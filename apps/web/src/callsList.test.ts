import { describe, expect, it } from "vitest";
import { JOB_STATES, type JobState, type MyJobSummary } from "@pro-now/types";

import { capsuleTrip } from "./activeCapsule";
import { STATUS_VIEW, callsFromJobs, markForDatabaseCode, onTheWayJobIds, toCallListItem, whenHe, type CallMatch } from "./callsList";

const NOW = new Date(2026, 9, 2, 12, 0); // 2 October 2026, noon, local time

const job = (over: Partial<MyJobSummary> = {}): MyJobSummary => ({
  id: "j1",
  status: "CLOSED",
  createdAt: new Date(2026, 9, 2, 9, 30).toISOString(),
  serviceNameHe: "תיקון נזילה",
  serviceCode: "HOME_PLUMB_LEAK",
  professional: { id: "pro_1", displayName: "יוסי" },
  ratingGiven: 5,
  amountMinorUnits: 22000,
  ...over,
});

describe("status labels", () => {
  it("covers every job state", () => {
    for (const s of JOB_STATES) expect(STATUS_VIEW[s]?.stateHe, s).toBeTruthy();
  });

  it("uses the demo's words for the live steps", () => {
    const words = (["SEARCHING", "PRO_EN_ROUTE", "PRO_ARRIVED", "DIAGNOSIS", "WAITING_QUOTE_APPROVAL", "IN_PROGRESS", "COMPLETION_PENDING"] as JobState[]).map(
      (s) => STATUS_VIEW[s].stateHe
    );
    expect(words).toEqual(["מחפשים", "בדרך", "אצלך", "בבדיקה", "הצעה לאישור", "בעבודה", "לאישור סיום"]);
  });

  it("puts each live step on the demo's five-step rail", () => {
    expect(STATUS_VIEW.PRO_EN_ROUTE.stage).toBe(0);
    expect(STATUS_VIEW.PRO_ARRIVED.stage).toBe(1);
    expect(STATUS_VIEW.WAITING_QUOTE_APPROVAL.stage).toBe(2);
    expect(STATUS_VIEW.IN_PROGRESS.stage).toBe(3);
    expect(STATUS_VIEW.COMPLETION_PENDING.stage).toBe(4);
  });

  it("finished, cancelled and disputed jobs are not live", () => {
    for (const s of ["REVIEW_PENDING", "CLOSED", "CANCELLED", "DISPUTED"] as JobState[]) expect(STATUS_VIEW[s].live, s).toBe(false);
    expect(STATUS_VIEW.CLOSED.stateHe).toBe("הושלם");
    expect(STATUS_VIEW.CANCELLED.stateHe).toBe("בוטלה");
  });

  it("never says the card was charged (D1)", () => {
    for (const s of JOB_STATES) expect(STATUS_VIEW[s].stateHe).not.toMatch(/חויב|מאושר בכרטיס/);
  });
});

describe("whenHe", () => {
  it("says today and yesterday in words", () => {
    expect(whenHe(new Date(2026, 9, 2, 1, 0).toISOString(), NOW)).toBe("היום");
    expect(whenHe(new Date(2026, 9, 1, 23, 0).toISOString(), NOW)).toBe("אתמול");
  });

  it("gives the date this year without the year, and with it before", () => {
    const thisYear = whenHe(new Date(2026, 4, 14).toISOString(), NOW);
    expect(thisYear).toContain("14");
    expect(thisYear).not.toContain("2026");
    expect(whenHe(new Date(2025, 4, 14).toISOString(), NOW)).toContain("2025");
  });
});

describe("markForDatabaseCode", () => {
  it("draws the service's own mark", () => {
    expect(markForDatabaseCode("HOME_PLUMB_LEAK")).toBe("plumbing");
  });

  it("falls back to a wrench for an unknown code", () => {
    expect(markForDatabaseCode("NOT_A_CODE")).toBe("wrench");
  });
});

describe("toCallListItem", () => {
  it("a closed job shows who came, the stars and the receipt's amount", () => {
    expect(toCallListItem(job(), NOW)).toMatchObject({
      id: "j1",
      serviceNameHe: "תיקון נזילה",
      mark: "plumbing",
      stateHe: "הושלם",
      whenHe: "היום",
      live: false,
      proNameHe: "יוסי",
      proSeed: "pro_1",
      etaMinutes: null,
      totalMinorUnits: 22000,
      myRating: 5,
      needsRating: false,
    });
  });

  it("a job whose review is open waits for the customer's stars", () => {
    expect(toCallListItem(job({ status: "REVIEW_PENDING", ratingGiven: null }), NOW)).toMatchObject({ live: false, needsRating: true, myRating: null });
  });

  it("a cancelled job asks for nothing", () => {
    const c = toCallListItem(job({ status: "CANCELLED", professional: null, ratingGiven: null, amountMinorUnits: null }), NOW);
    expect(c).toMatchObject({ live: false, needsRating: false, proNameHe: null, proSeed: null, totalMinorUnits: null });
  });

  it("a search in progress is live, with nobody named and no ETA invented", () => {
    const c = toCallListItem(job({ status: "SEARCHING", professional: null, ratingGiven: null, amountMinorUnits: null }), NOW);
    expect(c).toMatchObject({ live: true, stateHe: "מחפשים", proNameHe: null, etaMinutes: null, stage: 0, attention: false });
  });

  it("a quote waiting for approval is a live call that needs attention", () => {
    expect(toCallListItem(job({ status: "WAITING_QUOTE_APPROVAL", ratingGiven: null, amountMinorUnits: null }), NOW)).toMatchObject({
      live: true,
      attention: true,
      stage: 2,
      stateHe: "הצעה לאישור",
    });
  });
});

describe("callsFromJobs", () => {
  const at = (d: number, h = 10) => new Date(2026, 8, d, h).toISOString();

  it("live calls first, in the order they were made, then the rest newest first", () => {
    const { calls } = callsFromJobs(
      [
        job({ id: "closed-new", createdAt: at(30) }),
        job({ id: "live-new", status: "PRO_EN_ROUTE", createdAt: at(29) }),
        job({ id: "closed-old", createdAt: at(10) }),
        job({ id: "live-old", status: "IN_PROGRESS", createdAt: at(28) }),
        job({ id: "review", status: "REVIEW_PENDING", ratingGiven: null, createdAt: at(20) }),
      ],
      NOW
    );
    expect(calls.map((c) => c.id)).toEqual(["live-old", "live-new", "closed-new", "review", "closed-old"]);
  });

  it("calls the history 'הושלמו' only when every job in it was completed", () => {
    expect(callsFromJobs([job()], NOW).historyTitleHe).toBe("הושלמו");
    expect(callsFromJobs([job(), job({ id: "x", status: "CANCELLED" })], NOW).historyTitleHe).toBe("היסטוריה");
  });

  it("an empty list stays empty (the screen shows its empty state)", () => {
    expect(callsFromJobs([], NOW).calls).toEqual([]);
  });
});

describe("minutes on a live call", () => {
  // The server read the ETA 2 minutes ago: 16 minutes then, so 14 now.
  const match: CallMatch = {
    eta: { etaSeconds: 16 * 60, computedAt: new Date(NOW.getTime() - 2 * 60_000).toISOString() } as CallMatch["eta"],
    etaSecondsAtAssignment: 20 * 60,
  };
  const enRoute = job({ status: "PRO_EN_ROUTE", ratingGiven: null, amountMinorUnits: null });

  it("shows the server's ETA, counted down since it was read", () => {
    expect(toCallListItem(enRoute, NOW, match).etaMinutes).toBe(14);
  });

  it("agrees with home's capsule to the minute", () => {
    for (const status of ["PRO_ASSIGNED", "PRO_EN_ROUTE"] as JobState[]) {
      expect(toCallListItem(job({ status }), NOW, match).etaMinutes).toBe(capsuleTrip(status, match, NOW.getTime()).etaMinutes);
    }
  });

  it("invents nothing: no match, no ETA, or nobody on the way means no minutes", () => {
    expect(toCallListItem(enRoute, NOW).etaMinutes).toBeNull();
    expect(toCallListItem(enRoute, NOW, { eta: null, etaSecondsAtAssignment: null }).etaMinutes).toBeNull();
    for (const status of ["SEARCHING", "PRO_ARRIVED", "IN_PROGRESS", "CLOSED"] as JobState[]) {
      expect(toCallListItem(job({ status }), NOW, match).etaMinutes, status).toBeNull();
    }
  });

  it("never below one minute", () => {
    const late: CallMatch = { ...match, eta: { ...match.eta!, etaSeconds: 30 } };
    expect(toCallListItem(enRoute, NOW, late).etaMinutes).toBe(1);
  });

  it("callsFromJobs gives each call its own job's minutes", () => {
    const a = job({ id: "a", status: "PRO_EN_ROUTE", createdAt: new Date(2026, 9, 2, 10).toISOString() });
    const b = job({ id: "b", status: "PRO_ASSIGNED", createdAt: new Date(2026, 9, 2, 11).toISOString() });
    const { calls } = callsFromJobs([a, b], NOW, { a: match });
    expect(calls.map((c) => [c.id, c.etaMinutes])).toEqual([["a", 14], ["b", null]]);
  });

  it("reads matches only for the jobs somebody is on the way to", () => {
    const ids = onTheWayJobIds([job({ id: "s", status: "SEARCHING" }), job({ id: "a", status: "PRO_ASSIGNED" }), job({ id: "r", status: "PRO_EN_ROUTE" }), job({ id: "x", status: "PRO_ARRIVED" })]);
    expect(ids).toEqual(["a", "r"]);
  });
});
