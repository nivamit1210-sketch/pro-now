import { describe, expect, it } from "vitest";

import {
  JOB_STATES,
  leavingCancels,
  livingMapViolations,
  sceneIsOver,
  scenePhaseForJob,
  proJobFocusHe,
  canReleaseJob,
  releaseBlockedHe,
  VISIT_ORDER,
  visitOrderViolations,
  jobProgressHe,
  proJobFocusFor,
  visitMoneyLineHe,
  DEMO_WORLD,
  type JobState,
  type LivingMapState,
} from "../src";

/**
 * The job says one thing; the world shows another. These tests are about
 * the join between them, which is where a screen quietly starts lying.
 */
describe("scenePhaseForJob", () => {
  it("answers for every job state the server can send", () => {
    // Not a formality. A new state added to JOB_STATES with no thought
    // here would fall through to the default and silently show a search
    // for a job that is, say, in dispute.
    for (const s of JOB_STATES) {
      expect(["SEARCHING", "CANDIDATES_FOUND", "MATCH_REVEAL", "ASSIGNED_ROUTE"]).toContain(
        scenePhaseForJob(s)
      );
    }
  });

  it("never claims to have found candidates from a status alone", () => {
    /*
     * The heart of it. CANDIDATES_FOUND and MATCH_REVEAL require named
     * people; a job status names nobody. If this function ever returns one
     * of them, some screen will draw bubbles for candidates that do not
     * exist — /CLAUDE.md §3.
     */
    for (const s of JOB_STATES) {
      expect(scenePhaseForJob(s)).not.toBe("CANDIDATES_FOUND");
      expect(scenePhaseForJob(s)).not.toBe("MATCH_REVEAL");
    }
  });

  it("shows the search while nobody is assigned", () => {
    expect(scenePhaseForJob("SEARCHING")).toBe("SEARCHING");
    expect(scenePhaseForJob("OFFERING")).toBe("SEARCHING");
  });

  it("opens the street the moment somebody is assigned", () => {
    // Amit's split: searching shows, waiting plays. LivingMapScene only
    // lets the customer steer in ASSIGNED_ROUTE, so this single assertion
    // is what decides whether the game exists at all.
    expect(scenePhaseForJob("PRO_ASSIGNED")).toBe("ASSIGNED_ROUTE");
    expect(scenePhaseForJob("PRO_EN_ROUTE")).toBe("ASSIGNED_ROUTE");
  });

  it("does not snap back to searching once the professional has arrived", () => {
    // A world that reverted to "looking for someone" while the customer's
    // plumber is standing in the kitchen would read as the job being lost.
    for (const s of ["PRO_ARRIVED", "DIAGNOSIS", "IN_PROGRESS"] as JobState[]) {
      expect(scenePhaseForJob(s)).toBe("ASSIGNED_ROUTE");
    }
  });

  it("produces a state the living map considers legal", () => {
    /*
     * The mapping and the invariant checker are written apart, so this is
     * the test that makes them agree: build the state each phase implies
     * and run the product's own rules over it.
     */
    for (const s of JOB_STATES) {
      const phase = scenePhaseForJob(s);
      const state: LivingMapState = {
        phase,
        theme: "HOME",
        adapter: DEMO_WORLD,
        candidates: [],
        journey:
          phase === "ASSIGNED_ROUTE"
            ? { assignmentId: "asg_1", latestFix: null, previousFix: null }
            : null,
      };
      expect(livingMapViolations(state)).toEqual([]);
    }
  });
});

describe("leavingCancels", () => {
  it("is true only while the request is still unanswered", () => {
    expect(leavingCancels("SEARCHING")).toBe(true);
    expect(leavingCancels("OFFERING")).toBe(true);
    expect(leavingCancels("PRO_ASSIGNED")).toBe(false);
    expect(leavingCancels("PRO_EN_ROUTE")).toBe(false);
  });

  it("does not offer to cancel a job that is already cancelled", () => {
    expect(leavingCancels("CANCELLED")).toBe(false);
  });
});

describe("sceneIsOver", () => {
  it("is true exactly for the states with nothing left to watch", () => {
    const over = JOB_STATES.filter(sceneIsOver);
    expect(over).toEqual(["CLOSED", "CANCELLED", "DISPUTED"]);
  });
});

/**
 * THE MONEY LINE HAS TO SAY THE THING THAT IS TRUE NOW.
 *
 * Amit, on the tracking panel: *"איך הצעת מחיר תשלח אם הוא כבר סיים את
 * העבודה? זה אמור להיות לפני."* The sentence was handed to the screen
 * once and never changed, so a promise that was true at the knock was
 * still on the screen after the quote had been approved and the work was
 * underway.
 */
describe("visitMoneyLineHe", () => {
  const fee = { visitFeeHe: "₪179" };

  it("never promises an in-app quote for work priced only once somebody looks (2026-09-29)", () => {
    for (const s of ["PRO_ASSIGNED", "PRO_EN_ROUTE", "PRO_ARRIVED", "DIAGNOSIS"] as const) {
      expect(visitMoneyLineHe(s, fee)).not.toMatch(/הצעת מחיר תישלח|ההצעה תגיע/);
    }
    // Before the diagnosis: the visit fee is all the app charges.
    // No money in the app (D1): the fee is paid to the professional directly.
    expect(visitMoneyLineHe("PRO_EN_ROUTE", fee)).toMatch(/משלמים ישירות למקצוען/);
    // During it: the repair is settled with the professional directly.
    expect(visitMoneyLineHe("DIAGNOSIS", fee)).toMatch(/ישירות מול המקצוען/);
    // Finished with no quote: the fee is what is paid.
    expect(visitMoneyLineHe("COMPLETION_PENDING", fee)).toMatch(/דמי הביקור והאבחון/);
  });

  it("changes at every step of the visit", () => {
    const seen = ["PRO_EN_ROUTE", "DIAGNOSIS", "WAITING_QUOTE_APPROVAL", "IN_PROGRESS", "COMPLETION_PENDING"]
      .map((s) => visitMoneyLineHe(s as JobState, { ...fee, pendingTotalHe: "₪320", approvedTotalHe: "₪320" }));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("never names an amount it was not given", () => {
    for (const s of ["PRO_ASSIGNED", "DIAGNOSIS", "WAITING_QUOTE_APPROVAL", "IN_PROGRESS", "COMPLETION_PENDING"] as const) {
      expect(visitMoneyLineHe(s, {})).not.toMatch(/\d/);
    }
  });

  it("promises no charge exactly where there is something to approve", () => {
    expect(visitMoneyLineHe("WAITING_QUOTE_APPROVAL", fee)).toContain("לא מחויב עד שתאשרו");
    expect(visitMoneyLineHe("IN_PROGRESS", fee)).not.toContain("לא מחויב");
  });

  it("does not restate the visit fee once a quote is on the table", () => {
    // It is offset against the quote, so naming both reads as two charges.
    expect(visitMoneyLineHe("WAITING_QUOTE_APPROVAL", { ...fee, pendingTotalHe: "₪320" })).not.toContain("₪179");
    expect(visitMoneyLineHe("IN_PROGRESS", { ...fee, approvedTotalHe: "₪320" })).not.toContain("₪179");
  });

  it("never claims money has moved", () => {
    for (const s of ["COMPLETED", "PAYMENT_PENDING", "PAYMENT_CAPTURED", "CLOSED"] as const) {
      expect(visitMoneyLineHe(s, { ...fee, approvedTotalHe: "₪320" })).toBeNull();
    }
    expect(visitMoneyLineHe("COMPLETION_PENDING", { approvedTotalHe: "₪320" })).toContain("לתשלום");
  });

  it("says nothing before anybody has been assigned", () => {
    for (const s of ["DRAFT", "SEARCHING", "OFFERING", "CANCELLED"] as const) {
      expect(visitMoneyLineHe(s, fee)).toBeNull();
    }
  });

  it("drops the quote conversation entirely on a fixed price", () => {
    const fixed = { fixedTotalHe: "₪450", visitFeeHe: "₪179" };
    for (const s of ["PRO_EN_ROUTE", "PRO_ARRIVED", "IN_PROGRESS"] as const) {
      const line = visitMoneyLineHe(s, fixed);
      expect(line).toContain("₪450");
      expect(line).not.toMatch(/הצעת מחיר|הצעה/);
      // And not the visit fee either: one price was agreed, not two.
      expect(line).not.toContain("₪179");
    }
    expect(visitMoneyLineHe("COMPLETION_PENDING", fixed)).toContain("לתשלום");
  });
});

/**
 * THE PROFESSIONAL'S SCREEN HAS TO CHANGE TOO.
 *
 * Amit: *"עדיין כל המסכים פה אותו דבר ואין שום שינוי בין בדרך לבדיקה
 * להצעת מחיר."*
 */
describe("proJobFocusHe", () => {
  it("says something different at every stage of a visit", () => {
    const stages: JobState[] = [
      "PRO_ASSIGNED",
      "PRO_EN_ROUTE",
      "PRO_ARRIVED",
      "DIAGNOSIS",
      "WAITING_QUOTE_APPROVAL",
      "IN_PROGRESS",
      "COMPLETION_PENDING",
    ];
    const said = stages.map((s) => proJobFocusHe(s));
    expect(said.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
    expect(new Set(said).size).toBe(stages.length);
  });

  it("says nothing before there is a job or after it is over", () => {
    for (const s of ["DRAFT", "SEARCHING", "OFFERING", "COMPLETED", "CLOSED"] as const) {
      expect(proJobFocusHe(s)).toBeNull();
    }
  });

  it("never promises a time", () => {
    for (const s of ["PRO_EN_ROUTE", "DIAGNOSIS", "IN_PROGRESS"] as const) {
      expect(proJobFocusHe(s)).not.toMatch(/\d/);
    }
  });

  it("moves the screen's point from the road to the fault to the money", () => {
    expect(proJobFocusFor("PRO_EN_ROUTE")).toBe("TRAVEL");
    expect(proJobFocusFor("PRO_ARRIVED")).toBe("PROBLEM");
    expect(proJobFocusFor("DIAGNOSIS")).toBe("PROBLEM");
    expect(proJobFocusFor("WAITING_QUOTE_APPROVAL")).toBe("MONEY");
    expect(proJobFocusFor("IN_PROGRESS")).toBe("MONEY");
    expect(proJobFocusFor("SEARCHING")).toBeNull();
  });

  /*
   * The two must agree: a stage that has something to say is a stage
   * that has a point, and one that has neither is not a visit.
   */
  it("agrees with itself about which stages are a visit", () => {
    for (const s of JOB_STATES) {
      expect(proJobFocusHe(s) === null).toBe(proJobFocusFor(s) === null);
    }
  });
});

/**
 * THE PRICE COMES BEFORE THE WORK.
 *
 * Amit, twice: *"איך הצעת מחיר תשלח אם הוא כבר סיים את העבודה?"* and
 * *"זה אמור להיות לפני שהוא עובד בכלל."* The single most important
 * ordering in the product, and until now it was enforced everywhere and
 * asserted nowhere.
 */
describe("visit order", () => {
  it("holds its own invariants", () => {
    expect(visitOrderViolations()).toEqual([]);
  });

  it("has no way from a diagnosis to work that skips the approval", () => {
    const i = VISIT_ORDER.indexOf("DIAGNOSIS");
    expect(VISIT_ORDER[i + 1]).toBe("WAITING_QUOTE_APPROVAL");
    expect(VISIT_ORDER[i + 2]).toBe("IN_PROGRESS");
  });

  it("gives the professional a sentence at every step of it", () => {
    for (const s of VISIT_ORDER) {
      expect(proJobFocusHe(s), s).toBeTruthy();
    }
  });

  /*
   * The customer's sentence starts at the knock and not before, which is
   * deliberate: until somebody is at the door the arrival assurance owns
   * the words, and two things narrating the same wait is how a screen
   * ends up contradicting itself.
   */
  it("gives the customer one from the moment somebody is at the door", () => {
    for (const s of VISIT_ORDER.slice(VISIT_ORDER.indexOf("PRO_ARRIVED"))) {
      expect(jobProgressHe(s), s).toBeTruthy();
    }
    expect(jobProgressHe("PRO_EN_ROUTE")).toBeNull();
  });
});

/**
 * A WAY OUT, UP TO THE POINT WHERE MONEY IS INVOLVED.
 *
 * Amit: *"אחרי שהוא רשם כן אני לוקח, הוא לא יכול להתחרט? אין פה כפתור
 * ביטול או חזור."*
 */
describe("releasing a job", () => {
  it("is possible while nothing but time has been spent", () => {
    for (const s of ["PRO_ASSIGNED", "PRO_EN_ROUTE", "PRO_ARRIVED", "DIAGNOSIS"] as const) {
      expect(canReleaseJob(s), s).toBe(true);
      expect(releaseBlockedHe(s)).toBeNull();
    }
  });

  it("stops the moment a price is on the table", () => {
    /*
     * From here an amount is held on the customer's approval, so walking
     * away is a dispute rather than a release — different machinery, and
     * a policy nobody has written.
     */
    for (const s of ["WAITING_QUOTE_APPROVAL", "IN_PROGRESS", "COMPLETION_PENDING"] as const) {
      expect(canReleaseJob(s), s).toBe(false);
      expect(releaseBlockedHe(s)).toBeTruthy();
    }
  });

  it("lines up with the order of a visit rather than being a second opinion", () => {
    const stop = VISIT_ORDER.findIndex((s) => !canReleaseJob(s));
    expect(VISIT_ORDER[stop]).toBe("WAITING_QUOTE_APPROVAL");
    // And it never comes back afterwards.
    for (const s of VISIT_ORDER.slice(stop)) expect(canReleaseJob(s)).toBe(false);
  });

  it("says nothing about a job that has not started", () => {
    expect(releaseBlockedHe("SEARCHING")).toBeNull();
  });
});

describe("no money in the app (D1)", () => {
  const facts = { paidDirectly: true, approvedTotalHe: "‏320 ‏₪", visitFeeHe: "‏180 ‏₪" };
  it("never says the customer approved or will release a payment", () => {
    for (const status of ["IN_PROGRESS", "COMPLETION_PENDING"] as const) {
      const line = visitMoneyLineHe(status, facts)!;
      expect(line).toContain("ישירות למקצוען");
      expect(line).not.toMatch(/אישרתם|אחרי שתאשרו|משחרר/);
    }
  });
});
