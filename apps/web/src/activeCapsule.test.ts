import { describe, expect, it } from "vitest";

import { capsuleFigureUri, capsuleTrip } from "./activeCapsule";
import { worldSources } from "./art/worldSources";

const at = (iso: string) => Date.parse(iso);
const eta = (etaSeconds: number, computedAt = "2026-10-02T09:00:00.000Z") => ({ etaSeconds, distanceMeters: null, isRouteBased: false, computedAt });

describe("the home capsule's trip", () => {
  it("draws nothing it was not told: no ETA, no minutes and no place on the road", () => {
    expect(capsuleTrip("PRO_EN_ROUTE", { eta: null, etaSecondsAtAssignment: 900 }, at("2026-10-02T09:00:00Z"))).toEqual({ etaMinutes: null, progress: null });
    expect(capsuleTrip("PRO_EN_ROUTE", null, 0)).toEqual({ etaMinutes: null, progress: null });
  });

  it("only while somebody is on the way", () => {
    for (const status of ["SEARCHING", "PRO_ARRIVED", "DIAGNOSIS", "IN_PROGRESS", "COMPLETION_PENDING"] as const) {
      expect(capsuleTrip(status, { eta: eta(600), etaSecondsAtAssignment: 900 }, at("2026-10-02T09:00:00Z"))).toEqual({ etaMinutes: null, progress: null });
    }
  });

  it("assigned and not moving yet: the minutes, standing at the start", () => {
    expect(capsuleTrip("PRO_ASSIGNED", { eta: eta(840), etaSecondsAtAssignment: 840 }, at("2026-10-02T09:00:00Z"))).toEqual({ etaMinutes: 14, progress: 0 });
  });

  it("on the way: how far through the trip the offer's ETA and the ETA now say", () => {
    const trip = capsuleTrip("PRO_EN_ROUTE", { eta: eta(600), etaSecondsAtAssignment: 1200 }, at("2026-10-02T09:00:00Z"));
    expect(trip).toEqual({ etaMinutes: 10, progress: 0.5 });
  });

  it("counts the seconds since the reading off it, and stops at the door", () => {
    const later = capsuleTrip("PRO_EN_ROUTE", { eta: eta(600), etaSecondsAtAssignment: 1200 }, at("2026-10-02T09:02:00Z"));
    expect(later.etaMinutes).toBe(8);
    expect(later.progress).toBeCloseTo(0.6, 5);
    const late = capsuleTrip("PRO_EN_ROUTE", { eta: eta(60), etaSecondsAtAssignment: 1200 }, at("2026-10-02T09:30:00Z"));
    expect(late).toEqual({ etaMinutes: 1, progress: 1 });
  });

  it("without the trip's start, the minutes but no position: the figure walks on the spot", () => {
    expect(capsuleTrip("PRO_EN_ROUTE", { eta: eta(300) }, at("2026-10-02T09:00:00Z"))).toEqual({ etaMinutes: 5, progress: null });
    expect(capsuleTrip("PRO_EN_ROUTE", { eta: eta(300), etaSecondsAtAssignment: null }, at("2026-10-02T09:00:00Z"))).toEqual({ etaMinutes: 5, progress: null });
  });
});

describe("the capsule's figure", () => {
  it("is the trade's drawn professional when the art has arrived", () => {
    expect(capsuleFigureUri("HOME_PLUMB_LEAK", worldSources)).toBe("/world/character_home_world.webp");
  });

  it("is nothing for an unknown service or missing art: the silhouette carries on", () => {
    expect(capsuleFigureUri(undefined, worldSources)).toBeNull();
    expect(capsuleFigureUri("NOT_A_SERVICE", worldSources)).toBeNull();
    expect(capsuleFigureUri("HOME_PLUMB_LEAK", {})).toBeNull();
  });
});
