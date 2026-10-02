import { describe, expect, it } from "vitest";
import { pilotServiceById } from "@pro-now/types";

import { catalogPick, jobServiceNameHe } from "../src/domain/job/service-name.js";

describe("the service name the customer picked (audit v2 #1)", () => {
  it("takes the name from the catalogue when the pick bridges to the dispatched service", () => {
    expect(catalogPick("svc-clean", "CLEAN_URGENT")).toEqual({ ok: true, catalogServiceId: "svc-clean", catalogServiceNameHe: pilotServiceById["svc-clean"]!.nameHe });
  });

  it("refuses a pick that is another service, unknown, or not a catalogue id at all", () => {
    expect(catalogPick("svc-leak", "CLEAN_URGENT").ok).toBe(false);
    expect(catalogPick("svc-nope", "CLEAN_URGENT").ok).toBe(false);
    expect(catalogPick("toString", "CLEAN_URGENT").ok).toBe(false);
  });

  it("shows the picked name, and the service's own on a job that has none", () => {
    expect(jobServiceNameHe({ catalogServiceNameHe: "ניקיון דחוף", service: { nameHe: "מנקה פנוי/ה להיום עכשיו" } })).toBe("ניקיון דחוף");
    expect(jobServiceNameHe({ catalogServiceNameHe: null, service: { nameHe: "מנקה פנוי/ה להיום עכשיו" } })).toBe("מנקה פנוי/ה להיום עכשיו");
  });
});
