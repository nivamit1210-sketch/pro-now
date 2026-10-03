import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { credentialTypeFor } from "@pro-now/types";

import { startApp } from "./harness.js";
import { uniqueEmail } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * The daily expiry check (docs/10 §Life after approval: the daily check):
 * a warning at 30 days, at 7 days and on expiry, each once, and an expired
 * credential marked EXPIRED.
 */
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
    expect(n[0]!.body).toMatch(/יפוג בעוד 30 יום — אפשר להעלות את החידוש כבר עכשיו$/);
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
});
