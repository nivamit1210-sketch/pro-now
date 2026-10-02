/**
 * HOW SOMEBODY REACHES A HUMAN.
 *
 * ---------------------------------------------------------------------
 * THIS WAS AN OPEN DECISION AND IT IS DECIDED
 * ---------------------------------------------------------------------
 * `/CLAUDE.md` §4 lists "support hours/SLA" among the things this
 * codebase must not invent, and it was invented by nobody: the menu had
 * no "צור קשר" row at all, because a row pointing at a channel that did
 * not exist is worse than no row.
 *
 * Amit chose it: *"ערוץ תמיכה תעשה וואטסאפ 0547222218 אימייל
 * nivamit1210@gmail.com כרגע."* The word that matters is כרגע — this is
 * his own phone and his own inbox while the product has one person
 * behind it, and it is recorded here rather than typed into a screen so
 * the day it becomes a support desk it changes in one place.
 *
 * ---------------------------------------------------------------------
 * WHAT IS STILL NOT DECIDED, AND IS NOT INVENTED HERE
 * ---------------------------------------------------------------------
 * HOURS and a RESPONSE TIME. A channel is a fact; "we answer within an
 * hour" is a promise, and promising one on a founder's personal phone
 * is how a marketplace loses trust the first night nobody answers. So
 * no screen says when — see `supportHoursHe`, which says the true thing
 * instead.
 */

/** The number in international form, for a wa.me link. No spaces. */
export const SUPPORT_WHATSAPP_E164 = "972547222218";
/** The same number as an Israeli reader expects to see it. */
export const SUPPORT_WHATSAPP_HE = "054-722-2218";
export const SUPPORT_EMAIL = "nivamit1210@gmail.com";

/** A link that opens WhatsApp on whatever the person already has. */
export function whatsappUrl(messageHe?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP_E164}`;
  return messageHe ? `${base}?text=${encodeURIComponent(messageHe)}` : base;
}

export function supportEmailUrl(subjectHe?: string): string {
  const base = `mailto:${SUPPORT_EMAIL}`;
  return subjectHe ? `${base}?subject=${encodeURIComponent(subjectHe)}` : base;
}

/**
 * What the product may say about WHEN somebody answers.
 *
 * Not a number. There is no support desk, no rota and no measured
 * response time, and inventing one is exactly the class of thing
 * /CLAUDE.md §4 exists to prevent. This says what is true: a person
 * reads it, and that person is not always awake.
 */
export function supportHoursHe(): string {
  return "אדם קורא את ההודעות. אם זה דחוף — ואטסאפ מגיע מהר יותר ממייל.";
}

/*
 * ---------------------------------------------------------------------
 * "משהו לא נראה לי תקין" — A SAFETY REPORT FROM THE DOOR (audit v2 #8b)
 * ---------------------------------------------------------------------
 * The arrival screen's link. The customer picks what is wrong, may add a
 * line, and it lands with a person: a support ticket of kind SAFETY, an
 * alert to ops (the Telegram channel the error alerts use) and a row in
 * the admin's "דיווחים". What the customer is told is only what is true:
 * it was received and somebody will come back to them — no response time
 * (see `supportHoursHe`), and the police number for an emergency.
 */
export const SAFETY_REPORT_REASONS = ["NOT_THE_PERSON", "WRONG_CODE", "FEELS_UNSAFE", "OTHER"] as const;
export type SafetyReportReason = (typeof SAFETY_REPORT_REASONS)[number];

/** In words that need no gender (the reporter's or the professional's). */
export const SAFETY_REASON_HE: Record<SafetyReportReason, string> = {
  NOT_THE_PERSON: "זה לא האדם שבתמונה",
  WRONG_CODE: "הקוד לא תואם",
  FEELS_UNSAFE: "לא מרגיש לי בטוח",
  OTHER: "משהו אחר",
};

export const SAFETY_NOTE_MAX = 500;
export const SAFETY_RECEIVED_HE = "קיבלנו, נחזור אליך";
/** Israel's police. Said on the sheet before and after sending. */
export const EMERGENCY_POLICE_NUMBER = "100";
