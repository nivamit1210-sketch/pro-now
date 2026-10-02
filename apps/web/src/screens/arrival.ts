import type { JobState } from "@pro-now/types";

/**
 * THE ARRIVAL SCREEN (the demo's ArrivalVerifyBody): the minute a stranger
 * is at the door. The demo shows it between "on the way" and "arrived";
 * the server's matching moment is PRO_ARRIVED — the professional said
 * "הגעתי" and has not started yet. Going back from it shows the live job,
 * and once the diagnosis starts the visit has moved on without it.
 */
export function showsArrival(status: JobState, dismissed: boolean): boolean {
  return status === "PRO_ARRIVED" && !dismissed;
}

/** "נזילה · 12 עבודות דרך PRO NOW" — only the count PRO NOW really has. */
export function arrivalHeadlineHe(serviceNameHe: string, completedJobs: number): string {
  const jobs =
    completedJobs <= 0 ? "עבודה ראשונה דרך PRO NOW" : completedJobs === 1 ? "עבודה אחת דרך PRO NOW" : `${completedJobs} עבודות דרך PRO NOW`;
  return `${serviceNameHe} · ${jobs}`;
}
