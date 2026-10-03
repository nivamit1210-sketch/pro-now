import { describe, expect, it } from "vitest";

import { vehicleInput, vehicleLineHe, vehicleProblemsHe } from "./vehicle";

describe("the professional's car on their own screens (audit v2 #8a)", () => {
  it("finds nothing wrong with a car, the plate's last digits, or neither", () => {
    expect(vehicleProblemsHe({ vehicleHe: "יונדאי i20 לבנה", plateTail: "47" })).toEqual({ vehicleHe: null, plateTail: null });
    expect(vehicleProblemsHe({ vehicleHe: "", plateTail: "" })).toEqual({ vehicleHe: null, plateTail: null });
  });

  it("says why a full plate is refused, in either field", () => {
    expect(vehicleProblemsHe({ vehicleHe: "", plateTail: "1234567" }).plateTail).toMatch(/רק 2 או 3 הספרות האחרונות/);
    expect(vehicleProblemsHe({ vehicleHe: "מאזדה 12-345-67", plateTail: "" }).vehicleHe).toMatch(/בלי מספר הרכב כאן/);
    expect(vehicleProblemsHe({ vehicleHe: "", plateTail: "4" }).plateTail).not.toBeNull();
  });

  it("sends trimmed values, empty as cleared", () => {
    expect(vehicleInput({ vehicleHe: " קיה ", plateTail: " " })).toEqual({ vehicleHe: "קיה", plateTail: null });
  });

  it("reads the line as the customer will", () => {
    expect(vehicleLineHe({ vehicleHe: "יונדאי i20 לבנה", plateTail: "47" })).toBe("יונדאי i20 לבנה · ••• 47");
    expect(vehicleLineHe({ vehicleHe: null, plateTail: "123" })).toBe("רכב פרטי · ••• 123");
    expect(vehicleLineHe({ vehicleHe: "קיה", plateTail: null })).toBe("קיה");
    expect(vehicleLineHe({ vehicleHe: null, plateTail: null })).toBeNull();
  });
});
