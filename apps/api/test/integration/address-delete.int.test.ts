import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";

/**
 * AUDIT V2 #4, the picker's ×: a customer takes a saved address off their
 * list. Only their own; a job that went there keeps its address word for
 * word; the list's first (the app's default when nothing is chosen) moves
 * on to the newest still listed; and nobody new is sent to a removed one.
 */
let app: FastifyInstance;
let db: PrismaClient;
let me: CookieJar;
let stranger: CookieJar;
let myCustomerId: string;
let serviceId: string;

const as = (j: CookieJar, idem?: string) => ({ cookie: j.header(), origin: "http://localhost:4000", ...(idem ? { "idempotency-key": idem } : {}) });
const list = async (j: CookieJar) => {
  const res = await app.inject({ method: "GET", url: "/api/v1/me/addresses", headers: as(j) });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json().addresses as Array<{ id: string; formatted: string }>).map((a) => a.id);
};
const remove = (j: CookieJar, id: string) => app.inject({ method: "DELETE", url: `/api/v1/me/addresses/${id}`, headers: as(j) });
const saveLocation = (j: CookieJar, lat: number) =>
  app.inject({ method: "POST", url: "/api/v1/me/addresses", headers: as(j), payload: { kind: "location", lat, lng: 34.7818 } });
let n = 0;
/** Saved at distinct moments, so the list's newest-first order is the order made here. */
const mine = async (formatted: string) => {
  n += 1;
  const row = await db.address.create({
    data: { customerId: myCustomerId, formatted, lat: 32.08, lng: 34.78, createdAt: new Date(Date.UTC(2026, 9, 2, 12, 0, n)) },
  });
  return row.id;
};

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  serviceId = (await db.service.findUniqueOrThrow({ where: { code: "CLEAN_URGENT" } })).id;
  me = await signInByEmail(app, uniqueEmail("addr-del"));
  stranger = await signInByEmail(app, uniqueEmail("addr-del-stranger"));
  const userId = (await whoAmI(app, me))!.user.id;
  myCustomerId = (await db.customerProfile.upsert({ where: { userId }, update: {}, create: { userId } })).id;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("taking a saved address off my list", () => {
  it("is for a signed-in customer only", async () => {
    const id = await mine("רוטשילד 1, תל אביב - יפו");
    expect((await app.inject({ method: "DELETE", url: `/api/v1/me/addresses/${id}` })).statusCode).toBe(401);
    expect(await db.address.findUnique({ where: { id } })).not.toBeNull();
  });

  it("refuses somebody else's address exactly as an unknown one, and leaves it alone", async () => {
    const id = await mine("הרצל 5, תל אביב - יפו");
    const theirs = await remove(stranger, id);
    const unknown = await remove(stranger, "no-such-address");
    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    expect(unknown.statusCode).toBe(404);
    expect(theirs.json().code).toBe(unknown.json().code);
    expect(theirs.json().message).toBe(unknown.json().message);
    expect(await db.address.findUnique({ where: { id } })).toMatchObject({ formatted: "הרצל 5, תל אביב - יפו", archivedAt: null });
    expect(await list(me)).toContain(id);
  });

  it("deletes one no job used, and the next newest becomes the list's first", async () => {
    const older = await mine("בן יהודה 10, תל אביב - יפו");
    const newest = await mine("אלנבי 20, תל אביב - יפו");
    expect((await list(me))[0]).toBe(newest);

    const res = await remove(me, newest);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ removed: "deleted" });
    expect(await db.address.findUnique({ where: { id: newest } })).toBeNull();
    const after = await list(me);
    expect(after).not.toContain(newest);
    expect(after[0]).toBe(older);

    // Gone is gone: a second × finds nothing.
    expect((await remove(me, newest)).statusCode).toBe(404);
  });

  it("archives one a job used: the job keeps its address, the list and new orders do not", async () => {
    const id = await mine("דיזנגוף 50, תל אביב - יפו · קומה 2");
    const job = await db.job.create({ data: { customerId: myCustomerId, serviceId, addressId: id, status: "CLOSED" } });

    const res = await remove(me, id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ removed: "archived" });
    expect(await list(me)).not.toContain(id);

    const kept = await db.job.findUniqueOrThrow({ where: { id: job.id }, include: { address: true } });
    expect(kept.address).toMatchObject({ id, formatted: "דיזנגוף 50, תל אביב - יפו · קומה 2", lat: 32.08, lng: 34.78 });
    expect(kept.address.archivedAt).toBeInstanceOf(Date);

    const order = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: as(me, `addr-del-${Date.now()}`),
      payload: { serviceId, addressId: id, structuredAnswers: {}, mediaRefs: [] },
    });
    expect(order.statusCode, order.body).toBe(404);
    expect(order.json()).toMatchObject({ code: "ADDRESS_NOT_FOUND" });

    // Archived is off the list for good: a second × finds nothing.
    expect((await remove(me, id)).statusCode).toBe(404);
  });

  it("saving the same place again lists a fresh address, and the archived one stays with its job", async () => {
    const first = await saveLocation(me, 32.0853);
    expect(first.statusCode, first.body).toBe(201);
    const oldId = first.json().address.id as string;
    await db.job.create({ data: { customerId: myCustomerId, serviceId, addressId: oldId, status: "CLOSED" } });
    expect((await remove(me, oldId)).json()).toEqual({ removed: "archived" });

    const again = await saveLocation(me, 32.0853);
    expect(again.statusCode, again.body).toBe(201);
    const newId = again.json().address.id as string;
    expect(newId).not.toBe(oldId);
    expect(again.json().address.formatted).toBe(first.json().address.formatted);
    const now = await list(me);
    expect(now[0]).toBe(newId);
    expect(now).not.toContain(oldId);
  });
});
