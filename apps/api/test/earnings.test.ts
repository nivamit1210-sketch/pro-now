import { describe, it, expect } from "vitest";
import { earningsFor, outsideAppEarningsFor } from "../src/domain/payments/earnings.js";

const NOW = new Date("2026-09-22T15:00:00Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

function payment(over: {
  jobId: string;
  createdAt: Date;
  charge: number;
  fee?: number;
  payable?: number;
  code?: string;
  nameHe?: string;
}) {
  const entries = [
    { entryType: "CUSTOMER_CHARGE", amountMinorUnits: over.charge },
    ...(over.fee === undefined
      ? []
      : [{ entryType: "PLATFORM_FEE", amountMinorUnits: -over.fee }]),
    ...(over.payable === undefined
      ? []
      : [{ entryType: "PROFESSIONAL_PAYABLE", amountMinorUnits: over.payable }]),
  ];
  return {
    jobId: over.jobId,
    createdAt: over.createdAt,
    ledgerEntries: entries,
    job: {
      service: { code: over.code ?? "HOME_PLUMB_LEAK", nameHe: over.nameHe ?? "נזילה" },
    },
  };
}

const fakePrisma = (payments: unknown[]) =>
  ({ payment: { findMany: async () => payments } }) as never;

describe("earnings — derived from the ledger, never summed from jobs", () => {
  it("names every deduction and shows the gross beside the net", async () => {
    const summary = await earningsFor(
      fakePrisma([payment({ jobId: "j1", createdAt: hoursAgo(2), charge: 37000, fee: 5550, payable: 31450 })]),
      "p1",
      NOW
    );
    const job = summary.jobs[0]!;
    expect(job.grossMinorUnits).toBe(37000);
    expect(job.netMinorUnits).toBe(31450);
    expect(job.deductions).toEqual([
      { code: "PLATFORM_FEE", labelHe: "עמלת פלטפורמה", minorUnits: 5550 },
    ]);
    // The screen renders the minus sign; the number itself is a magnitude.
    expect(job.deductions[0]!.minorUnits).toBeGreaterThan(0);
  });

  it("reports an unknown net as null, never as zero", async () => {
    /*
     * With no commission configured a captured payment writes
     * CUSTOMER_CHARGE alone. Rendering ₪0.00 would tell somebody who
     * worked all week that they earned nothing, which is a worse
     * falsehood than the nullable type costs to carry.
     */
    const summary = await earningsFor(
      fakePrisma([payment({ jobId: "j1", createdAt: hoursAgo(2), charge: 37000 })]),
      "p1",
      NOW
    );
    expect(summary.jobs[0]!.netMinorUnits).toBeNull();
    expect(summary.periodNetMinorUnits).toBeNull();
    expect(summary.periodGrossMinorUnits).toBe(37000);
    expect(summary.awaitingCommissionDecision).toBe(true);
  });

  it("does not claim to be awaiting a decision once one is set", async () => {
    const summary = await earningsFor(
      fakePrisma([payment({ jobId: "j1", createdAt: hoursAgo(2), charge: 10000, fee: 1500, payable: 8500 })]),
      "p1",
      NOW
    );
    expect(summary.awaitingCommissionDecision).toBe(false);
  });

  it("keeps an unlabelled deduction under its own name", async () => {
    // The screen refuses a single "fees" lump, so an entry type nobody
    // has translated keeps its code rather than being folded into a
    // vague label that hides what was taken.
    const summary = await earningsFor(
      fakePrisma([
        {
          jobId: "j1",
          createdAt: hoursAgo(1),
          ledgerEntries: [
            { entryType: "CUSTOMER_CHARGE", amountMinorUnits: 10000 },
            { entryType: "SOMETHING_NEW", amountMinorUnits: -700 },
            { entryType: "PROFESSIONAL_PAYABLE", amountMinorUnits: 9300 },
          ],
          job: { service: { code: "X", nameHe: "x" } },
        },
      ]),
      "p1",
      NOW
    );
    expect(summary.jobs[0]!.deductions).toEqual([
      { code: "SOMETHING_NEW", labelHe: "SOMETHING_NEW", minorUnits: 700 },
    ]);
  });

  it("returns a full week of days even when most of them are empty", async () => {
    // A bar chart with three bars because four days had no work is a
    // chart that lies about the shape of a week.
    const summary = await earningsFor(fakePrisma([]), "p1", NOW);
    expect(summary.days).toHaveLength(7);
    expect(summary.days.every((d) => d.jobs === 0 && d.netMinorUnits === null)).toBe(true);
  });

  it("puts each job on the day it was captured", async () => {
    const summary = await earningsFor(
      fakePrisma([
        payment({ jobId: "today", createdAt: hoursAgo(2), charge: 10000, fee: 1000, payable: 9000 }),
        payment({ jobId: "yesterday", createdAt: hoursAgo(26), charge: 20000, fee: 2000, payable: 18000 }),
      ]),
      "p1",
      NOW
    );
    const withJobs = summary.days.filter((d) => d.jobs > 0);
    expect(withJobs).toHaveLength(2);
    expect(withJobs.map((d) => d.netMinorUnits)).toEqual([18000, 9000]);
  });

  it("totals the period from the jobs in it", async () => {
    const summary = await earningsFor(
      fakePrisma([
        payment({ jobId: "a", createdAt: hoursAgo(2), charge: 10000, fee: 1000, payable: 9000 }),
        payment({ jobId: "b", createdAt: hoursAgo(5), charge: 20000, fee: 2000, payable: 18000 }),
      ]),
      "p1",
      NOW
    );
    expect(summary.periodGrossMinorUnits).toBe(30000);
    expect(summary.periodNetMinorUnits).toBe(27000);
    expect(summary.periodJobCount).toBe(2);
  });

  it("sums what is known when some jobs are still awaiting a rate", async () => {
    // Half an answer is still an answer, and the flag beside it says the
    // rest is pending rather than missing.
    const summary = await earningsFor(
      fakePrisma([
        payment({ jobId: "priced", createdAt: hoursAgo(2), charge: 10000, fee: 1000, payable: 9000 }),
        payment({ jobId: "unpriced", createdAt: hoursAgo(3), charge: 20000 }),
      ]),
      "p1",
      NOW
    );
    expect(summary.periodNetMinorUnits).toBe(9000);
    expect(summary.periodGrossMinorUnits).toBe(30000);
    expect(summary.awaitingCommissionDecision).toBe(true);
  });
});

describe("earnings while customers pay the professional directly (D1)", () => {
  const settled = (jobId: string, createdAt: Date, amountMinorUnits: number | null) => ({
    jobId,
    createdAt,
    metadata: { paidInApp: false, amountMinorUnits, currency: "ILS", basis: null, reason: amountMinorUnits === null ? "NO_PRICE" : null },
    job: { service: { code: "HOME_PLUMB_LEAK", nameHe: "נזילה" } },
  });
  const eventsPrisma = (events: unknown[]) => ({ jobEvent: { findMany: async () => events } }) as never;

  it("reads what each job came to from its receipt, with no net", async () => {
    const summary = await outsideAppEarningsFor(
      eventsPrisma([settled("j1", hoursAgo(2), 25000), settled("j2", hoursAgo(30), 18000)]),
      "p1",
      NOW
    );
    expect(summary.paidDirectly).toBe(true);
    expect(summary.periodGrossMinorUnits).toBe(43000);
    expect(summary.periodNetMinorUnits).toBeNull();
    expect(summary.jobs.map((j) => [j.jobId, j.grossMinorUnits, j.netMinorUnits])).toEqual([
      ["j1", 25000, null],
      ["j2", 18000, null],
    ]);
    // Nothing is awaiting a commission decision: nothing passed through the app.
    expect(summary.awaitingCommissionDecision).toBe(false);
    expect(summary.days.reduce((s, d) => s + d.grossMinorUnits, 0)).toBe(43000);
  });

  it("counts a job that closed with no amount, and never shows it as ₪0", async () => {
    const summary = await outsideAppEarningsFor(
      eventsPrisma([settled("j1", hoursAgo(2), 25000), settled("j2", hoursAgo(3), null)]),
      "p1",
      NOW
    );
    expect(summary.jobs.map((j) => j.jobId)).toEqual(["j1"]);
    expect(summary.unpricedJobCount).toBe(1);
    expect(summary.periodJobCount).toBe(2);
  });
});
