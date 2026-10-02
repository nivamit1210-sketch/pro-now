import { describe, expect, it } from "vitest";

import { IL_MOBILE, orderAddressHe, resolveAddress } from "./orderTarget";

describe("resolveAddress", () => {
  const list = [{ id: "a" }, { id: "b" }];
  it("keeps the chosen address", () => expect(resolveAddress(list, "b")?.id).toBe("b"));
  it("falls back to the first when the choice is gone or unset", () => {
    expect(resolveAddress(list, "deleted")?.id).toBe("a");
    expect(resolveAddress(list, null)?.id).toBe("a");
  });
  it("is null with no saved address", () => expect(resolveAddress([], "a")).toBeNull());
});

describe("IL_MOBILE", () => {
  it("accepts Israeli mobiles and refuses the rest", () => {
    expect(IL_MOBILE.test("050-1234567")).toBe(true);
    expect(IL_MOBILE.test("+972501234567")).toBe(true);
    expect(IL_MOBILE.test("03-1234567")).toBe(false);
  });
});

describe("orderAddressHe (the order's 'לאן' line)", () => {
  it("says the address as written", () => expect(orderAddressHe({ formatted: "הרצל 12, תל אביב - יפו", label: "בית" })).toBe("הרצל 12, תל אביב - יפו"));
  it("falls back to the label when the address has no words", () => expect(orderAddressHe({ formatted: " ", label: "בית" })).toBe("בית"));
  it("is null, and the line asks for one, with no address", () => {
    expect(orderAddressHe(null)).toBeNull();
    expect(orderAddressHe({ formatted: "", label: null })).toBeNull();
  });
});
