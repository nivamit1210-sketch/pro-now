import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { credentialTypeFor } from "@pro-now/types";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * The daily expiry check (docs/10 §Life after approval: the daily check):
 * a warning at 30 days, at 7 days and on expiry, each once, and an expired
 * credential marked EXPIRED.
 */
const ADMIN = uniqueEmail("exp-admin");
process.env.ADMIN_EMAILS = ADMIN;
let admin: CookieJar;
let app: FastifyInstance;
let db: PrismaClient;
let svcId: string;
const created: string[] = [];

const DAY = 86_400_000;
async function proWithCredentialExpiringIn(days: number) {
  const p = await dispatchablePro(db, uniqueEmail("exp"), svcId, 31.25, 34.79);
  created.push(p.id);
  const c = await db.professionalCredential.findFirstOrThrow({ where: { professionalId: p.id } });
  await db.professionalCredential.update({ where: { id: c.id }, data: { expiresAt: new Date(Date.now() + days * DAY) } });
  return { pro: p, credentialId: c.id };
}
const notices = (userId: string) =>
  db.notification.findMany({ where: { userId, type: "CREDENTIAL_EXPIRY" }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  app = await startApp();
  admin = await signInByEmail(app, ADMIN);
  db = createPrisma();
  const open = await db.marketActivation.findMany({
    where: { providerOnboardingEnabled: true, service: { priceModel: "VISIT_QUOTE" } },
    include: { service: { include: { requirements: true } } },
  });
  const withLicence = open.find((a) => a.service.requirements.some((r) => credentialTypeFor(r.requirement) && r.mandatory))!;
  svcId = withLicence.service.id;
});

// Each test's professional goes offline, so dispatch tests in other files are unaffected.
afterEach(async () => {
  for (const id of created.splice(0)) await takeOffline(db, id);
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("the daily credential expiry check", () => {
  it("30 days out: one WARN_30 notice with the spec's words; a second run sends nothing", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(30);
    await app.checkCredentialExpiryNow();
    await app.checkCredentialExpiryNow();
    const n = await notices(pro.userId);
    expect(n).toHaveLength(1);
    expect(n[0]!.body).toMatch(/יפוג בעוד 30 ימים — אפשר להעלות את החידוש כבר עכשיו$/);
    expect(n[0]!.data).toEqual({ url: "/pro/documents" });
    expect(await db.credentialNotice.findMany({ where: { credentialId } })).toEqual([expect.objectContaining({ kind: "WARN_30" })]);
  });

  it("after a long gap only EXPIRED goes out, and the credential is marked EXPIRED (Review Focus 2)", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(-2);
    await app.checkCredentialExpiryNow();
    expect((await notices(pro.userId)).map((x) => x.body)).toEqual([expect.stringMatching(/פג — השירות לא מקבל קריאות עד שהחידוש יאושר$/)]);
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: credentialId } })).status).toBe("EXPIRED");
  });

  it("two runs at once store and send each notice once (Review Focus 3)", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(7);
    await Promise.all([app.checkCredentialExpiryNow(), app.checkCredentialExpiryNow()]);
    expect(await db.credentialNotice.count({ where: { credentialId } })).toBe(1);
    expect(await notices(pro.userId)).toHaveLength(1);
  });

  it("a verified renewal valid past the date stops the notices", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(5);
    const old = await db.professionalCredential.findUniqueOrThrow({ where: { id: credentialId } });
    await db.professionalCredential.create({
      data: { professionalId: pro.id, serviceId: old.serviceId, type: old.type, status: "VERIFIED", expiresAt: new Date(Date.now() + 400 * DAY) },
    });
    await app.checkCredentialExpiryNow();
    expect(await notices(pro.userId)).toHaveLength(0);
  });

  it("no date (verified before this change) and 'no expiry' get nothing (Review Focus 1); a disabled service gets nothing", async () => {
    const a = await proWithCredentialExpiringIn(3);
    await db.professionalCredential.update({ where: { id: a.credentialId }, data: { expiresAt: null } });
    const b = await proWithCredentialExpiringIn(3);
    await db.professionalService.updateMany({ where: { professionalId: b.pro.id }, data: { status: "DISABLED" } });
    await app.checkCredentialExpiryNow();
    expect(await notices(a.pro.userId)).toHaveLength(0);
    expect(await notices(b.pro.userId)).toHaveLength(0);
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: a.credentialId } })).status).toBe("VERIFIED");
  });

  it("'no expiry' (noExpiry: true) gets no notice and stays VERIFIED", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(3);
    await db.professionalCredential.update({ where: { id: credentialId }, data: { expiresAt: null, noExpiry: true } });
    await app.checkCredentialExpiryNow();
    expect(await notices(pro.userId)).toHaveLength(0);
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: credentialId } })).status).toBe("VERIFIED");
  });

  it("an old credential past its date is marked EXPIRED even when a renewal covers it, with no notice", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(-2);
    const old = await db.professionalCredential.findUniqueOrThrow({ where: { id: credentialId } });
    await db.professionalCredential.create({
      data: { professionalId: pro.id, serviceId: old.serviceId, type: old.type, status: "VERIFIED", expiresAt: new Date(Date.now() + 400 * DAY) },
    });
    await app.checkCredentialExpiryNow();
    expect(await notices(pro.userId)).toHaveLength(0);
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: credentialId } })).status).toBe("EXPIRED");
  });

  it("a DRAFT service and a SUSPENDED account get no notice; the credential still becomes EXPIRED", async () => {
    const a = await proWithCredentialExpiringIn(-1);
    await db.professionalService.updateMany({ where: { professionalId: a.pro.id }, data: { status: "DRAFT" } });
    const b = await proWithCredentialExpiringIn(-1);
    await db.professionalProfile.update({ where: { id: b.pro.id }, data: { verificationStatus: "SUSPENDED" } });
    await app.checkCredentialExpiryNow();
    expect(await notices(a.pro.userId)).toHaveLength(0);
    expect(await notices(b.pro.userId)).toHaveLength(0);
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: a.credentialId } })).status).toBe("EXPIRED");
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: b.credentialId } })).status).toBe("EXPIRED");
  });

  it("re-dating a credential resets its notices: a WARN_7 already sent, then a date 20 days out gets a fresh WARN_30", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(5);
    await app.checkCredentialExpiryNow();
    expect((await db.credentialNotice.findMany({ where: { credentialId } })).map((n) => n.kind)).toEqual(["WARN_7"]);
    const decide = (payload: object) =>
      app.inject({ method: "POST", url: `/api/v1/admin/credentials/${credentialId}/decision`, headers: { cookie: admin.header(), origin: "http://localhost:4000" }, payload });
    const res = await decide({ approve: true, expiresAt: new Date(Date.now() + 20 * DAY).toISOString() });
    expect(res.statusCode, res.body).toBe(200);
    expect(await db.credentialNotice.count({ where: { credentialId } })).toBe(0);
    await app.checkCredentialExpiryNow();
    expect((await db.credentialNotice.findMany({ where: { credentialId } })).map((n) => n.kind)).toEqual(["WARN_30"]);
    expect(await notices(pro.userId)).toHaveLength(2);
    // The same date again changes nothing, so its notice stands.
    const same = (await db.professionalCredential.findUniqueOrThrow({ where: { id: credentialId } })).expiresAt!;
    expect((await decide({ approve: true, expiresAt: same.toISOString() })).statusCode).toBe(200);
    expect(await db.credentialNotice.count({ where: { credentialId } })).toBe(1);
  });

  it("the application shows the EXPIRED credential with renewalPending when a renewal was uploaded before the expiry was recorded", async () => {
    const email = uniqueEmail("exp-view");
    const p = await dispatchablePro(db, email, svcId, 31.25, 34.79);
    created.push(p.id);
    const old = await db.professionalCredential.findFirstOrThrow({ where: { professionalId: p.id } });
    await db.professionalCredential.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 2 * DAY) } });
    const renewal = await db.professionalCredential.create({ data: { professionalId: p.id, serviceId: old.serviceId, type: old.type, status: "PENDING" } });
    await app.checkCredentialExpiryNow(); // writes EXPIRED to the older row, after the renewal exists
    const jar = await signInByEmail(app, email);
    const view = (await app.inject({ method: "GET", url: "/api/v1/pro/application", headers: { cookie: jar.header(), origin: "http://localhost:4000" } })).json();
    const reqs = view.services.flatMap((s: { requirements: Array<{ credential: { id: string; status: string } | null; renewalPending: boolean }> }) => s.requirements);
    const row = reqs.find((r: { credential: { id: string } | null }) => r.credential?.id === old.id);
    expect(row, JSON.stringify(reqs)).toBeTruthy();
    expect(row.credential.status).toBe("EXPIRED");
    expect(row.renewalPending).toBe(true);
    expect(reqs.some((r: { credential: { id: string } | null }) => r.credential?.id === renewal.id)).toBe(false);
  });

  it("a disabled service's credential past its date is marked EXPIRED, with no notice", async () => {
    const { pro, credentialId } = await proWithCredentialExpiringIn(-2);
    await db.professionalService.updateMany({ where: { professionalId: pro.id }, data: { status: "DISABLED" } });
    await app.checkCredentialExpiryNow();
    expect(await notices(pro.userId)).toHaveLength(0);
    expect((await db.professionalCredential.findUniqueOrThrow({ where: { id: credentialId } })).status).toBe("EXPIRED");
  });
});

describe("the admin lists of credentials to review", () => {
  const get = async (path: string) => {
    const res = await app.inject({ method: "GET", url: `/api/v1/admin/credentials/${path}`, headers: { cookie: admin.header(), origin: "http://localhost:4000" } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };
  const ids = (rows: Array<{ credentialId: string }>) => rows.map((r) => r.credentialId);

  it("sorts each credential into expiring, expired or undated; 'no expiry' is in none; a renewal is listed with the date it replaces", async () => {
    const soon = await proWithCredentialExpiringIn(10);
    const past = await proWithCredentialExpiringIn(-3);
    const undated = await proWithCredentialExpiringIn(1);
    await db.professionalCredential.update({ where: { id: undated.credentialId }, data: { expiresAt: null } });
    const forever = await proWithCredentialExpiringIn(1);
    await db.professionalCredential.update({ where: { id: forever.credentialId }, data: { expiresAt: null, noExpiry: true } });

    const lists = await get("expiry");
    expect(ids(lists.expiring)).toContain(soon.credentialId);
    expect(ids(lists.expired)).toContain(past.credentialId);
    expect(ids(lists.undated)).toContain(undated.credentialId);
    expect(ids(lists.expiring)).not.toContain(past.credentialId);
    expect(ids(lists.expired)).not.toContain(soon.credentialId);
    for (const l of [lists.expiring, lists.expired, lists.undated]) expect(ids(l)).not.toContain(forever.credentialId);
    const row = lists.expiring.find((r: { credentialId: string }) => r.credentialId === soon.credentialId);
    expect(row).toEqual(expect.objectContaining({ professionalId: soon.pro.id, displayName: expect.any(String), serviceNameHe: expect.any(String), type: expect.any(String) }));
    expect(lists.undated.find((r: { credentialId: string }) => r.credentialId === undated.credentialId).expiresAt).toBeNull();

    // After the daily run the past one is EXPIRED and still listed as expired.
    await app.checkCredentialExpiryNow();
    expect(ids((await get("expiry")).expired)).toContain(past.credentialId);

    const old = await db.professionalCredential.findUniqueOrThrow({ where: { id: soon.credentialId } });
    const renewal = await db.professionalCredential.create({ data: { professionalId: soon.pro.id, serviceId: old.serviceId, type: old.type, status: "PENDING" } });
    const { renewals } = await get("renewals");
    const r = renewals.find((x: { credentialId: string }) => x.credentialId === renewal.id);
    expect(r).toEqual(expect.objectContaining({ professionalId: soon.pro.id, replacesExpiresAt: old.expiresAt!.toISOString() }));
    expect(renewals.map((x: { credentialId: string }) => x.credentialId)).not.toContain(soon.credentialId);
  });
});
