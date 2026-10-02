import { describe, expect, it } from "vitest";
import { JOB_STATES } from "@pro-now/types";

import { arrivalHeadlineHe, showsArrival } from "./arrival";

describe("showsArrival", () => {
  it("shows at the door, and only there", () => {
    expect(JOB_STATES.filter((s) => showsArrival(s, false))).toEqual(["PRO_ARRIVED"]);
  });
  it("gives way to the live job once the customer goes back", () => {
    expect(showsArrival("PRO_ARRIVED", true)).toBe(false);
  });
});

describe("arrivalHeadlineHe", () => {
  it("says the real count of jobs done through PRO NOW", () => {
    expect(arrivalHeadlineHe("נזילה", 12)).toBe("נזילה · 12 עבודות דרך PRO NOW");
    expect(arrivalHeadlineHe("נזילה", 1)).toBe("נזילה · עבודה אחת דרך PRO NOW");
  });
  it("never says '0 עבודות'", () => {
    expect(arrivalHeadlineHe("נזילה", 0)).toBe("נזילה · עבודה ראשונה דרך PRO NOW");
  });
});
