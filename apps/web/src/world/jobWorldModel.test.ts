import type { JobMatchView } from "@pro-now/types";
import { describe, expect, it } from "vitest";

import { buildJobWorldModel } from "./jobWorldModel";

const nowMs = Date.parse("2026-09-30T10:00:00.000Z");
const match: JobMatchView = {
  jobId: "job-1",
  status: "PRO_EN_ROUTE",
  serviceNameHe: "נזילה",
  professional: {
    id: "pro-1",
    displayName: "עמית",
    profilePhotoUrl: null,
    portraitKind: null,
    verifications: [],
    proNowCompletedJobs: 4,
    proNowRatingAverage: 5,
    proNowRatingCount: 3,
    externalReputation: null,
  },
  eta: {
    etaSeconds: 900,
    distanceMeters: 1200,
    isRouteBased: false,
    computedAt: new Date(nowMs).toISOString(),
  },
  price: { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 },
};

describe("buildJobWorldModel", () => {
  it("keeps the searching world honest before a match exists", () => {
    const model = buildJobWorldModel({ status: "SEARCHING", match: null, departmentCode: "HOME_URGENT", nowMs });
    expect(model.mode).toBe("SEARCH");
    expect(model.route).toMatchObject({ moving: false, progress: null, eta: null });
  });

  it("starts an assigned professional at the route origin", () => {
    const model = buildJobWorldModel({ status: "PRO_ASSIGNED", match, departmentCode: "HOME_URGENT", nowMs });
    expect(model.mode).toBe("ROUTE");
    expect(model.route).toMatchObject({ moving: false, progress: 0, departmentCode: "HOME_URGENT" });
  });

  it("advances an en-route professional from the server ETA snapshot", () => {
    const model = buildJobWorldModel({ status: "PRO_EN_ROUTE", match, departmentCode: "HOME_URGENT", nowMs: nowMs + 300_000 });
    expect(model.mode).toBe("ROUTE");
    expect(model.route?.moving).toBe(true);
    expect(model.route?.progress).toBeCloseTo(1 / 3);
  });

  it("stops at arrival and does not invent movement without ETA", () => {
    const arrived = buildJobWorldModel({ status: "PRO_ARRIVED", match, departmentCode: "HOME_URGENT", nowMs });
    const noEta = buildJobWorldModel({ status: "PRO_EN_ROUTE", match: { ...match, eta: null }, departmentCode: "HOME_URGENT", nowMs });
    expect(arrived.route).toMatchObject({ moving: false, progress: 1 });
    expect(noEta.route).toMatchObject({ moving: true, progress: null, eta: null });
  });
});
