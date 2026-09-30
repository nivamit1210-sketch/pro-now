import type { ProApplicationView } from "@pro-now/types";

/**
 * What the review after sending checks (Amit, 2026-09-29; the demo's
 * APPROVAL_STEPS_HE, in the plural the product speaks before it knows how
 * to address someone).
 */
export const APPROVAL_STEPS_HE = [
  "המסמכים שהעליתם",
  "רישיונות מול המאגרים הממשלתיים",
  "ביקורות ודירוגים ברשת",
  "אישור PRO NOW — ורק אז מקבלים עבודות",
] as const;

export type ApprovalState = "received" | "queued" | "waiting" | "done" | "attention" | "none";

export const APPROVAL_STATE_HE: Record<ApprovalState, string> = {
  received: "התקבלו",
  queued: "בתור לבדיקה",
  waiting: "ממתין",
  done: "נבדק ✓",
  attention: "צריך תיקון",
  none: "לא נדרש",
};

/**
 * Each step's state, read from the server's application and nothing else
 * (the demo's design review: checks that "finish" by themselves are fake
 * verification). Nothing here moves without an admin's decision.
 */
export function approvalProgress(view: ProApplicationView): Array<{ labelHe: string; state: ApprovalState }> {
  const accountApproved = view.profile.verificationStatus === "APPROVED";
  const docs = view.documents.map((d) => d.status);
  const creds = view.services.flatMap((s) => s.requirements.map((r) => r.credential?.status ?? null)).filter((x): x is string => x !== null);

  const documents: ApprovalState = docs.includes("REJECTED")
    ? "attention"
    : docs.length > 0 && docs.every((s) => s === "VERIFIED")
      ? "done"
      : "received";
  const licences: ApprovalState =
    creds.length === 0
      ? "none"
      : creds.includes("REJECTED")
        ? "attention"
        : creds.every((s) => s === "VERIFIED")
          ? "done"
          : "queued";
  // The review of the whole account (its reviews and ratings online) is the admin's account decision.
  const reputation: ApprovalState = accountApproved ? "done" : documents === "done" && licences !== "queued" ? "queued" : "waiting";
  const working: ApprovalState = accountApproved
    ? view.services.some((s) => s.status === "APPROVED")
      ? "done"
      : "queued"
    : "waiting";

  const states = [documents, licences, reputation, working];
  return APPROVAL_STEPS_HE.map((labelHe, i) => ({ labelHe, state: states[i]! }));
}
