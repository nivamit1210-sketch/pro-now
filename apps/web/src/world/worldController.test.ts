import { describe, expect, it } from "vitest";
import type { DepartmentCode, JobMatchView } from "@pro-now/types";

import { worldModeFor, worldRouteFor } from "./worldController";

const matchWithEta = (etaSeconds: number | null, computedAtMs = 0): JobMatchView => ({
  jobId: "job-1",
  status: "PRO_EN_ROUTE",
  serviceNameHe: "תיקון בבית",
  professional: {
    id: "pro-1",
    displayName: "מקצוען",
    addressAs: null,
    profilePhotoUrl: null,
    portraitKind: null,
    verifications: [],
    proNowCompletedJobs: 0,
    proNowRatingAverage: null,
    proNowRatingCount: 0,
    externalReputation: null,
  },
  eta:
    etaSeconds === null
      ? null
      : {
          etaSeconds,
          distanceMeters: null,
          isRouteBased: false,
          computedAt: new Date(computedAtMs).toISOString(),
        },
  price: { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 100 },
  vehicle: null,
});

const input = (status: JobMatchView["status"], match: JobMatchView | null, nowMs = 0) => ({
  status,
  match,
  departmentCode: "HOME_URGENT" as DepartmentCode,
  nowMs,
  reducedMotion: false,
});

describe("worldModeFor", () => {
  it("does not show a professional before match data exists", () => {
    expect(worldModeFor(input("PRO_ASSIGNED", null))).toBe("SEARCH");
  });

  it("maps an assigned job with match data to route mode", () => {
    expect(worldModeFor(input("PRO_ASSIGNED", matchWithEta(600)))).toBe("ROUTE");
  });
});

describe("worldRouteFor", () => {
  it("holds assigned work at the route start until it is en route", () => {
    const route = worldRouteFor(input("PRO_ASSIGNED", matchWithEta(600), 1_000));
    expect(route.moving).toBe(false);
    expect(route.progress).toBe(0);
  });

  it("uses server ETA facts and clamps progress", () => {
    const route = worldRouteFor(input("PRO_EN_ROUTE", matchWithEta(600, 0), 700_000));
    expect(route.moving).toBe(true);
    expect(route.progress).toBe(1);
  });

  it("keeps the vehicle unknown when ETA is null", () => {
    const route = worldRouteFor(input("PRO_EN_ROUTE", matchWithEta(null)));
    expect(route.progress).toBeNull();
  });

  it("stops at arrival without inventing a missing ETA", () => {
    expect(worldRouteFor(input("PRO_ARRIVED", matchWithEta(600))).progress).toBe(1);
    expect(worldRouteFor(input("PRO_ARRIVED", matchWithEta(null))).progress).toBeNull();
  });
});
