import { describe, expect, it } from "vitest";

import { reviewerLabelHe } from "../src/routes/pro.js";

describe("a reviewer, as a professional's profile names them", () => {
  it("is a first name and an initial, never the full name", () => {
    expect(reviewerLabelHe("נועה כהן")).toBe("נועה כ׳");
    expect(reviewerLabelHe("  דני  בן דוד ")).toBe("דני ב׳");
    expect(reviewerLabelHe("עמית")).toBe("עמית");
  });

  it("is nothing when there is no name (an erased account included)", () => {
    expect(reviewerLabelHe(null)).toBeNull();
    expect(reviewerLabelHe("   ")).toBeNull();
  });
});
