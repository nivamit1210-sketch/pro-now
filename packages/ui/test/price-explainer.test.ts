import { describe, expect, it } from "vitest";
import type { PriceQuoteView } from "@pro-now/types";

import { priceExplainer } from "../src/pricing-copy";

/**
 * The service page is where the customer learns what they are committing to
 * before anyone is dispatched. Every assertion below is really the same
 * assertion: a pricing model must describe its own shape, and must never
 * borrow the certainty of a different one.
 *
 * /CLAUDE.md §3 — "Real supply only. Real ETA only." The pricing corollary
 * is that a number the server has not given us is not printed at all.
 */

describe("priceExplainer", () => {
  it("states a FIXED price as the professional's list price, held and released after completion", () => {
    const price: PriceQuoteView = {
      priceModel: "FIXED",
      currency: "ILS",
      fixedTotalMinorUnits: 45000,
    };
    const out = priceExplainer(price);
    expect(out.headline).toContain("450");
    expect(out.detail).toContain("אחרי שתאשרו שהעבודה הושלמה");
  });

  it("presents VISIT_QUOTE as a visit fee, never as the job's price", () => {
    const price: PriceQuoteView = {
      priceModel: "VISIT_QUOTE",
      currency: "ILS",
      visitFeeMinorUnits: 17900,
    };
    const out = priceExplainer(price);
    expect(out.headline).toContain("179");
    // The critical sentence: the repair itself is settled directly, not through the app.
    // No money in the app (D1): paid to the professional directly.
    expect(out.detail).toContain("משלמים ישירות למקצוען");
    expect(out.detail).not.toContain("משולם באפליקציה");
    expect(out.detail).not.toContain("מחיר קבוע");
  });

  it("before anyone is found, names no visit fee — each professional sets their own", () => {
    const out = priceExplainer({ priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 }, { stage: "service" });
    expect(out.headline).not.toContain("179");
    expect(out.headline).toContain("לפי המקצוען");
    expect(out.detail).toContain("באפליקציה לא עובר כסף");
  });

  it("on the match, the fee is that professional's", () => {
    const out = priceExplainer({ priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 }, { proFirstNameHe: "יוסי" });
    expect(out.headline).toContain("179");
    expect(out.detail).toContain("של יוסי");
  });

  it("names the HOURLY minimum, because it is the number people are surprised by", () => {
    const price: PriceQuoteView = {
      priceModel: "HOURLY",
      currency: "ILS",
      hourlyRateMinorUnits: 28000,
      minimumBillableMinutes: 90,
    };
    const out = priceExplainer(price);
    expect(out.headline).toContain("לשעה");
    expect(out.detail).toContain("מינימום");
    expect(out.detail).toContain("שעה ו-30 דקות");
  });

  it("omits the minimum rather than inventing one when the server did not send it", () => {
    const out = priceExplainer({
      priceModel: "HOURLY",
      currency: "ILS",
      hourlyRateMinorUnits: 28000,
      minimumBillableMinutes: null,
    });
    expect(out.detail).not.toContain("מינימום");
  });

  it("describes DISTANCE_TIME by its parts and states the fare floor", () => {
    const out = priceExplainer({
      priceModel: "DISTANCE_TIME",
      currency: "ILS",
      baseMinorUnits: 3500,
      perKmMinorUnits: 450,
      minimumFareMinorUnits: 6000,
    });
    expect(out.headline).toContain("לק״מ");
    expect(out.detail).toContain("מינימום");
  });

  it("renders a dash, not a number, when the amount is genuinely missing", () => {
    for (const price of [
      { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: null },
      { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: null },
      { priceModel: "HOURLY", currency: "ILS", hourlyRateMinorUnits: null },
    ] as PriceQuoteView[]) {
      const out = priceExplainer(price);
      expect(out.headline).toBe("—");
      // A missing price must never read as free or as zero.
      expect(out.headline).not.toMatch(/0/);
    }
  });
});
