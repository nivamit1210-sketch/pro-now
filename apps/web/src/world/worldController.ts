import { routeProgress, scenePhaseForJob, type JobMatchView, type JobState } from "@pro-now/types";

import type { WorldJobInput, WorldMode, WorldRouteModel } from "./types";

type StaticWorldInput = { kind: "ambient" | "explore" | "fallback" };

const ASSIGNED_STATES: ReadonlySet<JobState> = new Set([
  "PRO_ASSIGNED",
  "PRO_EN_ROUTE",
  "PRO_ARRIVED",
  "DIAGNOSIS",
  "WAITING_QUOTE_APPROVAL",
  "IN_PROGRESS",
  "COMPLETION_PENDING",
]);

const ARRIVED_STATES: ReadonlySet<JobState> = new Set([
  "PRO_ARRIVED",
  "DIAGNOSIS",
  "WAITING_QUOTE_APPROVAL",
  "IN_PROGRESS",
  "COMPLETION_PENDING",
]);

export function worldModeFor(input: WorldJobInput | StaticWorldInput): WorldMode {
  if ("kind" in input) {
    if (input.kind === "ambient") return "AMBIENT";
    if (input.kind === "explore") return "EXPLORE";
    return "FALLBACK";
  }

  if (!input.status || !ASSIGNED_STATES.has(input.status) || !input.match) return "SEARCH";
  return "ROUTE";
}

export function worldRouteFor(input: WorldJobInput): WorldRouteModel {
  const eta = input.match?.eta ?? null;
  const status = input.status;

  if (!input.match || !status || !ASSIGNED_STATES.has(status)) {
    return { moving: false, progress: null, eta, departmentCode: input.departmentCode };
  }

  if (ARRIVED_STATES.has(status)) {
    return { moving: false, progress: eta ? 1 : null, eta, departmentCode: input.departmentCode };
  }

  if (status === "PRO_ASSIGNED") {
    return { moving: false, progress: eta ? 0 : null, eta, departmentCode: input.departmentCode };
  }

  const progress = eta
    ? routeProgress({
        etaSecondsAtAssignment: eta.etaSeconds,
        etaSecondsNow: eta.etaSeconds,
        nowMs: input.nowMs,
        etaReadAtMs: Date.parse(eta.computedAt),
      })
    : null;

  return { moving: status === "PRO_EN_ROUTE", progress, eta, departmentCode: input.departmentCode };
}

export type { JobMatchView };
export { scenePhaseForJob };
