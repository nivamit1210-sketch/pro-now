import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";

/**
 * AUDIT V2 #3: how the professional asked to be addressed while joining
 * (addressAs "M" / "F") reaches every view the customer's screens read
 * about them, so arrival and tracking say הגיעה about a woman: the match,
 * the job list (home capsule, הקריאות שלי) and the page for the person at home.
 */
let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let customerId: string;
let addressId: string;
let serviceId: string;

const as = (j: CookieJar) => ({ cookie: j.header(), origin: "http://localhost:4000" });

async function jobAssignedTo(addressAs: string | null) {
  const user = await db.user.create({ data: { email: uniqueEmail("address-as"), emailVerified: true, name: "דנה" } });
  const pro = await db.professionalProfile.create({
    data: { userId: user.id, legalName: "דנה לוי", displayName: "דנה", verificationStatus: "APPROVED", addressAs },
  });
  return db.job.create({
    data: {
      customerId,
      serviceId,
      addressId,
      status: "PRO_ARRIVED",
      assignedProfessionalId: pro.id,
      onSiteName: "סבתא רחל",
      onSitePhone: "0501234567",
    },
  });
}

async function seen(jobId: string) {
  const match = await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}/match`, headers: as(customer) });
  expect(match.statusCode, match.body).toBe(200);
  const list = await app.inject({ method: "GET", url: "/api/v1/jobs", headers: as(customer) });
  expect(list.statusCode, list.body).toBe(200);
  const row = (list.json().jobs as Array<{ id: string; professional: { addressAs: unknown } | null }>).find((j) => j.id === jobId);
  const minted = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/on-site-link`, headers: as(customer), payload: {} });
  expect(minted.statusCode, minted.body).toBe(200);
  const token = (minted.json().url as string).split("/s/")[1]!;
  const page = await app.inject({ method: "GET", url: `/api/v1/on-site/${token}` });
  expect(page.statusCode, page.body).toBe(200);
  return {
    match: match.json().professional.addressAs,
    list: row?.professional?.addressAs,
    onSite: page.json().professional.addressAs,
  };
}

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  customer = await signInByEmail(app, uniqueEmail("sees-address-as"));
  const userId = (await whoAmI(app, customer))!.user.id;
  customerId = (await db.customerProfile.upsert({ where: { userId }, update: {}, create: { userId } })).id;
  addressId = (await db.address.create({ data: { customerId, formatted: "בית", lat: 32.07, lng: 34.78 } })).id;
  serviceId = (await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } })).id;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("the customer's views carry how the professional asked to be addressed", () => {
  it("feminine: F in the match, the job list and the on-site page", async () => {
    const job = await jobAssignedTo("F");
    expect(await seen(job.id)).toEqual({ match: "F", list: "F", onSite: "F" });
  });

  it("masculine: M everywhere", async () => {
    const job = await jobAssignedTo("M");
    expect(await seen(job.id)).toEqual({ match: "M", list: "M", onSite: "M" });
  });

  it("not chosen (joined before the step existed), or anything unexpected: null, never a guess", async () => {
    for (const stored of [null, "X"]) {
      const job = await jobAssignedTo(stored);
      expect(await seen(job.id)).toEqual({ match: null, list: null, onSite: null });
    }
  });
});
