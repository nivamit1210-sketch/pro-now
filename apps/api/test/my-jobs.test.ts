import { describe, expect, it } from "vitest";

import { settledAmount, toMyJobSummary, type MyJobRow } from "../src/domain/job/my-jobs.js";

const row = (over: Partial<MyJobRow> = {}): MyJobRow => ({
  id: "job_1",
  status: "CLOSED",
  createdAt: new Date("2026-09-30T10:00:00.000Z"),
  catalogServiceNameHe: null,
  service: { nameHe: "תיקון נזילה", code: "PLUMB_LEAK" },
  assignedProfessional: { id: "pro_1", displayName: "יוסי" },
  review: { overallRating: 4 },
  events: [{ type: "SETTLED_OUTSIDE_APP", metadata: { paidInApp: false, amountMinorUnits: 22000, currency: "ILS" } }],
  ...over,
});

describe("the customer's job list row (GET /v1/jobs)", () => {
  it("carries who came, the stars given and what the work came to", () => {
    expect(toMyJobSummary(row())).toEqual({
      id: "job_1",
      status: "CLOSED",
      createdAt: "2026-09-30T10:00:00.000Z",
      serviceNameHe: "תיקון נזילה",
      serviceCode: "PLUMB_LEAK",
      professional: { id: "pro_1", displayName: "יוסי" },
      ratingGiven: 4,
      amountMinorUnits: 22000,
    });
  });

  it("names the service as the customer picked it, when the job kept that name (audit v2 #1)", () => {
    expect(toMyJobSummary(row({ catalogServiceNameHe: "נזילה או דליפת מים" })).serviceNameHe).toBe("נזילה או דליפת מים");
  });

  it("invents nothing for a job nobody has taken yet", () => {
    const s = toMyJobSummary(row({ status: "SEARCHING", assignedProfessional: null, review: null, events: [] }));
    expect(s).toMatchObject({ professional: null, ratingGiven: null, amountMinorUnits: null });
  });

  it("a review still owed reads as no stars, not zero", () => {
    expect(toMyJobSummary(row({ status: "REVIEW_PENDING", review: null })).ratingGiven).toBeNull();
  });
});

describe("settledAmount", () => {
  it("is null when the receipt recorded no amount (no price could be said)", () => {
    expect(settledAmount([{ type: "SETTLED_OUTSIDE_APP", metadata: { amountMinorUnits: null, reason: "NO_PRICE" } }])).toBeNull();
  });

  it("ignores every other event", () => {
    expect(settledAmount([{ type: "QUOTE_APPROVED", metadata: { amountMinorUnits: 999 } }])).toBeNull();
  });

  it("takes the latest receipt when there is more than one", () => {
    expect(
      settledAmount([
        { type: "SETTLED_OUTSIDE_APP", metadata: { amountMinorUnits: 100 } },
        { type: "SETTLED_OUTSIDE_APP", metadata: { amountMinorUnits: 250 } },
      ])
    ).toBe(250);
  });

  it("does not trust a malformed amount", () => {
    expect(settledAmount([{ type: "SETTLED_OUTSIDE_APP", metadata: { amountMinorUnits: "22000" } }])).toBeNull();
    expect(settledAmount([{ type: "SETTLED_OUTSIDE_APP", metadata: null }])).toBeNull();
  });
});
