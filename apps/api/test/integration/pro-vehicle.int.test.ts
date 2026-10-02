import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * AUDIT V2 #8a: the professional's car — free text and only the last two or
 * three digits of the plate — saved by the professional, and told to a
 * customer only once this professional is assigned to their job (the
 * demo's arrival "מגיע ב… · ••• 47"), and only while that visit is on.
 */
let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let otherCustomer: CookieJar;
let pro: CookieJar;
let proId: string | undefined;
let serviceId: string;
let addressId: string;
const LAT = 32.171;
const LNG = 34.844;
const CAR = "סקודה אוקטביה כחולה";

const as = (j: CookieJar, idem?: string) => ({ cookie: j.header(), origin: "http://localhost:4000", ...(idem ? { "idempotency-key": idem } : {}) });
const setVehicle = (j: CookieJar, payload: unknown) => app.inject({ method: "PUT", url: "/api/v1/pro/application/vehicle", headers: as(j), payload: payload as object });
const get = (j: CookieJar | null, url: string) => app.inject({ method: "GET", url, headers: j ? as(j) : {} });

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  serviceId = (await db.service.findUniqueOrThrow({ where: { code: "CLEAN_URGENT" } })).id;
  customer = await signInByEmail(app, uniqueEmail("vehicle-customer"));
  otherCustomer = await signInByEmail(app, uniqueEmail("vehicle-other"));
  const userId = (await whoAmI(app, customer))!.user.id;
  const profile = await db.customerProfile.upsert({ where: { userId }, update: {}, create: { userId } });
  addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "ויצמן 7", lat: LAT, lng: LNG } })).id;
  const proEmail = uniqueEmail("vehicle-pro");
  proId = (await dispatchablePro(db, proEmail, serviceId, LAT, LNG)).id;
  pro = await signInByEmail(app, proEmail);
});

afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

describe("the professional saves their car", () => {
  it("is for a professional only", async () => {
    expect((await setVehicle(customer, { vehicleHe: CAR, plateTail: "47" })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/api/v1/pro/application/vehicle", payload: { vehicleHe: CAR } })).statusCode).toBe(401);
  });

  it("refuses a full plate in either field, and keeps nothing of it", async () => {
    for (const payload of [{ plateTail: "1234567" }, { plateTail: "12-345-67" }, { plateTail: "4" }, { plateTail: "1234" }, { vehicleHe: "מאזדה 3 12-345-67" }]) {
      const res = await setVehicle(pro, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().code).toBe("VALIDATION_FAILED");
    }
    expect(await db.professionalProfile.findUniqueOrThrow({ where: { id: proId } })).toMatchObject({ vehicleHe: null, vehiclePlateTail: null });
  });

  it("keeps the car and the last digits, and shows them back on the application", async () => {
    const res = await setVehicle(pro, { vehicleHe: `  ${CAR} `, plateTail: "47" });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().profile.vehicle).toEqual({ vehicleHe: CAR, plateTail: "47" });
    expect((await get(pro, "/api/v1/pro/application")).json().profile.vehicle).toEqual({ vehicleHe: CAR, plateTail: "47" });
    // Optional: clearing one leaves the other.
    expect((await setVehicle(pro, { vehicleHe: CAR, plateTail: null })).json().profile.vehicle).toEqual({ vehicleHe: CAR, plateTail: null });
    expect((await setVehicle(pro, { vehicleHe: CAR, plateTail: "471" })).json().profile.vehicle).toEqual({ vehicleHe: CAR, plateTail: "471" });
  });

  it("is not part of the profile the professional previews as customers see it", async () => {
    const preview = await get(pro, "/api/v1/pro/public-profile");
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.body).not.toContain(CAR);
  });

  it("the database itself refuses a full plate", async () => {
    await expect(db.professionalProfile.update({ where: { id: proId }, data: { vehiclePlateTail: "1234567" } })).rejects.toThrow();
  });
});

describe("the customer is told the car only once this professional is assigned", () => {
  it("hides it before assignment, tells it to this customer only while the visit is on", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: as(customer, `vehicle-${Date.now()}`),
      payload: { serviceId, addressId, structuredAnswers: {}, mediaRefs: [], onSite: { name: "סבתא רחל", phone: "0501234567" } },
    });
    expect(created.statusCode, created.body).toBe(200);
    const jobId = created.json().job.id as string;
    const minted = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/on-site-link`, headers: as(customer), payload: {} });
    const onSiteUrl = `/api/v1/on-site/${(minted.json().url as string).split("/s/")[1]}`;

    // Offered, not yet accepted: nothing anywhere the customer (or the person at home) reads.
    const offer = await get(pro, "/api/v1/pro/offers/current");
    expect(offer.json()).toMatchObject({ jobId });
    const before = [
      await get(customer, `/api/v1/jobs/${jobId}`),
      await get(customer, `/api/v1/jobs/${jobId}/match`),
      await get(customer, "/api/v1/jobs"),
      await get(null, onSiteUrl),
    ];
    expect(before[1]!.statusCode).toBe(409);
    for (const res of before) {
      expect(res.body).not.toContain(CAR);
      expect(res.body).not.toContain("vehicle\":{");
    }
    expect(before[3]!.json().professional).toBeNull();

    // Accepted: the match carries it; the person at home reads the car, never the plate digits.
    const accept = await app.inject({ method: "POST", url: `/api/v1/offers/${offer.json().offerId}/accept`, headers: as(pro, `va-${Date.now()}`), payload: {} });
    expect(accept.statusCode, accept.body).toBe(200);
    const match = await get(customer, `/api/v1/jobs/${jobId}/match`);
    expect(match.statusCode, match.body).toBe(200);
    expect(match.json().vehicle).toEqual({ vehicleHe: CAR, plateTailHe: "471" });
    const page = (await get(null, onSiteUrl)).json();
    expect(page.professional.vehicleHe).toBe(CAR);
    expect(JSON.stringify(page)).not.toContain("471");

    // Somebody else's job: nothing.
    const stranger = await get(otherCustomer, `/api/v1/jobs/${jobId}/match`);
    expect(stranger.statusCode).toBe(404);
    expect(stranger.body).not.toContain(CAR);

    // After the visit nobody needs to recognise the car.
    await db.job.update({ where: { id: jobId }, data: { status: "CLOSED" } });
    expect((await get(customer, `/api/v1/jobs/${jobId}/match`)).json().vehicle).toBeNull();
    expect((await get(null, onSiteUrl)).json().professional.vehicleHe).toBeNull();
  });
});
