import { describe, expect, it } from "vitest";
import { adminTicketHandledSchema, safetyReportSchema } from "../src/schemas";

describe("safetyReportSchema (audit v2 #8b)", () => {
  it("takes each of the four reasons, with or without a note", () => {
    for (const reason of ["NOT_THE_PERSON", "WRONG_CODE", "FEELS_UNSAFE", "OTHER"] as const) {
      expect(safetyReportSchema.parse({ reason })).toEqual({ reason, note: null });
    }
    expect(safetyReportSchema.parse({ reason: "OTHER", note: "  הגיע עם עוד מישהו  " })).toEqual({ reason: "OTHER", note: "הגיע עם עוד מישהו" });
  });

  it("a blank note is no note", () => {
    expect(safetyReportSchema.parse({ reason: "WRONG_CODE", note: "   " }).note).toBeNull();
    expect(safetyReportSchema.parse({ reason: "WRONG_CODE", note: null }).note).toBeNull();
  });

  it("refuses an unknown reason, a missing one, a note over 500 and unknown keys", () => {
    expect(safetyReportSchema.safeParse({ reason: "SPAM" }).success).toBe(false);
    expect(safetyReportSchema.safeParse({ note: "x" }).success).toBe(false);
    expect(safetyReportSchema.safeParse({ reason: "OTHER", note: "א".repeat(501) }).success).toBe(false);
    expect(safetyReportSchema.safeParse({ reason: "OTHER", note: "א".repeat(500) }).success).toBe(true);
    expect(safetyReportSchema.safeParse({ reason: "OTHER", professionalId: "p1" }).success).toBe(false);
  });
});

describe("adminTicketHandledSchema", () => {
  it("needs a reason of at least 3 characters", () => {
    expect(adminTicketHandledSchema.safeParse({}).success).toBe(false);
    expect(adminTicketHandledSchema.safeParse({ reason: " x " }).success).toBe(false);
    expect(adminTicketHandledSchema.parse({ reason: " דיברנו איתה " })).toEqual({ reason: "דיברנו איתה" });
  });
});
