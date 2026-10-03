import { describe, expect, it } from "vitest";
import type { JobState } from "@pro-now/types";

import { VEHICLE_VISIBLE, vehicleForCustomer } from "../src/domain/vehicle.js";

const car = { vehicleHe: "יונדאי i20 לבנה", vehiclePlateTail: "47" };

describe("the professional's car, as the customer is told it (audit v2 #8a)", () => {
  it("is told from assignment until the work is done", () => {
    for (const status of ["PRO_ASSIGNED", "PRO_EN_ROUTE", "PRO_ARRIVED", "IN_PROGRESS", "COMPLETION_PENDING"] as JobState[]) {
      expect(vehicleForCustomer(status, car), status).toEqual({ vehicleHe: "יונדאי i20 לבנה", plateTailHe: "47" });
    }
  });

  it("is not told before anyone is assigned, nor after the visit", () => {
    for (const status of ["DRAFT", "SEARCHING", "OFFERING", "COMPLETED", "REVIEW_PENDING", "CLOSED", "CANCELLED", "DISPUTED"] as JobState[]) {
      expect(VEHICLE_VISIBLE.has(status), status).toBe(false);
      expect(vehicleForCustomer(status, car), status).toBeNull();
    }
  });

  it("says only what the professional gave, and nothing when they gave nothing", () => {
    expect(vehicleForCustomer("PRO_ARRIVED", { vehicleHe: "קיה", vehiclePlateTail: null })).toEqual({ vehicleHe: "קיה", plateTailHe: null });
    expect(vehicleForCustomer("PRO_ARRIVED", { vehicleHe: null, vehiclePlateTail: "123" })).toEqual({ vehicleHe: null, plateTailHe: "123" });
    expect(vehicleForCustomer("PRO_ARRIVED", { vehicleHe: "  ", vehiclePlateTail: null })).toBeNull();
  });

  it("never passes on more of a plate than its last digits, even from a bad row", () => {
    expect(vehicleForCustomer("PRO_ARRIVED", { vehicleHe: null, vehiclePlateTail: "1234567" })).toBeNull();
  });
});
