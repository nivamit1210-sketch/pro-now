import { DEFAULT_VISIT_TERMS, type JobState, type PricingKind } from "@pro-now/types";

/**
 * Who the quote goes to on a job ordered for someone else, when the orderer
 * never gave a name (an email sign-in that skipped the profile). Reads after
 * the "ל" of every sentence that names them: "למי שהזמין".
 */
export const ORDERER_FALLBACK_HE = "מי שהזמין";

/**
 * THE ONE BUTTON AT THE BOTTOM, decided in one place (and tested,
 * packages/ui/test/pro-job-action.test.ts). At DIAGNOSIS a visit-only job finishes the
 * diagnosis — the visit was the job — and any other job sends a quote; an
 * agreed price starts the work instead.
 */
export type ProJobAction = { label: string; kind: "advance" | "quote" | "agreed" | "finishDiagnosis" };
export function proJobActionFor(args: {
  status: JobState;
  kind?: PricingKind;
  workHe?: string;
  agreedPriceHe?: string | null;
  canStartAgreed?: boolean;
  diagnosisOnly?: boolean;
  canFinishDiagnosis?: boolean;
}): ProJobAction | null {
  const { status, kind = "VISIT", workHe = DEFAULT_VISIT_TERMS.workHe, agreedPriceHe = null } = args;
  const baseAction = nextAction(status);
  if (status === "DIAGNOSIS" && agreedPriceHe && args.canStartAgreed) {
    return { label: kind === "DISTANCE" ? `אספתי — יוצאים למסירה · ${agreedPriceHe}` : `מתחילים לעבוד · ${agreedPriceHe}`, kind: "agreed" };
  }
  if (status === "DIAGNOSIS" && args.diagnosisOnly && args.canFinishDiagnosis) {
    return { label: workHe === "התיקון" ? "סיימתי את האבחון" : "סיימתי את הבדיקה", kind: "finishDiagnosis" };
  }
  if (baseAction && status === "IN_PROGRESS" && kind === "DISTANCE") return { ...baseAction, label: "המשלוח נמסר" };
  return baseAction;
}

function nextAction(status: JobState): { label: string; kind: "advance" | "quote" } | null {
  switch (status) {
    case "PRO_ASSIGNED":
      return { label: "יציאה לדרך", kind: "advance" };
    case "PRO_EN_ROUTE":
      return { label: "הגעתי", kind: "advance" };
    case "PRO_ARRIVED":
      return { label: "התחלת בדיקה", kind: "advance" };
    case "DIAGNOSIS":
      return { label: "שליחת הצעת מחיר", kind: "quote" };
    case "WAITING_QUOTE_APPROVAL":
      return null; // The customer's move, not ours. No button to press.
    case "IN_PROGRESS":
      return { label: "סיימתי", kind: "advance" };
    default:
      return null;
  }
}
