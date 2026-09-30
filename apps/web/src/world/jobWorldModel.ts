import type { DepartmentCode, JobMatchView, JobState } from "@pro-now/types";

import { worldModeFor, worldRouteFor } from "./worldController";
import type { WorldSceneModel } from "./types";

export interface JobWorldModelInput {
  status: JobState | null;
  match: JobMatchView | null;
  departmentCode: DepartmentCode | null;
  nowMs: number;
  reducedMotion?: boolean;
}

export function buildJobWorldModel(input: JobWorldModelInput): WorldSceneModel {
  return {
    mode: worldModeFor({ ...input, reducedMotion: input.reducedMotion ?? false }),
    departmentCode: input.departmentCode,
    avatarNo: null,
    shopId: null,
    route: worldRouteFor({ ...input, reducedMotion: input.reducedMotion ?? false }),
    trades: {},
  };
}
