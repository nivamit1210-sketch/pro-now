import { describe, expect, it } from "vitest";
import { credentialItem, documentItem, itemExists, parseItem, serviceItem, valuesChanged, type ApplicationItems } from "../src/domain/review-loop.js";

const items: ApplicationItems = {
  hasIdentity: true, hasArea: true, hasPortrait: true, hasShop: false,
  documentKinds: ["TAX_FILE"],
  services: [{ serviceId: "svc1", requirements: ["LICENSE:PLUMBING"] }],
};

describe("item names", () => {
  it("builds and parses every kind", () => {
    expect(credentialItem("svc1", "LICENSE:PLUMBING")).toBe("CREDENTIAL:svc1:LICENSE:PLUMBING");
    expect(parseItem("CREDENTIAL:svc1:LICENSE:PLUMBING")).toEqual({ kind: "CREDENTIAL", serviceId: "svc1", requirement: "LICENSE:PLUMBING" });
    expect(parseItem(serviceItem("svc1"))).toEqual({ kind: "SERVICE", serviceId: "svc1" });
    expect(parseItem(documentItem("TAX_FILE"))).toEqual({ kind: "DOCUMENT", documentKind: "TAX_FILE" });
    expect(parseItem("PORTRAIT")).toEqual({ kind: "PORTRAIT" });
    expect(parseItem("NONSENSE")).toBeNull();
    expect(parseItem("SERVICE:")).toBeNull();
  });
  it("an item exists only if this application has it", () => {
    expect(itemExists("IDENTITY", items)).toBe(true);
    expect(itemExists("SHOP", items)).toBe(false);
    expect(itemExists("DETAILS", items)).toBe(true);
    expect(itemExists("DOCUMENT:TAX_FILE", items)).toBe(true);
    expect(itemExists("DOCUMENT:OTHER", items)).toBe(false);
    expect(itemExists("SERVICE:svc1", items)).toBe(true);
    expect(itemExists("SERVICE:svc2", items)).toBe(false);
    expect(itemExists("CREDENTIAL:svc1:LICENSE:PLUMBING", items)).toBe(true);
    expect(itemExists("CREDENTIAL:svc1:INSURANCE", items)).toBe(false);
    expect(itemExists("NONSENSE", items)).toBe(false);
  });
});

describe("valuesChanged", () => {
  it("compares field by field, dates by time, missing as null", () => {
    expect(valuesChanged({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(false);
    expect(valuesChanged({ a: 1 }, { a: 2 })).toBe(true);
    expect(valuesChanged({ d: new Date("2000-01-01") }, { d: new Date("2000-01-01T00:00:00Z") })).toBe(false);
    expect(valuesChanged({ a: null }, { a: undefined })).toBe(false);
    expect(valuesChanged({ a: "x" }, { a: "x", b: 1 })).toBe(true);
  });
});
