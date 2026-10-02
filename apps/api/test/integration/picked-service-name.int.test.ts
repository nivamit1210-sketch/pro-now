import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { pilotServiceById } from "@pro-now/types";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { dispatchablePro, takeOffline } from "./pro-helpers.js";

/**
 * AUDIT V2 #1: the customer orders "ניקיון דחוף" from the catalogue
 * (`svc-clean`) and the server dispatches CLEAN_URGENT ("מנקה פנוי/ה להיום
 * עכשיו"). As in the demo, the picked name is kept on the job and is the
 * one every later view returns: the customer's job, list, match and the
 * page for the person at home, and the professional's offer and job.
 */
let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let pro: CookieJar;
let proId: string | undefined;
let serviceId: string;
let serviceNameHe: string;
let addressId: string;
const PICKED = pilotServiceById["svc-clean"]!.nameHe;
const LAT = 32.115;
const LNG = 34.835;

const as = (j: CookieJar, idem?: string) => ({ cookie: j.header(), origin: "http://localhost:4000", ...(idem ? { "idempotency-key": idem } : {}) });
const createJob = (payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/api/v1/jobs",
    headers: as(customer, `picked-${Date.now()}-${Math.random()}`),
    payload: { serviceId, addressId, structuredAnswers: {}, mediaRefs: [], ...payload },
  });

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  const service = await db.service.findUniqueOrThrow({ where: { code: "CLEAN_URGENT" } });
  serviceId = service.id;
  serviceNameHe = service.nameHe;
  customer = await signInByEmail(app, uniqueEmail("picked-customer"));
  const userId = (await whoAmI(app, customer))!.user.id;
  const profile = await db.customerProfile.upsert({ where: { userId }, update: {}, create: { userId } });
  addressId = (await db.address.create({ data: { customerId: profile.id, formatted: "הרצל 9", lat: LAT, lng: LNG } })).id;
  const proEmail = uniqueEmail("picked-pro");
  proId = (await dispatchablePro(db, proEmail, serviceId, LAT, LNG)).id;
  pro = await signInByEmail(app, proEmail);
});

afterAll(async () => {
  await takeOffline(db, proId);
  await app.close();
  await db.$disconnect();
});

describe("the service name the customer picked stays with the job", () => {
  it("the two catalogues really do name it differently (what this fixes)", () => {
    expect(PICKED).toBe("ניקיון דחוף");
    expect(serviceNameHe).not.toBe(PICKED);
  });

  it("refuses a catalogue service that is not the one being dispatched, or none at all", async () => {
    for (const catalogServiceId of ["svc-leak", "svc-nope", "constructor"]) {
      const res = await createJob({ catalogServiceId, onSite: undefined });
      expect(res.statusCode, catalogServiceId).toBe(400);
      expect(res.json().code).toBe("CATALOG_SERVICE_MISMATCH");
    }
  });

  it("is stored from the catalogue and returned to the customer and to the professional", async () => {
    const created = await createJob({ catalogServiceId: "svc-clean", onSite: { name: "סבתא רחל", phone: "0501234567" } });
    expect(created.statusCode, created.body).toBe(200);
    const jobId = created.json().job.id as string;
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ catalogServiceId: "svc-clean", catalogServiceNameHe: PICKED });

    // The professional's offer, then their job once accepted.
    const offer = await app.inject({ method: "GET", url: "/api/v1/pro/offers/current", headers: as(pro) });
    expect(offer.statusCode, offer.body).toBe(200);
    expect(offer.json()).toMatchObject({ jobId, serviceNameHe: PICKED });
    const accept = await app.inject({ method: "POST", url: `/api/v1/offers/${offer.json().offerId}/accept`, headers: as(pro, `a-${Date.now()}`), payload: {} });
    expect(accept.statusCode, accept.body).toBe(200);
    const proJob = await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${jobId}`, headers: as(pro) });
    expect(proJob.json().serviceNameHe).toBe(PICKED);

    // The customer's job, list and match.
    const mine = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json();
    expect(mine.serviceNameHe).toBe(PICKED);
    expect(mine.job.catalogServiceId).toBe("svc-clean");
    const list = (await app.inject({ method: "GET", url: "/api/v1/jobs", headers: as(customer) })).json();
    expect(list.jobs.find((j: { id: string }) => j.id === jobId).serviceNameHe).toBe(PICKED);
    const match = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}/match`, headers: as(customer) })).json();
    expect(match.serviceNameHe).toBe(PICKED);

    // The person at home reads it too.
    const minted = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/on-site-link`, headers: as(customer), payload: {} });
    const page = (await app.inject({ method: "GET", url: `/api/v1/on-site/${(minted.json().url as string).split("/s/")[1]}` })).json();
    expect(page.serviceNameHe).toBe(PICKED);

    await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/cancel`, headers: as(customer), payload: {} });
  });

  it("a job ordered without it (an older client) keeps the service's own name", async () => {
    const created = await createJob({});
    expect(created.statusCode, created.body).toBe(200);
    const jobId = created.json().job.id as string;
    const mine = (await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}`, headers: as(customer) })).json();
    expect(mine.serviceNameHe).toBe(serviceNameHe);
    await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/cancel`, headers: as(customer), payload: {} });
  });
});
