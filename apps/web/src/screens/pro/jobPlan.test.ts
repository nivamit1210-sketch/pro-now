import { describe, expect, it } from "vitest";

import { proJobPlan } from "./jobPlan";

const leak = { serviceCode: "HOME_PLUMB_LEAK", priceModel: "VISIT_QUOTE" as const, onSiteNameHe: null, customerNameHe: "דנה" };

describe("proJobPlan: what the pro's job screen offers at the door", () => {
  it("an ordinary visit-and-diagnosis job finishes the diagnosis, with no quote", () => {
    const plan = proJobPlan(leak);
    expect(plan.kind).toBe("VISIT");
    expect(plan.diagnosisOnly).toBe(true);
    expect(plan.quoteGoesToHe).toBeNull();
    expect(plan.visitTerms.workHe).toBe("התיקון");
  });

  it("a job ordered for someone else is quoted in the app, to the person who ordered", () => {
    const plan = proJobPlan({ ...leak, onSiteNameHe: "סבא יוסף" });
    expect(plan.diagnosisOnly).toBe(false);
    expect(plan.quoteGoesToHe).toBe("דנה");
  });

  it("an orderer with no name is still somebody the quote goes to", () => {
    expect(proJobPlan({ ...leak, customerNameHe: " ", onSiteNameHe: "סבא יוסף" })).toMatchObject({ diagnosisOnly: false, quoteGoesToHe: "מי שהזמין" });
  });

  it("takes the trade's own words for the work", () => {
    expect(proJobPlan({ ...leak, serviceCode: "HOME_HANDYMAN" }).visitTerms.workHe).toBe("העבודה");
  });

  it("falls back on the price model for a service outside the pilot catalogue", () => {
    expect(proJobPlan({ ...leak, serviceCode: "NOT_IN_PILOT" })).toMatchObject({ kind: "VISIT", diagnosisOnly: true });
    expect(proJobPlan({ ...leak, serviceCode: "NOT_IN_PILOT", priceModel: "FIXED" })).toMatchObject({ kind: "LIST", diagnosisOnly: false });
    expect(proJobPlan({ ...leak, serviceCode: "NOT_IN_PILOT", priceModel: "HOURLY" }).kind).toBe("HOURLY");
    expect(proJobPlan({ ...leak, serviceCode: "NOT_IN_PILOT", priceModel: "DISTANCE_TIME" }).kind).toBe("DISTANCE");
  });
});
