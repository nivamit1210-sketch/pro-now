import { describe, expect, it } from "vitest";

import { ORDERER_FALLBACK_HE, proJobActionFor } from "../src/screens/proJobAction";

/*
 * Which button the professional sees at the bottom of the job screen.
 * The roadmap's "two kinds of work" (docs/18, 2026-09-29) and Dvir's call
 * (2026-10-02): an ordinary visit-and-diagnosis job ends at the diagnosis;
 * only a job ordered for someone else is quoted in the app.
 */
describe("proJobActionFor", () => {
  it("an ordinary visit finishes the diagnosis — no quote button", () => {
    expect(proJobActionFor({ status: "DIAGNOSIS", diagnosisOnly: true, canFinishDiagnosis: true })).toEqual({ label: "סיימתי את האבחון", kind: "finishDiagnosis" });
  });

  it("a trade that does not diagnose finishes its check", () => {
    expect(proJobActionFor({ status: "DIAGNOSIS", workHe: "העבודה", diagnosisOnly: true, canFinishDiagnosis: true })?.label).toBe("סיימתי את הבדיקה");
    expect(proJobActionFor({ status: "DIAGNOSIS", workHe: "הטיפול", diagnosisOnly: true, canFinishDiagnosis: true })?.label).toBe("סיימתי את הבדיקה");
  });

  it("a job ordered for someone else sends a quote", () => {
    expect(proJobActionFor({ status: "DIAGNOSIS", diagnosisOnly: false, canFinishDiagnosis: true })).toEqual({ label: "שליחת הצעת מחיר", kind: "quote" });
  });

  it("without a way to finish, the screen still offers the quote rather than a dead button", () => {
    expect(proJobActionFor({ status: "DIAGNOSIS", diagnosisOnly: true, canFinishDiagnosis: false })?.kind).toBe("quote");
  });

  it("an agreed price starts the work", () => {
    expect(proJobActionFor({ status: "DIAGNOSIS", agreedPriceHe: "‏320 ‏₪", canStartAgreed: true, diagnosisOnly: true, canFinishDiagnosis: true })).toEqual({ label: "מתחילים לעבוד · ‏320 ‏₪", kind: "agreed" });
    expect(proJobActionFor({ status: "DIAGNOSIS", kind: "DISTANCE", agreedPriceHe: "‏90 ‏₪", canStartAgreed: true })?.label).toBe("אספתי — יוצאים למסירה · ‏90 ‏₪");
  });

  it("the orderer's fallback reads after a ל", () => {
    expect(`ל${ORDERER_FALLBACK_HE}`).toBe("למי שהזמין");
  });

  it("the other steps are unchanged", () => {
    expect(proJobActionFor({ status: "PRO_ASSIGNED" })?.label).toBe("יציאה לדרך");
    expect(proJobActionFor({ status: "PRO_EN_ROUTE" })?.label).toBe("הגעתי");
    expect(proJobActionFor({ status: "PRO_ARRIVED" })?.label).toBe("התחלת בדיקה");
    expect(proJobActionFor({ status: "IN_PROGRESS" })?.label).toBe("סיימתי");
    expect(proJobActionFor({ status: "IN_PROGRESS", kind: "DISTANCE" })?.label).toBe("המשלוח נמסר");
    expect(proJobActionFor({ status: "WAITING_QUOTE_APPROVAL" })).toBeNull();
    expect(proJobActionFor({ status: "COMPLETION_PENDING" })).toBeNull();
  });
});
