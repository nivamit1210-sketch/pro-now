import type { CatalogResponse } from "@pro-now/types";
import { describe, expect, it } from "vitest";

import { worldTradesFromCatalog } from "./catalogTrades";

const catalog: CatalogResponse = {
  marketCode: "IL",
  departments: [
    {
      // The database's department code, which is not the pilot's HOME_URGENT.
      code: "HOME_REPAIRS",
      nameHe: "תיקונים בבית",
      nameEn: "Home repairs",
      categories: [
        {
          code: "PLUMBING",
          nameHe: "אינסטלציה",
          nameEn: "Plumbing",
          services: [
            {
              id: "db-leak",
              code: "HOME_PLUMB_LEAK",
              // The seeded row's own name; shops show the customer-facing one.
              nameHe: "נזילה/פיצוץ בצנרת",
              nameEn: "Leak",
              priceModel: "VISIT_QUOTE",
              trustTier: "C",
            },
            {
              id: "unknown",
              code: "NOT_IN_PILOT",
              nameHe: "שירות בדיקה",
              nameEn: "Unknown",
              priceModel: "VISIT_QUOTE",
              trustTier: "C",
            },
          ],
        },
      ],
    },
  ],
};

describe("worldTradesFromCatalog", () => {
  it("maps server catalog codes to the matching world shop and pilot ids", () => {
    const trades = worldTradesFromCatalog(catalog);

    expect(trades.home).toBeDefined();
    expect(trades.home!).toMatchObject({
      shopId: "home",
      departmentCode: "HOME_URGENT",
      nameHe: "הבית",
      interiorAssetId: "home_workshop_hero",
    });
    expect(trades.home!.services).toEqual([
      { id: "svc-leak", nameHe: "נזילה או דליפת מים", descriptionHe: "מים שמופיעים איפה שהם לא אמורים." },
    ]);
    expect(Object.keys(trades)).toEqual(["home"]);
  });

  it("does not invent shops for departments that are not in the world manifest", () => {
    const trades = worldTradesFromCatalog({
      ...catalog,
      departments: [{ code: "NOT_A_DEPARTMENT", nameHe: "", nameEn: "", categories: [] }],
    });
    expect(trades).toEqual({});
  });
});
