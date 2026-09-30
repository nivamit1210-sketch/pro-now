import { useEffect, useState, type ReactNode } from "react";

import type { DepartmentCode, JobMatchView, JobState } from "@pro-now/types";

import { WorldCanvas } from "./WorldCanvas";
import { createWorldScene } from "./scene/WorldScene";
import { buildJobWorldModel } from "./jobWorldModel";

export interface JobWorldBackdropProps {
  status: JobState | null;
  match: JobMatchView | null;
  departmentCode: DepartmentCode | null;
  fallback: ReactNode;
}

export function JobWorldBackdrop({ status, match, departmentCode, fallback }: JobWorldBackdropProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isRoute = status === "PRO_ASSIGNED" || status === "PRO_EN_ROUTE";

  useEffect(() => {
    if (!isRoute) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRoute]);

  const scene = buildJobWorldModel({ status, match, departmentCode, nowMs });
  return (
    <WorldCanvas
      mode={scene.mode}
      route={scene.route}
      avatarNo={scene.avatarNo}
      scene={scene}
      sceneFactory={createWorldScene}
      onEvent={() => undefined}
      fallback={fallback}
    />
  );
}
