import { describe, expect, it } from "vitest";
import { ApiError } from "@pro-now/api-client";
import { SAFETY_SENT_BODY_HE, safetyErrorHe, safetyIntroHe } from "./safety";

describe("the safety sheet's words (audit v2 #8b)", () => {
  it("offers to share only where there is a link to share", () => {
    expect(safetyIntroHe("סבתא רינה")).toContain("לשתף את מצב הקריאה עם סבתא רינה");
    expect(safetyIntroHe("סבתא רינה")).toContain("בלי הכתובת המלאה");
    expect(safetyIntroHe(null)).not.toContain("לשתף");
    expect(safetyIntroHe(null)).toContain("לאדם מהצוות");
  });

  it("always gives the police number, sent or not", () => {
    expect(SAFETY_SENT_BODY_HE).toContain("משטרה 100");
    expect(safetyErrorHe(new Error("network"))).toContain("משטרה 100");
  });

  it("the server's limit says itself; anything else is a retry", () => {
    expect(safetyErrorHe(new ApiError(429, "SAFETY_REPORT_LIMIT", "כבר קיבלנו ממך כמה דיווחים"))).toBe("כבר קיבלנו ממך כמה דיווחים");
    expect(safetyErrorHe(new ApiError(500, "INTERNAL_ERROR", "Internal server error"))).toContain("נסו שוב");
  });
});
