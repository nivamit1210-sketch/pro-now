import { describe, expect, it } from "vitest";
import { daysUntil, dueNotice, isCoveredByRenewal, israelDay, NOTICE_TEXT_HE } from "../src/domain/credentials/expiry.js";

const d = (iso: string) => new Date(iso);

describe("israelDay", () => {
  it("is the calendar day in Asia/Jerusalem", () => {
    expect(israelDay(d("2026-10-03T00:00:00Z"))).toBe("2026-10-03");
    expect(israelDay(d("2026-10-02T21:30:00Z"))).toBe("2026-10-03"); // 00:30 in Israel (UTC+3 in October)
    expect(israelDay(d("2026-12-01T22:30:00Z"))).toBe("2026-12-02"); // 00:30 in Israel (UTC+2 in winter)
    expect(israelDay(d("2026-12-01T21:30:00Z"))).toBe("2026-12-01"); // 23:30 in Israel
  });
});

describe("daysUntil", () => {
  it("counts whole Israel calendar days", () => {
    expect(daysUntil(d("2026-11-02T00:00:00Z"), d("2026-10-03T09:00:00Z"))).toBe(30);
    expect(daysUntil(d("2026-10-03T00:00:00Z"), d("2026-10-03T20:00:00Z"))).toBe(0);
    expect(daysUntil(d("2026-10-01T00:00:00Z"), d("2026-10-03T09:00:00Z"))).toBe(-2);
  });
});

describe("dueNotice", () => {
  const none = new Set<never>();
  it("sends nothing more than 30 days out", () => expect(dueNotice(31, none)).toBeNull());
  it("30 days out → WARN_30, then nothing until 7", () => {
    expect(dueNotice(30, none)).toBe("WARN_30");
    expect(dueNotice(12, new Set(["WARN_30"] as const))).toBeNull();
  });
  it("7 days out → WARN_7", () => expect(dueNotice(7, new Set(["WARN_30"] as const))).toBe("WARN_7"));
  it("on the day and after → EXPIRED", () => {
    expect(dueNotice(0, new Set(["WARN_30", "WARN_7"] as const))).toBe("EXPIRED");
    expect(dueNotice(-3, none)).toBe("EXPIRED");
  });
  it("after a gap, only the most relevant one (Review Focus 2)", () => {
    expect(dueNotice(5, none)).toBe("WARN_7");
    expect(dueNotice(-2, none)).toBe("EXPIRED");
  });
  it("never repeats, and skips a notice whose more urgent sibling went out", () => {
    expect(dueNotice(0, new Set(["EXPIRED"] as const))).toBeNull();
    expect(dueNotice(20, new Set(["WARN_7"] as const))).toBeNull();
  });
});

describe("isCoveredByRenewal", () => {
  const target = { expiresAt: d("2026-10-20T00:00:00Z") };
  it("a verified credential valid past the target's date covers it", () => {
    expect(isCoveredByRenewal(target, [{ status: "VERIFIED", expiresAt: d("2027-10-20T00:00:00Z"), noExpiry: false }])).toBe(true);
    expect(isCoveredByRenewal(target, [{ status: "VERIFIED", expiresAt: null, noExpiry: true }])).toBe(true);
  });
  it("pending, expiring the same day or earlier, or dateless-unknown does not", () => {
    expect(isCoveredByRenewal(target, [{ status: "PENDING", expiresAt: d("2027-10-20T00:00:00Z"), noExpiry: false }])).toBe(false);
    expect(isCoveredByRenewal(target, [{ status: "VERIFIED", expiresAt: d("2026-10-20T00:00:00Z"), noExpiry: false }])).toBe(false);
    expect(isCoveredByRenewal(target, [{ status: "VERIFIED", expiresAt: null, noExpiry: false }])).toBe(false);
  });
});

describe("notice copy", () => {
  it("is the spec's words", () => {
    expect(NOTICE_TEXT_HE.WARN_30("רישיון חשמלאי", "תיקון קצר", 30)).toBe("תוקף רישיון חשמלאי לתיקון קצר יפוג בעוד 30 ימים — אפשר להעלות את החידוש כבר עכשיו");
    expect(NOTICE_TEXT_HE.WARN_7("ביטוח", "הובלה", 5)).toBe("תוקף ביטוח להובלה יפוג בעוד 5 ימים — אפשר להעלות את החידוש כבר עכשיו");
    expect(NOTICE_TEXT_HE.WARN_7("ביטוח", "הובלה", 1)).toBe("תוקף ביטוח להובלה יפוג מחר — אפשר להעלות את החידוש כבר עכשיו");
    expect(NOTICE_TEXT_HE.EXPIRED("ביטוח", "הובלה", 0)).toBe("תוקף ביטוח להובלה פג — השירות לא מקבל קריאות עד שהחידוש יאושר");
  });
});
