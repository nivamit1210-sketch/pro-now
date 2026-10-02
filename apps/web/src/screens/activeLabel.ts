/*
 * THE HOME CAPSULE'S WORDS.
 *
 * One line about the live call ("תיקון נזילה · הגיעה"). Where the words are
 * about the professional, they follow how they asked to be addressed while
 * joining (addressAs, sent with the job list).
 */
/** What the capsule says for each stage, in the demo's words. */
export const ACTIVE_LABEL_HE: Partial<Record<string, string>> = {
  DRAFT: "מחפשים מקצוען",
  SEARCHING: "מחפשים מקצוען",
  OFFERING: "מחפשים מקצוען",
  PRO_ASSIGNED: "נמצא מקצוען",
  PRO_EN_ROUTE: "בדרך אליך",
  PRO_ARRIVED: "הגיע",
  DIAGNOSIS: "בודק את הבעיה",
  WAITING_QUOTE_APPROVAL: "הצעת מחיר",
  IN_PROGRESS: "בעבודה",
  COMPLETION_PENDING: "סיים — מחכה לאישורך",
  REVIEW_PENDING: "איך היה?",
};
/** The same words about a professional who asked to be addressed in the feminine. */
const ACTIVE_LABEL_FEMALE_HE: Partial<Record<string, string>> = {
  PRO_ARRIVED: "הגיעה",
  DIAGNOSIS: "בודקת את הבעיה",
  COMPLETION_PENDING: "סיימה — מחכה לאישורך",
};
export function activeLabelHe(status: string, professionalFemale: boolean): string {
  return (professionalFemale ? ACTIVE_LABEL_FEMALE_HE[status] : undefined) ?? ACTIVE_LABEL_HE[status] ?? "בטיפול";
}
