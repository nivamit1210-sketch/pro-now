import { describe, expect, it } from "vitest";
import { accountApprovalBlocker, ageOn, currentCheck, identityBadge, type IdentityAttempt } from "../src/domain/identity-check.js";

const at = (iso: string) => new Date(iso);
const attempt = (o: Partial<IdentityAttempt> & { createdAt: Date }): IdentityAttempt => ({
  id: o.createdAt.toISOString(), status: "MANUAL_REVIEW", isSandbox: true, method: null, ...o,
});

describe("currentCheck", () => {
  it("is the latest attempt that was not replaced", () => {
    const old = attempt({ createdAt: at("2026-10-01T10:00:00Z"), status: "REJECTED" });
    const latest = attempt({ createdAt: at("2026-10-02T10:00:00Z") });
    expect(currentCheck([latest, old])).toBe(latest);
  });
  it("skips superseded attempts and is null without any", () => {
    expect(currentCheck([attempt({ createdAt: at("2026-10-02T10:00:00Z"), status: "SUPERSEDED" })])).toBeNull();
    expect(currentCheck([])).toBeNull();
  });
});

describe("ageOn", () => {
  it("turns 18 on the birthday itself, not the day before", () => {
    expect(ageOn(at("2008-10-02"), at("2026-10-02T08:00:00Z"))).toBe(18);
    expect(ageOn(at("2008-10-03"), at("2026-10-02T08:00:00Z"))).toBe(17);
  });
  it("handles a 29 February birthday", () => {
    expect(ageOn(at("2008-02-29"), at("2026-02-28T12:00:00Z"))).toBe(17);
    expect(ageOn(at("2008-02-29"), at("2026-03-01T12:00:00Z"))).toBe(18);
  });
});

describe("accountApprovalBlocker", () => {
  const on = at("2026-10-02T08:00:00Z");
  const verified = attempt({ createdAt: on, status: "VERIFIED", method: "MANUAL" });
  it("needs a verified current check", () => {
    expect(accountApprovalBlocker({ dateOfBirth: at("1990-01-01"), current: null }, on)).toBe("IDENTITY_NOT_VERIFIED");
    expect(accountApprovalBlocker({ dateOfBirth: at("1990-01-01"), current: attempt({ createdAt: on }) }, on)).toBe("IDENTITY_NOT_VERIFIED");
  });
  it("needs a date of birth, and 18 on the day of the decision", () => {
    expect(accountApprovalBlocker({ dateOfBirth: null, current: verified }, on)).toBe("DATE_OF_BIRTH_MISSING");
    expect(accountApprovalBlocker({ dateOfBirth: at("2008-10-03"), current: verified }, on)).toBe("UNDER_MINIMUM_AGE");
    expect(accountApprovalBlocker({ dateOfBirth: at("2008-10-02"), current: verified }, on)).toBeNull();
  });
});

describe("identityBadge", () => {
  const on = at("2026-10-02T08:00:00Z");
  it("says 'verified' only for a real vendor's verified check", () => {
    expect(identityBadge(attempt({ createdAt: on, status: "VERIFIED", isSandbox: false, method: "VENDOR" }))).toBe("IDENTITY_VERIFIED");
  });
  it("says 'checked by PRO NOW' for a manual approval, sandbox or not", () => {
    expect(identityBadge(attempt({ createdAt: on, status: "VERIFIED", isSandbox: true, method: "MANUAL" }))).toBe("IDENTITY_CHECKED");
    expect(identityBadge(attempt({ createdAt: on, status: "VERIFIED", isSandbox: false, method: "MANUAL" }))).toBe("IDENTITY_CHECKED");
  });
  it("says nothing otherwise", () => {
    expect(identityBadge(null)).toBeNull();
    expect(identityBadge(attempt({ createdAt: on, status: "MANUAL_REVIEW" }))).toBeNull();
    expect(identityBadge(attempt({ createdAt: on, status: "VERIFIED", isSandbox: true, method: "VENDOR" }))).toBeNull();
  });
});
