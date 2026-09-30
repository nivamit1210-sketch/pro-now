import { describe, expect, it } from "vitest";
import type { DepartmentCode } from "@pro-now/types";

import { canEnterTrade, routeSampleIsNormalized } from "./street";

const trade = (interiorAssetId: string | null) => ({
  shopId: "home",
  departmentCode: "HOME_URGENT" as DepartmentCode,
  nameHe: "הבית",
  services: [],
  interiorAssetId,
});

describe("world scene manifest", () => {
  it("allows entry only when an interior asset exists", () => {
    expect(canEnterTrade(trade("home_workshop_hero"))).toBe(true);
    expect(canEnterTrade(trade(null))).toBe(false);
  });

  it("keeps route samples in normalized world coordinates", () => {
    expect(routeSampleIsNormalized("HOME_URGENT")).toBe(true);
  });
});
