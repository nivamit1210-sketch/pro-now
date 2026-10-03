import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { credentialTypeFor } from "@pro-now/types";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { sweepSilentProfessionals } from "../../src/domain/dispatch/presence-sweep.js";
import { takeOffline } from "./pro-helpers.js";

/**
 * W7 acceptance (docs/21): a new professional applies, an admin approves
 * one service, only that service receives offers, and silence takes them
 * offline.
 */
const ADMIN = uniqueEmail("w7-admin");
process.env.ADMIN_EMAILS = ADMIN;

let app: FastifyInstance;
let db: PrismaClient;
let applicant: CookieJar;
let admin: CookieJar;
let customer: CookieJar;
let proId: string;
let approvedSvc: { id: string; code: string };
let otherSvc: { id: string; code: string };
let addressId: string;
const LAT = 31.25;
const LNG = 34.79;

const as = (j: CookieJar, idem?: string) => ({
  cookie: j.header(),
  origin: "http://localhost:4000",
  ...(idem ? { "idempotency-key": idem } : {}),
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

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  const open = await db.marketActivation.findMany({
    where: { providerOnboardingEnabled: true, service: { priceModel: "VISIT_QUOTE" } },
    include: { service: { include: { requirements: true } } },
  });
  const withLicence = open.find((a) => a.service.requirements.some((r) => credentialTypeFor(r.requirement) && r.mandatory))!;
  approvedSvc = { id: withLicence.service.id, code: withLicence.service.code };
  const another = open.find((a) => a.service.id !== approvedSvc.id)!;
  otherSvc = { id: another.service.id, code: another.service.code };

  applicant = await signInByEmail(app, uniqueEmail("w7-applicant"));
  admin = await signInByEmail(app, ADMIN);
  customer = await signInByEmail(app, uniqueEmail("w7-customer"));
  const me = (await whoAmI(app, customer))!;
  const profile = await db.customerProfile.upsert({ where: { userId: me.user.id }, update: {}, create: { userId: me.user.id } });
  addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "באר שבע", lat: LAT, lng: LNG } })).id;
});

afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

describe("joining as a professional", () => {
  it("any signed-in person may apply; the application lists what is required", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/pro/join", headers: as(applicant), payload: { displayName: "רוני", legalName: "רוני אברהם", addressAs: "F", dateOfBirth: "1990-05-14" } });
    expect(res.statusCode, res.body).toBe(200);
    proId = res.json().profile.id;
    expect(res.json().profile).toMatchObject({ addressAs: "F", verificationStatus: "DRAFT" });
    expect(res.json().missing).toEqual(expect.arrayContaining(["SERVICES", "AREA", "DOCUMENT:TAX_FILE", "PORTRAIT", "TAX_STATUS", "IDENTITY"]));
    expect(res.json().profile.dateOfBirth).toBe("1990-05-14");
    expect(res.json().profile.business).toBeNull();
    expect(res.json().profile.portrait).toBeNull();
    expect(res.json().missing.join()).not.toMatch(/CRIMINAL/);
  });

  it("a professional must be at least 18 (Dvir, 2026-10-02)", async () => {
    const minor = await signInByEmail(app, uniqueEmail("w7-minor"));
    const today = new Date();
    const seventeen = `${today.getUTCFullYear() - 17}-01-01`;
    const res = await app.inject({ method: "POST", url: "/api/v1/pro/join", headers: as(minor), payload: { displayName: "נוי", legalName: "נוי כהן", addressAs: "F", dateOfBirth: seventeen } });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("UNDER_MINIMUM_AGE");
    // Refused before anything is written: no professional role, no profile.
    const minorId = (await whoAmI(app, minor))!.user.id;
    expect(await db.userRole.count({ where: { userId: minorId, role: "PROFESSIONAL" } })).toBe(0);
    expect(await db.professionalProfile.count({ where: { userId: minorId } })).toBe(0);
    const bad = await app.inject({ method: "POST", url: "/api/v1/pro/join", headers: as(minor), payload: { displayName: "נוי", legalName: "נוי כהן", addressAs: "F", dateOfBirth: "14/05/1990" } });
    expect(bad.statusCode).toBe(400);
  });

  it("identity photos are their own upload kind, photos only", async () => {
    const prepare = (mime: string, bytes: number) => app.inject({ method: "POST", url: "/api/v1/uploads", headers: as(applicant), payload: { kind: "IDENTITY", mime, bytes } });
    expect((await prepare("image/jpeg", 1000)).statusCode).toBe(201);
    expect((await prepare("application/pdf", 1000)).statusCode).toBe(422);
    expect((await prepare("image/jpeg", 3_000_001)).statusCode).toBe(422);
  });

  it("refuses a service that is not open to professionals", async () => {
    const closed = await db.marketActivation.findFirst({ where: { providerOnboardingEnabled: false } });
    if (!closed) return;
    const res = await app.inject({ method: "PUT", url: "/api/v1/pro/application/services", headers: as(applicant), payload: { serviceIds: [closed.serviceId] } });
    expect(res.statusCode).toBe(422);
  });

  it("an incomplete application cannot be submitted, and says what is missing", async () => {
    await app.inject({ method: "PUT", url: "/api/v1/pro/application/services", headers: as(applicant), payload: { serviceIds: [approvedSvc.id, otherSvc.id] } });
    const res = await app.inject({ method: "POST", url: "/api/v1/pro/application/submit", headers: as(applicant), payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().missing).toEqual(expect.arrayContaining([`PRICE:${approvedSvc.code}`, "AREA"]));
    expect(res.json().missing.some((m: string) => m.startsWith(`CREDENTIAL:${approvedSvc.code}:`))).toBe(true);
  });

  it("the business: an optional trading name and how they are registered for tax (Amit, 2026-09-30)", async () => {
    const put = (payload: object) => app.inject({ method: "PUT", url: "/api/v1/pro/application/business", headers: as(applicant), payload });
    expect((await put({ tradingName: "רוני אינסטלציה" })).statusCode).toBe(400);
    expect((await put({ taxStatus: "SOMETHING_ELSE" })).statusCode).toBe(400);

    const res = await put({ tradingName: "  רוני אינסטלציה ", taxStatus: "LICENSED" });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().profile.business).toEqual({ tradingName: "רוני אינסטלציה", taxStatus: "LICENSED" });
    expect(res.json().missing).not.toContain("TAX_STATUS");

    // No name is an answer too; and entering details verifies nothing (docs/10: the badge has its own status).
    const bare = await put({ tradingName: null, taxStatus: "EXEMPT" });
    expect(bare.json().profile.business).toEqual({ tradingName: null, taxStatus: "EXEMPT" });
    const row = await db.businessProfile.findUniqueOrThrow({ where: { professionalId: proId } });
    expect(row.verificationStatus).toBe("UNVERIFIED");
  });

  it("the shop: a sign, a brand colour, a logo if they like; designing it can wait (Amit, 2026-09-30)", async () => {
    const before = (await app.inject({ method: "GET", url: "/api/v1/pro/application", headers: as(applicant) })).json();
    expect(before.profile.shop).toBeNull();
    expect(before.missing.join()).not.toMatch(/SHOP/);

    const put = (payload: object) => app.inject({ method: "PUT", url: "/api/v1/pro/application/shop", headers: as(applicant), payload });
    expect((await put({ name: "", brandColor: "#FF5C38" })).statusCode).toBe(400);
    expect((await put({ name: "שם ארוך מדי בשביל שלט ניאון אחד", brandColor: "#FF5C38" })).statusCode).toBe(400);
    expect((await put({ name: "רוני", brandColor: "red" })).statusCode).toBe(400);
    const someoneElses = await upload(customer, "PHOTO");
    expect((await put({ name: "רוני", brandColor: "#FF5C38", logoUploadId: someoneElses })).statusCode).toBe(422);

    const logo = await upload(applicant, "PHOTO");
    const res = await put({ name: "  רוני צנרת ", brandColor: "#8b5cf6", logoUploadId: logo });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().profile.shop).toEqual({ name: "רוני צנרת", brandColor: "#8B5CF6", logoUploadId: logo });

    const noLogo = await put({ name: "רוני צנרת", brandColor: "#2FBF8A", logoUploadId: null });
    expect(noLogo.json().profile.shop).toEqual({ name: "רוני צנרת", brandColor: "#2FBF8A", logoUploadId: null });
  });

  it("the portrait is a photo of their own, or the trade's character (Amit, 2026-09-30: required)", async () => {
    const put = (payload: object, jar = applicant) => app.inject({ method: "PUT", url: "/api/v1/pro/application/portrait", headers: as(jar), payload });

    const someoneElses = await upload(customer, "PHOTO");
    expect((await put({ kind: "PHOTO", uploadId: someoneElses })).statusCode).toBe(422);
    expect((await put({ kind: "PHOTO" })).statusCode).toBe(400);
    expect((await put({ kind: "CHARACTER", uploadId: someoneElses })).statusCode).toBe(400);

    const character = await put({ kind: "CHARACTER" });
    expect(character.statusCode, character.body).toBe(200);
    expect(character.json().profile.portrait).toEqual({ kind: "CHARACTER", uploadId: null });
    expect(character.json().missing).not.toContain("PORTRAIT");

    const photoId = await upload(applicant, "PHOTO");
    const photo = await put({ kind: "PHOTO", uploadId: photoId });
    expect(photo.statusCode, photo.body).toBe(200);
    expect(photo.json().profile.portrait).toEqual({ kind: "PHOTO", uploadId: photoId });
    // Theirs to see again, for the summary before sending.
    expect((await app.inject({ method: "GET", url: `/api/v1/media/${photoId}`, headers: as(applicant) })).statusCode).toBe(302);
    // Only the admin sees the photo, and only through a short-lived link.
    const seen = await app.inject({ method: "GET", url: `/api/v1/admin/professionals/${proId}`, headers: as(admin) });
    expect(seen.statusCode, seen.body).toBe(200);
    expect(seen.json().portrait).toMatchObject({ kind: "PHOTO", mime: "image/jpeg" });
    expect(seen.json().portrait.url).toMatch(/^https?:\/\//);
    // What customers see of it is portrait-customers.int.test.ts (D1).
  });

  describe("the identity check (docs/10 §Identity check in the app)", () => {
    const send = (payload: object, jar = applicant) => app.inject({ method: "POST", url: "/api/v1/pro/application/identity", headers: as(jar), payload });
    const four = async (jar = applicant) => ({
      documentUploadId: await upload(jar, "IDENTITY"),
      selfieUploadIds: [await upload(jar, "IDENTITY"), await upload(jar, "IDENTITY"), await upload(jar, "IDENTITY")],
    });

    it("refuses someone else's photos, and photos that are not identity uploads", async () => {
      expect((await send(await four(customer))).statusCode).toBe(422);
      const wrongKind = { ...(await four()), documentUploadId: await upload(applicant, "PHOTO") };
      expect((await send(wrongKind)).statusCode).toBe(422);
      expect((await send({ documentUploadId: "x", selfieUploadIds: ["a", "b"] })).statusCode).toBe(400);
    });

    it("goes to a person for review, and is the application's current check", async () => {
      const res = await send(await four());
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().identity).toMatchObject({ status: "MANUAL_REVIEW", reasonHe: null });
      expect(res.json().missing).not.toContain("IDENTITY");
      const row = await db.identityVerification.findFirstOrThrow({ where: { professionalId: proId }, orderBy: { createdAt: "desc" } });
      expect(row).toMatchObject({ vendorName: "sandbox-identity", isSandbox: true, status: "MANUAL_REVIEW", method: null });
      expect(row.uploadIds).toHaveLength(4);
      // The account's own status is not moved by identity (docs/10, deviation noted in the plan).
      expect((await db.professionalProfile.findUniqueOrThrow({ where: { id: proId } })).verificationStatus).toBe("DRAFT");
    });

    it("a double tap makes one attempt", async () => {
      const payload = await four();
      const [a, b] = await Promise.all([send(payload), send(payload)]);
      expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
      const live = await db.identityVerification.count({ where: { professionalId: proId, status: { not: "SUPERSEDED" } } });
      expect(live).toBe(1);
    });

    it("a retake replaces the check under review, and deletes its photos", async () => {
      const before = await db.identityVerification.findFirstOrThrow({ where: { professionalId: proId, status: "MANUAL_REVIEW" } });
      expect((await send(await four())).statusCode).toBe(200);
      const old = await db.identityVerification.findUniqueOrThrow({ where: { id: before.id } });
      expect(old.status).toBe("SUPERSEDED");
      expect(old.uploadIds).toEqual([]);
      expect(old.photosDeletedAt).not.toBeNull();
      expect(await db.upload.count({ where: { id: { in: before.uploadIds } } })).toBe(0);
    });

    it("a retake that reuses one old photo keeps it, and deletes the rest of the old check's photos", async () => {
      const before = await db.identityVerification.findFirstOrThrow({ where: { professionalId: proId, status: "MANUAL_REVIEW" } });
      const kept = before.uploadIds[1]!;
      const fresh = await four();
      const res = await send({ ...fresh, selfieUploadIds: [kept, fresh.selfieUploadIds[1], fresh.selfieUploadIds[2]] });
      expect(res.statusCode, res.body).toBe(200);
      expect(await db.upload.count({ where: { id: kept } })).toBe(1);
      expect(await db.upload.count({ where: { id: { in: before.uploadIds.filter((id) => id !== kept) } } })).toBe(0);
      const live = await db.identityVerification.findFirstOrThrow({ where: { professionalId: proId, status: "MANUAL_REVIEW" } });
      expect(live.uploadIds).toContain(kept);
    });

    it("a refused check is final: a new submission is a 409 IDENTITY_REJECTED (docs/10)", async () => {
      const other = await signInByEmail(app, uniqueEmail("w7-refused"));
      const joined = await app.inject({ method: "POST", url: "/api/v1/pro/join", headers: as(other), payload: { displayName: "גל", legalName: "גל שמש", addressAs: "M", dateOfBirth: "1985-03-02" } });
      expect(joined.statusCode, joined.body).toBe(200);
      const otherId = joined.json().profile.id as string;
      expect((await send(await four(other), other)).statusCode).toBe(200);
      // A person refused it (as admin-pros.ts records a REJECT).
      await db.identityVerification.updateMany({ where: { professionalId: otherId, status: "MANUAL_REVIEW" }, data: { status: "REJECTED", decisionReason: "התעודה לא בתוקף", decidedAt: new Date() } });
      const again = await send(await four(other), other);
      expect(again.statusCode, again.body).toBe(409);
      expect(again.json().code).toBe("IDENTITY_REJECTED");
      expect(await db.identityVerification.count({ where: { professionalId: otherId } })).toBe(1);
    });

    it("the verification page reads only what it shows of the current check, never its photos or reviewer", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pro/verification", headers: as(applicant) });
      expect(res.statusCode, res.body).toBe(200);
      const check = res.json().professional.identityVerification;
      expect(Object.keys(check).sort()).toEqual(["createdAt", "id", "isSandbox", "method", "status", "vendorName"]);
      expect(check).toMatchObject({ status: "MANUAL_REVIEW", isSandbox: true, vendorName: "sandbox-identity", method: null });
    });

    it("an upload the clean-up already deleted is a 422, not a 500", async () => {
      const payload = await four();
      await db.upload.delete({ where: { id: payload.selfieUploadIds[1]! } });
      expect((await send(payload)).statusCode).toBe(422);
    });

    it("the 4-day clean-up keeps an undecided check's photos", async () => {
      const current = await db.identityVerification.findFirstOrThrow({ where: { professionalId: proId, status: "MANUAL_REVIEW" } });
      await db.upload.updateMany({ where: { id: { in: current.uploadIds } }, data: { createdAt: new Date(Date.now() - 10 * 86400_000) } });
      await app.cleanupMediaNow();
      expect(await db.upload.count({ where: { id: { in: current.uploadIds } } })).toBe(4);
    });
  });

  it("with everything required, it goes to review", async () => {
    for (const svc of [approvedSvc, otherSvc]) {
      const priced = await app.inject({ method: "PATCH", url: `/api/v1/pro/services/${svc.id}/pricing`, headers: as(applicant), payload: { basePriceMinorUnits: 20000 } });
      expect(priced.statusCode, priced.body).toBe(200);
    }
    await app.inject({ method: "PUT", url: "/api/v1/pro/application/area", headers: as(applicant), payload: { lat: LAT, lng: LNG, radiusKm: 15 } });
    await app.inject({ method: "POST", url: "/api/v1/pro/application/documents", headers: as(applicant), payload: { kind: "TAX_FILE", uploadId: await upload(applicant, "DOCUMENT") } });

    for (const svc of [approvedSvc, otherSvc]) {
      const reqs = await db.serviceRequirement.findMany({ where: { serviceId: svc.id, mandatory: true } });
      for (const r of reqs.filter((x) => credentialTypeFor(x.requirement))) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/pro/application/credentials",
          headers: as(applicant),
          payload: { serviceId: svc.id, requirement: r.requirement, number: "12345", uploadId: await upload(applicant, "DOCUMENT") },
        });
        expect(res.statusCode, res.body).toBe(200);
      }
    }
    const submitted = await app.inject({ method: "POST", url: "/api/v1/pro/application/submit", headers: as(applicant), payload: {} });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ submitted: true, missing: [], profile: { verificationStatus: "SERVICE_REVIEW" } });
    expect(submitted.json().services.map((s: { status: string }) => s.status)).toEqual(["PENDING", "PENDING"]);
  });

  it("cannot go online before approval", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/pro/shifts", headers: as(applicant), payload: { lat: LAT, lng: LNG, enabledServiceIds: [approvedSvc.id] } });
    expect(res.statusCode).toBe(403);
  });
});

describe("the admin approves, in order, on the record", () => {
  const decide = (url: string, payload: object, jar = admin) => app.inject({ method: "POST", url, headers: as(jar), payload });

  it("refuses anyone who is not an admin", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/pro-applications", headers: as(applicant) })).statusCode).toBe(403);
    expect((await decide(`/api/v1/admin/professionals/${proId}/decision`, { approve: true }, applicant)).statusCode).toBe(403);
  });

  it("lists the application, and refuses a service before the account", async () => {
    const list = (await app.inject({ method: "GET", url: "/api/v1/admin/pro-applications", headers: as(admin) })).json();
    expect(list.applications.map((a: { profile: { id: string } }) => a.profile.id)).toContain(proId);
    const ps = await db.professionalService.findFirstOrThrow({ where: { professionalId: proId, serviceId: approvedSvc.id } });
    expect((await decide(`/api/v1/admin/pro-services/${ps.id}/decision`, { approve: true })).json().code).toBe("ACCOUNT_NOT_APPROVED");
  });

  it("the account cannot be approved before identity; a person approves identity on the record", async () => {
    const early = await decide(`/api/v1/admin/professionals/${proId}/decision`, { approve: true });
    expect(early.statusCode).toBe(409);
    expect(early.json().code).toBe("IDENTITY_NOT_VERIFIED");

    const detail = (await app.inject({ method: "GET", url: `/api/v1/admin/professionals/${proId}`, headers: as(admin) })).json();
    expect(detail.identity).toMatchObject({ status: "MANUAL_REVIEW", isSandbox: true, declared: { legalName: "רוני אברהם", dateOfBirth: "1990-05-14" } });
    for (const url of Object.values(detail.identity.photos)) expect(url).toMatch(/^https?:\/\//);
    expect(await db.auditLog.count({ where: { action: "IDENTITY_PHOTOS_VIEWED", targetId: proId } })).toBeGreaterThan(0);

    const check = await db.identityVerification.findFirstOrThrow({ where: { professionalId: proId, status: "MANUAL_REVIEW" } });
    expect((await decide(`/api/v1/admin/identity/${check.id}/decision`, { action: "RETAKE" })).statusCode).toBe(400);
    const ok = await decide(`/api/v1/admin/identity/${check.id}/decision`, { action: "APPROVE" });
    expect(ok.statusCode, ok.body).toBe(200);
    const row = await db.identityVerification.findUniqueOrThrow({ where: { id: check.id } });
    expect(row).toMatchObject({ status: "VERIFIED", method: "MANUAL", uploadIds: [] });
    expect(row.decidedById).not.toBeNull();
    expect(row.photosDeletedAt).not.toBeNull();
    expect(await db.upload.count({ where: { id: { in: check.uploadIds } } })).toBe(0);
    expect((await decide(`/api/v1/admin/identity/${check.id}/decision`, { action: "APPROVE" })).json().code).toBe("IDENTITY_ALREADY_DECIDED");
    expect(await db.auditLog.count({ where: { action: "IDENTITY_APPROVED", targetId: proId } })).toBe(1);

    const again = await app.inject({
      method: "POST",
      url: "/api/v1/pro/application/identity",
      headers: as(applicant),
      payload: {
        documentUploadId: await upload(applicant, "IDENTITY"),
        selfieUploadIds: [await upload(applicant, "IDENTITY"), await upload(applicant, "IDENTITY"), await upload(applicant, "IDENTITY")],
      },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("IDENTITY_ALREADY_VERIFIED");
  });

  it("a credential cannot be verified without an expiry date or 'no expiry', nor with a past date", async () => {
    const c = await db.professionalCredential.findFirstOrThrow({ where: { professionalId: proId, status: "PENDING" } });
    const url = `/api/v1/admin/credentials/${c.id}/decision`;
    expect((await decide(url, { approve: true })).json().code).toBe("EXPIRY_REQUIRED");
    expect((await decide(url, { approve: true, expiresAt: new Date(Date.now() - 86_400_000).toISOString() })).json().code).toBe("EXPIRY_IN_PAST");
    expect((await decide(url, { approve: true, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), noExpiry: true })).statusCode).toBe(400);
    const ok = await decide(url, { approve: true, noExpiry: true });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await db.professionalCredential.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "VERIFIED", noExpiry: true, expiresAt: null });
    // An already-verified credential can get its date later (staff filling in old ones).
    const dated = await decide(url, { approve: true, expiresAt: new Date(Date.now() + 200 * 86_400_000).toISOString() });
    expect(dated.statusCode).toBe(200);
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: c.id } })).noExpiry).toBe(false);
    // Back to pending, so the next test still starts from an unverified licence.
    await db.professionalCredential.update({ where: { id: c.id }, data: { status: "PENDING", expiresAt: null } });
  });

  it("the application shows each credential's expiry and a pending renewal", async () => {
    const view = (await app.inject({ method: "GET", url: "/api/v1/pro/application", headers: as(applicant) })).json();
    const req = view.services.flatMap((s: { requirements: unknown[] }) => s.requirements).find((r: { credential: unknown }) => r.credential) as { credential: { expiresAt: string | null; noExpiry: boolean }; renewalPending: boolean };
    expect(req.credential).toHaveProperty("expiresAt");
    expect(req.credential).toHaveProperty("noExpiry");
    expect(req.renewalPending).toBe(false);
  });

  it("refuses a service whose licence is not verified, then approves it once it is", async () => {
    expect((await decide(`/api/v1/admin/professionals/${proId}/decision`, { approve: true })).statusCode).toBe(200);
    const ps = await db.professionalService.findFirstOrThrow({ where: { professionalId: proId, serviceId: approvedSvc.id } });
    const early = await decide(`/api/v1/admin/pro-services/${ps.id}/decision`, { approve: true });
    expect(early.json().code).toBe("CREDENTIALS_NOT_SATISFIED");

    for (const c of await db.professionalCredential.findMany({ where: { professionalId: proId, serviceId: approvedSvc.id } })) {
      expect((await decide(`/api/v1/admin/credentials/${c.id}/decision`, { approve: true, expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString() })).statusCode).toBe(200);
    }
    const approved = await decide(`/api/v1/admin/pro-services/${ps.id}/decision`, { approve: true });
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await db.professionalService.findUniqueOrThrow({ where: { id: ps.id } })).status).toBe("APPROVED");
  });

  it("a refusal needs a reason", async () => {
    const ps = await db.professionalService.findFirstOrThrow({ where: { professionalId: proId, serviceId: otherSvc.id } });
    expect((await decide(`/api/v1/admin/pro-services/${ps.id}/decision`, { approve: false })).statusCode).toBe(400);
  });

  it("every decision is in the audit log", async () => {
    const actions = (await db.auditLog.findMany({ where: { OR: [{ targetId: proId }, { targetType: { in: ["credential", "professional_service"] } }] } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["PRO_APPLICATION_SUBMITTED", "PRO_ACCOUNT_APPROVED", "CREDENTIAL_VERIFIED", "PRO_SERVICE_APPROVED"]));
  });
});

describe("real supply", () => {
  it("only the approved service reaches the professional", async () => {
    const online = await app.inject({ method: "POST", url: "/api/v1/pro/shifts", headers: as(applicant), payload: { lat: LAT + 0.005, lng: LNG, enabledServiceIds: [approvedSvc.id, otherSvc.id] } });
    expect(online.statusCode, online.body).toBe(200);

    const order = (serviceId: string) =>
      app.inject({ method: "POST", url: "/api/v1/jobs", headers: as(customer, `w7-${Math.random()}`), payload: { serviceId, addressId, structuredAnswers: {}, mediaRefs: [] } });
    const other = await order(otherSvc.id);
    expect(other.json().job.status).not.toBe("OFFERING");
    const offer = (await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(applicant) })).body;
    expect(offer).toBe("");
    await app.inject({ method: "POST", url: `/api/v1/jobs/${other.json().job.id}/cancel`, headers: as(customer), payload: {} });

    const mine = await order(approvedSvc.id);
    expect(mine.json().job.status).toBe("OFFERING");
    const current = (await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(applicant) })).json();
    expect(current.jobId).toBe(mine.json().job.id);
    // Transparent payout (CLAUDE.md §3): at least their own visit fee, marked as an estimate.
    expect(current).toMatchObject({ expectedPayoutMinorUnits: 20000, payoutIsEstimate: true });
    await app.inject({ method: "POST", url: `/api/v1/offers/${current.offerId}/skip`, headers: as(applicant), payload: {} });
    await app.inject({ method: "POST", url: `/api/v1/jobs/${mine.json().job.id}/cancel`, headers: as(customer), payload: {} });
  });

  it("a professional whose pings stop is taken offline", async () => {
    await db.professionalProfile.update({ where: { id: proId }, data: { presenceState: "AVAILABLE" } });
    await db.professionalLocation.updateMany({ where: { professionalId: proId }, data: { receivedAt: new Date(Date.now() - 10 * 60_000) } });
    const offline = await sweepSilentProfessionals(db, 180);
    expect(offline).toContain(proId);
    expect((await db.professionalProfile.findUniqueOrThrow({ where: { id: proId } })).presenceState).toBe("OFFLINE");
    expect(await db.availabilitySession.count({ where: { professionalId: proId, status: "ACTIVE" } })).toBe(0);
  });
});
