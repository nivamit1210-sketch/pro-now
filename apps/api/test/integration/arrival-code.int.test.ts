import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * The arrival screen's code (docs/21 W6): the four digits the assigned
 * professional says at the door. The server issues it at assignment for
 * EVERY job — not only one ordered for someone else — and hands it to the
 * customer and the professional, and to nobody before someone is assigned.
 */
let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let other: CookieJar;
let pro: CookieJar;
let serviceId: string;
let proId: string | undefined;
let addressId: string;
let jobId: string;
const LAT = 32.09;
const LNG = 34.77;

const as = (j: CookieJar, idem?: string) => ({
  cookie: j.header(),
  origin: "http://localhost:4000",
  ...(idem ? { "idempotency-key": idem } : {}),
});

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  serviceId = (await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } })).id;
  customer = await signInByEmail(app, uniqueEmail("arrival-customer"));
  const userId = (await whoAmI(app, customer))!.user.id;
  const profile = await db.customerProfile.upsert({ where: { userId }, update: {}, create: { userId } });
  addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "בן יהודה 20", lat: LAT, lng: LNG } })).id;
  other = await signInByEmail(app, uniqueEmail("arrival-other"));
  const proEmail = uniqueEmail("arrival-pro");
  proId = (await dispatchablePro(db, proEmail, serviceId, LAT, LNG)).id;
  pro = await signInByEmail(app, proEmail);
});

afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

describe("the code at the door, on an ordinary job", () => {
  it("before anyone is assigned there is no code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: as(customer, `arrival-${Date.now()}`),
      payload: { serviceId, addressId, structuredAnswers: {}, mediaRefs: [] },
    });
    expect(res.statusCode, res.body).toBe(200);
    jobId = res.json().job.id;
    const mine = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json();
    expect(mine.onSite).toBeNull();
    expect(mine.doorCode).toBeNull();
  });

  it("assignment issues one, and the customer and the professional see the same four digits", async () => {
    const offer = await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(pro) });
    expect(offer.json().jobId).toBe(jobId);
    const accept = await app.inject({ method: "POST", url: `/api/v1/offers/${offer.json().offerId}/accept`, headers: as(pro, `a-${Date.now()}`), payload: {} });
    expect(accept.statusCode, accept.body).toBe(200);

    const proView = (await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${jobId}`, headers: as(pro) })).json();
    expect(proView.doorCodeHe).toMatch(/^\d{4}$/);
    expect(proView.onSiteNameHe).toBeNull();

    const mine = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json();
    expect(mine.doorCode).toBe(proView.doorCodeHe);
    expect(mine.onSite).toBeNull();
  });

  it("it stays the same through the arrival", async () => {
    const before = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json().doorCode;
    for (const step of ["en-route", "arrive"]) {
      const res = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/${step}`, headers: as(pro, `${step}-${Date.now()}`), payload: {} });
      expect(res.statusCode, res.body).toBe(200);
    }
    const mine = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json();
    expect(mine.job.status).toBe("PRO_ARRIVED");
    expect(mine.doorCode).toBe(before);
  });

  it("another customer cannot read it", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(other) });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toMatch(/doorCode/);
  });
});
