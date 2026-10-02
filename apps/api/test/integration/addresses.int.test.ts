import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, type CookieJar } from "./auth-helpers.js";

let app: FastifyInstance;
let jar: CookieJar;
const headers = () => ({ cookie: jar.header(), origin: "http://localhost:4000" });
const TEL_AVIV = 5000;

beforeAll(async () => {
  app = await startApp();
  jar = await signInByEmail(app, uniqueEmail("addresses"));
});
afterAll(async () => {
  await app.close();
});

const suggest = async (q: string) => {
  const res = await app.inject({ method: "GET", url: `/api/v1/geo/streets?q=${encodeURIComponent(q)}`, headers: headers() });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().suggestions as Array<{ localityCode: number; streetCode: number; streetName: string; localityName: string; houseNumber: string | null }>;
};
const save = (payload: object) => app.inject({ method: "POST", url: "/api/v1/me/addresses", headers: headers(), payload });

describe("street suggestions", () => {
  it("is for a signed-in customer only", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/geo/streets?q=הרצל" })).statusCode).toBe(401);
  });

  it("answers from two characters, from the official list", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/geo/streets?q=ה", headers: headers() })).statusCode).toBe(400);
    expect((await suggest("הר")).length).toBeGreaterThan(0);
  });

  it("puts the named place first and carries the house number", async () => {
    const [top] = await suggest("הרצל 12 תל");
    expect(top).toMatchObject({ streetName: "הרצל", localityName: "תל אביב - יפו", localityCode: TEL_AVIV, houseNumber: "12" });
  });

  it("finds nothing for letters that are no street", async () => {
    expect(await suggest("קקקקק")).toEqual([]);
  });
});

describe("saving an address", () => {
  it("places a street from the list on the map itself, at the house", async () => {
    const [herzl] = await suggest("הרצל 12 תל");
    const res = await save({ kind: "street", localityCode: herzl!.localityCode, streetCode: herzl!.streetCode, houseNumber: "12", details: "קומה 3" });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().address).toMatchObject({
      formatted: "הרצל 12, תל אביב - יפו · קומה 3",
      lat: 32.0622,
      geoPrecision: "HOUSE",
      houseNumber: "12",
    });
  });

  it("falls back to the street when the map does not know the house", async () => {
    const [herzl] = await suggest("הרצל תל");
    const res = await save({ kind: "street", localityCode: herzl!.localityCode, streetCode: herzl!.streetCode, houseNumber: "999" });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().address).toMatchObject({ formatted: "הרצל 999, תל אביב - יפו", lat: 32.0472, geoPrecision: "STREET" });
  });

  it("refuses a street the map does not know, rather than guessing", async () => {
    const [other] = await suggest("דיזנגוף תל");
    const res = await save({ kind: "street", localityCode: other!.localityCode, streetCode: other!.streetCode, houseNumber: "50" });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "ADDRESS_NOT_ON_MAP" });
  });

  it("refuses a street that is not in the list", async () => {
    const res = await save({ kind: "street", localityCode: TEL_AVIV, streetCode: 8_888_888 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "STREET_NOT_FOUND" });
  });

  it("refuses free text with coordinates, the shape that sent professionals nowhere", async () => {
    const res = await save({ formatted: "asdfgh", lat: 32.07, lng: 34.78 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("keeps the device's own location, named by the server", async () => {
    const res = await save({ kind: "location", lat: 32.0853, lng: 34.7818, details: "דירה 4" });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().address).toMatchObject({ geoPrecision: "DEVICE", lat: 32.0853 });
    expect(res.json().address.formatted).toMatch(/· דירה 4$/);
  });
});
