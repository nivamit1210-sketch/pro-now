import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * W6 (docs/21): a customer's job from request to review, with no money in
 * the app (D1), and the job's socket announcing every step.
 *
 * A repair priced only once somebody looks (VISIT_QUOTE): the app carries
 * the visit and its fee, and the repair is agreed directly — the
 * professional finishes the diagnosis and the job goes to the customer's
 * confirmation with no quote (docs/18-ROADMAP, Amit 2026-09-29; Dvir
 * 2026-10-02). A quote in the app is for a job ordered for someone else;
 * that path is the second describe.
 */
let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let pro: CookieJar;
let serviceId: string;
let proId: string | undefined;
let addressId: string;

const as = (j: CookieJar, idem?: string) => ({
  cookie: j.header(),
  origin: "http://localhost:4000",
  ...(idem ? { "idempotency-key": idem } : {}),
});
const LAT = 32.0853;
const LNG = 34.7818;

beforeAll(async () => {
  process.env.IN_APP_PAYMENTS = "off";
  app = await startApp();
  db = createPrisma();
  // A service priced by visit and quote (the helper gives the pro its documents).
  const svc = await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } });
  serviceId = svc.id;

  customer = await signInByEmail(app, uniqueEmail("w6-customer"));
  const me = (await whoAmI(app, customer))!;
  const profile = await db.customerProfile.upsert({ where: { userId: me.user.id }, update: {}, create: { userId: me.user.id } });
  addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "הרצל 1, תל אביב", lat: LAT, lng: LNG } })).id;

  const proEmail = uniqueEmail("w6-pro");
  proId = (await dispatchablePro(db, proEmail, serviceId, LAT, LNG)).id;
  pro = await signInByEmail(app, proEmail);
});

afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

describe("a job from request to review, no money in the app (D1)", () => {
  let jobId: string;
  const heard: string[] = [];

  it("dispatch offers the job to the one eligible professional", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: as(customer, `w6-${Date.now()}`),
      payload: { serviceId, addressId, description: "נזילה מתחת לכיור", structuredAnswers: {}, mediaRefs: [] },
    });
    expect(res.statusCode, res.body).toBe(200);
    jobId = res.json().job.id;
    expect(res.json().job.status).toBe("OFFERING");
  });

  it("the calls list shows the job with nobody assigned yet", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/jobs", headers: as(customer) });
    expect(list.statusCode, list.body).toBe(200);
    const row = list.json().jobs.find((j: { id: string }) => j.id === jobId);
    expect(row).toMatchObject({ status: "OFFERING", professional: null, ratingGiven: null, amountMinorUnits: null });
    expect(typeof row.serviceCode).toBe("string");
  });

  it("the customer's socket hears every step", async () => {
    const ws = await app.injectWS(`/api/v1/ws/jobs/${jobId}`, { headers: as(customer) });
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as { type: string; eventType?: string };
      heard.push(msg.type === "JOB_EVENT" ? msg.eventType! : msg.type);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(heard).toContain("READY");

    const offer = await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(pro) });
    const accept = await app.inject({ method: "POST", url: `/api/v1/offers/${offer.json().offerId}/accept`, headers: as(pro, `acc-${Date.now()}`), payload: {} });
    expect(accept.statusCode, accept.body).toBe(200);

    for (const step of ["en-route", "arrive", "start"]) {
      const r = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/${step}`, headers: as(pro), payload: {} });
      expect(r.statusCode, `${step}: ${r.body}`).toBe(200);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(heard).toEqual(expect.arrayContaining(["OFFER_ACCEPTED", "PRO_EN_ROUTE_REQUESTED", "PRO_ARRIVED_REQUESTED", "SERVICE_STARTED"]));
    ws.terminate();
  });

  it("starting the visit is the diagnosis", async () => {
    const job = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json().job;
    expect(job.status).toBe("DIAGNOSIS");
  });

  it("finishing the diagnosis goes to the customer's confirmation, with no quote", async () => {
    const done = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/complete`, headers: as(pro), payload: {} });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json()).toMatchObject({ ok: true, status: "COMPLETION_PENDING" });
    const job = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json().job;
    expect(job.status).toBe("COMPLETION_PENDING");
    expect(await db.quote.count({ where: { jobId } })).toBe(0);
    expect(job.events.map((e: { type: string; actor: string }) => `${e.type}:${e.actor}`)).toContain("SERVICE_COMPLETION_REQUESTED:PROFESSIONAL");
  });

  it("the customer's confirmation closes it at the visit fee, and moves no money", async () => {
    const confirm = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/confirm-completion`, headers: as(customer), payload: {} });
    expect(confirm.statusCode, confirm.body).toBe(200);
    // The professional's own visit fee (pro-helpers: 25000) — the visit was the job.
    expect(confirm.json()).toMatchObject({ status: "REVIEW_PENDING", receipt: { paidInApp: false, amountMinorUnits: 25000, basis: "VISIT_FEE_ONLY" } });

    expect(await db.payment.count({ where: { jobId } })).toBe(0);
    expect(await db.ledgerEntry.count({ where: { payment: { jobId } } })).toBe(0);

    const view = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json();
    expect(view).toMatchObject({ paymentsInApp: false, receipt: { amountMinorUnits: 25000, paidInApp: false } });
  });

  it("the professional's earnings show the job, paid directly, with no net", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/pro/earnings", headers: as(pro) });
    expect(res.statusCode, res.body).toBe(200);
    const { breakdown } = res.json();
    expect(breakdown).toMatchObject({ paidDirectly: true, periodNetMinorUnits: null, awaitingCommissionDecision: false });
    expect(breakdown.jobs).toContainEqual(expect.objectContaining({ jobId, grossMinorUnits: 25000, netMinorUnits: null }));
  });

  it("the review closes the job", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/reviews`, headers: as(customer), payload: { overallRating: 5, text: "מעולה" } });
    expect(res.statusCode, res.body).toBe(200);
    expect((await db.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("CLOSED");
  });

  it("the professional sees their profile as customers do: the review, an initial for the reviewer, no full name", async () => {
    await db.customerProfile.updateMany({ where: { jobs: { some: { id: jobId } } }, data: { fullName: "נועה כהן" } });
    const res = await app.inject({ method: "GET", url: "/api/v1/pro/public-profile", headers: as(pro) });
    expect(res.statusCode, res.body).toBe(200);
    const view = res.json();
    expect(view.professional).toMatchObject({ proNowRatingCount: expect.any(Number), verifications: expect.any(Array) });
    expect(view.services.length).toBeGreaterThan(0);
    const review = view.reviews.find((r: { text: string | null }) => r.text === "מעולה");
    expect(review).toMatchObject({ rating: 5, reviewerLabelHe: "נועה כ׳", serviceNameHe: expect.any(String) });
    expect(res.body).not.toContain("נועה כהן");
  });

  it("only a professional has a public profile", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/pro/public-profile", headers: as(customer) })).statusCode).toBe(403);
  });

  it("the calls list then says who came, the stars given and the receipt's amount", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/jobs", headers: as(customer) });
    const row = list.json().jobs.find((j: { id: string }) => j.id === jobId);
    const assigned = await db.professionalProfile.findUniqueOrThrow({ where: { id: proId! } });
    expect(row).toMatchObject({
      status: "CLOSED",
      professional: { id: assigned.id, displayName: assigned.displayName },
      ratingGiven: 5,
      amountMinorUnits: 25000,
    });
  });

  it("nobody else's calls list shows the job", async () => {
    const stranger = await signInByEmail(app, uniqueEmail("w6-list-stranger"));
    const list = await app.inject({ method: "GET", url: "/api/v1/jobs", headers: as(stranger) });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().jobs.map((j: { id: string }) => j.id)).not.toContain(jobId);
  });

  it("nobody else may listen to the job", async () => {
    const stranger = await signInByEmail(app, uniqueEmail("w6-stranger"));
    const ws = await app.injectWS(`/api/v1/ws/jobs/${jobId}`, { headers: as(stranger) });
    const code = await new Promise<number>((resolve) => ws.on("close", (c: number) => resolve(c)));
    expect(code).toBe(4404);
  });
});

describe("ordered for someone else: the repair is quoted in the app", () => {
  let jobId: string;

  it("the professional sees whose door it is", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: as(customer, `w6-onsite-${Date.now()}`),
      payload: { serviceId, addressId, description: "נזילה אצל סבא", structuredAnswers: {}, mediaRefs: [], onSite: { name: "סבא יוסף", phone: "050-1234567" } },
    });
    expect(res.statusCode, res.body).toBe(200);
    jobId = res.json().job.id;
    const offer = await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(pro) });
    expect(offer.json().jobId).toBe(jobId);
    const accept = await app.inject({ method: "POST", url: `/api/v1/offers/${offer.json().offerId}/accept`, headers: as(pro, `acc-onsite-${Date.now()}`), payload: {} });
    expect(accept.statusCode, accept.body).toBe(200);
    for (const step of ["en-route", "arrive", "start"]) {
      const r = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/${step}`, headers: as(pro), payload: {} });
      expect(r.statusCode, `${step}: ${r.body}`).toBe(200);
    }
    const view = (await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${jobId}`, headers: as(pro) })).json();
    expect(view).toMatchObject({ status: "DIAGNOSIS", priceModel: "VISIT_QUOTE", onSiteNameHe: "סבא יוסף" });
  });

  it("the quote from the diagnosis is approved on sending while no money moves (D1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${jobId}/quotes`,
      headers: as(pro),
      payload: { lineItems: [{ description: "החלפת סיפון", quantity: 1, unitPriceMinorUnits: 22000, kind: "MATERIALS" }] },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ autoApproved: true, quote: { status: "APPROVED" } });
    const job = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json().job;
    expect(job.status).toBe("IN_PROGRESS");
    expect(job.events.map((e: { type: string; actor: string }) => `${e.type}:${e.actor}`)).toContain("QUOTE_APPROVED:SYSTEM");
  });

  it("completion closes it at the approved quote", async () => {
    const done = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/complete`, headers: as(pro), payload: {} });
    expect(done.json()).toMatchObject({ ok: true, status: "COMPLETION_PENDING" });
    const confirm = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/confirm-completion`, headers: as(customer), payload: {} });
    expect(confirm.statusCode, confirm.body).toBe(200);
    expect(confirm.json()).toMatchObject({ status: "REVIEW_PENDING", receipt: { paidInApp: false, amountMinorUnits: 22000, basis: "APPROVED_QUOTE" } });
    expect(await db.payment.count({ where: { jobId } })).toBe(0);
  });
});
