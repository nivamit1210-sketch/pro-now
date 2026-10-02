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

/** The row before Amit's list: who they are and that they are 18 (docs/10 §Identity check). */
export const IDENTITY_STEP_HE = "הזהות ותאריך הלידה";

export type ApprovalState = "received" | "queued" | "waiting" | "done" | "attention" | "refused" | "none";

export const APPROVAL_STATE_HE: Record<ApprovalState, string> = {
  received: "התקבלו",
  queued: "בתור לבדיקה",
  waiting: "ממתין",
  done: "נבדק ✓",
  attention: "צריך תיקון",
  refused: "לא אושר",
  none: "לא נדרש",
};

/**
 * Each step's state, read from the server's application and nothing else
 * (the demo's design review: checks that "finish" by themselves are fake
 * verification). Nothing here moves without an admin's decision.
 */
export type ApprovalRow = {
  labelHe: string;
  state: ApprovalState;
  /** The reviewer's own words, when they gave some. */
  noteHe?: string;
  /** Where to fix it, when it is the applicant's to fix. */
  action?: { labelHe: string; to: string };
};

/**
 * The identity check and the date of birth, from the server's view. A retake
 * asked for, or an applicant from before the check (no check, no date of
 * birth), is something to do, with the way to do it; a refusal is final
 * (docs/10). An account approved before the check existed is not asked for
 * one: nobody reviews it until re-verification exists.
 */
function identityRow(view: ProApplicationView, accountApproved: boolean): ApprovalRow {
  const labelHe = IDENTITY_STEP_HE;
  const id = view.identity;
  const noteHe = id?.reasonHe ?? undefined;
  if (id?.status === "REJECTED") return { labelHe, state: "refused", ...(noteHe ? { noteHe } : {}) };
  // The details step (step 0, where /pro/join opens by default) holds the date of birth.
  if (view.missing.includes("DATE_OF_BIRTH")) return { labelHe, state: "attention", action: { labelHe: "להוסיף תאריך לידה ›", to: "/pro/join?at=details" } };
  if (id?.status === "RETAKE_REQUESTED") {
    return { labelHe, state: "attention", ...(noteHe ? { noteHe } : {}), action: { labelHe: "לצלם שוב ›", to: "/pro/join?at=documents" } };
  }
  if (id?.status === "VERIFIED") return { labelHe, state: "done" };
  if (id?.status === "MANUAL_REVIEW" || id?.status === "PENDING") return { labelHe, state: "queued" };
  if (accountApproved && !id) return { labelHe, state: "none" };
  return { labelHe, state: "attention", action: { labelHe: "לבדיקת הזהות ›", to: "/pro/join?at=documents" } };
}

export function approvalProgress(view: ProApplicationView): ApprovalRow[] {
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
  return [identityRow(view, accountApproved), ...APPROVAL_STEPS_HE.map((labelHe, i) => ({ labelHe, state: states[i]! }))];
}

/**
 * A date of birth as typed in Israel (DD/MM/YYYY, also D/M/YYYY, with / . or -)
 * into the server's YYYY-MM-DD. Null for anything that is not a real day.
 * Whether it is old enough is the server's answer (UNDER_MINIMUM_AGE), not this.
 */
export function parseDateOfBirthHe(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The server's YYYY-MM-DD shown back as DD/MM/YYYY. */
export function formatDateOfBirthHe(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
