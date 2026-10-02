import { describe, expect, it } from "vitest";

import { settledView } from "./settled";

const START = "2026-10-02T07:00:00.000Z";
const NOW = Date.parse("2026-10-02T08:30:00.000Z");
const status = (over: Partial<{ presenceState: string; shiftId: string | null; shiftStartedAt: string | null; shiftJobs: number }> = {}) => ({
  presenceState: "AVAILABLE" as const,
  shiftId: "shift_1",
  shiftStartedAt: START,
  shiftJobs: 2,
  ...over,
}) as Parameters<typeof settledView>[0]["status"];
const line = (jobId: string, grossMinorUnits: number, completedAt: string) => ({
  jobId, serviceCode: "HOME_PLUMB_LEAK", serviceNameHe: "נזילה", completedAt, grossMinorUnits, deductions: [], netMinorUnits: null,
});
const earnings = (jobs: ReturnType<typeof line>[]) => ({
  breakdown: {
    currency: "ILS", periodFromISO: START, periodToISO: START, periodGrossMinorUnits: 0, periodNetMinorUnits: null, periodJobCount: jobs.length,
    days: [], jobs, awaitingCommissionDecision: false, paidDirectly: true, unpricedJobCount: 0,
  },
});
const job = { jobId: "job_b", payoutMinorUnits: 32000, payoutIsEstimate: false };

describe("the job-settled screen, from the server", () => {
  it("this job's receipt, the shift's total, its count, time online, and back on shift", () => {
    const v = settledView({
      job,
      status: status(),
      earnings: earnings([line("job_b", 32000, "2026-10-02T08:29:00Z"), line("job_a", 18000, "2026-10-02T07:40:00Z"), line("job_old", 9000, "2026-10-01T15:00:00Z")]),
      nowMs: NOW,
    });
    expect(v).toEqual({ addedNetMinorUnits: 32000, shiftNetMinorUnits: 50000, shiftJobCount: 2, onlineMinutes: 90, returningToAvailable: true });
  });

  it("the receipt wins over the job screen's payout", () => {
    const v = settledView({ job, status: status({ shiftJobs: 1 }), earnings: earnings([line("job_b", 18000, "2026-10-02T08:29:00Z")]), nowMs: NOW });
    expect(v.addedNetMinorUnits).toBe(18000);
  });

  it("before the receipt is read: the payout, unless it is only an estimate", () => {
    expect(settledView({ job, status: status({ shiftJobs: 1 }), earnings: null, nowMs: NOW }).addedNetMinorUnits).toBe(32000);
    expect(settledView({ job: { ...job, payoutIsEstimate: true }, status: status(), earnings: null, nowMs: NOW }).addedNetMinorUnits).toBeNull();
  });

  it("no shift total when a job in the shift closed with no amount: unknown is not zero", () => {
    const v = settledView({ job, status: status({ shiftJobs: 3 }), earnings: earnings([line("job_b", 32000, "2026-10-02T08:29:00Z"), line("job_a", 18000, "2026-10-02T07:40:00Z")]), nowMs: NOW });
    expect(v.shiftNetMinorUnits).toBeNull();
    expect(v.shiftJobCount).toBe(3);
  });

  it("off shift: no shift total, no time online, and it says the shift is over", () => {
    const v = settledView({ job, status: status({ shiftId: null, shiftStartedAt: null, shiftJobs: 0, presenceState: "OFFLINE" }), earnings: earnings([]), nowMs: NOW });
    expect(v).toMatchObject({ shiftNetMinorUnits: null, onlineMinutes: 0, returningToAvailable: false });
  });

  it("an offer already waiting still counts as back on shift", () => {
    expect(settledView({ job, status: status({ presenceState: "OFFER_RECEIVED" }), earnings: null, nowMs: NOW }).returningToAvailable).toBe(true);
  });
});
