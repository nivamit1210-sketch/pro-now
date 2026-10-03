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

  it("a draft mark can be cancelled; a sent one cannot", async () => {
    const req = await db.fixRequest.findFirstOrThrow({ where: { professionalId: pro.id, itemKey: "PORTRAIT" } });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${req.id}`, headers: as(admin) })).statusCode).toBe(204);
    expect((await db.fixRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
    expect((await app.inject({ method: "DELETE", url: "/api/v1/admin/fix-requests/nope", headers: as(admin) })).json().code).toBe("FIX_REQUEST_NOT_FOUND");
    const sent = await applicantInReview(db, uniqueEmail("rl-sent"));
    const round = await db.reviewRound.create({ data: { professionalId: sent.id, createdById: sent.userId, status: "SENT", sentAt: new Date() } });
    const r = await db.fixRequest.create({ data: { roundId: round.id, professionalId: sent.id, itemKey: "DETAILS", reasonHe: "השם לא תואם" } });
    const res = await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${r.id}`, headers: as(admin) });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ALREADY_SENT");
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
    expect((await db.reviewRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe("ANSWERED");
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

    const sentReq = await db.fixRequest.findFirstOrThrow({ where: { professionalId: p.id, itemKey: "DOCUMENT:TAX_FILE", round: { status: "SENT" } } });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/admin/fix-requests/${sentReq.id}`, headers: as(admin) })).json().code).toBe("ALREADY_SENT");
  });

  it("an unknown professional is a 404", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/professionals/00000000-0000-0000-0000-000000000000/review-round/send`, headers: as(admin) });
    expect(res.statusCode).toBe(404);
  });
});
