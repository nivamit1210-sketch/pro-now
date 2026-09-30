import type { DepartmentCode, JobMatchView, JobState, EtaView } from "@pro-now/types";

export type WorldMode = "AMBIENT" | "EXPLORE" | "SEARCH" | "ROUTE" | "FALLBACK";

export type WorldMoveCommand = { x: number; z: number; sprint: boolean };

export interface WorldJobInput {
  status: JobState | null;
  match: JobMatchView | null;
  departmentCode: DepartmentCode | null;
  nowMs: number;
  reducedMotion: boolean;
}

export interface WorldRouteModel {
  moving: boolean;
  progress: number | null;
  eta: EtaView | null;
  departmentCode: DepartmentCode | null;
}

export interface WorldTrade {
  shopId: string;
  departmentCode: DepartmentCode;
  nameHe: string;
  services: readonly { id: string; nameHe: string; descriptionHe?: string | null }[];
  interiorAssetId: string | null;
}

export interface WorldSceneModel {
  mode: WorldMode;
  departmentCode: DepartmentCode | null;
  avatarNo: number | null;
  shopId: string | null;
  route: WorldRouteModel | null;
  trades: Readonly<Record<string, WorldTrade>>;
}
