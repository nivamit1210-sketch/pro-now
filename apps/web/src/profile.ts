import type { MyJobSummary } from "@pro-now/types";
import type { MeResponse } from "@pro-now/validation";
import type { CustomerCallHistoryItem, CustomerOpenCall } from "@pro-now/ui";

import { STATUS_VIEW, markForDatabaseCode, whenHe } from "./callsList";

/**
 * The profile's numbers from the server's own list of jobs (the same query
 * as הקריאות שלי, so the two agree): what is open, what is done, and what
 * the done work came to. Nothing is counted that the server did not record —
 * a job closed without an amount adds nothing, and no amount at all is "—",
 * never ₪0.
 */
export function profileFromJobs(
  jobs: MyJobSummary[],
  now: Date
): { openCalls: CustomerOpenCall[]; history: CustomerCallHistoryItem[]; lifetimeSpendMinorUnits: number | null } {
  const open = jobs
    .filter((j) => STATUS_VIEW[j.status].live)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(
      (j): CustomerOpenCall => ({
        id: j.id,
        serviceNameHe: j.serviceNameHe,
        mark: markForDatabaseCode(j.serviceCode),
        stateHe: STATUS_VIEW[j.status].stateHe,
        etaMinutes: null,
        proSeed: j.professional?.id ?? null,
        proNameHe: j.professional?.displayName ?? null,
      })
    );
  const done = jobs
    .filter((j) => j.status === "REVIEW_PENDING" || j.status === "CLOSED")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = done.map(
    (j): CustomerCallHistoryItem => ({
      id: j.id,
      serviceNameHe: j.serviceNameHe,
      mark: markForDatabaseCode(j.serviceCode),
      metaHe: `${whenHe(j.createdAt, now)} · ${STATUS_VIEW[j.status].stateHe}`,
      proSeed: j.professional?.id ?? null,
      proNameHe: j.professional?.displayName ?? null,
      totalMinorUnits: j.amountMinorUnits,
      myRating: j.ratingGiven,
    })
  );
  const amounts = done.map((j) => j.amountMinorUnits).filter((a): a is number => a !== null);
  return {
    openCalls: open,
    history,
    lifetimeSpendMinorUnits: amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) : null,
  };
}

/** Their name when they gave one; otherwise the address they sign in with. */
export function displayNameFor(me: Pick<MeResponse, "user">): string {
  const name = me.user.name.trim();
  return name ? name : me.user.email;
}
