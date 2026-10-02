import { describe, expect, it } from "vitest";
import { SAFETY_REASON_HE, SAFETY_REPORT_REASONS } from "@pro-now/types";
import { safetyReportSchema } from "@pro-now/validation";
import { safetyAlertHtml, safetySubjectHe, type SafetyAlertInput } from "../src/domain/safety-report.js";

const base: SafetyAlertInput = {
  environment: "production",
  publicUrl: "https://pronow.app/",
  ticketId: "t1",
  reason: "NOT_THE_PERSON",
  note: null,
  jobId: "job_1",
  jobStatus: "PRO_ARRIVED",
  serviceNameHe: "ניקיון דחוף",
  reporterUserId: "user_1",
  professional: { id: "pro_1", displayName: "דנה" },
};

describe("safety report (audit v2 #8b)", () => {
  it("the server's reasons are the screen's, each with words", () => {
    expect([...safetyReportSchema.shape.reason.options]).toEqual([...SAFETY_REPORT_REASONS]);
    for (const r of SAFETY_REPORT_REASONS) expect(SAFETY_REASON_HE[r].length).toBeGreaterThan(3);
    expect(safetySubjectHe("WRONG_CODE")).toBe("דיווח בטיחות: הקוד לא תואם");
  });

  it("the alert names the reason, the job, the professional and links to the admin", () => {
    const html = safetyAlertHtml(base);
    expect(html).toContain("🛡️ <b>PRO NOW · production</b> · דיווח בטיחות");
    expect(html).toContain("<b>זה לא האדם שבתמונה</b>");
    expect(html).toContain("ניקיון דחוף · PRO_ARRIVED · job <code>job_1</code>");
    expect(html).toContain("מקצוען: דנה <code>pro_1</code>");
    expect(html).toContain("ticket <code>t1</code> · user <code>user_1</code>");
    expect(html).toContain('href="https://pronow.app/admin"');
  });

  it("the customer's words are escaped, scrubbed of emails and phones, and cut", () => {
    const html = safetyAlertHtml({ ...base, reason: "OTHER", note: "<b>x</b> call me 0521234567 or dana@example.com" });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("0521234567");
    expect(html).not.toContain("dana@example.com");
    const long = safetyAlertHtml({ ...base, note: "א".repeat(500) });
    expect(long).toContain(`״${"א".repeat(299)}…״`);
  });

  it("without a professional, says so", () => {
    expect(safetyAlertHtml({ ...base, professional: null })).toContain("מקצוען: —");
  });
});
