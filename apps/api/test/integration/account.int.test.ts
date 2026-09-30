import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, signInWithGoogle, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";

let app: FastifyInstance;
let db: PrismaClient;

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const headers = (jar: CookieJar) => ({ cookie: jar.header(), origin: "http://localhost:4000" });
const reachesApi = async (jar: CookieJar) =>
  (await app.inject({ method: "GET", url: "/api/v1/me/addresses", headers: headers(jar) })).statusCode;

describe("sign out everywhere", () => {
  it("ends every session of the person, on every device", async () => {
    const email = uniqueEmail("everywhere");
    const phone = await signInByEmail(app, email);
    const laptop = await signInByEmail(app, email);
    expect(await reachesApi(phone)).toBe(200);
    expect(await reachesApi(laptop)).toBe(200);

    const res = await app.inject({ method: "POST", url: "/api/auth/revoke-sessions", headers: headers(phone), payload: {} });
    expect(res.statusCode, res.body).toBe(200);
    expect(await reachesApi(phone)).toBe(401);
    expect(await reachesApi(laptop)).toBe(401);
  });
});

describe("delete my account", () => {
  async function customerWithAddress(tag: string) {
    const email = uniqueEmail(tag);
    const jar = await signInByEmail(app, email);
    const userId = (await whoAmI(app, jar))!.user.id;
    const address = await app.inject({
      method: "POST",
      url: "/api/v1/me/addresses",
      headers: headers(jar),
      payload: { formatted: "רחוב הדוגמה 1, תל אביב", lat: 32.07, lng: 34.78, label: "בית" },
    });
    expect(address.statusCode, address.body).toBe(201);
    return { email, jar, userId };
  }

  const deleteMe = (jar: CookieJar) => app.inject({ method: "DELETE", url: "/api/v1/me", headers: headers(jar) });

  it("erases who the person is, removes every way in, and keeps the records others depend on", async () => {
    const { email, jar, userId } = await customerWithAddress("leaver");
    const customer = await db.customerProfile.findUniqueOrThrow({ where: { userId } });
    const service = await db.service.findFirstOrThrow();
    const address = await db.address.findFirstOrThrow({ where: { customerId: customer.id } });
    const closedJob = await db.job.create({
      data: { customerId: customer.id, serviceId: service.id, addressId: address.id, status: "CLOSED" },
    });

    const res = await deleteMe(jar);
    expect(res.statusCode, res.body).toBe(200);

    expect(await reachesApi(jar)).toBe(401);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.deletedAt).not.toBeNull();
    expect(user.email).not.toContain(email.split("@")[0]);
    expect(user.email.endsWith("@users.invalid")).toBe(true);
    expect(user.name).toBe("");
    expect(await db.session.count({ where: { userId } })).toBe(0);
    expect(await db.account.count({ where: { userId } })).toBe(0);
    expect(await db.userRole.count({ where: { userId } })).toBe(0);

    const erased = await db.address.findUniqueOrThrow({ where: { id: address.id } });
    expect(erased).toMatchObject({ formatted: "[נמחק]", label: null, lat: 0, lng: 0 });
    expect(await db.job.findUnique({ where: { id: closedJob.id } })).not.toBeNull();

    const audit = await db.auditLog.findMany({ where: { targetId: userId, action: "ACCOUNT_DELETED" } });
    expect(audit).toHaveLength(1);
  });

  it("a professional's names, trading name and chosen face go too", async () => {
    const { jar, userId } = await customerWithAddress("pro-leaver");
    const pro = await db.professionalProfile.create({
      data: { userId, legalName: "יוסי כהן", displayName: "יוסי", portraitKind: "CHARACTER" },
    });
    await db.businessProfile.create({ data: { professionalId: pro.id, tradingName: "יוסי אינסטלציה", taxStatus: "EXEMPT" } });

    expect((await deleteMe(jar)).statusCode).toBe(200);

    expect(await db.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } })).toMatchObject({
      legalName: "[נמחק]",
      displayName: "[נמחק]",
      portraitKind: null,
      portraitUploadId: null,
    });
    expect(await db.businessProfile.findUniqueOrThrow({ where: { professionalId: pro.id } })).toMatchObject({ tradingName: null, taxStatus: "EXEMPT" });
  });

  it("the same email later signs up as a new, unrelated person", async () => {
    const { email, jar, userId } = await customerWithAddress("returner");
    expect((await deleteMe(jar)).statusCode).toBe(200);
    const again = await whoAmI(app, await signInByEmail(app, email));
    expect(again?.user.id).toBeDefined();
    expect(again?.user.id).not.toBe(userId);
  });

  it("a deleted Google sign-in no longer leads back to the old account", async () => {
    const email = uniqueEmail("google-leaver");
    const first = await signInWithGoogle(app, { email, email_verified: true });
    const oldId = (await whoAmI(app, first.jar))!.user.id;
    expect((await deleteMe(first.jar)).statusCode).toBe(200);
    const second = await signInWithGoogle(app, { email, email_verified: true });
    expect((await whoAmI(app, second.jar))?.user.id).not.toBe(oldId);
  });

  it("is refused while the person is inside a job, and nothing changes", async () => {
    const { jar, userId } = await customerWithAddress("busy");
    const customer = await db.customerProfile.findUniqueOrThrow({ where: { userId } });
    const address = await db.address.findFirstOrThrow({ where: { customerId: customer.id } });
    const service = await db.service.findFirstOrThrow();
    await db.job.create({
      data: { customerId: customer.id, serviceId: service.id, addressId: address.id, status: "PRO_EN_ROUTE" },
    });

    const res = await deleteMe(jar);
    expect(res.statusCode).toBe(409);
    expect(await reachesApi(jar)).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
  });

  it("needs a session", async () => {
    expect((await app.inject({ method: "DELETE", url: "/api/v1/me" })).statusCode).toBe(401);
  });
});
