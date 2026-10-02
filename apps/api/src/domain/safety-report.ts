import { SAFETY_REASON_HE, scrubText, type SafetyReportReason } from "@pro-now/types";
import { escapeHtml } from "../observability/monitor.js";

/**
 * "משהו לא נראה לי תקין" — A SAFETY REPORT FROM THE DOOR (audit v2 #8b).
 *
 * The customer who ordered tells us something is wrong with the visit.
 * It is kept as a support ticket of kind SAFETY (the admin's "דיווחים"),
 * written on the job's timeline, and announced to ops in the Telegram
 * channel the error alerts use, so a person sees it now rather than at the
 * next look at the admin.
 *
 * What the alert carries is what ops needs to act and no more: the
 * reason, the customer's words (scrubbed of emails and phone numbers),
 * the job, the professional's shown name and ids. Never the address, the
 * customer's name, email or phone: those are one tap away in the admin,
 * behind ADMIN, not in a chat app's history.
 */

/** A safety report needs somebody at the door: before assignment there is nobody to report. */
export const REPORTS_PER_JOB_MAX = 5;
/** The same reason and words again within this window is a double tap or a retry, not a new report. */
export const SAME_REPORT_WINDOW_MS = 10 * 60 * 1000;
const NOTE_IN_ALERT = 300;

export function safetySubjectHe(reason: SafetyReportReason): string {
  return `דיווח בטיחות: ${SAFETY_REASON_HE[reason]}`;
}

export interface SafetyAlertInput {
  environment: string;
  publicUrl: string;
  ticketId: string;
  reason: SafetyReportReason;
  note: string | null;
  jobId: string;
  jobStatus: string;
  serviceNameHe: string;
  reporterUserId: string;
  professional: { id: string; displayName: string } | null;
}

export function safetyAlertHtml(a: SafetyAlertInput): string {
  const lines: string[] = [];
  lines.push(`🛡️ <b>PRO NOW · ${escapeHtml(a.environment)}</b> · דיווח בטיחות`);
  lines.push(`<b>${escapeHtml(SAFETY_REASON_HE[a.reason])}</b>`);
  if (a.note) {
    const note = scrubText(a.note);
    lines.push(`״${escapeHtml(note.length > NOTE_IN_ALERT ? `${note.slice(0, NOTE_IN_ALERT - 1)}…` : note)}״`);
  }
  lines.push(`${escapeHtml(a.serviceNameHe)} · ${escapeHtml(a.jobStatus)} · job <code>${escapeHtml(a.jobId)}</code>`);
  lines.push(
    a.professional
      ? `מקצוען: ${escapeHtml(a.professional.displayName)} <code>${escapeHtml(a.professional.id)}</code>`
      : "מקצוען: —"
  );
  lines.push(`ticket <code>${escapeHtml(a.ticketId)}</code> · user <code>${escapeHtml(a.reporterUserId)}</code>`);
  lines.push(`🔗 <a href="${escapeHtml(`${a.publicUrl.replace(/\/$/, "")}/admin`)}">ניהול · דיווחים</a>`);
  return lines.join("\n");
}
