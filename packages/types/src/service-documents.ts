/**
 * ---------------------------------------------------------------------
 * THE DOCUMENTS EACH SERVICE ASKS OF A PROFESSIONAL
 * ---------------------------------------------------------------------
 * DECIDED 2026-09-30 (Dvir, D4 in docs/sync/SYNC-2026-09-30.md): the
 * research's list is the rule. Copied from the demo's `onboardingDocsFor`
 * (tools/design-preview/lib/types/src/onboarding-docs.ts, from the report
 * "מסמכים נדרשים לבעלי מקצוע", 2026-09-29), in the engine's vocabulary
 * (`KIND:SPECIALISATION`, see credential-requirements.ts).
 *
 * Levels, as the professional reads them:
 *   LAW, always          → mandatory: it gates dispatch for that service.
 *   LAW, "when needed"   → asked and explained, never blocking: a painter
 *                          who never works above 2 m is not stopped.
 *   RECOMMENDED          → customary, speeds up approval, never blocking.
 *
 * The account's own documents (ID, a selfie, the tax file) are not here:
 * everybody gives them, per account (ACCOUNT_DOCUMENT_KINDS).
 *
 * Deliberately absent: a criminal-record certificate, or any "background
 * check". Demanding one is an offence in Israel even with consent (the
 * report, "מה מותר לבקש"). Police approval for tutors of minors is a
 * question for a lawyer (docs/18), not asked here.
 *
 * One change from the demo: its "how we check" lines say some registries
 * are checked automatically. That is item I and not built, so these say
 * what an admin checks against, without "automatically".
 */

export type DocumentLevel = "LAW" | "RECOMMENDED";

export interface DocumentRequirement {
  /** As stored in `ServiceRequirement.requirement`. */
  requirement: string;
  /** Gates dispatch. Only the law, unconditionally. */
  mandatory: boolean;
  level: DocumentLevel;
  /** When the law asks for it only in some cases: "אם עובדים בגובה מעל 2 מ׳". */
  whenHe?: string;
}

export interface DocumentInfo {
  nameHe: string;
  /** How PRO NOW checks it, in one line. */
  checkHe: string;
  /** A number field, when the registry is searched by it. */
  numberLabelHe?: string;
}

const INFO: Readonly<Record<string, DocumentInfo>> = {
  "INSURANCE:LIABILITY": { nameHe: "ביטוח צד ג׳", checkHe: "בודקים שהפוליסה בתוקף" },
  "LICENSE:ELECTRICIAN": { nameHe: "רישיון חשמלאי", checkHe: "נבדק מול מאגר החשמלאים של משרד העבודה", numberLabelHe: "מספר רישיון" },
  "LICENSE:GAS": { nameHe: "רישיון גזאי (מתקין גפ״מ)", checkHe: "נבדק מול מאגר הגזאים של משרד האנרגיה", numberLabelHe: "מספר רישיון" },
  "LICENSE:AC": { nameHe: "רישיון טכנאי מיזוג אוויר", checkHe: "רישיון חדש לפי חוק 2025 · נבדק מול משרד העבודה", numberLabelHe: "מספר רישיון" },
  "LICENSE:PEST_CONTROL": { nameHe: "היתר מדביר", checkHe: "נבדק מול מאגר המדבירים של המשרד להגנת הסביבה", numberLabelHe: "מספר היתר" },
  "LICENSE:VETERINARY": { nameHe: "רישיון וטרינר", checkHe: "נבדק מול מאגר הווטרינרים", numberLabelHe: "מספר רישיון" },
  "LICENSE:MEDICAL": { nameHe: "רישיון לעסוק ברפואה", checkHe: "נבדק מול מאגר משרד הבריאות", numberLabelHe: "מספר רישיון" },
  "LICENSE:DRIVING": { nameHe: "רישיון נהיגה", checkHe: "סוג הרישיון מתאים לרכב" },
  "INSURANCE:VEHICLE": { nameHe: "ביטוח רכב (חובה)", checkHe: "בודקים שהפוליסה בתוקף" },
  "LICENSE:RECOVERY_VEHICLE": { nameHe: "רישיון רכב חילוץ + היתר נהג גרר", checkHe: "הרכב רשום כ״רכב חילוץ״ במשרד התחבורה", numberLabelHe: "מספר רכב" },
  "LICENSE:MOBILE_GARAGE": { nameHe: "רישיון מוסך נייד", checkHe: "נבדק מול מאגר המוסכים", numberLabelHe: "מספר רישיון" },
  "CERTIFICATE:WORK_AT_HEIGHT": { nameHe: "הסמכה לעבודה בגובה", checkHe: "בודקים תוקף (עד שנתיים)" },
  "CERTIFICATE:PROFESSIONAL": { nameHe: "תעודה מקצועית", checkHe: "תעודת לימודים, הסמכה או מורשה יצרן" },
};

const law = (requirement: string, whenHe?: string): DocumentRequirement =>
  whenHe ? { requirement, mandatory: false, level: "LAW", whenHe } : { requirement, mandatory: true, level: "LAW" };
const recommended = (requirement: string): DocumentRequirement => ({ requirement, mandatory: false, level: "RECOMMENDED" });

const HEIGHT = "אם עובדים בגובה מעל 2 מ׳";
const ELECTRICIAN = "LICENSE:ELECTRICIAN";
const AT_HEIGHT = "CERTIFICATE:WORK_AT_HEIGHT";
const CERT = "CERTIFICATE:PROFESSIONAL";
const DRIVING = [law("LICENSE:DRIVING"), law("INSURANCE:VEHICLE")];

/** Per pilot service: the documents beyond the account's own. The demo's BY_SERVICE. */
const BY_SERVICE: Readonly<Record<string, DocumentRequirement[]>> = {
  "svc-electric": [law(ELECTRICIAN)],
  "svc-socket": [law(ELECTRICIAN)],
  "svc-alarm": [law(ELECTRICIAN, "כשמתחברים לחשמל 230V")],
  "svc-solar": [law(ELECTRICIAN, "לעבודה על הגוף, התרמוסטט או החיבור"), law(AT_HEIGHT, HEIGHT)],
  "svc-gas": [law("LICENSE:GAS")],
  "svc-ac": [law("LICENSE:AC"), law(AT_HEIGHT, "ליחידה חיצונית בגובה")],
  "svc-pest": [law("LICENSE:PEST_CONTROL")],
  "svc-vet": [law("LICENSE:VETERINARY")],
  "svc-doctor": [law("LICENSE:MEDICAL")],
  "svc-towing": [...DRIVING, law("LICENSE:RECOVERY_VEHICLE")],
  "svc-courier": DRIVING,
  "svc-moving": DRIVING,
  "svc-jump-start": DRIVING,
  "svc-flat-tyre": [...DRIVING, law("LICENSE:MOBILE_GARAGE", "אם מתקנים את הצמיג במקום")],
  "svc-paint": [law(AT_HEIGHT, HEIGHT)],
  "svc-glass": [law(AT_HEIGHT, HEIGHT), recommended(CERT)],
  "svc-sealing": [law(AT_HEIGHT, HEIGHT), recommended(CERT)],
  "svc-fridge": [recommended(CERT)],
  "svc-washer": [recommended(CERT)],
  "svc-trainer": [recommended(CERT)],
  "svc-massage": [recommended(CERT)],
  "svc-haircut": [recommended(CERT)],
  "svc-nails": [recommended(CERT)],
  "svc-makeup": [recommended(CERT)],
  "svc-tutor": [recommended(CERT)],
};

/** Work outside the customer's home, where liability insurance is not customary. */
const NO_HOME_INSURANCE = new Set(["svc-courier", "svc-dog-walk", "svc-tutor", "svc-trainer"]);

export function documentRequirementsFor(pilotServiceId: string): DocumentRequirement[] {
  const rows = [...(BY_SERVICE[pilotServiceId] ?? [])];
  if (!NO_HOME_INSURANCE.has(pilotServiceId)) rows.push(recommended("INSURANCE:LIABILITY"));
  return rows;
}

export function documentInfoFor(requirement: string): DocumentInfo | null {
  return INFO[requirement] ?? null;
}

/** The "when needed" line of one service's requirement, if it has one. */
export function documentConditionHe(pilotServiceId: string, requirement: string): string | null {
  return BY_SERVICE[pilotServiceId]?.find((r) => r.requirement === requirement)?.whenHe ?? null;
}
