import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/** Life after approval: edits (docs/10 §Life after approval, §Edits after approval). */
const ADMIN = uniqueEmail("aa-admin");
process.env.ADMIN_EMAILS = ADMIN;

let app: FastifyInstance;
let db: PrismaClient;
let admin: CookieJar;
let proJar: CookieJar;
let pro: { id: string; userId: string };

const as = (j: CookieJar) => ({ cookie: j.header(), origin: "http://localhost:4000" });

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  const svc = await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } });
  const email = uniqueEmail("aa-pro");
  const p = await dispatchablePro(db, email, svc.id, 31.5, 34.8);
  await takeOffline(db, p.id);
  await db.professionalProfile.update({ where: { id: p.id }, data: { dateOfBirth: new Date("1990-01-01T00:00:00Z"), addressAs: "M" } });
  await db.identityVerification.create({ data: { professionalId: p.id, vendorName: "sandbox-identity", status: "VERIFIED", method: "MANUAL" } });
  pro = { id: p.id, userId: p.userId };
  proJar = await signInByEmail(app, email);
  admin = await signInByEmail(app, ADMIN);
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("edits after approval", () => {
  it("locks the legal name and date of birth once identity is verified; an unchanged re-save is fine (Review Focus 4)", async () => {
    const join = (payload: object) => app.inject({ method: "POST", url: "/api/v1/pro/join", headers: as(proJar), payload });
    const same = { displayName: "פט החדש", legalName: "Pat Pro", addressAs: "M", dateOfBirth: "1990-01-01" };
    expect((await join(same)).statusCode).toBe(200);
    expect((await join({ ...same, legalName: "Pat Other" })).json().code).toBe("IDENTITY_LOCKED");
    expect((await join({ ...same, dateOfBirth: "1991-01-01" })).json().code).toBe("IDENTITY_LOCKED");
  });

  it("staff can correct them: audited with before and after, the age rule holds, and the professional is told", async () => {
    const patch = (payload: object, jar = admin) => app.inject({ method: "PATCH", url: `/api/v1/admin/professionals/${pro.id}/identity-details`, headers: as(jar), payload });
    expect((await patch({ legalName: "Pat Proper", reason: "תיקון לפי תעודה" }, proJar)).statusCode).toBe(403);
    expect((await patch({ reason: "בלי שדות" })).statusCode).toBe(400);
    const minor = `${new Date().getUTCFullYear() - 17}-01-01`;
    expect((await patch({ dateOfBirth: minor, reason: "בדיקה" })).json().code).toBe("UNDER_MINIMUM_AGE");
    const ok = await patch({ legalName: "Pat Proper", reason: "תיקון לפי תעודה" });
    expect(ok.statusCode, ok.body).toBe(200);
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "PRO_IDENTITY_DETAILS_CORRECTED", targetId: pro.id } });
    expect(a.beforeJson).toMatchObject({ legalName: "Pat Pro" });
    expect(a.afterJson).toMatchObject({ legalName: "Pat Proper" });
    expect(await db.notification.count({ where: { userId: pro.userId, type: "PRO_DETAILS_CORRECTED" } })).toBe(1);
    expect((await db.notification.findFirstOrThrow({ where: { userId: pro.userId, type: "PRO_DETAILS_CORRECTED" } })).data).toMatchObject({ url: "/pro" });
  });

  it("a tax-status change on an approved account notifies every admin; an unchanged one does not", async () => {
    const put = (taxStatus: string) => app.inject({ method: "PUT", url: "/api/v1/pro/application/business", headers: as(proJar), payload: { tradingName: null, taxStatus } });
    await put("EXEMPT"); // establish
    const before = await db.notification.count({ where: { type: "STAFF_TAX_STATUS_CHANGED" } });
    await put("EXEMPT");
    expect(await db.notification.count({ where: { type: "STAFF_TAX_STATUS_CHANGED" } })).toBe(before);
    await put("COMPANY");
    const adminUser = (await whoAmI(app, admin))!.user.id;
    expect(await db.notification.count({ where: { userId: adminUser, type: "STAFF_TAX_STATUS_CHANGED" } })).toBeGreaterThan(0);
    expect((await db.notification.findFirstOrThrow({ where: { userId: adminUser, type: "STAFF_TAX_STATUS_CHANGED" } })).data).toMatchObject({ url: "/admin" });
  });

  it("the admin card lists the last 30 days of changes, staff corrections marked", async () => {
    const detail = (await app.inject({ method: "GET", url: `/api/v1/admin/professionals/${pro.id}`, headers: as(admin) })).json();
    expect(detail.recentChanges[0]).toMatchObject({ action: expect.any(String), at: expect.any(String) });
    expect(detail.recentChanges.some((c: { byStaff: boolean }) => c.byStaff)).toBe(true);
  });
});
