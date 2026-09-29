import { describe, it, expect } from "vitest";
import { assertTransition, isTransitionAllowed, nextAfterArrival, InvalidJobTransitionError } from "../src/domain/job/transitions.js";

describe("job state machine — /docs/07-JOB-STATE-MACHINE.md", () => {
  it("allows the full happy-path visit+quote flow", () => {
    const path: Array<[any, any]> = [
      ["DRAFT", "SEARCHING"],
      ["SEARCHING", "OFFERING"],
      ["OFFERING", "PRO_ASSIGNED"],
      ["PRO_ASSIGNED", "PRO_EN_ROUTE"],
      ["PRO_EN_ROUTE", "PRO_ARRIVED"],
      ["PRO_ARRIVED", "DIAGNOSIS"],
      ["DIAGNOSIS", "WAITING_QUOTE_APPROVAL"],
      ["WAITING_QUOTE_APPROVAL", "IN_PROGRESS"],
      ["IN_PROGRESS", "COMPLETION_PENDING"],
      ["COMPLETION_PENDING", "COMPLETED"],
      ["COMPLETED", "PAYMENT_PENDING"],
      // No money in the app (D1): straight to review.
      ["COMPLETED", "REVIEW_PENDING"],
      ["PAYMENT_PENDING", "PAYMENT_CAPTURED"],
      ["PAYMENT_CAPTURED", "REVIEW_PENDING"],
      ["REVIEW_PENDING", "CLOSED"],
    ];
    for (const [from, to] of path) {
      expect(isTransitionAllowed(from, to)).toBe(true);
    }
  });

  it("allows the fixed/hourly/courier shortcut that skips DIAGNOSIS", () => {
    expect(isTransitionAllowed("PRO_ARRIVED", "IN_PROGRESS")).toBe(true);
  });

  it("lets a diagnosis-only visit finish without a quote (the visit fee is the whole charge)", () => {
    expect(isTransitionAllowed("DIAGNOSIS", "COMPLETION_PENDING")).toBe(true);
    // …but never straight to money, and never back into work without an approval.
    expect(isTransitionAllowed("DIAGNOSIS", "PAYMENT_PENDING")).toBe(false);
    expect(isTransitionAllowed("DIAGNOSIS", "IN_PROGRESS")).toBe(false);
  });

  it("rejects WORKING -> AVAILABLE style skips (no COMPLETED/CANCELLED in between)", () => {
    expect(isTransitionAllowed("IN_PROGRESS", "PAYMENT_PENDING")).toBe(false);
    expect(() => assertTransition("IN_PROGRESS", "PAYMENT_PENDING", "SYSTEM")).toThrow(InvalidJobTransitionError);
  });

  it("rejects a customer cancelling mid-service directly (must go through Ops)", () => {
    expect(() => assertTransition("IN_PROGRESS", "CANCELLED", "CUSTOMER")).toThrow();
    expect(() => assertTransition("IN_PROGRESS", "CANCELLED", "OPS")).not.toThrow();
  });

  it("allows a customer to cancel before assignment", () => {
    expect(() => assertTransition("SEARCHING", "CANCELLED", "CUSTOMER")).not.toThrow();
  });

  it("never allows a transition out of a terminal state", () => {
    expect(isTransitionAllowed("CLOSED", "IN_PROGRESS")).toBe(false);
    expect(isTransitionAllowed("CANCELLED", "SEARCHING")).toBe(false);
  });
});

/**
 * The step between arriving and working.
 *
 * `nextAfterArrival` has encoded this since the state machine was written
 * and the route that starts a job never asked it: `/api/v1/jobs/:id/start`
 * sent every job straight to IN_PROGRESS. For a VISIT_QUOTE service that
 * skips DIAGNOSIS — the state where the professional looks at the problem
 * and writes a price — so the job landed in "working" before the customer
 * had approved anything, and the quote step had no state to live in.
 */
describe("nextAfterArrival", () => {
  it("sends a quoted service to diagnosis, not to work", () => {
    expect(nextAfterArrival(true)).toBe("DIAGNOSIS");
  });

  it("lets a priced service start immediately", () => {
    // A fixed-price haircut has nothing to diagnose. Forcing it through
    // DIAGNOSIS would make the professional press a button that means
    // nothing, which is how people learn to press buttons that do.
    expect(nextAfterArrival(false)).toBe("IN_PROGRESS");
  });

  it("returns a state that is actually reachable from PRO_ARRIVED", () => {
    // The two functions are written apart; this is what makes them agree.
    for (const requiresDiagnosis of [true, false]) {
      const target = nextAfterArrival(requiresDiagnosis);
      expect(() => assertTransition("PRO_ARRIVED", target, "PROFESSIONAL")).not.toThrow();
    }
  });
});
