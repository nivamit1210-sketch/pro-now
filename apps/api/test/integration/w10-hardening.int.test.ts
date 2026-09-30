import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";

/**
 * W10 (docs/21): malformed input is the client's mistake on EVERY route —
 * never a 500 — whoever sends it; security headers are on every answer;
 * an oversized body is refused before any handler runs.
 */
const ADMIN = uniqueEmail("w10-admin");
process.env.ADMIN_EMAILS = ADMIN;

let app: FastifyInstance;
const sessions: Record<string, CookieJar> = {};

beforeAll(async () => {
  app = await startApp();
  sessions.customer = await signInByEmail(app, uniqueEmail("w10-customer"));
  sessions.admin = await signInByEmail(app, ADMIN);
  const proEmail = uniqueEmail("w10-pro");
  sessions.pro = await signInByEmail(app, proEmail);
  const db = createPrisma();
  const user = await db.user.findFirstOrThrow({ where: { email: proEmail } });
  await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
  await db.professionalProfile.create({ data: { userId: user.id, legalName: "W10 Pro", displayName: "W10" } });
  await db.$disconnect();
});
afterAll(async () => {
  await app.close();
});

const concrete = (url: string) => url.replace(/:[a-zA-Z]+/g, "x").replace(/\*$/, "x");
// Sockets, Better Auth's own routes, the deliberate-error routes, and
// deleting the account (it takes no input to be malformed, and would sign
// every test caller out halfway through).
const skip = (method: string, url: string) =>
  url.includes("/ws/") || url.startsWith("/api/auth/") || url.includes("/debug/") || (method === "DELETE" && url === "/api/v1/me");

describe("malformed input is never a 500", () => {
  it("on every route, as every kind of caller", async () => {
    const routes = app.routeIndex.filter((r) => r.url.startsWith("/api/") && !skip(r.method, r.url) && r.method !== "HEAD" && r.method !== "OPTIONS");
    expect(routes.length).toBeGreaterThan(50);
    const bodies: unknown[] = [{ nonsense: [{}], text: 42 }, [1, 2, 3], "not json"];
    const failures: string[] = [];
    for (const r of routes) {
      for (const [who, jar] of Object.entries(sessions)) {
        for (const body of r.method === "GET" ? [undefined] : bodies) {
          const res = await app.inject({
            method: r.method as never,
            url: concrete(r.url) + (r.method === "GET" ? "?q=%00%ff&status=NOT_A_STATUS&lat=abc" : ""),
            headers: { cookie: jar.header(), origin: "http://localhost:4000", "content-type": typeof body === "string" ? "text/plain" : "application/json", "idempotency-key": "k-malformed-0001" },
            ...(body === undefined ? {} : { payload: typeof body === "string" ? body : JSON.stringify(body) }),
          });
          if (res.statusCode >= 500) failures.push(`${r.method} ${r.url} as ${who}: ${res.statusCode} ${res.body.slice(0, 120)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("headers and limits", () => {
  it("every answer carries the security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    // Not production: no HSTS over plain http.
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("refuses an oversized body before any handler runs", async () => {
    const fresh = await signInByEmail(app, uniqueEmail("w10-limit"));
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/match",
      headers: { cookie: fresh.header(), origin: "http://localhost:4000", "content-type": "application/json" },
      payload: JSON.stringify({ text: "א".repeat(80_000) }),
    });
    expect(res.statusCode).toBe(413);
  });
});

describe("health and readiness", () => {
  it("liveness asks nothing; readiness checks the database, PostGIS and storage", async () => {
    expect((await app.inject({ method: "GET", url: "/api/health" })).json()).toEqual({ ok: true });
    const ready = await app.inject({ method: "GET", url: "/api/ready" });
    expect(ready.statusCode, ready.body).toBe(200);
    expect(ready.json()).toMatchObject({ ready: true, checks: { database: "ok", storage: "ok" } });
    expect(ready.json().checks.postgis).toMatch(/^\d+\.\d+/);
  });

  it("is not ready when storage is not reachable, and says which part", async () => {
    const head = app.providers.storage.head;
    app.providers.storage.head = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    try {
      const res = await app.inject({ method: "GET", url: "/api/ready" });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ ready: false, checks: { database: "ok", postgis: expect.any(String), storage: "unavailable" } });
      expect(res.body).not.toContain("ECONNREFUSED");
    } finally {
      app.providers.storage.head = head;
    }
  });
});
