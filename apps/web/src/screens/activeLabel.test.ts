import { describe, expect, it } from "vitest";

import { activeLabelHe } from "./activeLabel";

describe("activeLabelHe", () => {
  it("speaks about a professional who asked for the feminine as she", () => {
    expect(activeLabelHe("PRO_ARRIVED", true)).toBe("הגיעה");
    expect(activeLabelHe("DIAGNOSIS", true)).toBe("בודקת את הבעיה");
    expect(activeLabelHe("COMPLETION_PENDING", true)).toBe("סיימה — מחכה לאישורך");
  });

  it("keeps the demo's words otherwise", () => {
    expect(activeLabelHe("PRO_ARRIVED", false)).toBe("הגיע");
    expect(activeLabelHe("PRO_EN_ROUTE", true)).toBe("בדרך אליך");
    expect(activeLabelHe("SEARCHING", true)).toBe("מחפשים מקצוען");
    expect(activeLabelHe("SOMETHING_NEW", false)).toBe("בטיפול");
  });
});
