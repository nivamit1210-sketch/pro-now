import { pilotServiceIdForDatabaseCode, type JobState, type MyJobSummary } from "@pro-now/types";
import { catalogServicePages, type CallListItem, type MarkName } from "@pro-now/ui";

/**
 * The customer's jobs (`GET /v1/jobs`) as the calls list's rows, in the
 * demo's words (tools/design-preview App.tsx `myCalls`).
 *
 * - A job still moving is a live card, with the demo's five-step rail.
 *   Its ETA is left out: the list does not carry one, and none is invented.
 * - A finished job whose review is still open (REVIEW_PENDING) waits for
 *   the customer ("ממתין לך" · דירוג המקצוען), which opens the job's own
 *   review screen. A closed or cancelled job is history.
 * - The amount is the receipt the server recorded when the job closed
 *   outside the app (D1); without one, no amount is shown.
 */

interface StatusView {
  stateHe: string;
  live: boolean;
  /** Live only: 0 on the way · 1 arrived · 2 checking · 3 working · 4 finishing. */
  stage?: number;
  /** Live only: the next step is the customer's. */
  attention?: boolean;
}

export const STATUS_VIEW: Record<JobState, StatusView> = {
  DRAFT: { stateHe: "מחפשים", live: true, stage: 0 },
  SEARCHING: { stateHe: "מחפשים", live: true, stage: 0 },
  OFFERING: { stateHe: "מחפשים", live: true, stage: 0 },
  PRO_ASSIGNED: { stateHe: "נמצא מקצוען", live: true, stage: 0 },
  PRO_EN_ROUTE: { stateHe: "בדרך", live: true, stage: 0 },
  PRO_ARRIVED: { stateHe: "אצלך", live: true, stage: 1 },
  DIAGNOSIS: { stateHe: "בבדיקה", live: true, stage: 2 },
  WAITING_QUOTE_APPROVAL: { stateHe: "הצעה לאישור", live: true, stage: 2, attention: true },
  IN_PROGRESS: { stateHe: "בעבודה", live: true, stage: 3 },
  COMPLETION_PENDING: { stateHe: "לאישור סיום", live: true, stage: 4, attention: true },
  COMPLETED: { stateHe: "סיום", live: true, stage: 4 },
  PAYMENT_PENDING: { stateHe: "סיום", live: true, stage: 4 },
  PAYMENT_CAPTURED: { stateHe: "סיום", live: true, stage: 4 },
  REVIEW_PENDING: { stateHe: "הושלם", live: false },
  CLOSED: { stateHe: "הושלם", live: false },
  CANCELLED: { stateHe: "בוטלה", live: false },
  DISPUTED: { stateHe: "בבירור", live: false },
};

/** The service's own mark, as the job screen draws it; a wrench when unknown. */
export function markForDatabaseCode(code: string): MarkName {
  const pilotId = pilotServiceIdForDatabaseCode(code);
  return ((pilotId && catalogServicePages[pilotId]?.mark) || "wrench") as MarkName;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** When the call was made, in the customer's terms: היום, אתמול, or the date. */
export function whenHe(iso: string, now: Date): string {
  const at = new Date(iso);
  if (sameDay(at, now)) return "היום";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return "אתמול";
  return at.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function toCallListItem(job: MyJobSummary, now: Date): CallListItem {
  const view = STATUS_VIEW[job.status];
  return {
    id: job.id,
    serviceNameHe: job.serviceNameHe,
    mark: markForDatabaseCode(job.serviceCode),
    stateHe: view.stateHe,
    whenHe: whenHe(job.createdAt, now),
    live: view.live,
    proNameHe: job.professional?.displayName ?? null,
    // Persona draws a character from a stable id, never a likeness (packages/ui Persona).
    proSeed: job.professional?.id ?? null,
    etaMinutes: null,
    totalMinorUnits: job.amountMinorUnits,
    myRating: job.ratingGiven,
    needsRating: job.status === "REVIEW_PENDING" && job.ratingGiven === null,
    ...(view.live ? { stage: view.stage ?? 0, attention: view.attention ?? false } : {}),
  };
}

/**
 * The rows in the demo's order: live calls in the order they were made
 * (the demo's dock order), then the rest newest first, as the server sends
 * them. The screen itself groups them (live · waiting on you · history).
 */
export function callsFromJobs(jobs: MyJobSummary[], now: Date): { calls: CallListItem[]; historyTitleHe: string } {
  const live = jobs.filter((j) => STATUS_VIEW[j.status].live).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rest = jobs.filter((j) => !STATUS_VIEW[j.status].live).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const calls = [...live, ...rest].map((j) => toCallListItem(j, now));
  // "הושלמו" means completed; a list that also holds cancelled calls is history.
  const allCompleted = rest.every((j) => j.status === "CLOSED" || j.status === "REVIEW_PENDING");
  return { calls, historyTitleHe: allCompleted ? "הושלמו" : "היסטוריה" };
}
