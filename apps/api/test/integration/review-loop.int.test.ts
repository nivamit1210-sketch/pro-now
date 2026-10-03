import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { applicantInReview, draftApplicant } from "./pro-helpers.js";

/** The review loop's marks (docs/10 §Review loop): a reviewer marks items; decisions cancel marks. */
const ADMIN = uniqueEmail("rl-admin");
process.env.ADMIN_EMAILS = ADMIN;

let app: FastifyInstance;
let db: PrismaClient;
let admin: CookieJar;
let applicant: CookieJar;
let pro: { id: string; userId: string; email: string; serviceId: string };
let svcId: string;

const as = (j: CookieJar) => ({ cookie: j.header(), origin: "http://localhost:4000" });

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  admin = await signInByEmail(app, ADMIN);
  applicant = await signInByEmail(app, uniqueEmail("rl-applicant"));
  pro = await applicantInReview(db, uniqueEmail("rl-pro"));
  svcId = pro.serviceId;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("marking items", () => {
  it("marks an item with a reason; a second mark on the same item replaces the reason", async () => {
    const mark = (payload: object) => app.inject({ method: "POST", url: `/api/v1/admin/professionals/${pro.id}/fix-requests`, headers: as(admin), payload });
    const first = await mark({ itemKey: "PORTRAIT", reasonHe: "התמונה חשוכה" });
    expect(first.statusCode, first.body).toBe(201);
    const again = await mark({ itemKey: "PORTRAIT", reasonHe: "התמונה חשוכה מדי, צריך אור" });
    expect(again.statusCode).toBe(201);
    const rows = await db.fixRequest.findMany({ where: { professionalId: pro.id, itemKey: "PORTRAIT" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reasonHe: "התמונה חשוכה מדי, צריך אור", status: "OPEN" });
    expect(await db.reviewRound.count({ where: { professionalId: pro.id, status: "DRAFT" } })).toBe(1);
  });

  it("refuses an item the application does not have, a short reason, a non-admin, and an application not in review", async () => {
    const url = `/api/v1/admin/professionals/${pro.id}/fix-requests`;
    expect((await app.inject({ method: "POST", url, headers: as(admin), payload: { itemKey: "SERVICE:nope", reasonHe: "סיבה טובה" } })).json().code).toBe("UNKNOWN_ITEM");
    expect((await app.inject({ method: "POST", url, headers: as(admin), payload: { itemKey: "PORTRAIT", reasonHe: "אה" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers: as(applicant), payload: { itemKey: "PORTRAIT", reasonHe: "סיבה טובה" } })).statusCode).toBe(403);
    const draftPro = await draftApplicant(db, uniqueEmail("rl-draft"));
    expect((await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${draftPro.id}/fix-requests`, headers: as(admin), payload: { itemKey: "DETAILS", reasonHe: "סיבה טובה" } })).json().code).toBe("NOT_IN_REVIEW");
    expect((await app.inject({ method: "POST", url: "/api/v1/admin/professionals/nope/fix-requests", headers: as(admin), payload: { itemKey: "DETAILS", reasonHe: "סיבה טובה" } })).json().code).toBe("PROFESSIONAL_NOT_FOUND");
  });

  it("a draft mark can be cancelled; a fixed one cannot", async () => {
    const req = await db.fixRequest.findFirstOrThrow({ where: { professionalId: pro.id, itemKey: "PORTRAIT" } });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${req.id}`, headers: as(admin) })).statusCode).toBe(204);
    expect((await db.fixRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
    expect((await app.inject({ method: "DELETE", url: "/api/v1/admin/fix-requests/nope", headers: as(admin) })).json().code).toBe("FIX_REQUEST_NOT_FOUND");
    const sent = await applicantInReview(db, uniqueEmail("rl-sent"));
    const round = await db.reviewRound.create({ data: { professionalId: sent.id, createdById: sent.userId, status: "SENT", sentAt: new Date() } });
    const r = await db.fixRequest.create({ data: { roundId: round.id, professionalId: sent.id, itemKey: "DETAILS", reasonHe: "השם לא תואם", status: "FIXED", fixedAt: new Date() } });
    const res = await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${r.id}`, headers: as(admin) });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ALREADY_SENT");
    // An open request of a round already answered is not the reviewer's to cancel either.
    const answered = await applicantInReview(db, uniqueEmail("rl-answered"));
    const old = await db.reviewRound.create({ data: { professionalId: answered.id, createdById: answered.userId, status: "ANSWERED", sentAt: new Date(), answeredAt: new Date() } });
    const o = await db.fixRequest.create({ data: { roundId: old.id, professionalId: answered.id, itemKey: "DETAILS", reasonHe: "השם לא תואם" } });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${o.id}`, headers: as(admin) })).json().code).toBe("ALREADY_SENT");
  });
});

describe("decisions that cancel marks", () => {
  it("the account cannot be approved while a mark is pending; approving or refusing a marked item cancels its mark", async () => {
    await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${pro.id}/fix-requests`, headers: as(admin), payload: { itemKey: `SERVICE:${svcId}`, reasonHe: "המחיר לא ברור" } });
    const check = await db.identityVerification.findFirstOrThrow({ where: { professionalId: pro.id } });
    await app.inject({ method: "POST", url: `/api/v1/admin/identity/${check.id}/decision`, headers: as(admin), payload: { action: "APPROVE" } });
    const blocked = await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${pro.id}/decision`, headers: as(admin), payload: { approve: true } });
    expect(blocked.json().code).toBe("FIXES_PENDING");
    const ps = await db.professionalService.findFirstOrThrow({ where: { professionalId: pro.id, serviceId: svcId } });
    await app.inject({ method: "POST", url: `/api/v1/admin/pro-services/${ps.id}/decision`, headers: as(admin), payload: { approve: false, reason: "לא בתחום" } });
    expect((await db.fixRequest.findFirstOrThrow({ where: { professionalId: pro.id, itemKey: `SERVICE:${svcId}` } })).status).toBe("CANCELLED");
  });

  it("an identity decision cancels the IDENTITY mark", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-idmark"));
    await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${p.id}/fix-requests`, headers: as(admin), payload: { itemKey: "IDENTITY", reasonHe: "התמונה מטושטשת" } });
    const check = await db.identityVerification.findFirstOrThrow({ where: { professionalId: p.id } });
    await app.inject({ method: "POST", url: `/api/v1/admin/identity/${check.id}/decision`, headers: as(admin), payload: { action: "REJECT", reason: "המסמך אינו קריא" } });
    expect(await db.fixRequest.count({ where: { professionalId: p.id, status: "OPEN" } })).toBe(0);
  });

  it("refusing the account cancels every open request and closes a sent round", async () => {
    const other = await applicantInReview(db, uniqueEmail("rl-refuse"));
    await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${other.id}/fix-requests`, headers: as(admin), payload: { itemKey: "DETAILS", reasonHe: "השם לא תואם" } });
    const round = await db.reviewRound.findFirstOrThrow({ where: { professionalId: other.id } });
    await db.reviewRound.update({ where: { id: round.id }, data: { status: "SENT", sentAt: new Date() } });
    await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${other.id}/decision`, headers: as(admin), payload: { approve: false, reason: "לא מתאים" } });
    expect(await db.fixRequest.count({ where: { professionalId: other.id, status: "OPEN" } })).toBe(0);
    expect((await db.reviewRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe("CLOSED");
  });
});

describe("sending a round (docs/10 §Review loop)", () => {
  it("refuses to send with nothing marked", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-empty"));
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${p.id}/review-round/send`, headers: as(admin) });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("NOTHING_MARKED");
  });

  it("sends every mark at once: account out of the queue, one inbox notice, an identity retake with its photos deleted", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-send"));
    const mark = (itemKey: string, reasonHe: string) => app.inject({ method: "POST", url: `/api/v1/admin/professionals/${p.id}/fix-requests`, headers: as(admin), payload: { itemKey, reasonHe } });
    await mark("DOCUMENT:TAX_FILE", "המסמך לא קריא");
    await mark("IDENTITY", "הפנים לא רואים בתמונה");
    const check = await db.identityVerification.findFirstOrThrow({ where: { professionalId: p.id } });

    const sent = await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${p.id}/review-round/send`, headers: as(admin) });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json().count).toBe(2);

    expect((await db.professionalProfile.findUniqueOrThrow({ where: { id: p.id } })).verificationStatus).toBe("CHANGES_REQUESTED");
    const queue = (await app.inject({ method: "GET", url: "/api/v1/admin/pro-applications", headers: as(admin) })).json();
    expect(queue.applications.map((a: { profile: { id: string } }) => a.profile.id)).not.toContain(p.id);
    expect(await db.reviewRound.count({ where: { professionalId: p.id, status: "SENT" } })).toBe(1);
    const notices = await db.notification.findMany({ where: { userId: p.userId, type: "PRO_FIXES_REQUESTED" } });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.title).toBe("יש כמה דברים לתקן בבקשה");

    const after = await db.identityVerification.findUniqueOrThrow({ where: { id: check.id } });
    expect(after).toMatchObject({ status: "RETAKE_REQUESTED", decisionReason: "הפנים לא רואים בתמונה", uploadIds: [] });
    expect(await db.upload.count({ where: { id: { in: check.uploadIds } } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "REVIEW_ROUND_SENT", targetId: p.id } })).toBe(1);

  });

  it("an unknown professional is a 404", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/professionals/00000000-0000-0000-0000-000000000000/review-round/send`, headers: as(admin) });
    expect(res.statusCode).toBe(404);
  });
});

async function upload(jar: CookieJar, kind: "PHOTO" | "DOCUMENT" | "IDENTITY"): Promise<string> {
  const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const prepared = await app.inject({ method: "POST", url: "/api/v1/uploads", headers: as(jar), payload: { kind, mime: "image/jpeg", bytes: body.byteLength } });
  expect(prepared.statusCode, prepared.body).toBe(201);
  const { uploadUrl, upload: u } = prepared.json() as { uploadUrl: string; upload: { id: string } };
  expect((await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body })).status).toBe(200);
  expect((await app.inject({ method: "POST", url: `/api/v1/uploads/${u.id}/complete`, headers: as(jar) })).statusCode).toBe(200);
  return u.id;
}

describe("the professional fixes and resends", () => {
  let pro: { id: string; userId: string; email: string; serviceId: string };
  let svcId: string;
  let proJar: CookieJar;
  const mark = (id: string, itemKey: string, reasonHe: string) =>
    app.inject({ method: "POST", url: `/api/v1/admin/professionals/${id}/fix-requests`, headers: as(admin), payload: { itemKey, reasonHe } });
  const send = (id: string) => app.inject({ method: "POST", url: `/api/v1/admin/professionals/${id}/review-round/send`, headers: as(admin) });

  beforeAll(async () => {
    pro = await applicantInReview(db, uniqueEmail("rl-fixer"));
    svcId = pro.serviceId;
    proJar = await signInByEmail(app, pro.email);
    expect((await mark(pro.id, "DETAILS", "השם בתעודה שונה")).statusCode).toBe(201);
    expect((await mark(pro.id, `SERVICE:${svcId}`, "המחיר חסר פירוט")).statusCode).toBe(201);
    expect((await mark(pro.id, "DOCUMENT:TAX_FILE", "לא קריא")).statusCode).toBe(201);
    const sent = await send(pro.id);
    expect(sent.statusCode, sent.body).toBe(200);
  });

  it("the application lists the requests with their reasons, all open", async () => {
    const view = (await app.inject({ method: "GET", url: "/api/v1/pro/application", headers: as(proJar) })).json();
    expect(view.changesRequested).toBe(true);
    expect(view.submitted).toBe(false);
    expect(view.fixRequests).toHaveLength(3);
    expect(view.fixRequests).toEqual(expect.arrayContaining([
      { itemKey: "DETAILS", reasonHe: "השם בתעודה שונה", status: "OPEN" },
      { itemKey: `SERVICE:${svcId}`, reasonHe: "המחיר חסר פירוט", status: "OPEN" },
      { itemKey: "DOCUMENT:TAX_FILE", reasonHe: "לא קריא", status: "OPEN" },
    ]));
  });

  it("resending with open requests is refused and names them", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/pro/application/submit", headers: as(proJar), payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("FIXES_OPEN");
    expect(res.json().open).toEqual(expect.arrayContaining(["DETAILS", `SERVICE:${svcId}`, "DOCUMENT:TAX_FILE"]));
    expect((await db.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } })).verificationStatus).toBe("CHANGES_REQUESTED");
  });

  it("an unchanged save fixes nothing; a price saved with the same numbers fixes nothing", async () => {
    const view = (await app.inject({ method: "GET", url: "/api/v1/pro/application", headers: as(proJar) })).json();
    const join = await app.inject({ method: "POST", url: "/api/v1/pro/join", headers: as(proJar), payload: { displayName: view.profile.displayName, legalName: view.profile.legalName, addressAs: view.profile.addressAs, dateOfBirth: view.profile.dateOfBirth } });
    expect(join.statusCode, join.body).toBe(200);
    const ps = await db.professionalService.findFirstOrThrow({ where: { professionalId: pro.id, serviceId: svcId } });
    const price = await app.inject({ method: "PATCH", url: `/api/v1/pro/services/${svcId}/pricing`, headers: as(proJar), payload: { basePriceMinorUnits: ps.basePriceMinorUnits } });
    expect(price.statusCode, price.body).toBe(200);
    expect(await db.fixRequest.count({ where: { professionalId: pro.id, status: "FIXED" } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "PRO_APPLICATION_ITEM_CHANGED", targetId: pro.id } })).toBe(0);
  });

  it("each real change fixes its own item only", async () => {
    await app.inject({ method: "POST", url: "/api/v1/pro/join", headers: as(proJar), payload: { displayName: "דנה", legalName: "דנה לוי-כהן", addressAs: "F", dateOfBirth: "1990-05-14" } });
    expect((await db.fixRequest.findFirstOrThrow({ where: { professionalId: pro.id, itemKey: "DETAILS" } })).status).toBe("FIXED");
    expect((await db.fixRequest.findFirstOrThrow({ where: { professionalId: pro.id, itemKey: "DOCUMENT:TAX_FILE" } })).status).toBe("OPEN");
    expect((await db.fixRequest.findFirstOrThrow({ where: { professionalId: pro.id, itemKey: `SERVICE:${svcId}` } })).status).toBe("OPEN");
    const doc = await app.inject({ method: "POST", url: "/api/v1/pro/application/documents", headers: as(proJar), payload: { kind: "TAX_FILE", uploadId: await upload(proJar, "DOCUMENT") } });
    expect(doc.statusCode, doc.body).toBe(200);
    const price = await app.inject({ method: "PATCH", url: `/api/v1/pro/services/${svcId}/pricing`, headers: as(proJar), payload: { basePriceMinorUnits: 23000 } });
    expect(price.statusCode, price.body).toBe(200);
    expect(await db.fixRequest.count({ where: { professionalId: pro.id, status: "OPEN" } })).toBe(0);
    const area = await app.inject({ method: "PUT", url: "/api/v1/pro/application/area", headers: as(proJar), payload: { lat: 32.08, lng: 34.78, radiusKm: 7 } });
    expect(area.statusCode, area.body).toBe(200);
    const view = (await app.inject({ method: "GET", url: "/api/v1/pro/application", headers: as(proJar) })).json();
    expect(view.fixRequests.map((r: { status: string }) => r.status)).toEqual(["FIXED", "FIXED", "FIXED"]);
  });

  it("with everything fixed, resending puts it back in the queue and answers the round", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/pro/application/submit", headers: as(proJar), payload: {} });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().profile.verificationStatus).toBe("SERVICE_REVIEW");
    expect(res.json().changesRequested).toBe(false);
    expect(res.json().fixRequests).toEqual([]);
    expect(await db.reviewRound.count({ where: { professionalId: pro.id, status: "ANSWERED" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "PRO_APPLICATION_SUBMITTED", targetId: pro.id } })).toBe(1);
    // The queue marks it as back after fixes; an application never sent back is not.
    const fresh = await applicantInReview(db, uniqueEmail("rl-fresh"));
    const queue = (await app.inject({ method: "GET", url: "/api/v1/admin/pro-applications", headers: as(admin) })).json();
    const row = (id: string) => queue.applications.find((a: { profile: { id: string } }) => a.profile.id === id);
    expect(row(pro.id)).toMatchObject({ returned: true });
    expect(row(fresh.id)).toMatchObject({ returned: false });
  });

  it("the reviewer sees the round: fixed requests with their reasons, and what else changed", async () => {
    const detail = (await app.inject({ method: "GET", url: `/api/v1/admin/professionals/${pro.id}`, headers: as(admin) })).json();
    expect(detail.review.current).toMatchObject({ status: "ANSWERED" });
    expect(detail.review.current.requests.find((r: { itemKey: string }) => r.itemKey === "DETAILS")).toMatchObject({ reasonHe: "השם בתעודה שונה", status: "FIXED" });
    expect(detail.review.changedItemKeys).toEqual(expect.arrayContaining(["DETAILS", "DOCUMENT:TAX_FILE", `SERVICE:${svcId}`, "AREA"]));
    expect(detail.review.draft).toEqual([]);
    expect(detail.review.earlier).toEqual([]);
  });

  it("a change before the round is sent does not fix the draft mark (Review Focus 1)", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-early"));
    const jar = await signInByEmail(app, p.email);
    expect((await mark(p.id, "AREA", "האזור רחב מדי")).statusCode).toBe(201);
    const area = await app.inject({ method: "PUT", url: "/api/v1/pro/application/area", headers: as(jar), payload: { lat: 31.26, lng: 34.8, radiusKm: 5 } });
    expect(area.statusCode, area.body).toBe(200);
    expect((await send(p.id)).statusCode).toBe(200);
    expect((await db.fixRequest.findFirstOrThrow({ where: { professionalId: p.id, itemKey: "AREA" } })).status).toBe("OPEN");
    const audits = await db.auditLog.findMany({ where: { action: "PRO_APPLICATION_ITEM_CHANGED", targetId: p.id } });
    expect(audits.map((a) => a.afterJson)).toEqual([{ itemKey: "AREA" }]);
  });

  it("a send racing with a fix ends consistent (both succeed; the request is OPEN or FIXED, never lost)", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-race"));
    const jar = await signInByEmail(app, p.email);
    expect((await mark(p.id, "PORTRAIT", "צריך תמונה אמיתית")).statusCode).toBe(201);
    const photo = await upload(jar, "PHOTO");
    const [sent, portrait] = await Promise.all([
      send(p.id),
      app.inject({ method: "PUT", url: "/api/v1/pro/application/portrait", headers: as(jar), payload: { kind: "PHOTO", uploadId: photo } }),
    ]);
    expect(sent.statusCode, sent.body).toBe(200);
    expect(portrait.statusCode, portrait.body).toBe(200);
    expect(await db.reviewRound.count({ where: { professionalId: p.id, status: "SENT" } })).toBe(1);
    const req = await db.fixRequest.findMany({ where: { professionalId: p.id, itemKey: "PORTRAIT" } });
    expect(req).toHaveLength(1);
    expect(["OPEN", "FIXED"]).toContain(req[0]!.status);
    expect(await db.auditLog.count({ where: { action: "PRO_APPLICATION_ITEM_CHANGED", targetId: p.id } })).toBe(1);
  });
});

describe("final review fixes (docs/10 §Review loop)", () => {
  const mark = (id: string, itemKey: string, reasonHe: string) =>
    app.inject({ method: "POST", url: `/api/v1/admin/professionals/${id}/fix-requests`, headers: as(admin), payload: { itemKey, reasonHe } });
  const send = (id: string) => app.inject({ method: "POST", url: `/api/v1/admin/professionals/${id}/review-round/send`, headers: as(admin) });
  const approveIdentity = async (id: string) => {
    const check = await db.identityVerification.findFirstOrThrow({ where: { professionalId: id } });
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/identity/${check.id}/decision`, headers: as(admin), payload: { action: "APPROVE" } });
    expect(res.statusCode, res.body).toBe(200);
  };

  it("IDENTITY cannot be marked once the identity check is decided", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-id-decided"));
    await approveIdentity(p.id);
    const res = await mark(p.id, "IDENTITY", "התמונה מטושטשת");
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("IDENTITY_NOT_OPEN");
    expect(await db.fixRequest.count({ where: { professionalId: p.id } })).toBe(0);
  });

  it("a send drops an IDENTITY request the check can no longer take back, and counts only the rest", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-id-drop"));
    expect((await mark(p.id, "IDENTITY", "התמונה מטושטשת")).statusCode).toBe(201);
    expect((await mark(p.id, "DETAILS", "השם לא תואם")).statusCode).toBe(201);
    // Decided outside the reviewer's identity decision (which would itself cancel the mark).
    await db.identityVerification.updateMany({ where: { professionalId: p.id }, data: { status: "VERIFIED" } });
    const res = await send(p.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().count).toBe(1);
    expect((await db.fixRequest.findFirstOrThrow({ where: { professionalId: p.id, itemKey: "IDENTITY" } })).status).toBe("CANCELLED");
    expect((await db.identityVerification.findFirstOrThrow({ where: { professionalId: p.id } })).status).toBe("VERIFIED");
  });

  it("a send with only a non-retakeable IDENTITY request is NOTHING_MARKED and changes nothing", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-id-only"));
    expect((await mark(p.id, "IDENTITY", "התמונה מטושטשת")).statusCode).toBe(201);
    await db.identityVerification.updateMany({ where: { professionalId: p.id }, data: { status: "VERIFIED" } });
    const res = await send(p.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("NOTHING_MARKED");
    expect((await db.professionalProfile.findUniqueOrThrow({ where: { id: p.id } })).verificationStatus).toBe("SERVICE_REVIEW");
    expect(await db.reviewRound.count({ where: { professionalId: p.id, status: "DRAFT" } })).toBe(1);
    expect((await db.fixRequest.findFirstOrThrow({ where: { professionalId: p.id, itemKey: "IDENTITY" } })).status).toBe("OPEN");
    expect(await db.notification.count({ where: { userId: p.userId, type: "PRO_FIXES_REQUESTED" } })).toBe(0);
  });

  it("an open request of a sent round can be cancelled, audited, and the professional can then resend", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-cancel-sent"));
    const jar = await signInByEmail(app, p.email);
    expect((await mark(p.id, "DETAILS", "השם לא תואם")).statusCode).toBe(201);
    expect((await send(p.id)).statusCode).toBe(200);
    const req = await db.fixRequest.findFirstOrThrow({ where: { professionalId: p.id, itemKey: "DETAILS" } });
    const res = await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${req.id}`, headers: as(admin) });
    expect(res.statusCode, res.body).toBe(204);
    expect((await db.fixRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "FIX_REQUEST_CANCELLED", targetId: p.id } });
    expect(row.beforeJson).toEqual({ itemKey: "DETAILS" });
    expect(row.afterJson).toEqual({ status: "CANCELLED" });
    const view = (await app.inject({ method: "GET", url: "/api/v1/pro/application", headers: as(jar) })).json();
    expect(view.fixRequests).toEqual([]);
    const resend = await app.inject({ method: "POST", url: "/api/v1/pro/application/submit", headers: as(jar), payload: {} });
    expect(resend.statusCode, resend.body).toBe(200);
    expect(resend.json().profile.verificationStatus).toBe("SERVICE_REVIEW");
  });

  it("the account cannot be approved while the application is back with the professional", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-cr-approve"));
    await approveIdentity(p.id);
    expect((await mark(p.id, "DETAILS", "השם לא תואם")).statusCode).toBe(201);
    expect((await send(p.id)).statusCode).toBe(200);
    const req = await db.fixRequest.findFirstOrThrow({ where: { professionalId: p.id, itemKey: "DETAILS" } });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${req.id}`, headers: as(admin) })).statusCode).toBe(204);
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/professionals/${p.id}/decision`, headers: as(admin), payload: { approve: true } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("FIXES_PENDING");
    expect((await db.professionalProfile.findUniqueOrThrow({ where: { id: p.id } })).verificationStatus).toBe("CHANGES_REQUESTED");
  });

  it("a re-mark audits the previous reason; a cancel audits the new status", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-remark"));
    expect((await mark(p.id, "PORTRAIT", "התמונה חשוכה")).statusCode).toBe(201);
    expect((await mark(p.id, "PORTRAIT", "התמונה חשוכה מדי")).statusCode).toBe(201);
    const rows = await db.auditLog.findMany({ where: { action: "FIX_REQUEST_MARKED", targetId: p.id }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.beforeJson).toBeNull();
    expect(rows[1]!.beforeJson).toEqual({ reasonHe: "התמונה חשוכה" });
    const req = await db.fixRequest.findFirstOrThrow({ where: { professionalId: p.id, itemKey: "PORTRAIT" } });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${req.id}`, headers: as(admin) })).statusCode).toBe(204);
    expect((await db.auditLog.findFirstOrThrow({ where: { action: "FIX_REQUEST_CANCELLED", targetId: p.id } })).afterJson).toEqual({ status: "CANCELLED" });
  });

  it.each([true, false])("a credential decision (approve=%s) cancels that credential's mark", async (approve) => {
    const p = await applicantInReview(db, uniqueEmail(`rl-cred-${approve}`));
    const reqRow = await db.serviceRequirement.findFirstOrThrow({ where: { OR: [{ requirement: { startsWith: "LICENSE" } }, { requirement: { startsWith: "CERTIFICATE" } }, { requirement: { startsWith: "INSURANCE" } }] } });
    const type = reqRow.requirement.split(":")[0]!.toUpperCase() as "LICENSE" | "CERTIFICATE" | "INSURANCE";
    const credential = await db.professionalCredential.create({ data: { professionalId: p.id, serviceId: reqRow.serviceId, type, number: "T-1", issuer: "test", status: "PENDING" } });
    const key = `CREDENTIAL:${reqRow.serviceId}:${reqRow.requirement}`;
    const fix = await db.fixRequest.create({ data: { professionalId: p.id, itemKey: key, reasonHe: "המסמך לא קריא", round: { create: { professionalId: p.id, createdById: p.userId } } } });
    const other = await db.fixRequest.create({ data: { professionalId: p.id, itemKey: "DETAILS", reasonHe: "השם לא תואם", roundId: fix.roundId } });
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/credentials/${credential.id}/decision`, headers: as(admin), payload: approve ? { approve: true, noExpiry: true } : { approve: false, reason: "לא תקף" } });
    expect(res.statusCode, res.body).toBe(200);
    expect((await db.fixRequest.findUniqueOrThrow({ where: { id: fix.id } })).status).toBe("CANCELLED");
    expect((await db.fixRequest.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("OPEN");
  });

  it("before any round, the reviewer sees what changed since the application was sent", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-changed-early"));
    const jar = await signInByEmail(app, p.email);
    await db.auditLog.create({ data: { actorId: p.userId, action: "PRO_APPLICATION_ITEM_CHANGED", targetType: "professional", targetId: p.id, afterJson: { itemKey: "PORTRAIT" }, createdAt: new Date(Date.now() - 60_000) } });
    const none = (await app.inject({ method: "GET", url: `/api/v1/admin/professionals/${p.id}`, headers: as(admin) })).json();
    expect(none.review.changedItemKeys).toEqual([]);
    await db.auditLog.create({ data: { actorId: p.userId, action: "PRO_APPLICATION_SUBMITTED", targetType: "professional", targetId: p.id, createdAt: new Date(Date.now() - 30_000) } });
    const area = await app.inject({ method: "PUT", url: "/api/v1/pro/application/area", headers: as(jar), payload: { lat: 31.3, lng: 34.8, radiusKm: 6 } });
    expect(area.statusCode, area.body).toBe(200);
    const detail = (await app.inject({ method: "GET", url: `/api/v1/admin/professionals/${p.id}`, headers: as(admin) })).json();
    expect(detail.review.current).toBeNull();
    expect(detail.review.changedItemKeys).toEqual(["AREA"]);
  });

  it("the queue marks an application as back only when its latest sent round was answered", async () => {
    const p = await applicantInReview(db, uniqueEmail("rl-closed-latest"));
    const t = Date.now();
    await db.reviewRound.create({ data: { professionalId: p.id, createdById: p.userId, status: "ANSWERED", sentAt: new Date(t - 120_000), answeredAt: new Date(t - 100_000), createdAt: new Date(t - 130_000) } });
    await db.reviewRound.create({ data: { professionalId: p.id, createdById: p.userId, status: "CLOSED", sentAt: new Date(t - 60_000), answeredAt: new Date(t - 50_000), createdAt: new Date(t - 70_000) } });
    const queue = (await app.inject({ method: "GET", url: "/api/v1/admin/pro-applications", headers: as(admin) })).json();
    const row = queue.applications.find((a: { profile: { id: string } }) => a.profile.id === p.id);
    expect(row).toMatchObject({ returned: false });
  });
});
