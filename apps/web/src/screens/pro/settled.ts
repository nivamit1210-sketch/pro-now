import type { JobState, ProEarningsView, ProJobDetailView, ProStatusView } from "@pro-now/types";

/**
 * THE MOMENT A JOB CLOSES, ON THE PROFESSIONAL'S SIDE (the demo's
 * `ProJobSettledBody`): what this job came to, the shift so far, and
 * whether they are back on shift — from the server, never a guess.
 *
 * No money moves through the app (D1), so every amount here is what the
 * server recorded as paid to them directly; the screen's words are "סכום
 * העבודה" and "סך המשמרת", never "charged".
 *
 * - The job's amount: its line in /pro/earnings (the receipt it closed
 *   with); before that is written, the payout the job screen already
 *   shows, when it is not an estimate. Otherwise null, drawn as "—".
 * - The shift's amount: the earnings lines since the shift started, only
 *   when every job closed in the shift has one. A shift with a job closed
 *   at no recorded amount has no honest total, so it is null too.
 */
export const SETTLED_STATES: ReadonlySet<JobState> = new Set(["COMPLETED", "REVIEW_PENDING", "CLOSED"]);

/** Presence states in which the professional is still on shift and taking work. */
const BACK_ON_SHIFT: ReadonlySet<string> = new Set(["AVAILABLE", "OFFER_RECEIVED", "RESERVED"]);

export interface SettledView {
  addedNetMinorUnits: number | null;
  shiftNetMinorUnits: number | null;
  shiftJobCount: number;
  onlineMinutes: number;
  returningToAvailable: boolean;
}

export function settledView(args: {
  job: Pick<ProJobDetailView, "jobId" | "payoutMinorUnits" | "payoutIsEstimate">;
  status: Pick<ProStatusView, "presenceState" | "shiftId" | "shiftStartedAt" | "shiftJobs">;
  earnings: Pick<ProEarningsView, "breakdown"> | null | undefined;
  nowMs: number;
}): SettledView {
  const { job, status, earnings, nowMs } = args;
  const lines = earnings?.breakdown.jobs ?? [];
  const own = lines.find((l) => l.jobId === job.jobId);
  const addedNetMinorUnits = own ? own.grossMinorUnits : job.payoutIsEstimate ? null : job.payoutMinorUnits;

  const startedMs = status.shiftStartedAt ? Date.parse(status.shiftStartedAt) : NaN;
  const onShift = status.shiftId !== null && Number.isFinite(startedMs);
  const inShift = onShift ? lines.filter((l) => Date.parse(l.completedAt) >= startedMs) : [];
  const shiftNetMinorUnits =
    onShift && status.shiftJobs > 0 && inShift.length === status.shiftJobs
      ? inShift.reduce((sum, l) => sum + l.grossMinorUnits, 0)
      : null;

  return {
    addedNetMinorUnits,
    shiftNetMinorUnits,
    shiftJobCount: status.shiftJobs,
    onlineMinutes: onShift ? Math.max(0, Math.floor((nowMs - startedMs) / 60_000)) : 0,
    returningToAvailable: status.shiftId !== null && BACK_ON_SHIFT.has(status.presenceState),
  };
}
