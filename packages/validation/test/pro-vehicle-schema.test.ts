import { describe, expect, it } from "vitest";

import { looksLikePlate, proVehicleSchema } from "../src";

/**
 * Audit v2 #8a: the car is free text, and of the plate only the last two or
 * three digits are ever kept. A full plate is refused, not trimmed, in
 * either field.
 */
const parse = (input: unknown) => proVehicleSchema.safeParse(input);
const issues = (input: unknown) => {
  const r = parse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
};

describe("the professional's car", () => {
  it("keeps a car and the plate's last digits", () => {
    expect(parse({ vehicleHe: "  יונדאי i20 לבנה ", plateTail: "47" }).data).toEqual({ vehicleHe: "יונדאי i20 לבנה", plateTail: "47" });
    expect(parse({ vehicleHe: "קיה פיקנטו", plateTail: "123" }).data).toEqual({ vehicleHe: "קיה פיקנטו", plateTail: "123" });
  });

  it("treats both as optional, and empty as cleared", () => {
    expect(parse({}).data).toEqual({ vehicleHe: null, plateTail: null });
    expect(parse({ vehicleHe: "", plateTail: "  " }).data).toEqual({ vehicleHe: null, plateTail: null });
    expect(parse({ vehicleHe: null, plateTail: null }).data).toEqual({ vehicleHe: null, plateTail: null });
  });

  it("refuses a full plate, or anything but two or three digits, as the tail", () => {
    for (const plateTail of ["1234567", "12-345-67", "4", "1234", "4a", "٤٧"]) {
      expect(issues({ plateTail }), plateTail).toEqual(["plateTail:PLATE_TAIL_ONLY"]);
    }
    // Spaces around it are trimmed, not refused.
    expect(parse({ plateTail: " 47 " }).data?.plateTail).toBe("47");
  });

  it("refuses a full plate typed into the car's text", () => {
    for (const vehicleHe of ["מאזדה 3 1234567", "טויוטה 12-345-67", "סקודה 123.45.678", "רכב 12 345 67"]) {
      expect(issues({ vehicleHe }), vehicleHe).toEqual(["vehicleHe:VEHICLE_TEXT_HAS_PLATE"]);
    }
  });

  it("allows a model and its year", () => {
    for (const vehicleHe of ["טויוטה קורולה 2019 לבנה", "פולקסווגן ID.4 2022", "מאזדה 3", "BMW X5 2021"]) {
      expect(parse({ vehicleHe }).success, vehicleHe).toBe(true);
    }
    expect(looksLikePlate("ID.4 2022")).toBe(false);
    expect(looksLikePlate("123456")).toBe(true);
  });

  it("caps the car's text and takes no other fields", () => {
    expect(issues({ vehicleHe: "א".repeat(41) })).toHaveLength(1);
    expect(parse({ vehicleHe: "קיה", plate: "1234567" }).success).toBe(false);
  });
});
