import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";

/**
 * D1 (Dvir, 2026-09-30): the face a professional chose while joining
 * reaches the customer they are sent to. A photo is approved as it is, for
 * now; the drawn character stands in when that was the choice.
 */
let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let customerId: string;
let addressId: string;
let serviceId: string;

const as = (j: CookieJar) => ({ cookie: j.header(), origin: "http://localhost:4000" });

async function assignedTo(portrait: { kind: "PHOTO" | "CHARACTER" } | null) {
  const user = await db.user.create({ data: { email: uniqueEmail("face"), emailVerified: true, name: "פנים" } });
  const upload =
    portrait?.kind === "PHOTO"
      ? await db.upload.create({ data: { ownerId: user.id, kind: "PHOTO", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `test/face-${user.id}.jpg` } })
      : null;
  const pro = await db.professionalProfile.create({
    data: {
      userId: user.id,
      legalName: "פנים",
      displayName: "פנים",
      verificationStatus: "APPROVED",
      portraitKind: portrait?.kind ?? null,
      portraitUploadId: upload?.id ?? null,
    },
  });
  const job = await db.job.create({ data: { customerId, serviceId, addressId, status: "PRO_ASSIGNED", assignedProfessionalId: pro.id } });
  const res = await app.inject({ method: "GET", url: `/api/v1/jobs/${job.id}/match`, headers: as(customer) });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().professional as { profilePhotoUrl: string | null; portraitKind: string | null };
}

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  customer = await signInByEmail(app, uniqueEmail("sees-face"));
  const userId = (await whoAmI(app, customer))!.user.id;
  customerId = (await db.customerProfile.upsert({ where: { userId }, update: {}, create: { userId } })).id;
  addressId = (await db.address.create({ data: { customerId, formatted: "בית", lat: 32.07, lng: 34.78 } })).id;
  serviceId = (await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } })).id;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("the customer sees the professional's chosen face", () => {
  it("a photo, through a short-lived link", async () => {
    const seen = await assignedTo({ kind: "PHOTO" });
    expect(seen.portraitKind).toBe("PHOTO");
    expect(seen.profilePhotoUrl).toMatch(/^https?:\/\/.+face-/);
    expect(seen.profilePhotoUrl).toMatch(/X-Amz-Expires=|Expires=/);
  });

  it("the trade's drawn character, which the screen draws for the job's service", async () => {
    const seen = await assignedTo({ kind: "CHARACTER" });
    expect(seen).toMatchObject({ portraitKind: "CHARACTER", profilePhotoUrl: null });
  });

  it("nothing chosen (joined before the step existed): no face at all", async () => {
    const seen = await assignedTo(null);
    expect(seen).toMatchObject({ portraitKind: null, profilePhotoUrl: null });
  });
});
