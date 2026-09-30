import type {
  CatalogDepartmentDef,
  CatalogServiceDef,
} from "./catalog";

/**
 * The pilot catalogue: the actual services PRO NOW opens with, as data.
 *
 * WHY THIS IS A FILE AND NOT A LIST INSIDE A SCREEN. Every screen that
 * hard-codes a service becomes a place the catalogue can disagree with
 * itself. The home grid would say a service is live, the matcher would route
 * a sentence to a service the home grid dropped, and the professional's
 * eligibility list would name a trade the customer cannot request. One
 * source, read by all three, is the only version of this that stays true
 * after the third edit.
 *
 * HOW THE PILOT WAS SIZED. Not by listing what a home needs — that list is
 * enormous and would produce a marketplace where nine taps in ten find
 * nobody. It was sized by asking which problems (a) hurt enough that a
 * person wants someone NOW rather than a quote by Thursday, and (b) have
 * enough working professionals in one city that "now" can actually be
 * answered. Fourteen services clear both bars. Everything else in this file
 * is modelled so the taxonomy is ready, and switched off so the pilot is not
 * diluted.
 *
 * THE THREE SWITCHES, AND WHY THEY ARE SEPARATE:
 *
 *   activationStatus   — do we offer it at all?
 *   fulfillmentProfile — is NOW a sane promise for this kind of work?
 *   trustProfile       — what must be verified before a stranger is sent?
 *
 * Collapsing any two of these loses something real. Painting is ACTIVE-able
 * and entirely legitimate, but it is SCHEDULED_ONLY: nobody stands beside a
 * wall hoping a painter arrives in nine minutes. Gas work is URGENT_NOW by
 * nature and is nonetheless INACTIVE here, because the licence question is a
 * legal decision this codebase must not invent (/CLAUDE.md §4). A locksmith
 * lockout is ordinary work with an extraordinary trust profile: the one job
 * in the catalogue whose whole purpose is opening a door for someone who
 * cannot prove, at that moment, that the door is theirs.
 *
 * WHAT IS DELIBERATELY ABSENT. No prices. Ranges belong to the pricing
 * engine and to the professional's quote, and a number written here would be
 * read as a promise the server never made. `pricingModel` says HOW a service
 * is priced; it never says how much.
 */

const IDENTITY = "IDENTITY" as const;

function plumbing(s: Omit<CatalogServiceDef, "mark">): CatalogServiceDef {
  return { ...s, mark: "plumbing" };
}

// ---------------------------------------------------------------------
// אינסטלציה — the archetype of NOW. Water is already doing damage.
// ---------------------------------------------------------------------

const blockage: CatalogServiceDef = plumbing({
  id: "svc-blockage",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הכיור או האסלה הסתומים",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "PLUMB_BLOCKAGE",
  nameHe: "פתיחת סתימה",
  descriptionHe: "כיור, אסלה, מקלחת או ביוב שחוזר.",
  keywordsHe: ["סתימה", "סתום", "לא יורד", "ביוב", "מים עולים", "אסלה", "כיור", "מקלחת", "ניקוז", "סתימות", "נסתם", "נסתמה", "סתומה", "לא מתנקז", "מתנקז לאט", "הצפה", "הציף", "שירותים", "שוחה", "קולטן", "אינסטלטור", "שרברב", "ריח רע מהכיור", "פתיחת סתימות"],
  symptomsHe: ["המים לא יורדים בכיור", "אסלה סתומה", "מים עולים במקלחת", "ריח ביוב"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "ידיים עם כלי ניקוז מעל סיפון פתוח",
  typicalMinutes: [40, 90],
});

const leak: CatalogServiceDef = plumbing({
  id: "svc-leak",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של המקום שבו מופיעים המים",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "PLUMB_LEAK",
  nameHe: "נזילה או דליפת מים",
  descriptionHe: "מים שמופיעים איפה שהם לא אמורים.",
  keywordsHe: ["נזילה", "נוזל", "דולף", "מטפטף", "מים", "רטוב", "צינור", "סיפון", "כתם", "נזילות", "דליפה", "דולפת", "טפטוף", "מטפטפת", "פיצוץ צינור", "צינור התפוצץ", "מים על הרצפה", "שעון מים", "חשבון מים גבוה", "ברז ראשי", "אינסטלטור", "שרברב", "נוזלים מים"],
  symptomsHe: ["מים מתחת לכיור", "כתם רטוב בקיר", "טפטוף מהתקרה", "מים ליד הדוד"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "ארון מתחת לכיור פתוח, פנס על צינור",
  typicalMinutes: [45, 120],
});

const tap: CatalogServiceDef = plumbing({
  id: "svc-tap",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של הברז או המיכל הקיים",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "PLUMB_FIXTURE",
  nameHe: "החלפת ברז או מיכל הדחה",
  descriptionHe: "ברז, ניאגרה, מקלחון או צנרת גלויה.",
  keywordsHe: ["ברז", "ניאגרה", "מיכל הדחה", "להחליף ברז", "מקלחון", "ראש מקלחת", "ברזים", "מערבל", "ברז מטבח", "ברז אמבטיה", "הדחה", "מיכל", "לחץ מים", "ברז שבור", "ברז נוזל", "אינסטלטור", "שרברב"],
  symptomsHe: ["ברז מטפטף", "הניאגרה לא נעצרת", "צריך להחליף ברז", "לחץ מים חלש"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "ברז חדש באריזה לצד מפתח שוודי",
  typicalMinutes: [30, 75],
});

// ---------------------------------------------------------------------
// חשמל — licensed work. The catalogue says so structurally; which licence
// is mandatory is counsel's answer, not ours (/CLAUDE.md §4).
// ---------------------------------------------------------------------

const powerOut: CatalogServiceDef = {
  id: "svc-electric",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של לוח החשמל",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "ELEC_OUTAGE",
  nameHe: "הפסקת חשמל בדירה",
  descriptionHe: "פחת שקופץ, חושך בחלק מהבית, ריח שרוף.",
  mark: "electrical",
  keywordsHe: ["חשמל", "הפסקת חשמל", "פחת", "קצר", "לוח חשמל", "מפסק", "חושך", "ריח שרוף", "ניצוץ", "חשמלאי", "אין חשמל", "נפל החשמל", "החשמל נפל", "קפץ", "הפחת קפץ", "קצר חשמלי", "נשרף", "חוט חשמל", "מפסק פחת", "לוח", "פיוזים", "פקקים", "נקודה שרופה", "קופץ", "קופצת"],
  symptomsHe: ["הפחת קופץ שוב ושוב", "אין חשמל בחלק מהבית", "ריח שרוף מהלוח", "ניצוצות משקע"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE", "ELECTRICIAN_LICENSE"],
  photoSubjectHe: "לוח חשמל פתוח עם בודק מתח ביד",
  typicalMinutes: [40, 120],
};

const socket: CatalogServiceDef = {
  id: "svc-socket",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של השקע או נקודת האור",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "ELEC_POINT",
  nameHe: "שקע, נקודת אור או גוף תאורה",
  descriptionHe: "התקנה או תיקון של נקודה בודדת.",
  mark: "electrical",
  keywordsHe: ["שקע", "נורה", "אור", "גוף תאורה", "מנורה", "נקודת חשמל", "להתקין שקע", "לוסטרה", "שקעים", "מתג", "מתגים", "נורות", "תאורה", "ספוט", "ספוטים", "מנורות", "נברשת", "לד", "חשמלאי", "מפסק אור"],
  symptomsHe: ["שקע לא עובד", "להתקין גוף תאורה", "מתג לא מדליק", "צריך שקע נוסף"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE", "ELECTRICIAN_LICENSE"],
  photoSubjectHe: "ידיים מחברות שקע בקיר, מברג מבודד",
  typicalMinutes: [25, 60],
};

// ---------------------------------------------------------------------
// מנעולנות — ordinary work, extraordinary trust.
// ---------------------------------------------------------------------

const lockout: CatalogServiceDef = {
  id: "svc-lock",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הדלת והמנעול",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "LOCK_LOCKOUT",
  nameHe: "ננעלתי בחוץ",
  descriptionHe: "פתיחת דלת כשאין מפתח.",
  mark: "locksmith",
  keywordsHe: ["ננעלתי", "נעול", "מפתח", "נשאר בפנים", "לא נכנס", "דלת נעולה", "פריצת דלת", "מנעולן", "ננעלה", "ננעלנו", "נטרקה", "נטרקה הדלת", "נשארתי בחוץ", "בחוץ", "שכחתי מפתח", "המפתח בפנים", "לא יכול להיכנס", "לא יכולה להיכנס", "פורץ מנעולים", "פריצת מנעול"],
  symptomsHe: ["המפתח נשאר בפנים", "המפתח נשבר במנעול", "הדלת ננעלה מאחוריי", "נשארתי מחוץ לבית"],
  /*
   * FIXED, not visit-and-quote (Amit, 2026-09-27, checked against how
   * locksmiths in Israel publish prices): opening a door is priced per lock
   * type in advance — a slammed door, a cylinder, a multi-bolt — and the
   * customer can say which from a photo. A new cylinder is an extra the
   * customer approves on the spot.
   */
  pricingModel: "FIXED",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "ENHANCED",
  requiredCredentials: [
    "IDENTITY_ENHANCED",
    "BUSINESS",
    "LIABILITY_INSURANCE",
    "PROPERTY_LINK_POLICY",
  ],
  photoSubjectHe: "ידיים עם כלי פתיחה ליד צילינדר, דלת סגורה",
  typicalMinutes: [15, 45],
};

const cylinder: CatalogServiceDef = {
  id: "svc-cylinder",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של הצילינדר או המנעול",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "LOCK_CYLINDER",
  nameHe: "החלפת צילינדר או מנעול",
  descriptionHe: "החלפה אחרי אובדן מפתח, מעבר דירה או פריצה.",
  mark: "locksmith",
  keywordsHe: ["צילינדר", "להחליף מנעול", "מנעול", "איבדתי מפתח", "מעבר דירה", "אחרי פריצה", "מנעולן", "מנעולים", "צילינדרים", "תקוע", "לא מסתובב", "החלפת מנעול", "פרצו", "פריצה", "מפתח חדש", "שכפול"],
  symptomsHe: ["איבדתי מפתח", "נכנסתי לדירה חדשה", "המנעול תקוע", "אחרי פריצה"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "ENHANCED",
  requiredCredentials: ["IDENTITY_ENHANCED", "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "צילינדר חדש ביד מול דלת פתוחה",
  typicalMinutes: [20, 50],
};

// ---------------------------------------------------------------------
// מיזוג ומכשירי חשמל — "today", almost never "this minute".
// ---------------------------------------------------------------------

const acFix: CatalogServiceDef = {
  id: "svc-ac",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של המזגן והיחידה החיצונית",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "HVAC_REPAIR",
  nameHe: "מזגן לא מקרר או מטפטף",
  descriptionHe: "תיקון, ניקוי או בדיקת גז למזגן קיים.",
  mark: "climate",
  keywordsHe: ["מזגן", "מיזוג", "לא מקרר", "לא מחמם", "מטפטף מהמזגן", "מזגן רועש", "ניקוי מזגן", "מזגנים", "טכנאי מזגנים", "מזגנאי", "חם בבית", "חם נורא", "קר בבית", "שלט מזגן", "גז למזגן", "מרכזי", "מיני מרכזי", "מזגן לא עובד", "מזגן מטפטף"],
  symptomsHe: ["המזגן לא מקרר", "מטפטף מים מהמזגן", "רעש חזק מהמזגן", "ריח מהמזגן"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "מזגן עילי פתוח עם מסנן ביד",
  typicalMinutes: [45, 100],
};

const fridge: CatalogServiceDef = {
  id: "svc-fridge",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של המקרר ושל מדבקת הדגם",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "APPL_FRIDGE",
  nameHe: "מקרר או מקפיא",
  descriptionHe: "מקרר שלא מקרר, מקפיא שמפשיר, מים מתחת.",
  mark: "appliance",
  keywordsHe: ["מקרר", "מקפיא", "לא מקרר", "הפשיר", "פריזר", "מים במקרר", "מקררים", "קרח", "לא קר", "האוכל מתקלקל", "טכנאי מקררים", "מקפיא לא עובד", "מקרר רועש", "מקרר מטפטף"],
  symptomsHe: ["המקרר לא מקרר", "המקפיא הפשיר", "מים בתחתית המקרר", "המקרר לא נדלק"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "גב מקרר מוסט מהקיר, מד חום ביד",
  typicalMinutes: [40, 90],
};

const washer: CatalogServiceDef = {
  id: "svc-washer",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של המכונה ושל מדבקת הדגם",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "APPL_WASHER",
  nameHe: "מכונת כביסה או מייבש",
  descriptionHe: "לא מנקזת, לא מסתובבת, מציפה או לא נדלקת.",
  mark: "appliance",
  keywordsHe: ["מכונת כביסה", "כביסה", "מייבש", "לא מנקזת", "מציפה", "לא מסתובבת", "מדיח", "מכונה", "מדיח כלים", "מייבש כביסה", "לא סוחטת", "לא נפתחת", "מכונה רועשת", "מכונה נוזלת", "טכנאי מכונות כביסה"],
  symptomsHe: ["המכונה מציפה מים", "לא מנקזת", "לא מסתובבת", "רעש חזק בסחיטה"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "מכונת כביסה פתוחה עם מסנן שאוב ביד",
  typicalMinutes: [40, 90],
};

// ---------------------------------------------------------------------
// ניקיון והדברה
// ---------------------------------------------------------------------

const cleanNow: CatalogServiceDef = {
  id: "svc-clean",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של השטח, אם נוח לך",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "CLEAN_URGENT",
  nameHe: "ניקיון דחוף",
  descriptionHe: "אחרי אירוע, אחרי שיפוץ, או לפני שמגיעים אורחים.",
  mark: "cleaning",
  keywordsHe: ["ניקיון", "לנקות", "אחרי שיפוץ", "אחרי אירוע", "מנקה", "ניקוי דירה", "מנקה עד הבית", "עוזרת בית", "ניקיון בית", "לכלוך", "מלוכלך", "ספונג׳ה", "ניקיון חלונות", "שטיפה", "לסדר ולנקות"],
  symptomsHe: ["אחרי אירוע בבית", "אחרי שיפוץ", "לפני כניסה לדירה", "ניקוי כללי דחוף"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS"],
  photoSubjectHe: "סלון נקי עם ציוד ניקיון בפינה",
  typicalMinutes: [120, 300],
};

const pest: CatalogServiceDef = {
  id: "svc-pest",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של המקום שבו ראית אותם",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "PEST_CONTROL",
  nameHe: "הדברה",
  descriptionHe: "טיפול בג׳וקים, נמלים, יתושים או מכרסמים.",
  mark: "pest",
  keywordsHe: ["הדברה", "ג׳וקים", "גוקים", "נמלים", "מכרסמים", "עכברים", "פשפשים", "יתושים", "מדביר", "מדבירה", "תיקנים", "מקקים", "ג'וק", "ג׳וק", "עכבר", "חולדה", "חולדות", "טרמיטים", "צרעות", "דבורים", "קן", "ריסוס", "לרסס", "פרעושים בבית"],
  symptomsHe: ["ג׳וקים במטבח", "נמלים בכל הבית", "רעשים בקיר", "פשפשי מיטה"],
  pricingModel: "VISIT_QUOTE", quoteBeforeDispatch: true,
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE", "PEST_CONTROL_LICENSE"],
  photoSubjectHe: "מדביר עם ציוד מגן ומרסס, ללא חרקים בתמונה",
  typicalMinutes: [45, 90],
};

// ---------------------------------------------------------------------
// שינוע — the two services where the vehicle is the tool.
// ---------------------------------------------------------------------

const courier: CatalogServiceDef = {
  id: "svc-courier",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של מה שצריך להעביר",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "LOG_COURIER",
  nameHe: "שליחות עכשיו",
  descriptionHe: "איסוף ומסירה של חבילה, מסמך או מפתח.",
  mark: "moving",
  keywordsHe: ["שליחות", "שליח", "להביא", "לאסוף", "חבילה", "מסמכים", "מפתח", "לשלוח", "משלוח", "שליח עכשיו", "לשלוח חבילה", "להעביר חבילה", "איסוף", "מעטפה", "שכחתי", "להביא לי", "להעביר מסמכים"],
  symptomsHe: ["לאסוף חבילה", "להעביר מפתח", "מסמכים למשרד", "לשכוח משהו ולהביא"],
  pricingModel: "DISTANCE_TIME", needsDestination: true,
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "DRIVING_LICENSE", "VEHICLE_INSURANCE"],
  photoSubjectHe: "תיק שליחים ליד קטנוע, חבילה קטנה ביד",
  typicalMinutes: [20, 60],
};

const smallMove: CatalogServiceDef = {
  id: "svc-moving",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של הפריטים ושל הכניסה לבניין",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "LOG_SMALL_MOVE",
  nameHe: "הובלה קטנה",
  descriptionHe: "פריט בודד, כמה ארגזים, או דירת סטודיו.",
  mark: "moving",
  keywordsHe: ["הובלה", "להעביר", "ארגזים", "מעבר דירה", "משאית", "ספה", "מקרר להעביר", "פינוי", "מוביל", "הובלות", "להעביר דירה", "להעביר רהיטים", "מעבר", "משאית קטנה", "מכונת כביסה להעביר", "להעביר ספה", "להעביר מקרר"],
  symptomsHe: ["ספה או מיטה בודדת", "כמה ארגזים", "פינוי פריט ישן", "מעבר בתוך הבניין"],
  pricingModel: "VISIT_QUOTE", quoteBeforeDispatch: true, needsDestination: true,
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "DRIVING_LICENSE", "VEHICLE_INSURANCE"],
  photoSubjectHe: "שני אנשים מרימים ארגז ליד רכב מסחרי פתוח",
  typicalMinutes: [60, 180],
};

// ---------------------------------------------------------------------
// Modelled, not offered.
//
// These are not placeholders. They carry the same required fields as the
// live services, so switching one on is a data change and not a development
// task — and so the professional-side verification flow can already be
// tested against a licence we do not yet accept.
// ---------------------------------------------------------------------

function scheduled(
  s: Omit<
    CatalogServiceDef,
    "fulfillmentProfile" | "activationStatus" | "trustProfile" | "requiredCredentials"
  > &
    Partial<Pick<CatalogServiceDef, "trustProfile" | "requiredCredentials">>
): CatalogServiceDef {
  return {
    fulfillmentProfile: "SCHEDULED_ONLY",
    activationStatus: "PILOT",
    trustProfile: "STANDARD",
    requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
    ...s,
  };
}

const painting = scheduled({
  id: "svc-paint",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הקיר או החדר",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "FINISH_PAINT",
  nameHe: "צביעה",
  descriptionHe: "חדר, קיר או תיקוני צבע אחרי נזילה.",
  mark: "painting",
  keywordsHe: ["צביעה", "לצבוע", "צבע", "קיר", "טיח", "סיד", "צבעי", "צבעים", "לצבוע קיר", "קילוף", "מתקלף", "מתקלפת", "צבע מתקלף", "לצבוע דירה"],
  symptomsHe: ["לצבוע חדר", "כתם אחרי נזילה", "תיקוני צבע", "קילופים בתקרה"],
  pricingModel: "VISIT_QUOTE", quoteBeforeDispatch: true,
  photoSubjectHe: "רולר צבע על קיר לבן, יריעת הגנה על הרצפה",
});

const furniture = scheduled({
  id: "svc-furniture",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של הרהיט או של הקופסה",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "ASSEMBLE_FURNITURE",
  nameHe: "הרכבת רהיטים",
  descriptionHe: "ארון, מיטה, שולחן או ריהוט מהקופסה.",
  mark: "furniture",
  keywordsHe: ["הרכבה", "להרכיב", "ארון", "מיטה", "איקאה", "רהיט", "קומודה", "הרכבת", "רהיטים", "ארונות", "שולחן", "כיסא", "הרכבת ספריה", "כוננית", "מדפים", "לפרק", "פירוק", "הרכבת ארון", "הרכבת מיטה"],
  symptomsHe: ["ארון מהקופסה", "מיטה להרכבה", "שולחן ומדפים", "פירוק והרכבה במעבר"],
  pricingModel: "FIXED",
  photoSubjectHe: "חלקי ארון על הרצפה עם מברגה",
});

const tvMount = scheduled({
  id: "svc-tv",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של הקיר ושל המסך",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "INSTALL_TV",
  nameHe: "תליית טלוויזיה ומסכים",
  descriptionHe: "התקנה על הקיר והסתרת כבלים.",
  mark: "tv",
  keywordsHe: ["טלוויזיה", "מסך", "לתלות", "זרוע", "מתקן לטלוויזיה", "כבלים", "טלויזיה", "טלוויזיות", "טלביזיה", "מקרן", "לתלות טלוויזיה", "מסך על הקיר", "סאונד בר", "זרוע לטלוויזיה"],
  symptomsHe: ["לתלות טלוויזיה", "להזיז מסך קיים", "להסתיר כבלים", "התקנת מקרן"],
  pricingModel: "FIXED",
  photoSubjectHe: "מסך על קיר עם פלס ומתקן קיר",
});

const garden = scheduled({
  id: "svc-garden",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הגינה",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "GARDEN_CARE",
  nameHe: "גינון",
  descriptionHe: "גיזום, כיסוח, השקיה ותחזוקת גינה.",
  mark: "garden",
  keywordsHe: ["גינון", "גינה", "גיזום", "דשא", "עצים", "השקיה", "גנן", "עשבים", "עשב", "עץ", "גדר חיה", "שיחים", "לגזום", "מדשאה", "לכסח", "כיסוח", "דשא סינטטי"],
  symptomsHe: ["דשא גבוה", "עץ שצריך גיזום", "מערכת השקיה", "סידור גינה"],
  pricingModel: "VISIT_QUOTE", quoteBeforeDispatch: true,
  photoSubjectHe: "מספרי גיזום וענפים גזומים על דשא",
});

const glass = scheduled({
  id: "svc-glass",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של החלון או המסגרת",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "GLASS_WORK",
  nameHe: "זכוכית ואלומיניום",
  descriptionHe: "חלון שבור, מקלחון, רשת או תריס.",
  mark: "glass",
  keywordsHe: ["זכוכית", "חלון", "שבר", "מקלחון", "רשת", "תריס", "אלומיניום", "זגג", "חלונות", "זכוכית שבורה", "תריסים", "רשתות", "חלון תקוע", "ויטרינה", "מראה", "חלון שבור", "תריס תקוע"],
  symptomsHe: ["חלון שבור", "תריס תקוע", "רשת קרועה", "מקלחון זזה"],
  pricingModel: "VISIT_QUOTE",
  photoSubjectHe: "ידיים בכפפות מחזיקות לוח זכוכית ליד מסגרת אלומיניום",
});

const sealing = scheduled({
  id: "svc-sealing",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הרטיבות",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "SEALING_WORK",
  nameHe: "איטום",
  descriptionHe: "גג, מרפסת, חדר רחצה או קיר חיצוני.",
  mark: "sealing",
  keywordsHe: ["איטום", "רטיבות", "גג", "מרפסת", "עובש", "קיר רטוב", "גג דולף", "מים מהתקרה", "איטום גג", "זפת", "יריעות", "חלחול", "מחלחל", "רטוב בקיר", "טחב"],
  symptomsHe: ["רטיבות בקיר", "מים מהגג", "עובש בפינה", "מרפסת מחלחלת"],
  pricingModel: "VISIT_QUOTE",
  photoSubjectHe: "מריחת חומר איטום על מרפסת בטון",
});

const carpentry = scheduled({
  id: "svc-carpentry",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הרהיט או הדלת",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "CARPENTRY",
  nameHe: "נגרות",
  descriptionHe: "דלתות, מטבח, מדפים ותיקוני עץ.",
  mark: "carpentry",
  keywordsHe: ["נגר", "נגרות", "עץ", "דלת", "מטבח", "מדף", "צירים", "מגירה", "ארון מטבח", "דלת עץ", "ידית", "מגירות", "דלת ארון", "עבודות עץ", "נגר עד הבית"],
  symptomsHe: ["דלת ארון נפלה", "מגירה לא נסגרת", "מדף להתקנה", "תיקון דלת עץ"],
  pricingModel: "VISIT_QUOTE",
  photoSubjectHe: "ידיים מכווננות ציר של דלת ארון עץ",
});

const tiling = scheduled({
  id: "svc-tiling",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של האריחים",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "TILING",
  nameHe: "ריצוף וחיפוי",
  descriptionHe: "אריחים שבורים, רובה, וחיפוי מטבח.",
  mark: "tiling",
  keywordsHe: ["ריצוף", "אריח", "רובה", "קרמיקה", "חיפוי", "מרצף", "רצף", "אריחים", "מרצפת", "מרצפות", "פורצלן", "פסיפס", "אריח סדוק", "מרצפת שבורה"],
  symptomsHe: ["אריח שבור", "רובה מתפוררת", "אריח מתנפח", "חיפוי מאחורי המטבח"],
  pricingModel: "VISIT_QUOTE",
  photoSubjectHe: "אריח נקי ומרית רובה על רצפה",
});

const drywall = scheduled({
  id: "svc-drywall",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הקיר או התקרה",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "DRYWALL",
  nameHe: "גבס וטיח",
  descriptionHe: "מחיצות, תקרות, ותיקון חורים בקיר.",
  mark: "drywall",
  keywordsHe: ["גבס", "טיח", "מחיצה", "תקרה", "חור בקיר", "שפכטל", "גבסן", "קיר גבס", "סדק", "סדקים", "חור", "נישה", "תקרה אקוסטית", "סדק בקיר", "טייח", "טייחים", "גבסן", "טיח"],
  symptomsHe: ["חור בקיר", "תקרת גבס", "מחיצה חדשה", "סדק בטיח"],
  pricingModel: "VISIT_QUOTE",
  photoSubjectHe: "שפכטל על לוח גבס עם סרגל",
});

const curtains = scheduled({
  id: "svc-curtains",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של החלון",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "INSTALL_CURTAINS",
  nameHe: "וילונות ומסילות",
  descriptionHe: "התקנה, החלפה וכיוון של מסילות.",
  mark: "curtains",
  keywordsHe: ["וילון", "וילונות", "מסילה", "לתלות וילון", "רולר", "מסילות", "רולרים", "פרגוד", "וילון נפל", "להתקין וילונות"],
  symptomsHe: ["להתקין וילון", "מסילה נפלה", "וילון רולר חדש", "לקצר וילון"],
  pricingModel: "FIXED",
  photoSubjectHe: "מסילת וילון על קיר עם מברגה ופלס",
});

const alarm = scheduled({
  id: "svc-alarm",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של המערכת הקיימת",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "SECURITY_ALARM",
  nameHe: "אזעקה ומצלמות",
  descriptionHe: "התקנה ותיקון של מערכות אבטחה ביתיות.",
  mark: "alarm",
  keywordsHe: ["אזעקה", "מצלמה", "מצלמות", "אבטחה", "אינטרקום", "חיישן", "מצלמות אבטחה", "קודן", "פעמון", "מערכת אזעקה", "מצפצף", "האזעקה לא מפסיקה"],
  symptomsHe: ["אזעקה מצפצפת", "להתקין מצלמות", "אינטרקום לא עובד", "חיישן תקול"],
  pricingModel: "VISIT_QUOTE",
  trustProfile: "ENHANCED",
  requiredCredentials: ["IDENTITY_ENHANCED", "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "מצלמת אבטחה קטנה על קיר חוץ",
});

const solar = scheduled({
  id: "svc-solar",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הדוד והקולטים",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "SOLAR_WATER",
  nameHe: "דוד שמש וקולטים",
  descriptionHe: "תיקון, החלפה וניקוי של מערכת חימום מים.",
  mark: "solar",
  keywordsHe: ["דוד", "דוד שמש", "קולט", "מים חמים", "אין מים חמים", "גופי חימום", "בוילר", "מים קרים", "קולטים", "טרמוסטט", "גוף חימום", "דוד חשמל", "המים לא מתחממים", "טכנאי דודים", "דודים", "טכנאי דוד שמש"],
  symptomsHe: ["אין מים חמים", "נזילה מהדוד", "קולט שבור", "להחליף דוד"],
  pricingModel: "VISIT_QUOTE",
  photoSubjectHe: "דוד שמש וקולטים על גג, מפתח צינורות",
});

/**
 * Gas. Modelled in full and switched OFF.
 *
 * This is the clearest case in the file of §4 doing its job. Gas work is
 * urgent by nature — a smell of gas is the most NOW request a person can
 * make — and that is exactly why it cannot be switched on by an engineering
 * judgement call. Which licence is mandatory, what insurance must be in
 * force, and what the platform's liability is when it dispatches someone to
 * a gas fault are legal answers. The service sits here INACTIVE so that the
 * day those answers arrive, the change is one field.
 */
const gas: CatalogServiceDef = {
  id: "svc-gas",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הכיריים או של חיבור הגז",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "GAS_WORK",
  nameHe: "גז",
  descriptionHe: "חיבור, תיקון ובדיקת מערכת גז ביתית.",
  mark: "gas",
  keywordsHe: ["גז", "ריח גז", "בלון גז", "כיריים", "תנור גז", "צנרת גז", "ריח של גז", "מריח גז", "בלון", "גזייה", "ברנר", "דליפת גז", "טכנאי גז", "הכיריים לא נדלקות", "גזאי", "גזאית", "טכנאי גז"],
  symptomsHe: ["ריח גז", "כיריים לא נדלקות", "חיבור תנור", "בדיקת מערכת"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "INACTIVE",
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE", "GAS_LICENSE"],
  photoSubjectHe: "מד לחץ על צנרת גז, ידיים בכפפות",
  typicalMinutes: [30, 90],
};


// ---------------------------------------------------------------------
// אנשים שמגיעים אליך
//
// THE DEPARTMENT THAT DECIDES WHAT THIS COMPANY IS.
//
// Without it, PRO NOW is an app for home repairs with a marketplace
// underneath. With it, it is what Amit described: a network of independent
// professionals who can be at your door within the hour, whether they carry
// a tool bag, a folding table, or nothing at all.
//
// And this is not a branding preference — it is a supply argument. The
// hardest thing to buy in a NOW marketplace is a professional sitting online
// with an hour free. A personal trainer between clients, a masseur with a
// cancellation, a tutor with a gap before evening: these people ALREADY have
// the shape the product needs, and unlike a plumber they need no van, no
// parts and no parking. They are the cheapest liquidity a new city can have.
//
// TWO THINGS THAT CHANGE HERE, AND THEY ARE NOT COSMETIC:
//
// 1. There is no fault. Nobody's body is broken because they booked a
//    massage, and a product that asks "מה התקלה?" before a training session
//    has told the customer it was not built for them. Copy that assumes a
//    fault has to stay out of these flows.
//
// 2. The person IS the risk surface. A plumber is alone with a pipe; a
//    massage therapist is alone with a person, often for an hour, often
//    touching them. That is `PERSONAL_CONTACT`, and it is a different
//    question from `ENHANCED`, not a louder version of it. Which checks the
//    platform actually requires is a §4 decision — these services stay PILOT
//    until it is made, and the record carries the requirement so the
//    decision cannot be skipped by accident.
// ---------------------------------------------------------------------

/** Someone comes to you, as themselves, for an hour. */
function personal(
  s: Omit<CatalogServiceDef, "trustProfile" | "requiredCredentials" | "activationStatus"> &
    Partial<Pick<CatalogServiceDef, "trustProfile" | "requiredCredentials" | "activationStatus">>
): CatalogServiceDef {
  return {
    // PILOT, not ACTIVE, and the reason is in the comment above: the
    // verification policy for being alone with a person has not been decided
    // (/CLAUDE.md §4). Flipping this field without that decision is exactly
    // the mistake the field exists to prevent.
    activationStatus: "PILOT",
    trustProfile: "PERSONAL_CONTACT",
    requiredCredentials: ["IDENTITY_ENHANCED", "BACKGROUND_CHECK", "PROFESSIONAL_CERTIFICATE"],
    ...s,
  };
}

const trainer = personal({
  id: "svc-trainer",
  matchingMode: "PERSON_FIT",
  mediaIntent: "NONE",
  customerPhotoPromptHe: null,
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "FIT_TRAINER",
  nameHe: "אימון אישי",
  descriptionHe: "מאמן מגיע אליך — לבית, לפארק או לחדר הכושר.",
  mark: "fitness",
  keywordsHe: ["מאמן", "אימון", "כושר", "מאמן אישי", "להתאמן", "ספורט", "פילאטיס", "אימונים", "מאמנת", "ירידה במשקל", "חדר כושר", "ריצה", "יוגה", "להוריד במשקל"],
  symptomsHe: ["אימון ראשון להתנסות", "אימון בבית", "אימון בפארק", "חזרה אחרי הפסקה"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "מאמן עם מזרן וגומיות בסלון או בפארק",
  typicalMinutes: [45, 60],
});

const massage = personal({
  id: "svc-massage",
  matchingMode: "PERSON_FIT",
  mediaIntent: "NONE",
  customerPhotoPromptHe: null,
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "WELL_MASSAGE",
  nameHe: "עיסוי עד הבית",
  descriptionHe: "מטפל מגיע עם מיטת טיפולים.",
  mark: "wellness",
  keywordsHe: ["עיסוי", "מסאז", "מסאג׳", "מטפל", "כאבי גב", "שחרור שרירים", "רפלקסולוגיה", "מסאז׳", "מעסה", "מעסה עד הבית", "כאב גב", "צוואר תפוס", "תפוס", "שרירים", "כתפיים", "גב תפוס", "עייפות", "גב", "כואב", "כואב הגב", "כואבים", "צוואר"],
  symptomsHe: ["כאבי גב או צוואר", "אחרי אימון", "עיסוי רקמות עמוק", "עיסוי מרגיע"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "מיטת טיפולים מקופלת לצד תיק מטפל",
  typicalMinutes: [50, 90],
});

const haircut = personal({
  id: "svc-haircut",
  matchingMode: "PERSON_FIT",
  mediaIntent: "INSPIRATION",
  customerPhotoPromptHe: "אפשר לצרף תמונה של תסרוקת שאהבת",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "GROOM_HAIR",
  nameHe: "תספורת עד הבית",
  descriptionHe: "ספר או ספרית מגיעים עם הציוד.",
  mark: "grooming",
  keywordsHe: ["תספורת", "ספר", "ספרית", "להסתפר", "זקן", "צבע שיער", "פן", "מספרה", "תספורות", "שיער", "גילוח", "החלקה", "צבע לשיער", "ספר עד הבית", "להסתפר בבית", "ספרית", "ספר עד הבית", "ספרית עד הבית"],
  symptomsHe: ["תספורת גבר", "תספורת אישה", "תספורת לילד", "עיצוב זקן"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "מספריים ומכונת תספורת על מגבת",
  typicalMinutes: [30, 60],
});

const nails = personal({
  id: "svc-nails",
  matchingMode: "PERSON_FIT",
  mediaIntent: "INSPIRATION",
  customerPhotoPromptHe: "אפשר לצרף תמונה של לק או עיצוב שאהבת",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "GROOM_NAILS",
  nameHe: "מניקור ופדיקור",
  descriptionHe: "טיפול ציפורניים אצלך בבית.",
  mark: "grooming",
  keywordsHe: ["מניקור", "פדיקור", "ציפורניים", "לק", "ג׳ל", "בניית ציפורניים", "ציפורן", "לק ג׳ל", "מניקוריסטית", "ציפורניים שבורות"],
  symptomsHe: ["מניקור", "פדיקור", "לק ג׳ל", "הסרה ובנייה"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "ערכת טיפוח ציפורניים פתוחה על שולחן",
  typicalMinutes: [45, 90],
});

const tutor = personal({
  id: "svc-tutor",
  matchingMode: "PERSON_FIT",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של החומר או של המבחן",
  mobilityProfile: "CARRIES_NOTHING",
  code: "LEARN_TUTOR",
  nameHe: "שיעור פרטי",
  descriptionHe: "מורה מגיע אליך — או מתחבר עכשיו.",
  mark: "learning",
  keywordsHe: ["שיעור", "מורה", "שיעור פרטי", "מתמטיקה", "אנגלית", "בגרות", "מבחן", "מורה פרטי", "מורה פרטית", "שיעורי בית", "מבחנים", "פיזיקה", "לימוד", "ללמוד", "עברית", "חשבון", "כימיה", "מורה עד הבית"],
  symptomsHe: ["מבחן מחר", "עזרה בשיעורי בית", "הכנה לבגרות", "שיעור קבוע"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  // The one service here with no physical contact at all, which is why it
  // does not carry a background check by default — the trust question is
  // real but different, and it is a §4 decision like the rest.
  trustProfile: "ENHANCED",
  requiredCredentials: ["IDENTITY_ENHANCED", "PROFESSIONAL_CERTIFICATE"],
  photoSubjectHe: "מחברת ומחשבון על שולחן מטבח",
  typicalMinutes: [45, 90],
});

/**
 * הנדימן לשעה — the service that proves the model.
 *
 * It is not a trade. It is an hour of a capable person with a bag of tools,
 * and it absorbs every small job the catalogue will never have a name for: a
 * shelf, a curtain rod, a door that sticks, a box that needs carrying down.
 * A taxonomy can grow forever and still miss what someone actually needs at
 * eight in the evening; this is how the product answers anyway.
 */
const handymanHour: CatalogServiceDef = {
  id: "svc-handyman",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של מה שצריך לתקן",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "ASSIST_HANDYMAN",
  nameHe: "הנדימן לשעה",
  descriptionHe: "עבודות קטנות בבית — לפי שעה, בלי להגדיר מראש בדיוק מה.",
  mark: "handyman",
  keywordsHe: ["הנדימן", "תיקונים קטנים", "לתלות", "לקדוח", "מדף", "להרכיב", "עזרה בבית", "בעל מקצוע כללי", "אחזקה", "תיקונים", "תיקון קטן", "לתלות תמונה", "לתלות מדף", "איש תחזוקה", "שיפוצניק", "איש אחזקה", "תיקונים בבית"],
  symptomsHe: ["לתלות מדף או תמונה", "דלת שנתקעת", "כמה תיקונים קטנים", "לא בטוח מה צריך"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "LIABILITY_INSURANCE"],
  photoSubjectHe: "תיק כלים פתוח עם מברגה ופלס",
  typicalMinutes: [60, 180],
};

/** עזרה בהרמה וסידור — a pair of hands, no trade required. */
const helpingHands: CatalogServiceDef = {
  id: "svc-hands",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "צילום של מה שצריך להזיז",
  mobilityProfile: "CARRIES_NOTHING",
  code: "ASSIST_HANDS",
  nameHe: "זוג ידיים לעזרה",
  descriptionHe: "להרים, לסדר, לפנות, לארוז — שעה או שתיים של עזרה.",
  mark: "moving",
  keywordsHe: ["עזרה", "להרים", "לסדר", "לארוז", "לפנות", "כוח אדם", "מישהו שיעזור", "סבל", "סבלים", "כבד", "לסחוב", "להזיז", "עזרה בהזזה", "ידיים", "סחיבה"],
  symptomsHe: ["להרים משהו כבד", "לסדר מחסן", "לארוז לפני מעבר", "לפנות גרוטאות"],
  pricingModel: "HOURLY",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY],
  photoSubjectHe: "שני אנשים מרימים ארגז במסדרון",
  typicalMinutes: [60, 180],
};

/** ניקיון אחרי שיפוץ — named by Amit, and genuinely its own job. */
const renoClean: CatalogServiceDef = {
  id: "svc-clean-reno",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של השטח אחרי השיפוץ",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "CLEAN_RENOVATION",
  nameHe: "ניקיון אחרי שיפוץ",
  descriptionHe: "אבק בנייה, שאריות צבע, חלונות ומסגרות.",
  mark: "cleaning",
  keywordsHe: ["ניקיון אחרי שיפוץ", "אבק בנייה", "שאריות צבע", "ניקיון עומק", "אחרי בנייה", "אבק", "שאריות", "ניקיון אחרי בנייה", "אחרי שיפוץ", "לכלוך של שיפוץ"],
  symptomsHe: ["אבק בכל הבית", "שאריות צבע וטיח", "חלונות ומסגרות", "לפני כניסה לדירה"],
  pricingModel: "VISIT_QUOTE", quoteBeforeDispatch: true,
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "ACTIVE",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS"],
  photoSubjectHe: "שואב תעשייתי ודלי לצד חלון נקי",
  typicalMinutes: [180, 420],
};


// ---------------------------------------------------------------------
// בעלי חיים — Amit: "דוג ווקר כן! ולא חשבתי על זה. או בעלי חיים בכללי."
//
// This department came out of reading ספץ's taxonomy and is the clearest
// case in the catalogue of a vertical that is NATIVELY on-demand and that a
// home-repairs frame would never have found. A dog needs walking in the next
// hour, not next Thursday — the whole category is "now" by nature, which is
// the same test that admits a blocked drain and rejects a kitchen
// renovation. It also carries no equipment, so mobility is trivial.
//
// The trust profile is the interesting part: a dog walker is usually given a
// key or a door code, and is alone in the home with nobody watching. That is
// a HIGHER trust bar than an electrician who works while you stand there,
// not a lower one — which is why these are PERSONAL_CONTACT despite
// involving no contact with a person at all.
// ---------------------------------------------------------------------

const dogWalk = personal({
  id: "svc-dog-walk",
  matchingMode: "PERSON_FIT",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "תמונה של הכלב, כדי שנדע מי מחכה",
  mobilityProfile: "CARRIES_NOTHING",
  code: "PET_WALK",
  nameHe: "הוצאת כלב לטיול",
  descriptionHe: "דוג ווקר מגיע ומוציא את הכלב עכשיו.",
  mark: "garden",
  keywordsHe: ["דוג ווקר", "דוג", "ווקר", "טיול", "כלב", "להוציא את הכלב", "הליכה עם כלב", "דוגווקר", "לטייל", "לטייל עם הכלב", "להוציא", "שיוציא", "שיטייל", "הליכה", "כלבים", "כלבה", "רצועה", "דוג ווקרית", "חיות", "חיה", "חיות מחמד", "חנות חיות", "חנות לחיות", "חנות לבעלי חיים", "בעלי חיים", "פט שופ", "פטשופ"],
  symptomsHe: ["טיול קצר", "טיול ארוך", "כלב גדול", "כלב שמושך ברצועה"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "רצועה ושקיות תלויות ליד דלת כניסה",
  typicalMinutes: [30, 60],
});

const petSit = personal({
  id: "svc-pet-sit",
  matchingMode: "PERSON_FIT",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "תמונה של החיה",
  mobilityProfile: "CARRIES_NOTHING",
  code: "PET_SIT",
  nameHe: "השגחה על חיית מחמד",
  descriptionHe: "מישהו נשאר עם החיה בזמן שאתם לא בבית.",
  mark: "garden",
  keywordsHe: ["דוגי סיטר", "פט סיטר", "השגחה", "לשמור על הכלב", "לשמור על החתול", "מי ישמור", "לשמור", "שמרטף לכלב", "שמרטפית לכלב", "להאכיל", "האכלה", "חופשה", "בחו״ל", "כלב", "כלבה", "חתול", "חתולה", "חתולים", "חיות", "חיה", "חיות מחמד", "חנות חיות", "חנות לחיות", "חנות לבעלי חיים", "בעלי חיים", "פט שופ", "פטשופ"],
  symptomsHe: ["כמה שעות", "ערב שלם", "האכלה בלבד", "חיה שצריכה תרופות"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "קערת מים וצעצוע על רצפת סלון",
  typicalMinutes: [60, 300],
});

const petGroom = personal({
  id: "svc-pet-groom",
  matchingMode: "PERSON_FIT",
  mediaIntent: "ITEM_REFERENCE",
  customerPhotoPromptHe: "תמונה של הפרווה עכשיו",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "PET_GROOM",
  nameHe: "מספרה ניידת לכלבים",
  descriptionHe: "רחצה, גזירה וטיפוח — בלי לצאת מהבית.",
  mark: "grooming",
  keywordsHe: ["מספרה לכלבים", "טיפוח כלב", "גזירה", "רחצה לכלב", "ציפורניים לכלב", "מספרה ניידת", "טיפוח", "לרחוץ", "מקלחת לכלב", "גזירת ציפורניים", "פרווה", "סירוק", "קיצור", "כלב", "כלבה", "כלבים", "חתול", "מספרת כלבים", "תספורת", "מקלחת", "תספורת לכלב", "חיות", "חיה", "חיות מחמד", "חנות חיות", "חנות לחיות", "חנות לבעלי חיים", "בעלי חיים", "פט שופ", "פטשופ"],
  symptomsHe: ["רחצה", "גזירה מלאה", "קיצור ציפורניים", "פרווה מסובכת"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "מספריים ומברשת טיפוח על מגבת",
  typicalMinutes: [60, 120],
});

// ---------------------------------------------------------------------
// שירותים לרכב — Amit: "שירותים לרכב כן".
//
// The purest NOW department in the whole catalogue, and the one where the
// competition is worst. A dead battery or a flat tyre on a Friday night is
// the archetypal case: it cannot wait, it is location-bound, and the person
// is usually standing outside in the dark. Note that ספץ's single most
// delighted review in three years of the store is exactly this — a flat tyre
// on a Friday night, fixed in fifteen minutes — delivered by luck rather
// than by design.
//
// TOWING IS NOT HERE. It needs a truck, a licence class and an insurance
// relationship, and whether we dispatch it is a business decision, not an
// engineering one (/CLAUDE.md §4). Modelled, and left INACTIVE.
// ---------------------------------------------------------------------

function vehicle(s: Omit<CatalogServiceDef, "mark">): CatalogServiceDef {
  return { ...s, mark: "moving" };
}

const jumpStart = vehicle({
  id: "svc-jump-start",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "NONE",
  customerPhotoPromptHe: null,
  mobilityProfile: "NEEDS_VEHICLE",
  code: "CAR_JUMP",
  nameHe: "הרכב לא מתניע",
  descriptionHe: "מישהו מגיע עם כבלים ומתניע.",
  keywordsHe: ["לא מתניע", "מצבר", "בוסטר", "כבלים", "הרכב מת", "התנעה", "סוללה", "האוטו לא מתניע", "הרכב לא מתניע", "מצבר מת", "נגמר המצבר", "רכב", "אוטו", "מכונית", "לא מניע", "לא נדלק הרכב"],
  symptomsHe: ["אין בכלל חשמל", "מנסה ולא תופס", "השארתי אורות דולקים", "לא יודע"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "PILOT",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "DRIVING_LICENSE", "VEHICLE_INSURANCE"],
  photoSubjectHe: "כבלי התנעה מחוברים למצבר",
  typicalMinutes: [15, 30],
});

const flatTyre = vehicle({
  id: "svc-flat-tyre",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הגלגל",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "CAR_TYRE",
  nameHe: "תקר בגלגל",
  descriptionHe: "החלפה לחלופי, או תיקון במקום.",
  keywordsHe: ["תקר", "פנצ׳ר", "גלגל", "צמיג", "פנצ'ר", "החלפת גלגל", "פנצר", "גלגל פנצ׳ר", "גלגל רזרבי", "ג׳ק", "ברגים", "רכב", "אוטו", "מכונית", "גלגל נקוע", "גלגל ריק"],
  symptomsHe: ["יש גלגל חלופי", "אין גלגל חלופי", "הגלגל פגוע בצד", "לא מצליח לפתוח את הברגים"],
  pricingModel: "FIXED",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "PILOT",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS", "DRIVING_LICENSE", "VEHICLE_INSURANCE"],
  photoSubjectHe: "מגבה וגלגל חלופי ליד רכב",
  typicalMinutes: [20, 45],
});

const carLockout = vehicle({
  id: "svc-car-lockout",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "NONE",
  customerPhotoPromptHe: null,
  mobilityProfile: "NEEDS_VEHICLE",
  code: "CAR_LOCKOUT",
  nameHe: "מפתחות ננעלו ברכב",
  descriptionHe: "מנעולן רכב פותח בלי לשבור.",
  keywordsHe: ["ננעל ברכב", "מפתחות ברכב", "מנעולן רכב", "נשארו המפתחות בפנים", "פריצה לרכב", "ננעל", "ננעלתי", "ננעלתי ברכב", "המפתח ברכב", "מפתח ברכב", "ילד ברכב", "ננעלו", "מנעולן", "רכב", "אוטו", "מכונית"],
  symptomsHe: ["המפתח בתוך הרכב", "איבדתי את המפתח", "יש ילד או חיה ברכב", "המפתח נשבר במנעול"],
  pricingModel: "FIXED",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "PILOT",
  /*
   * Same reasoning as the home lockout: the one job whose whole purpose is
   * opening something for a person who cannot, at that moment, prove it is
   * theirs. A child or an animal locked inside also makes this the single
   * most time-critical row in the catalogue.
   */
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [
    IDENTITY,
    "BUSINESS",
    "VEHICLE_LINK_POLICY",
    "DRIVING_LICENSE",
    "LIABILITY_INSURANCE",
  ],
  photoSubjectHe: "ערכת פתיחת רכב על מכסה מנוע",
  typicalMinutes: [15, 40],
});

const towing = vehicle({
  id: "svc-towing",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של הרכב ושל המקום",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "CAR_TOW",
  nameHe: "גרירת רכב",
  descriptionHe: "גרר לרכב שלא זז.",
  keywordsHe: ["גרר", "גרירה", "לגרור", "הרכב לא זז", "תאונה", "גררו", "תקוע", "מוסך", "רכב תקוע", "רכב", "אוטו", "מכונית", "נתקעתי בדרך", "האוטו מת"],
  symptomsHe: ["הרכב לא מתניע", "אחרי תאונה", "תקוע בחניון", "צריך למוסך מסוים"],
  pricingModel: "VISIT_QUOTE", quoteBeforeDispatch: true, needsDestination: true,
  fulfillmentProfile: "URGENT_NOW",
  // Licence class, insurance and the relationship with the receiving garage
  // are business and legal decisions this codebase must not invent (§4).
  activationStatus: "INACTIVE",
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [IDENTITY, "BUSINESS", "DRIVING_LICENSE", "VEHICLE_INSURANCE", "LIABILITY_INSURANCE"],
  photoSubjectHe: "משאית גרר עם רכב עליה",
  typicalMinutes: [30, 90],
});

// ---------------------------------------------------------------------
// מחשבים ואלקטרוניקה — NOW-shaped for a different reason.
//
// Nothing is being damaged by a dead laptop, but something is being LOST:
// the file, the deadline, the evening. Urgency here is about the person's
// day rather than about the property, and that is still urgency.
// ---------------------------------------------------------------------

const computerFix: CatalogServiceDef = {
  id: "svc-computer",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של המסך או של ההודעה",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "TECH_COMPUTER",
  nameHe: "טכנאי מחשבים",
  descriptionHe: "מחשב שלא עולה, איטי או בלי רשת.",
  mark: "tv",
  keywordsHe: ["מחשב", "לפטופ", "לא נדלק", "איטי", "וירוס", "אינטרנט לא עובד", "ראוטר", "טכנאי מחשבים", "מחשבים", "מחשב נייד", "וירוסים", "אינטרנט", "וויפי", "wifi", "מדפסת", "נתקע", "מסך כחול", "טכנאי", "האינטרנט לא עובד"],
  symptomsHe: ["לא נדלק בכלל", "איטי מאוד", "אין אינטרנט", "מסך כחול או שגיאה"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "PILOT",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS"],
  photoSubjectHe: "מחשב נייד פתוח עם מברג לצידו",
  typicalMinutes: [45, 120],
};

const phoneFix: CatalogServiceDef = {
  id: "svc-phone-fix",
  matchingMode: "FASTEST_ELIGIBLE",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של המכשיר",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "TECH_PHONE",
  nameHe: "תיקון סלולרי",
  descriptionHe: "מסך שבור או סוללה — מגיעים אליך.",
  mark: "tv",
  keywordsHe: ["מסך שבור", "טלפון", "אייפון", "סוללה", "לא נטען", "תיקון סלולרי", "סמארטפון", "פלאפון", "פלאפונים", "סלולרי", "טלפונים", "סמסונג", "גלקסי", "מסך סדוק", "שקע טעינה", "נייד", "הטלפון נפל", "מסך מנופץ", "טכנאי סלולר", "טכנאי סלולרי", "טכנאי טלפונים", "טכנאית סלולר"],
  symptomsHe: ["מסך שבור", "לא נטען", "נפל למים", "לא נדלק"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "SAME_DAY_NOW",
  activationStatus: "PILOT",
  trustProfile: "STANDARD",
  requiredCredentials: [IDENTITY, "BUSINESS"],
  photoSubjectHe: "מסך טלפון מפורק על מזרן עבודה",
  typicalMinutes: [30, 75],
};

const makeup = personal({
  id: "svc-makeup",
  matchingMode: "PERSON_FIT",
  mediaIntent: "INSPIRATION",
  customerPhotoPromptHe: "אפשר לצרף תמונה של לוק שאהבת",
  mobilityProfile: "CARRIES_ON_PERSON",
  code: "GROOM_MAKEUP",
  nameHe: "איפור",
  descriptionHe: "מאפרת מגיעה עם הערכה.",
  mark: "grooming",
  keywordsHe: ["איפור", "מאפרת", "ערב", "אירוע", "לוק", "איפור ערב", "חתונה", "בת מצווה", "כלה", "איפור כלה", "מאפרת עד הבית"],
  symptomsHe: ["איפור ערב", "איפור יום", "יש לי אירוע בעוד שעתיים", "לא יודעת מה מתאים"],
  pricingModel: "FIXED",
  fulfillmentProfile: "SAME_DAY_NOW",
  photoSubjectHe: "ערכת איפור פתוחה עם מברשות",
  typicalMinutes: [45, 90],
});

// ---------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------


/**
 * ---------------------------------------------------------------------
 * רפואה עד הבית — modelled, and switched off
 * ---------------------------------------------------------------------
 * Amit: "תוסיף לי גם רופאים פרטיים/וטרינרים."
 *
 * He is right that they belong in the taxonomy. A child with a fever at
 * eleven at night, or a dog that has stopped eating on a Friday, are among
 * the purest "I need someone NOW" moments a family has — arguably more
 * urgent than any pipe in this catalogue. And a house-call doctor is a real,
 * established Israeli service.
 *
 * They are nonetheless INACTIVE, for the same reason gas is. Dispatching
 * medical care is not a design decision: it touches licensing, malpractice
 * cover, medical-record retention, triage liability, and the question of
 * what happens when the correct answer is an ambulance rather than a
 * doctor — a question this product would be answering implicitly, at speed,
 * for someone frightened. Every one of those is a business and legal
 * decision this codebase must not invent (/CLAUDE.md §4).
 *
 * So the taxonomy is ready and the switch is off. That is what
 * `activationStatus` is for, and it is the difference between planning for
 * a vertical and quietly shipping one.
 */

const houseDoctor: CatalogServiceDef = {
  id: "svc-doctor",
  matchingMode: "PERSON_FIT",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "אפשר לצלם פריחה או מדחום",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "MED_HOUSE_CALL",
  nameHe: "רופא עד הבית",
  descriptionHe: "ביקור רופא פרטי בבית, גם בלילה.",
  mark: "wellness",
  keywordsHe: ["רופא", "רופא פרטי", "ביקור בית", "חום", "ילד חולה", "רופא ילדים", "רופא עד הבית", "רופאה", "חולה", "שיעול", "כאב גרון", "כאב אוזניים", "הקאות", "מקיא", "שלשול", "דלקת", "מרשם", "אנטיביוטיקה", "לא מרגיש טוב", "לא מרגישה טוב", "סחרחורת", "כאב ראש", "כאבי בטן", "ילד", "ילדה", "תינוק", "תינוקת", "סבא", "סבתא", "רופא משפחה", "חום גבוה", "נחנק", "נחנקה", "נחנקת"],
  symptomsHe: ["חום גבוה", "ילד חולה", "כאבים", "צריך מרשם"],
  pricingModel: "FIXED",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "INACTIVE",
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [
    "IDENTITY_ENHANCED",
    "BUSINESS",
    "MEDICAL_LICENSE",
    "LIABILITY_INSURANCE",
    "BACKGROUND_CHECK",
  ],
  photoSubjectHe: "תיק רופא פתוח עם סטטוסקופ",
  typicalMinutes: [20, 45],
};

const vet: CatalogServiceDef = {
  id: "svc-vet",
  matchingMode: "PERSON_FIT",
  mediaIntent: "PROBLEM_EVIDENCE",
  customerPhotoPromptHe: "צילום של החיה ושל מה שמדאיג אתכם",
  mobilityProfile: "NEEDS_VEHICLE",
  code: "MED_VET",
  nameHe: "וטרינר עד הבית",
  descriptionHe: "בדיקה וטיפול בלי לסחוב את החיה למרפאה.",
  mark: "wellness",
  keywordsHe: ["וטרינר", "וטרינרית", "כלב חולה", "חתול חולה", "חיסון", "החיה לא אוכלת", "וטרינר עד הבית", "חתול", "חתולה", "חתולים", "חתלתול", "כלב", "כלבה", "כלבים", "גור", "גורה", "גורים", "ארנב", "ארנבת", "תוכי", "ציפור", "אוגר", "שרקן", "צב", "חיית מחמד", "בעל חיים", "נחנק", "נחנקת", "נחנקה", "משתעל", "משתעלת", "הקיא", "הקיאה", "מקיא", "מקיאה", "הקאות", "שלשול", "צולע", "צולעת", "מדמם", "מדממת", "דימום", "פצוע", "פצועה", "נפצע", "נפצעה", "בלע", "בלעה", "נשך", "ננשך", "נעקץ", "הורעל", "רעל", "לא אוכל", "לא אוכלת", "לא שותה", "לא זז", "לא קם", "חלש", "חלשה", "מתנשף", "לא נושם", "קרציה", "קרציות", "פרעושים", "מגרד", "מתגרד", "עיקור", "סירוס", "שבב", "חיסונים", "ווטרינר", "וטרינרי", "רופא חיות", "רופא לחיות", "רופאת חיות", "רופא וטרינר", "מרפאה וטרינרית", "מרפאת חיות"],
  symptomsHe: ["לא אוכל", "פציעה", "חיסון שגרתי", "חיה מבוגרת"],
  pricingModel: "VISIT_QUOTE",
  fulfillmentProfile: "URGENT_NOW",
  activationStatus: "INACTIVE",
  trustProfile: "LICENSE_REQUIRED",
  requiredCredentials: [
    "IDENTITY_ENHANCED",
    "BUSINESS",
    "VETERINARY_LICENSE",
    "LIABILITY_INSURANCE",
  ],
  photoSubjectHe: "תיק וטרינרי וסטטוסקופ על שולחן",
  typicalMinutes: [25, 60],
};

/**
 * ---------------------------------------------------------------------
 * THE TREE — and why it was reorganised
 * ---------------------------------------------------------------------
 * Amit: "אני חייב שזה יהיה יותר מסודר בקטגוריות… תסתכלו במדרג, איזי, כל
 * האתרים של אנשי מקצוע, תשתמשו בזה וקחו את זה לטכנולוגיה שלנו."
 *
 * So we read them: מדרג (15 topics), איזי, המקצוענים, זאפ נינג'ה and ספץ
 * (18 groups). Three findings decided this tree.
 *
 * 1. THE TOP LEVEL IS THE ARBITRARY PART. The same thirty leaf services get
 *    sliced five different ways: מדרג cuts by LIFE EVENT (עוברים דירה,
 *    קונים דירה, לידה והורות), איזי by INTENT QUESTION (את מי מזמינים?),
 *    ספץ by OBJECT OF WORK, and both המקצוענים and זאפ נינג'ה have no top
 *    level at all — just a flat list of trades ordered by demand. Five cuts
 *    over one stable leaf set means the cut is a choice, not a discovery.
 *    What IS stable across all five is the trade noun: אינסטלטור, חשמלאי,
 *    מנעולן, טכנאי מזגנים, הדברה appear on every single site.
 *
 * 2. SO WE CUT BY OBJECT OF WORK, like ספץ — the home, the appliance, the
 *    body, the animal, the car — because that is the cut that survives our
 *    own filter. We are not a directory; we only carry work that can start
 *    in the next hour, and "what is the work being done TO" is the question
 *    that predicts whether NOW is possible. A life-event cut (עוברים דירה)
 *    mixes a same-hour move with a scheduled painter; an object cut does
 *    not.
 *
 * 3. AND WE DROPPED WHAT CANNOT HAPPEN NOW. Amit went through ספץ's
 *    eighteen and ruled: "קח מפה רק את הקטגוריות הרלוונטיות שיכולות
 *    להתבצע מיידי. לדוגמא עבודות עפר לא מעניין, עורך דין לא מעניין כרגע.
 *    אבל דוג ווקר כן! ולא חשבתי על זה… שירותים לרכב כן… שמחות ואירועים
 *    כרגע לא… בעלי חיים כן, מה שרלוונטי."
 *
 *    Out: עבודות עפר ופיתוח · עורכי דין · ביטוח ופיננסים · מיסטיקה
 *    ורוחניות · סיעוד · שירותים לעסקים · שמחות ואירועים · פרחים ומתנות.
 *    In, and new to this catalogue: בעלי חיים (the department nobody here
 *    had thought of, and natively on-demand) and שירותים לרכב (the most
 *    urgent department in the product).
 *
 * WHAT WE DELIBERATELY DID NOT COPY. ספץ lists 400 topics in every יישוב in
 * Israel and honours "now" in almost none of them — their own FAQ answer to
 * "the professional did not arrive" is that you should telephone him
 * yourself. A catalogue is a promise about supply. Ours is sized to what a
 * pilot city can actually answer; everything else is modelled and switched
 * off, which is what `activationStatus` is for.
 */
export const pilotCatalog: CatalogDepartmentDef[] = [
  {
    code: "HOME_URGENT",
    nameHe: "תיקונים בבית",
    categories: [
      { code: "PLUMBING", nameHe: "אינסטלציה", mark: "plumbing", services: [blockage, leak, tap] },
      { code: "ELECTRICAL", nameHe: "חשמל", mark: "electrical", services: [powerOut, socket] },
      { code: "LOCKSMITH", nameHe: "מנעולנות", mark: "locksmith", services: [lockout, cylinder] },
      { code: "GAS", nameHe: "גז", mark: "gas", services: [gas] },
    ],
  },
  {
    /*
     * ספץ gives appliances their own top level and they are right: a dead
     * fridge is not "plumbing", and a customer looking for a washing-machine
     * technician does not think of themselves as having a home repair. It is
     * also the department where the trade name IS the service name, which is
     * what every Israeli site trained people on.
     */
    code: "APPLIANCES",
    nameHe: "מכשירי חשמל",
    categories: [
      { code: "CLIMATE", nameHe: "מיזוג", mark: "climate", services: [acFix] },
      { code: "APPLIANCE", nameHe: "מוצרי חשמל", mark: "appliance", services: [fridge, washer] },
    ],
  },
  {
    code: "HOME_CARE",
    nameHe: "ניקיון ובית",
    categories: [
      { code: "CLEANING", nameHe: "ניקיון", mark: "cleaning", services: [cleanNow, renoClean] },
      { code: "PEST", nameHe: "הדברה", mark: "pest", services: [pest] },
      { code: "GARDEN", nameHe: "גינון", mark: "garden", services: [garden] },
    ],
  },
  {
    code: "BEAUTY",
    nameHe: "טיפוח ויופי",
    categories: [
      { code: "GROOMING", nameHe: "טיפוח", mark: "grooming", services: [haircut, nails, makeup] },
    ],
  },
  {
    /*
     * מדרג files עיסוי and מאמני כושר under בריאות, beside dentists and
     * physiotherapists. That medical frame is wrong for a massage someone
     * orders on a Thursday evening, and it is the reason מדרג has no
     * at-home wellness identity at all. Own department.
     */
    code: "WELLNESS",
    nameHe: "בריאות וכושר",
    categories: [
      { code: "FITNESS", nameHe: "כושר ועיסוי", mark: "fitness", services: [trainer, massage] },
      { code: "MEDICAL", nameHe: "רפואה עד הבית", mark: "wellness", services: [houseDoctor] },
    ],
  },
  {
    code: "PETS",
    nameHe: "בעלי חיים",
    categories: [
      { code: "PET_CARE", nameHe: "טיפול בחיות", mark: "garden", services: [dogWalk, petSit] },
      { code: "PET_GROOM", nameHe: "טיפוח חיות", mark: "grooming", services: [petGroom] },
      { code: "PET_MED", nameHe: "וטרינריה", mark: "wellness", services: [vet] },
    ],
  },
  {
    code: "VEHICLE",
    nameHe: "שירותים לרכב",
    categories: [
      {
        code: "ROADSIDE",
        nameHe: "תקלות בדרך",
        mark: "moving",
        services: [jumpStart, flatTyre, carLockout, towing],
      },
    ],
  },
  {
    code: "LOGISTICS",
    nameHe: "הובלות ומשלוחים",
    categories: [
      { code: "COURIER", nameHe: "שליחויות", mark: "moving", services: [courier] },
      { code: "MOVING", nameHe: "הובלות", mark: "moving", services: [smallMove] },
    ],
  },
  {
    code: "TECH",
    nameHe: "מחשבים וסלולר",
    categories: [
      { code: "COMPUTERS", nameHe: "מחשבים", mark: "tv", services: [computerFix, phoneFix] },
    ],
  },
  {
    /*
     * ספץ calls this עבודות מזדמנות and TaskRabbit calls it the whole
     * product. It is the department that catches everything the taxonomy
     * will never have a name for — which is most of what people actually
     * need at eight in the evening.
     */
    code: "ODD_JOBS",
    nameHe: "עזרה ועבודות קטנות",
    categories: [
      {
        code: "ASSIST",
        nameHe: "עזרה כללית",
        mark: "handyman",
        services: [handymanHour, helpingHands],
      },
      { code: "LEARNING", nameHe: "לימודים", mark: "learning", services: [tutor] },
    ],
  },
  {
    code: "IMPROVEMENT",
    nameHe: "שיפוץ והתקנות",
    categories: [
      { code: "FINISHES", nameHe: "גימור", mark: "painting", services: [painting, tiling, drywall] },
      { code: "CARPENTRY", nameHe: "נגרות", mark: "carpentry", services: [carpentry, furniture] },
      {
        code: "INSTALLATIONS",
        nameHe: "התקנות",
        mark: "tv",
        services: [tvMount, curtains, glass, alarm],
      },
      { code: "BUILDING", nameHe: "מעטפת הבית", mark: "sealing", services: [sealing, solar] },
    ],
  },
];

/** Every service, keyed by id. Screens look up, they do not re-declare. */
export const pilotServiceById: Record<string, CatalogServiceDef> = Object.fromEntries(
  pilotCatalog.flatMap((d) => d.categories.flatMap((c) => c.services)).map((s) => [s.id, s])
);
