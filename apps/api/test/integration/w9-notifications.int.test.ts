import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";

import { startApp } from "./harness.js";
import { latestEmailTo, signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * W9 (docs/21): offers on the professional's own channel, the customer's
 * inbox, email that actually leaves, the live ETA, and push subscriptions.
 */
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = "mailto:ops@pronow.test";

let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let customerEmail: string;
let pro: CookieJar;
let proId: string;
let serviceId: string;
let addressId: string;
let jobId: string;
const LAT = 32.3;
const LNG = 34.86;

const as = (j: CookieJar, idem?: string) => ({
  cookie: j.header(),
  origin: "http://localhost:4000",
  ...(idem ? { "idempotency-key": idem } : {}),
});
const heard = (ws: { on: (e: string, f: (raw: Buffer) => void) => void }) => {
  const got: Array<{ type: string; eventType?: string; title?: string }> = [];
  ws.on("message", (raw: Buffer) => got.push(JSON.parse(raw.toString())));
  return got;
};
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  serviceId = (await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } })).id;
  customerEmail = uniqueEmail("w9-customer");
  customer = await signInByEmail(app, customerEmail);
  const me = (await whoAmI(app, customer))!;
  const profile = await db.customerProfile.upsert({ where: { userId: me.user.id }, update: {}, create: { userId: me.user.id } });
  addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "נתניה", lat: LAT, lng: LNG } })).id;
  const proEmail = uniqueEmail("w9-pro");
  proId = (await dispatchablePro(db, proEmail, serviceId, LAT, LNG)).id;
  pro = await signInByEmail(app, proEmail);
});
afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

describe("notifications", () => {
  it("the offer reaches the professional's own channel the moment dispatch sends it", async () => {
    const ws = await app.injectWS("/api/v1/ws/me", { headers: as(pro) });
    const got = heard(ws);
    await settle();
    const res = await app.inject({ method: "POST", url: "/api/v1/jobs", headers: as(customer, `w9-${Date.now()}`), payload: { serviceId, addressId, structuredAnswers: {}, mediaRefs: [] } });
    jobId = res.json().job.id;
    await settle();
    // READY may arrive before the listener is attached; the offer must arrive after it.
    expect(got.map((m) => m.type)).toContain("OFFER");
    ws.terminate();
  });

  it("the customer's inbox hears the acceptance, live and kept", async () => {
    const ws = await app.injectWS("/api/v1/ws/me", { headers: as(customer) });
    const got = heard(ws);
    await settle();
    const offer = (await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(pro) })).json();
    await app.inject({ method: "POST", url: `/api/v1/offers/${offer.offerId}/accept`, headers: as(pro, `a-${Date.now()}`), payload: {} });
    await settle();
    const found = got.find((m) => m.type === "NOTIFICATION") as { title?: string; body?: string } | undefined;
    expect(found?.title).toBe("נמצא מקצוען");
    // Named, and in the professional's own gender, although the event is announced before the accept commits.
    expect(found?.body).toMatch(/^Pat (יצא|יצאה) אליכם בקרוב/);
    ws.terminate();

    const inbox = (await app.inject({ method: "GET", url: "/api/v1/me/notifications", headers: as(customer) })).json();
    expect(inbox.unread).toBeGreaterThanOrEqual(1);
    expect(inbox.notifications[0]).toMatchObject({ type: "OFFER_ACCEPTED", url: `/jobs/${jobId}`, read: false });
    await app.inject({ method: "POST", url: "/api/v1/me/notifications/read", headers: as(customer), payload: {} });
    expect((await app.inject({ method: "GET", url: "/api/v1/me/notifications", headers: as(customer) })).json().unread).toBe(0);
  });

  it("the ETA moves with the professional, and the customer's job channel says so", async () => {
    await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/en-route`, headers: as(pro), payload: {} });
    const ws = await app.injectWS(`/api/v1/ws/jobs/${jobId}`, { headers: as(customer) });
    const got = heard(ws);
    await settle();
    const before = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}/match`, headers: as(customer) })).json().eta;
    const ping = await app.inject({ method: "POST", url: "/api/v1/pro/location", headers: as(pro), payload: { lat: LAT + 0.002, lng: LNG, capturedAt: new Date().toISOString() } });
    expect(ping.statusCode, ping.body).toBe(200);
    await settle();
    expect(got.some((m) => m.type === "JOB_EVENT" && m.eventType === "PRO_LOCATION")).toBe(true);
    const after = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}/match`, headers: as(customer) })).json().eta;
    expect(new Date(after.computedAt).getTime()).toBeGreaterThan(new Date(before.computedAt).getTime());
    expect(after.etaSeconds).toBeLessThan(before.etaSeconds);
    // Where the trip started stays put while the ETA counts down: the offer's snapshot.
    const match = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}/match`, headers: as(customer) })).json();
    const snapshot = (await db.dispatchOffer.findFirstOrThrow({ where: { jobId, status: "ACCEPTED" }, orderBy: { offeredAt: "desc" } })).etaSecondsSnapshot;
    expect(snapshot).not.toBeNull();
    expect(match.etaSecondsAtAssignment).toBe(snapshot);
    expect(match.etaSecondsAtAssignment).toBeGreaterThanOrEqual(after.etaSeconds);
    ws.terminate();
  });

  it("'the work is done' also arrives by email, through the outbox", async () => {
    for (const step of ["arrive", "start"]) await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/${step}`, headers: as(pro), payload: {} });
    await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/complete`, headers: as(pro), payload: {} });
    await settle();
    expect(await db.emailOutbox.count({ where: { toEmail: customerEmail, status: "PENDING" } })).toBe(1);
    await app.drainEmailNow();
    const mail = await latestEmailTo(customerEmail);
    expect(mail.subject).toBe("PRO NOW · העבודה הסתיימה");
    expect(await db.emailOutbox.count({ where: { toEmail: customerEmail, status: "SENT" } })).toBe(1);
  });

  it("a browser can subscribe to push; the public key is served", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/push/public-key" })).json().publicKey).toBe(vapid.publicKey);
    const sub = { endpoint: `https://push.example/${Date.now()}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
    expect((await app.inject({ method: "POST", url: "/api/v1/me/push-subscriptions", headers: as(customer), payload: sub })).statusCode).toBe(201);
    expect(await db.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(1);
  });

  it("everything personal here is erased with the account", async () => {
    await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/confirm-completion`, headers: as(customer), payload: {} });
    const userId = (await whoAmI(app, customer))!.user.id;
    const del = await app.inject({ method: "DELETE", url: "/api/v1/me", headers: as(customer) });
    expect(del.statusCode, del.body).toBe(200);
    expect(await db.notification.count({ where: { userId } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { userId } })).toBe(0);
  });
});
