import { ApiError } from "@pro-now/api-client";
import { EMERGENCY_POLICE_NUMBER } from "@pro-now/types";

/**
 * The words of the safety sheet (audit v2 #8b), kept apart so they are
 * tested. The demo's sheet offers two things: share the job's status, and
 * report a problem with the visit. Sharing exists in the product only as
 * the link for the person at home (an order for someone else), so the
 * share row and its sentence appear only then; the report always does.
 */
export const EMERGENCY_LINE_HE = `בסכנה מיידית: משטרה ${EMERGENCY_POLICE_NUMBER}`;

export function safetyIntroHe(onSiteNameHe: string | null): string {
  return onSiteNameHe
    ? `אפשר לשתף את מצב הקריאה עם ${onSiteNameHe} — מי הגיע, מתי, ומתי העבודה נסגרה. בלי הכתובת המלאה שלך.`
    : "משהו לא תקין בביקור? הדיווח מגיע לאדם מהצוות שלנו, לא למקצוען.";
}

export const SAFETY_SENT_BODY_HE = `הדיווח אצל הצוות שלנו. ${EMERGENCY_LINE_HE}.`;

/** Why a report did not go, in words; the server's own sentence when it has one in Hebrew. */
export function safetyErrorHe(e: unknown): string {
  if (e instanceof ApiError && e.code === "SAFETY_REPORT_LIMIT") return e.message;
  return `הדיווח לא נשלח. נסו שוב. ${EMERGENCY_LINE_HE}.`;
}
