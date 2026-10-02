import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

import { startApp } from "./harness.js";
import { signInByEmail, uniqueEmail, whoAmI, type CookieJar } from "./auth-helpers.js";
import { createPrisma } from "../../src/db/prisma-client.js";
import { REPORTS_PER_JOB_MAX } from "../../src/domain/safety-report.js";

/**
 * AUDIT V2 #8b: "משהו לא נראה לי תקין" at the door. Only the job's
 * customer reports, only once somebody was sent; the report is a SAFETY
 * support ticket, a line on the job's timeline and one immediate ops
 * alert; a double tap is the same report; there is a cap per job; the
 * admin lists it and closes it with a reason (audit log).
 */
const ADMIN = uniqueEmail("safety-admin");
process.env.ADMIN_EMAILS = ADMIN;

let app: FastifyInstance;
let db: PrismaClient;
let customer: CookieJar;
let customerUserId: string;
let customerId: string;
let addressId: string;
let serviceId: string;
let announce: ReturnType<typeof vi.spyOn>;

const as = (j: CookieJar) => ({ cookie: j.header(), origin: "http://localhost:4000" });
const report = (jar: CookieJar, jobId: string, payload: object) =>
  app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/safety-report`, headers: as(jar), payload });

async function job(status: string, assigned = true) {
  let assignedProfessionalId: string | undefined;
  if (assigned) {
    const user = await db.user.create({ data: { email: uniqueEmail("safety-pro"), emailVerified: true, name: "דנה" } });
    assignedProfessionalId = (await db.professionalProfile.create({
      data: { userId: user.id, legalName: "דנה לוי", displayName: "דנה", verificationStatus: "APPROVED" },
    })).id;
  }
  return db.job.create({ data: { customerId, serviceId, addressId, status: status as never, assignedProfessionalId } });
}

beforeAll(async () => {
  app = await startApp();
  db = createPrisma();
  customer = await signInByEmail(app, uniqueEmail("safety-customer"));
  customerUserId = (await whoAmI(app, customer))!.user.id;
  customerId = (await db.customerProfile.upsert({ where: { userId: customerUserId }, update: {}, create: { userId: customerUserId } })).id;
  addressId = (await db.address.create({ data: { customerId, formatted: "הרצל 12, תל אביב", lat: 32.07, lng: 34.78 } })).id;
  serviceId = (await db.service.findFirstOrThrow({ where: { priceModel: "VISIT_QUOTE" } })).id;
  announce = vi.spyOn(app.monitor, "announce");
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("who may report", () => {
  it("only the job's customer: anyone else gets the job's 404, nobody signed in 401", async () => {
    const j = await job("PRO_ARRIVED");
    const stranger = await signInByEmail(app, uniqueEmail("safety-stranger"));
    const res = await report(stranger, j.id, { reason: "NOT_THE_PERSON" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("JOB_NOT_FOUND");
    const anon = await app.inject({ method: "POST", url: `/api/v1/jobs/${j.id}/safety-report`, headers: { origin: "http://localhost:4000" }, payload: { reason: "OTHER" } });
    expect(anon.statusCode).toBe(401);
    expect(await db.supportTicket.count({ where: { jobId: j.id } })).toBe(0);
  });

  it("not before somebody was sent", async () => {
    const j = await job("SEARCHING", false);
    const res = await report(customer, j.id, { reason: "OTHER" });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("NO_PROFESSIONAL_YET");
  });

  it("refuses an unknown reason, a note over 500 and unknown keys, and keeps nothing", async () => {
    const j = await job("PRO_ARRIVED");
    for (const payload of [{ reason: "SPAM" }, { reason: "OTHER", note: "א".repeat(501) }, { reason: "OTHER", professionalId: "x" }, {}]) {
      const res = await report(customer, j.id, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await db.supportTicket.count({ where: { jobId: j.id } })).toBe(0);
  });
});

describe("a report", () => {
  it("is a SAFETY ticket, a timeline event and one immediate ops alert, and the customer is told it was received", async () => {
    const j = await job("PRO_ARRIVED");
    announce.mockClear();
    const res = await report(customer, j.id, { reason: "NOT_THE_PERSON", note: "  לא דומה לתמונה, תתקשרו אליי 0521234567 " });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({ receivedHe: "קיבלנו, נחזור אליך", replayed: false });

    const ticket = await db.supportTicket.findUniqueOrThrow({ where: { id: res.json().ticketId } });
    expect(ticket).toMatchObject({
      kind: "SAFETY",
      status: "OPEN",
      jobId: j.id,
      userId: customerUserId,
      reason: "NOT_THE_PERSON",
      noteHe: "לא דומה לתמונה, תתקשרו אליי 0521234567",
      professionalId: j.assignedProfessionalId,
      jobStatus: "PRO_ARRIVED",
      subject: "דיווח בטיחות: זה לא האדם שבתמונה",
    });
    const event = await db.jobEvent.findFirstOrThrow({ where: { jobId: j.id, type: "SAFETY_REPORTED" } });
    expect(event).toMatchObject({ actor: "CUSTOMER", actorId: customerUserId, metadata: { ticketId: ticket.id, reason: "NOT_THE_PERSON" } });

    expect(announce).toHaveBeenCalledTimes(1);
    const html = announce.mock.calls[0]![0] as string;
    expect(html).toContain("דיווח בטיחות");
    expect(html).toContain("זה לא האדם שבתמונה");
    expect(html).toContain(`<code>${j.id}</code>`);
    expect(html).toContain("מקצוען: דנה");
    // What ops needs, and nothing a chat history should keep.
    expect(html).not.toContain("0521234567");
    expect(html).not.toContain("הרצל");
    expect(html).not.toContain("safety-customer");
  });

  it("the same report again (a double tap, a retry) is the first one: no second ticket, no second alert", async () => {
    const j = await job("PRO_EN_ROUTE");
    const first = await report(customer, j.id, { reason: "WRONG_CODE" });
    expect(first.statusCode).toBe(201);
    announce.mockClear();
    const again = await report(customer, j.id, { reason: "WRONG_CODE", note: "  " });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ ticketId: first.json().ticketId, replayed: true });
    expect(announce).not.toHaveBeenCalled();
    expect(await db.supportTicket.count({ where: { jobId: j.id } })).toBe(1);
    // A different reason is a different report.
    expect((await report(customer, j.id, { reason: "FEELS_UNSAFE" })).statusCode).toBe(201);
  });

  it(`at most ${REPORTS_PER_JOB_MAX} per job, then a 429 in words with the police number`, async () => {
    const j = await job("IN_PROGRESS");
    for (let i = 0; i < REPORTS_PER_JOB_MAX; i++) {
      expect((await report(customer, j.id, { reason: "OTHER", note: `פעם ${i}` })).statusCode).toBe(201);
    }
    const over = await report(customer, j.id, { reason: "OTHER", note: "עוד פעם" });
    expect(over.statusCode).toBe(429);
    expect(over.json().code).toBe("SAFETY_REPORT_LIMIT");
    expect(over.json().message).toContain("100");
    expect(await db.supportTicket.count({ where: { jobId: j.id } })).toBe(REPORTS_PER_JOB_MAX);
  });

  it("is stored before the alert is even tried: an alert that blows up loses nothing", async () => {
    const j = await job("PRO_ARRIVED");
    // The monitor's announce never throws (alerting.test.ts); this proves the order anyway.
    announce.mockImplementationOnce(() => {
      throw new Error("alert path down");
    });
    await report(customer, j.id, { reason: "FEELS_UNSAFE" });
    expect(await db.supportTicket.count({ where: { jobId: j.id, kind: "SAFETY" } })).toBe(1);
  });
});

describe("the admin", () => {
  it("lists open reports with the visit, the reporter and the professional, and closes one with a reason (audit log, timeline)", async () => {
    const j = await job("PRO_ARRIVED");
    const created = await report(customer, j.id, { reason: "OTHER", note: "הגיע עם עוד מישהו" });
    const ticketId = created.json().ticketId as string;
    const admin = await signInByEmail(app, ADMIN);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/support-tickets", headers: as(admin) });
    expect(list.statusCode).toBe(200);
    expect(list.json().open).toBeGreaterThanOrEqual(1);
    const row = (list.json().tickets as Array<Record<string, unknown>>).find((t) => t.id === ticketId);
    expect(row).toMatchObject({
      kind: "SAFETY",
      status: "OPEN",
      reasonHe: "משהו אחר",
      noteHe: "הגיע עם עוד מישהו",
      job: { id: j.id, statusAtReport: "PRO_ARRIVED", statusNow: "PRO_ARRIVED" },
      professional: { id: j.assignedProfessionalId, displayName: "דנה" },
      reporter: { email: expect.stringContaining("safety-customer") },
    });

    expect((await app.inject({ method: "POST", url: `/api/v1/admin/support-tickets/${ticketId}/handled`, headers: as(admin), payload: {} })).statusCode).toBe(400);
    const before = await db.auditLog.count({ where: { targetId: ticketId } });
    const closed = await app.inject({ method: "POST", url: `/api/v1/admin/support-tickets/${ticketId}/handled`, headers: as(admin), payload: { reason: "דיברנו עם הלקוחה ועם המקצוענית" } });
    expect(closed.statusCode, closed.body).toBe(200);
    expect(closed.json().status).toBe("HANDLED");
    expect(await db.auditLog.count({ where: { targetId: ticketId, action: "SUPPORT_TICKET_HANDLED" } })).toBe(before + 1);
    expect(await db.jobEvent.count({ where: { jobId: j.id, type: "SAFETY_REPORT_HANDLED", actor: "OPS" } })).toBe(1);

    const again = await app.inject({ method: "POST", url: `/api/v1/admin/support-tickets/${ticketId}/handled`, headers: as(admin), payload: { reason: "שוב" } });
    expect(again.statusCode).toBe(409);
    const handled = await app.inject({ method: "GET", url: "/api/v1/admin/support-tickets?status=HANDLED", headers: as(admin) });
    expect((handled.json().tickets as Array<{ id: string }>).map((t) => t.id)).toContain(ticketId);
    const open = await app.inject({ method: "GET", url: "/api/v1/admin/support-tickets", headers: as(admin) });
    expect((open.json().tickets as Array<{ id: string }>).map((t) => t.id)).not.toContain(ticketId);
  });

  it("a customer cannot read or close the queue", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/support-tickets", headers: as(customer) })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/admin/support-tickets/x/handled", headers: as(customer), payload: { reason: "abc" } })).statusCode).toBe(403);
  });
});
