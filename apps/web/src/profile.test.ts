import { describe, expect, it } from "vitest";
import type { JobState, MyJobSummary } from "@pro-now/types";

import { displayNameFor, profileFromJobs } from "./profile";

const NOW = new Date("2026-10-02T12:00:00");
const job = (id: string, status: JobState, createdAt: string, amount: number | null = null, rating: number | null = null): MyJobSummary => ({
  id,
  status,
  createdAt,
  serviceNameHe: "נזילה",
  serviceCode: "HOME_PLUMB_LEAK",
  professional: status === "SEARCHING" ? null : { id: "pro-1", displayName: "דנה", addressAs: "F" },
  ratingGiven: rating,
  amountMinorUnits: amount,
});

describe("the profile, from the customer's own jobs", () => {
  it("splits open from done, newest done first, and only done work is history", () => {
    const p = profileFromJobs(
      [
        job("a", "CLOSED", "2026-09-30T10:00:00Z", 30000, 5),
        job("b", "PRO_EN_ROUTE", "2026-10-02T09:00:00Z"),
        job("c", "REVIEW_PENDING", "2026-10-01T10:00:00Z", 18000),
        job("d", "CANCELLED", "2026-10-01T08:00:00Z"),
      ],
      NOW
    );
    expect(p.openCalls.map((c) => [c.id, c.stateHe, c.proNameHe])).toEqual([["b", "בדרך", "דנה"]]);
    expect(p.history.map((h) => h.id)).toEqual(["c", "a"]);
    expect(p.history[1]).toMatchObject({ totalMinorUnits: 30000, myRating: 5 });
    // A cancelled job is neither open nor work done.
    expect([...p.openCalls, ...p.history].some((x) => x.id === "d")).toBe(false);
  });

  it("adds up only amounts the server recorded, and says nothing rather than ₪0", () => {
    expect(profileFromJobs([job("a", "CLOSED", "2026-09-30T10:00:00Z", 30000), job("b", "CLOSED", "2026-09-29T10:00:00Z", null)], NOW).lifetimeSpendMinorUnits).toBe(30000);
    expect(profileFromJobs([job("b", "CLOSED", "2026-09-29T10:00:00Z", null)], NOW).lifetimeSpendMinorUnits).toBeNull();
    expect(profileFromJobs([], NOW)).toEqual({ openCalls: [], history: [], lifetimeSpendMinorUnits: null });
  });
});

describe("who the profile is about", () => {
  it("uses their name, or the address they sign in with", () => {
    expect(displayNameFor({ user: { id: "u", email: "noa@example.com", name: "נועה" } })).toBe("נועה");
    expect(displayNameFor({ user: { id: "u", email: "noa@example.com", name: "  " } })).toBe("noa@example.com");
    expect(displayNameFor({ user: { id: "u", email: "noa@example.com", name: "" } })).toBe("noa@example.com");
  });
});
