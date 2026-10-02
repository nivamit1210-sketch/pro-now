import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";

let app: FastifyInstance;
let db: PrismaClient;
let alice: { userId: string; jar: CookieJar; addressId: string };
let bob: { userId: string; jar: CookieJar };
let pat: { userId: string; proId: string; jar: CookieJar };
let quinn: { userId: string; proId: string; jar: CookieJar };
let serviceId: string;

const as = (person: { jar: CookieJar }) => ({ cookie: person.jar.header(), origin: "http://localhost:4000" });

async function makeCustomer(tag: string) {
  const jar = await signInByEmail(app, uniqueEmail(tag));
  const userId = (await whoAmI(app, jar))!.user.id;
  await db.customerProfile.upsert({ where: { userId }, update: {}, create: { userId } });
  return { userId, jar };
}

async function makeProfessional(tag: string) {
  const email = uniqueEmail(tag);
  const user = await db.user.create({ data: { email, emailVerified: true, name: tag } });
  await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
  const profile = await db.professionalProfile.create({
    data: { userId: user.id, legalName: tag, displayName: tag, verificationStatus: "APPROVED" },
  });
  return { userId: user.id, proId: profile.id, jar: await signInByEmail(app, email) };
}

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  alice = { ...(await makeCustomer("media-alice")), addressId: "" };
  bob = await makeCustomer("media-bob");
  pat = await makeProfessional("media-pat");
  quinn = await makeProfessional("media-quinn");
  serviceId = (await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } })).id;
  const customer = await db.customerProfile.findUniqueOrThrow({ where: { userId: alice.userId } });
  alice.addressId = (
    await db.address.create({ data: { customerId: customer.id, formatted: "Alice media home", lat: 32.07, lng: 34.78 } })
  ).id;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("media ownership and job attachment", () => {
  it("rejects an attachment that is not owned and ready", async () => {
    const foreign = await db.upload.create({
      data: {
        ownerId: bob.userId,
        kind: "PHOTO",
        mime: "image/jpeg",
        bytes: 100,
        status: "READY",
        storageKey: `integration/${crypto.randomUUID()}`,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: { ...as(alice), "idempotency-key": `media-foreign-${foreign.id}` },
      payload: { serviceId, addressId: alice.addressId, mediaRefs: [foreign.id] },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "UPLOADS_NOT_READY" });
  });

  it("refuses an identity or document upload of their own as a job attachment: only photos and voice notes", async () => {
    for (const [kind, mime] of [["IDENTITY", "image/jpeg"], ["DOCUMENT", "application/pdf"]] as const) {
      const own = await db.upload.create({
        data: { ownerId: alice.userId, kind, mime, bytes: 100, status: "READY", storageKey: `integration/${crypto.randomUUID()}` },
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/jobs",
        headers: { ...as(alice), "idempotency-key": `media-kind-${own.id}` },
        payload: { serviceId, addressId: alice.addressId, mediaRefs: [own.id] },
      });
      expect(response.statusCode, `${kind}: ${response.body}`).toBe(422);
      expect(response.json()).toMatchObject({ code: "UPLOADS_NOT_READY" });
    }
  });

  it("exposes media to the assigned professional and refuses another professional", async () => {
    const upload = await db.upload.create({
      data: {
        ownerId: alice.userId,
        kind: "PHOTO",
        mime: "image/jpeg",
        bytes: 100,
        status: "READY",
        storageKey: `integration/${crypto.randomUUID()}`,
      },
    });
    const customer = await db.customerProfile.findUniqueOrThrow({ where: { userId: alice.userId } });
    const job = await db.job.create({
      data: {
        customerId: customer.id,
        serviceId,
        addressId: alice.addressId,
        assignedProfessionalId: pat.proId,
        status: "PRO_ASSIGNED",
        media: { create: [{ kind: upload.kind, storageRef: upload.storageKey, uploadId: upload.id }] },
      },
    });

    const wrongJob = await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${job.id}`, headers: as(quinn) });
    expect(wrongJob.statusCode).toBe(404);

    const rightJob = await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${job.id}`, headers: as(pat) });
    expect(rightJob.statusCode, rightJob.body).toBe(200);
    expect(rightJob.json().media).toMatchObject([{ kind: "PHOTO", mime: "image/jpeg", bytes: 100 }]);

    const wrongMedia = await app.inject({ method: "GET", url: `/api/v1/media/${upload.id}`, headers: as(quinn) });
    expect(wrongMedia.statusCode).toBe(403);
    const rightMedia = await app.inject({ method: "GET", url: `/api/v1/media/${upload.id}`, headers: as(pat) });
    expect(rightMedia.statusCode).toBe(302);
  });

  it("uploads three photos and a voice note, then exposes them only after assignment", async () => {
    const storageKeys: string[] = [];
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const voice = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

    async function upload(kind: "PHOTO" | "VOICE_NOTE", mime: string, body: Buffer): Promise<string> {
      const prepared = await app.inject({
        method: "POST",
        url: "/api/v1/uploads",
        headers: as(alice),
        payload: { kind, mime, bytes: body.byteLength },
      });
      expect(prepared.statusCode, prepared.body).toBe(201);
      const { uploadUrl, upload } = prepared.json() as {
        uploadUrl: string;
        upload: { id: string; storageKey: string };
      };
      storageKeys.push(upload.storageKey);

      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body });
      expect(put.status, await put.text()).toBe(200);

      const complete = await app.inject({
        method: "POST",
        url: `/api/v1/uploads/${upload.id}/complete`,
        headers: as(alice),
      });
      expect(complete.statusCode, complete.body).toBe(200);
      return upload.id;
    }

    try {
      const mediaRefs = [await upload("PHOTO", "image/jpeg", photo), await upload("PHOTO", "image/jpeg", photo), await upload("PHOTO", "image/jpeg", photo), await upload("VOICE_NOTE", "audio/mp4", voice)];
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/jobs",
        headers: { ...as(alice), "idempotency-key": `media-full-${crypto.randomUUID()}` },
        payload: { serviceId, addressId: alice.addressId, mediaRefs },
      });
      expect(created.statusCode, created.body).toBe(200);
      const jobId = (created.json() as { job: { id: string } }).job.id;
      await db.job.update({ where: { id: jobId }, data: { assignedProfessionalId: pat.proId, status: "PRO_ASSIGNED" } });

      const visible = await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${jobId}`, headers: as(pat) });
      expect(visible.statusCode, visible.body).toBe(200);
      expect(visible.json().media).toHaveLength(4);
      expect(visible.json().media.map((item: { kind: string }) => item.kind)).toEqual([
        "PHOTO",
        "PHOTO",
        "PHOTO",
        "VOICE_NOTE",
      ]);

      const hidden = await app.inject({ method: "GET", url: `/api/v1/pro/jobs/${jobId}`, headers: as(quinn) });
      expect(hidden.statusCode).toBe(404);
      const mediaHidden = await app.inject({ method: "GET", url: `/api/v1/media/${mediaRefs[0]}`, headers: as(quinn) });
      expect(mediaHidden.statusCode).toBe(403);
    } finally {
      await Promise.all(storageKeys.map((key) => app.providers.storage.delete(key)));
    }
  });
});
