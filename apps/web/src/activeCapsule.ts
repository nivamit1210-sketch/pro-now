import { WORLD_DISTRICTS, pilotServiceIdForDatabaseCode, routeProgress, type DepartmentCode, type JobMatchView, type JobState } from "@pro-now/types";
import { departmentCodeByServiceId, type WorldAssetSources } from "@pro-now/ui";

/**
 * What the home capsule draws for the job in progress, from what the server
 * said and nothing else (the demo's `ActiveJobCapsule` in CommandChrome).
 *
 * - Minutes: only while somebody is on the way (assigned or en route), and
 *   only when the server has an ETA. The seconds since it was read are
 *   counted off it, as on the tracking screen; never below one minute.
 * - Progress: on the way, `routeProgress` from the offer's ETA (the start
 *   of the trip) and the ETA now. Assigned and not yet moving stands at the
 *   start. Null whenever either number is missing: the figure then walks
 *   on the spot and the road moves, which says "on the way" and nothing
 *   about how far (CLAUDE.md §3).
 * - The figure: the trade's drawn professional, when the art has arrived.
 */
const ON_THE_WAY: ReadonlySet<JobState> = new Set(["PRO_ASSIGNED", "PRO_EN_ROUTE"]);

export interface CapsuleTrip {
  etaMinutes: number | null;
  progress: number | null;
}

export function capsuleTrip(status: JobState, match: Pick<JobMatchView, "eta" | "etaSecondsAtAssignment"> | null | undefined, nowMs: number): CapsuleTrip {
  const eta = match?.eta ?? null;
  if (!ON_THE_WAY.has(status) || !eta) return { etaMinutes: null, progress: null };
  const readAtMs = Date.parse(eta.computedAt);
  const elapsed = Number.isFinite(readAtMs) ? Math.max(0, (nowMs - readAtMs) / 1000) : 0;
  const etaMinutes = Math.max(1, Math.ceil((eta.etaSeconds - elapsed) / 60));
  if (status === "PRO_ASSIGNED") return { etaMinutes, progress: 0 };
  const progress = routeProgress({
    etaSecondsAtAssignment: match?.etaSecondsAtAssignment ?? null,
    etaSecondsNow: eta.etaSeconds,
    etaReadAtMs: Number.isFinite(readAtMs) ? readAtMs : undefined,
    nowMs,
  });
  return { etaMinutes, progress };
}

/** The trade's drawn professional, from the same district art the street uses; null without it. */
export function capsuleFigureUri(serviceCode: string | null | undefined, sources: WorldAssetSources): string | null {
  const pilotId = serviceCode ? pilotServiceIdForDatabaseCode(serviceCode) : null;
  const department = pilotId ? (departmentCodeByServiceId[pilotId] as DepartmentCode | undefined) : undefined;
  const id = department ? WORLD_DISTRICTS[department]?.characterWorldAssetId : undefined;
  const src = id ? (sources[id] as { uri?: unknown } | undefined) : undefined;
  return src && typeof src.uri === "string" ? src.uri : null;
}
