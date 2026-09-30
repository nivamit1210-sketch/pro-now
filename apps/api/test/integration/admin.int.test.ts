import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * W8 acceptance (docs/21): a non-admin gets 403 on EVERY /api/v1/admin/*
 * route, and EVERY admin mutation writes an audit row. Both enumerate the
 * server's own route list, so a route added later is covered or fails.
 */
const ADMIN = uniqueEmail("w8-admin");
process.env.ADMIN_EMAILS = ADMIN;

let app: FastifyInstance;
let db: PrismaClient;
let admin: CookieJar;
let customer: CookieJar;
let customerId: string;
let proId: string | undefined;

const as = (j: CookieJar, idem?: string) => ({
  cookie: j.header(),
  origin: "http://localhost:4000",
  ...(idem ? { "idempotency-key": idem } : {}),
});
const adminRoutes = () =>
  app.routeIndex.filter((r) => r.url.startsWith("/api/v1/admin/") && r.method !== "HEAD" && r.method !== "OPTIONS");
const concrete = (url: string) => url.replace(/:[a-zA-Z]+/g, "x");

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  admin = await signInByEmail(app, ADMIN);
  customer = await signInByEmail(app, uniqueEmail("w8-customer"));
  customerId = (await whoAmI(app, customer))!.user.id;
});
afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

describe("every admin route refuses anyone who is not an admin", () => {
  it("enumerates the routes", () => {
    expect(adminRoutes().length).toBeGreaterThanOrEqual(14);
  });

  it("403 for a signed-in customer, 401 for nobody", async () => {
    for (const r of adminRoutes()) {
      const as_customer = await app.inject({ method: r.method as never, url: concrete(r.url), headers: as(customer), payload: {} });
      expect(as_customer.statusCode, `${r.method} ${r.url}`).toBe(403);
      const anonymous = await app.inject({ method: r.method as never, url: concrete(r.url), headers: { origin: "http://localhost:4000" }, payload: {} });
      expect(anonymous.statusCode, `${r.method} ${r.url} (anonymous)`).toBe(401);
    }
  });
});

describe("every admin mutation writes an audit row", () => {
  it("covers every mutation route, and each one writes exactly one row", async () => {
    // Something for each decision to act on.
    const svc = await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } });
    const pro = await dispatchablePro(db, uniqueEmail("w8-pro"), svc.id, 31.5, 34.8);
    proId = pro.id;
    await takeOffline(db, pro.id);
    const ps = await db.professionalService.findFirstOrThrow({ where: { professionalId: pro.id } });
    const credential = await db.professionalCredential.findFirst({ where: { professionalId: pro.id } });
    const activation = await db.marketActivation.findFirstOrThrow({ where: { serviceId: svc.id } });

    const cases: Record<string, { url: string; payload: object }> = {
      "POST /api/v1/admin/professionals/:id/decision": { url: `/api/v1/admin/professionals/${pro.id}/decision`, payload: { approve: true } },
      "POST /api/v1/admin/credentials/:id/decision": credential
        ? { url: `/api/v1/admin/credentials/${credential.id}/decision`, payload: { approve: true } }
        : { url: "", payload: {} },
      "POST /api/v1/admin/pro-services/:id/decision": { url: `/api/v1/admin/pro-services/${ps.id}/decision`, payload: { approve: true } },
      "POST /api/v1/admin/users/:id/roles": { url: `/api/v1/admin/users/${customerId}/roles`, payload: { role: "PROFESSIONAL", grant: true, reason: "test grant" } },
      "PATCH /api/v1/admin/market/:id": { url: `/api/v1/admin/market/${activation.id}`, payload: { customerVisible: true, reason: "test switch" } },
    };
    // The debug routes change nothing: they throw, on purpose (monitoring, docs/23).
    const mutations = adminRoutes().filter((r) => r.method !== "GET" && !r.url.includes("/debug/"));
    for (const r of mutations) {
      const key = `${r.method} ${r.url}`;
      expect(Object.keys(cases), `a mutation with no audit test: ${key}`).toContain(key);
      const c = cases[key]!;
      if (!c.url) continue;
      const before = await db.auditLog.count();
      const res = await app.inject({ method: r.method as never, url: c.url, headers: as(admin), payload: c.payload });
      expect(res.statusCode, `${key}: ${res.body}`).toBe(200);
      expect(await db.auditLog.count(), key).toBe(before + 1);
    }
  });
});

describe("what the admin can and cannot do", () => {
  it("cannot make an admin: that comes only from the allowlist", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/users/${customerId}/roles`, headers: as(admin), payload: { role: "ADMIN", grant: true, reason: "no" } });
    expect(res.statusCode).toBe(400);
  });

  it("the dispatch switch is real: switched off, a service reaches nobody", async () => {
    const svc = await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE", code: { not: undefined } } });
    const activation = await db.marketActivation.findFirstOrThrow({ where: { serviceId: svc.id } });
    const pro2 = await dispatchablePro(db, uniqueEmail("w8-pro2"), svc.id, 31.9, 34.9);
    const profile = await db.customerProfile.upsert({ where: { userId: customerId }, update: {}, create: { userId: customerId } });
    const addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "x", lat: 31.9, lng: 34.9 } })).id;
    const order = () =>
      app.inject({ method: "POST", url: "/api/v1/jobs", headers: as(customer, `w8-${Math.random()}`), payload: { serviceId: svc.id, addressId, structuredAnswers: {}, mediaRefs: [] } });

    const off = await app.inject({ method: "PATCH", url: `/api/v1/admin/market/${activation.id}`, headers: as(admin), payload: { dispatchEnabled: false, reason: "pause" } });
    expect(off.statusCode).toBe(200);
    const blocked = await order();
    expect(blocked.json().job.status).not.toBe("OFFERING");
    await app.inject({ method: "POST", url: `/api/v1/jobs/${blocked.json().job.id}/cancel`, headers: as(customer), payload: {} });

    await app.inject({ method: "PATCH", url: `/api/v1/admin/market/${activation.id}`, headers: as(admin), payload: { dispatchEnabled: true, reason: "resume" } });
    const offered = await order();
    expect(offered.json().job.status).toBe("OFFERING");
    await app.inject({ method: "POST", url: `/api/v1/jobs/${offered.json().job.id}/cancel`, headers: as(customer), payload: {} });
    await takeOffline(db, pro2.id);
  });

  it("opens a professional's documents only through short-lived links", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: customerId } });
    const upload = await db.upload.create({ data: { ownerId: user.id, kind: "DOCUMENT", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `test/${Date.now()}.jpg` } });
    await db.professionalDocument.create({ data: { professionalId: proId!, kind: "GOVERNMENT_ID", storageRef: upload.storageKey, uploadId: upload.id } });
    const res = await app.inject({ method: "GET", url: `/api/v1/admin/professionals/${proId}`, headers: as(admin) });
    expect(res.statusCode, res.body).toBe(200);
    const doc = res.json().documents.find((d: { kind: string }) => d.kind === "GOVERNMENT_ID");
    expect(doc.url).toMatch(/X-Amz-Expires=120/);
  });

  it("the inspector tells a job's story from its events, and usage counts what exists", async () => {
    const list = (await app.inject({ method: "GET", url: "/api/v1/admin/jobs", headers: as(admin) })).json();
    expect(list.jobs.length).toBeGreaterThan(0);
    const one = (await app.inject({ method: "GET", url: `/api/v1/admin/jobs/${list.jobs[0].id}`, headers: as(admin) })).json();
    expect(one.events.map((e: { type: string }) => e.type)).toContain("JOB_CREATED");
    const usage = (await app.inject({ method: "GET", url: "/api/v1/admin/usage", headers: as(admin) })).json();
    expect(usage.users).toBeGreaterThan(0);
    expect(usage.database.bytes).toBeGreaterThan(0);
    expect(usage.storage.limitBytes).toBeNull();
  });
});
