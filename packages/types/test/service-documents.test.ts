import { describe, expect, it } from "vitest";

import { PILOT_TO_DATABASE_SERVICE_CODE } from "../src/catalog-bridge";
import { credentialTypeFor } from "../src/credential-requirements";
import { documentInfoFor, documentRequirementsFor } from "../src/service-documents";

const reqs = (pilotId: string) => Object.fromEntries(documentRequirementsFor(pilotId).map((r) => [r.requirement, r]));

describe("documentRequirementsFor: the research's list is the rule (D4, 2026-09-30)", () => {
  it("every row is a document a professional can upload, with words to show them", () => {
    for (const pilotId of Object.keys(PILOT_TO_DATABASE_SERVICE_CODE)) {
      for (const r of documentRequirementsFor(pilotId)) {
        expect(credentialTypeFor(r.requirement), `${pilotId} ${r.requirement}`).not.toBeNull();
        expect(documentInfoFor(r.requirement)?.nameHe, r.requirement).toBeTruthy();
      }
    }
  });

  it("what the law requires is mandatory: the electrician, the gas fitter, the AC technician (2025 law), pest control", () => {
    expect(reqs("svc-electric")["LICENSE:ELECTRICIAN"]).toMatchObject({ mandatory: true, level: "LAW" });
    expect(reqs("svc-ac")["LICENSE:AC"]).toMatchObject({ mandatory: true, level: "LAW" });
    expect(reqs("svc-pest")["LICENSE:PEST_CONTROL"]).toMatchObject({ mandatory: true, level: "LAW" });
  });

  it("what the law requires only in some cases is asked, explained, and never blocks", () => {
    const height = reqs("svc-ac")["CERTIFICATE:WORK_AT_HEIGHT"]!;
    expect(height).toMatchObject({ mandatory: false, level: "LAW" });
    expect(height.whenHe).toBeTruthy();
    expect(reqs("svc-flat-tyre")["LICENSE:MOBILE_GARAGE"]).toMatchObject({ mandatory: false, whenHe: expect.any(String) });
  });

  it("vehicle work needs a driving licence and vehicle insurance", () => {
    expect(reqs("svc-courier")["LICENSE:DRIVING"]?.mandatory).toBe(true);
    expect(reqs("svc-courier")["INSURANCE:VEHICLE"]?.mandatory).toBe(true);
  });

  it("liability insurance and trade certificates are recommended, not required", () => {
    expect(reqs("svc-leak")["INSURANCE:LIABILITY"]).toMatchObject({ mandatory: false, level: "RECOMMENDED" });
    expect(reqs("svc-nails")["CERTIFICATE:PROFESSIONAL"]).toMatchObject({ mandatory: false, level: "RECOMMENDED" });
  });

  it("no liability insurance is suggested for work outside the customer's home", () => {
    expect(reqs("svc-courier")["INSURANCE:LIABILITY"]).toBeUndefined();
    expect(reqs("svc-dog-walk")["INSURANCE:LIABILITY"]).toBeUndefined();
  });

  it("never a criminal-record certificate, or any background check", () => {
    for (const pilotId of Object.keys(PILOT_TO_DATABASE_SERVICE_CODE)) {
      expect(documentRequirementsFor(pilotId).map((r) => r.requirement).join()).not.toMatch(/BACKGROUND|CRIMINAL/);
    }
  });

  it("does not claim a check that is not built: no 'automatically'", () => {
    for (const pilotId of Object.keys(PILOT_TO_DATABASE_SERVICE_CODE)) {
      for (const r of documentRequirementsFor(pilotId)) expect(documentInfoFor(r.requirement)!.checkHe).not.toMatch(/אוטומטית/);
    }
  });

  it("an unknown service asks for nothing beyond the account's documents", () => {
    expect(documentRequirementsFor("svc-nothing")).toEqual([{ requirement: "INSURANCE:LIABILITY", mandatory: false, level: "RECOMMENDED" }]);
  });
});
