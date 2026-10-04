/**
 * CREDENTIAL EXPIRY RULES (docs/10 §Life after approval). Pure: which notice
 * is due on a given Israel calendar day, and when a renewal covers a
 * credential. The daily run (expiry-run.ts) stores and sends.
 */
export type NoticeKind = "WARN_30" | "WARN_7" | "EXPIRED";

const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day in Israel, YYYY-MM-DD. */
export function israelDay(d: Date): string {
  return DAY_FMT.format(d);
}

const dayNumber = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / 86_400_000;

/** Whole Israel calendar days from today to the expiry day: 0 today, negative after. */
export function daysUntil(expiresAt: Date, now: Date): number {
  return dayNumber(israelDay(expiresAt)) - dayNumber(israelDay(now));
}

const URGENCY: NoticeKind[] = ["EXPIRED", "WARN_7", "WARN_30"];

/** The most relevant notice due and not yet sent; null when nothing is due or a more urgent one already went out. */
export function dueNotice(daysLeft: number, sent: ReadonlySet<NoticeKind>): NoticeKind | null {
  const due: NoticeKind | null = daysLeft <= 0 ? "EXPIRED" : daysLeft <= 7 ? "WARN_7" : daysLeft <= 30 ? "WARN_30" : null;
  if (!due) return null;
  // Already sent this one, or something at least as urgent.
  if (URGENCY.slice(0, URGENCY.indexOf(due) + 1).some((k) => sent.has(k))) return null;
  return due;
}

/** Another verified credential of the same type, current past the target's day. */
export function isCoveredByRenewal(
  target: { expiresAt: Date },
  others: ReadonlyArray<{ status: string; expiresAt: Date | null; noExpiry: boolean }>
): boolean {
  const day = israelDay(target.expiresAt);
  return others.some((o) => o.status === "VERIFIED" && (o.noExpiry || (o.expiresAt !== null && israelDay(o.expiresAt) > day)));
}

export const CREDENTIAL_TYPE_HE: Record<string, string> = { LICENSE: "רישיון", INSURANCE: "ביטוח", CERTIFICATE: "תעודה" };

/** The real days left, never a rounded promise: 1 is "tomorrow"; 0 is the EXPIRED notice. */
const WARN_HE = (c: string, s: string, daysLeft: number) =>
  `תוקף ${c} ל${s} יפוג ${daysLeft === 1 ? "מחר" : `בעוד ${daysLeft} ימים`} — אפשר להעלות את החידוש כבר עכשיו`;

export const NOTICE_TEXT_HE: Record<NoticeKind, (credentialHe: string, serviceHe: string, daysLeft: number) => string> = {
  WARN_30: WARN_HE,
  WARN_7: WARN_HE,
  EXPIRED: (c, s) => `תוקף ${c} ל${s} פג — השירות לא מקבל קריאות עד שהחידוש יאושר`,
};
