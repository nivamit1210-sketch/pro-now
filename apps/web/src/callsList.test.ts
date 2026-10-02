import { describe, expect, it } from "vitest";
import { JOB_STATES, type JobState, type MyJobSummary } from "@pro-now/types";

import { STATUS_VIEW, callsFromJobs, markForDatabaseCode, toCallListItem, whenHe } from "./callsList";

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
