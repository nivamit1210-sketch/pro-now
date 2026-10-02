import type { JobState, MyJobSummary } from "@pro-now/types";
import { jobServiceNameHe } from "./service-name.js";

/**
 * One row of the customer's own job list (`GET /v1/jobs`): the home
 * capsule and the calls list (הקריאות שלי) read it.
 *
 * Everything here is the server's record: who was assigned, the stars the
 * customer gave, and what the work came to when it closed outside the app
 * (D1, the SETTLED_OUTSIDE_APP event). Nothing is filled in when it is not
 * known: a job nobody accepted has no professional, an unsettled one no
 * amount.
 */
export interface MyJobRow {
  id: string;
  status: JobState;
  createdAt: Date;
  /** The name the customer picked in the catalogue (audit v2 #1). */
  catalogServiceNameHe: string | null;
  service: { nameHe: string; code: string };
  assignedProfessional: { id: string; displayName: string } | null;
  review: { overallRating: number } | null;
  events: Array<{ type: string; metadata: unknown }>;
}

/** What `SETTLED_OUTSIDE_APP` recorded, or null when it recorded no amount. */
export function settledAmount(events: MyJobRow["events"]): number | null {
  const settled = [...events].reverse().find((e) => e.type === "SETTLED_OUTSIDE_APP");
  const amount = (settled?.metadata as { amountMinorUnits?: unknown } | null | undefined)?.amountMinorUnits;
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}

export function toMyJobSummary(j: MyJobRow): MyJobSummary {
  return {
    id: j.id,
    status: j.status,
    createdAt: j.createdAt.toISOString(),
    serviceNameHe: jobServiceNameHe(j),
    serviceCode: j.service.code,
    professional: j.assignedProfessional ? { id: j.assignedProfessional.id, displayName: j.assignedProfessional.displayName } : null,
    ratingGiven: j.review?.overallRating ?? null,
    amountMinorUnits: settledAmount(j.events),
  };
}
