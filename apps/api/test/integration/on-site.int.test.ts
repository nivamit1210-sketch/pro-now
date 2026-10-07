import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * Ordering for someone else (docs/21 W6): a link for the person at home,
 * and a door code the server issues at assignment.
 */
let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let customerUserId: string;
let pro: CookieJar;
let serviceId: string;
let proId: string | undefined;
let addressId: string;
const LAT = 32.07;
const LNG = 34.79;

const as = (j: CookieJar, idem?: string) => ({
  cookie: j.header(),
  origin: "http://localhost:4000",
  ...(idem ? { "idempotency-key": idem } : {}),
});

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  serviceId = (await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } })).id;
  customer = await signInByEmail(app, uniqueEmail("onsite-orderer"));
  customerUserId = (await whoAmI(app, customer))!.user.id;
  const profile = await db.customerProfile.upsert({ where: { userId: customerUserId }, update: { fullName: "יוסי כהן" }, create: { userId: customerUserId, fullName: "יוסי כהן" } });
  addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "סבא: הרצל 5", lat: LAT, lng: LNG } })).id;
  const proEmail = uniqueEmail("onsite-pro");
  proId = (await dispatchablePro(db, proEmail, serviceId, LAT, LNG)).id;
  pro = await signInByEmail(app, proEmail);
});

afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

const createJob = (onSite?: { name: string; phone: string }) =>
  app.inject({
    method: "POST",
    url: "/api/v1/jobs",
    headers: as(customer, `onsite-${Date.now()}-${Math.random()}`),
    payload: { serviceId, addressId, structuredAnswers: {}, mediaRefs: [], ...(onSite ? { onSite } : {}) },
  });

describe("ordering for someone else", () => {
  let jobId: string;
  let link: string;
  const token = () => link.split("/s/")[1]!;

  it("refuses a number that is not an Israeli mobile", async () => {
    const res = await createJob({ name: "סבא יוסף", phone: "12345" });
    expect(res.statusCode).toBe(400);
  });

  it("takes the person at home with the order, and mints a link for them", async () => {
    const res = await createJob({ name: "סבא יוסף", phone: "050-1234567" });
    expect(res.statusCode, res.body).toBe(200);
    jobId = res.json().job.id;

    const minted = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/on-site-link`, headers: as(customer), payload: {} });
    expect(minted.statusCode, minted.body).toBe(200);
    link = minted.json().url;
    expect(link).toMatch(/\/s\/[A-Za-z0-9_-]{40,}$/);
    // Only the hash is stored.
    const row = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.onSiteTokenHash).not.toContain(token());
  });

  it("before anyone is assigned, the page says so and shows no code", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/on-site/${token()}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ordererNameHe: "יוסי",
      onSiteNameHe: "סבא יוסף",
      quote: null,
      paidDirectly: true,
      serviceNameHe: expect.any(String),
      serviceCode: expect.any(String),
      stage: "searching",
      professional: null,
      etaSeconds: null,
      doorCode: null,
    });
    // No address and no price on a page anyone holding the link can open.
    expect(res.body).not.toContain("הרצל");
    expect(res.body).not.toMatch(/MinorUnits|price/i);
  });

  it("assignment issues a door code the professional and the page share", async () => {
    const offer = await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(pro) });
    expect(offer.json().jobId).toBe(jobId);
    const accept = await app.inject({ method: "POST", url: `/api/v1/offers/${offer.json().offerId}/accept`, headers: as(pro, `a-${Date.now()}`), payload: {} });
    expect(accept.statusCode, accept.body).toBe(200);

    const proView = (await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${jobId}`, headers: as(pro) })).json();
    expect(proView.doorCodeHe).toMatch(/^\d{4}$/);
    expect(proView.onSiteNameHe).toBe("סבא יוסף");

    const page = (await app.inject({ method: "GET", url: `/api/v1/on-site/${token()}` })).json();
    expect(page).toMatchObject({ stage: "coming", doorCode: proView.doorCodeHe, professional: { displayName: "Pat", photoUrl: null, portraitKind: null } });

    const mine = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json();
    expect(mine.onSite).toEqual({ name: "סבא יוסף", doorCode: proView.doorCodeHe });
  });

  it("a new link retires the old one", async () => {
    const old = token();
    const minted = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/on-site-link`, headers: as(customer), payload: {} });
    link = minted.json().url;
    expect((await app.inject({ method: "GET", url: `/api/v1/on-site/${old}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/on-site/${token()}` })).statusCode).toBe(200);
  });

  it("an expired link opens nothing", async () => {
    await db.job.update({ where: { id: jobId }, data: { onSiteTokenExpiresAt: new Date(Date.now() - 1000) } });
    expect((await app.inject({ method: "GET", url: `/api/v1/on-site/${token()}` })).statusCode).toBe(404);
  });

  it("only the orderer may mint a link, and only for an order for someone else", async () => {
    const stranger = await signInByEmail(app, uniqueEmail("onsite-stranger"));
    expect((await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/on-site-link`, headers: as(stranger), payload: {} })).statusCode).toBe(404);
    // A professional who is not a customer is refused by role before anything else.
    expect([403, 404]).toContain((await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/on-site-link`, headers: as(pro), payload: {} })).statusCode);
  });

  it("the person at home is erased with the orderer's account", async () => {
    await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/cancel`, headers: as(customer), payload: {} });
    const del = await app.inject({ method: "DELETE", url: "/api/v1/me", headers: as(customer) });
    expect(del.statusCode, del.body).toBe(200);
    const row = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(row).toMatchObject({ onSiteName: null, onSitePhone: null, onSiteTokenHash: null });
  });
});
