import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { purgeMatchFeedback } from "../../src/domain/matching/retention.js";

let app: FastifyInstance;
let db: PrismaClient;
let jar: CookieJar;
let userId: string;

const as = (j: CookieJar) => ({ cookie: j.header(), origin: "http://localhost:4000" });

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  jar = await signInByEmail(app, uniqueEmail("match"));
  userId = (await whoAmI(app, jar))!.user.id;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("POST /api/v1/match", () => {
  it("needs a signed-in person", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/match", payload: { text: "המזגן לא מקרר" } });
    expect(res.statusCode).toBe(401);
  });

  it("answers the plan's three sentences (docs/21 W5)", async () => {
    const ask = async (text: string) =>
      (await app.inject({ method: "POST", url: "/api/v1/match", headers: as(jar), payload: { text } })).json();

    const electric = await ask("לא צריך חשמלאי, צריך אינסטלטור");
    expect(electric.candidates.map((c: { serviceId: string }) => c.serviceId)).not.toContain("svc-electric");

    expect((await ask("הדלת של הרכב לא נפתחת")).candidates[0].serviceId).toBe("svc-car-lockout");
    expect((await ask("העכבר של המחשב לא עובד")).candidates[0].serviceId).toBe("svc-computer");

    const mouse = await ask("יש לי עכבר");
    expect(mouse).toMatchObject({ confidence: "low", classifier: "keyword", clarify: { options: ["svc-computer", "svc-pest"] } });
  });

  it("refuses an empty or oversized sentence", async () => {
    for (const text of ["   ", "א".repeat(501)]) {
      const res = await app.inject({ method: "POST", url: "/api/v1/match", headers: as(jar), payload: { text } });
      expect(res.statusCode, JSON.stringify(text.length)).toBe(400);
    }
  });
});

describe("POST /api/v1/match/feedback", () => {
  it("records what was suggested and what was chosen", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/match/feedback",
      headers: as(jar),
      payload: { text: "יש לי עכבר", suggestedServiceIds: ["svc-computer", "svc-pest"], chosenServiceId: "svc-pest", confidence: "low" },
    });
    expect(res.statusCode, res.body).toBe(204);
    const rows = await db.matchFeedback.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: "יש לי עכבר", chosenServiceId: "svc-pest", confidence: "low", classifier: "keyword" });
  });

  it("refuses a service that does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/match/feedback",
      headers: as(jar),
      payload: { text: "x", suggestedServiceIds: ["svc-made-up"], chosenServiceId: null, confidence: "none" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("is swept after the retention period", async () => {
    const old = await db.matchFeedback.create({
      data: { userId, text: "ישן", suggestedServiceIds: [], chosenServiceId: null, confidence: "none", classifier: "keyword", createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000) },
    });
    await purgeMatchFeedback(db);
    expect(await db.matchFeedback.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.matchFeedback.count({ where: { userId } })).toBe(1);
  });

  it("is erased with the account", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/v1/me", headers: as(jar) });
    expect(res.statusCode, res.body).toBe(200);
    expect(await db.matchFeedback.count({ where: { userId } })).toBe(0);
  });
});
