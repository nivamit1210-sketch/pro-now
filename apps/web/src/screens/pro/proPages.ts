import { documentInfoFor, formatMoney, money, pilotServiceIdForDatabaseCode, type PricingModel, type ProApplicationView, type ProEarningsView, type ProfessionalSummaryView, type ProPublicProfileView, type ProServiceEligibilityView } from "@pro-now/types";
import { catalogServicePages, type EarningDay, type EarningJob, type MarkName, type ProPricingRow, type ProProfileReviewItem, type ProProfileServiceItem, type ProServiceEligibility, type ShiftServiceChip, type VerificationStep } from "@pro-now/ui";

import { tradeCharacterFor } from "../../tradeCharacter";

/**
 * THE PROFESSIONAL'S FOUR TABS (the demo's, 2026-10-01), as routes.
 *
 * Each tab is its own address, so the phone's back goes to the tab before
 * and a refresh stays where it was. Pricing is not a tab: it opens from the
 * shift screen, as in the demo.
 */
export type ProTab = "shift" | "earnings" | "documents" | "profile";

export const PRO_TABS: ReadonlyArray<{ key: ProTab; path: string; labelHe: string; mark: "clock" | "wallet" | "shield" | "person" }> = [
  { key: "shift", path: "/pro", labelHe: "המשמרת", mark: "clock" },
  { key: "earnings", path: "/pro/earnings", labelHe: "הרווחים", mark: "wallet" },
  { key: "documents", path: "/pro/documents", labelHe: "המסמכים שלי", mark: "shield" },
  { key: "profile", path: "/pro/profile", labelHe: "הפרופיל", mark: "person" },
];

export type ProPage = ProTab | "pricing";

export function proPageFromPath(pathname: string): ProPage {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/pro/pricing") return "pricing";
  return PRO_TABS.find((t) => t.path === path)?.key ?? "shift";
}

/**
 * The account documents everyone gives (ProJoin's documents step). The ID
 * card and the face are not documents: they are the identity check (docs/10).
 */
export const ACCOUNT_DOCS: ReadonlyArray<{ kind: "TAX_FILE"; labelHe: string; noteHe: string }> = [
  { kind: "TAX_FILE", labelHe: "תיק עוסק", noteHe: "אישור עוסק פטור/מורשה או חברה" },
];

export function markFor(serviceCode: string): MarkName {
  const pilotId = pilotServiceIdForDatabaseCode(serviceCode);
  return ((pilotId && catalogServicePages[pilotId]?.mark) || "wrench") as MarkName;
}

/** The server's document/credential status, in the screen's vocabulary. Nothing on file is "not started". */
function stepState(status: string | null | undefined): VerificationStep["state"] {
  switch (status) {
    case "VERIFIED":
      return "VERIFIED";
    case "REJECTED":
      return "REJECTED";
    case "EXPIRED":
      return "EXPIRED";
    case null:
    case undefined:
      return "NOT_STARTED";
    default:
      return "IN_REVIEW";
  }
}

const ACTION_HE: Partial<Record<VerificationStep["state"], string>> = {
  NOT_STARTED: "עוד לא הועלה.",
  REJECTED: "נדחה — צריך להעלות מחדש.",
  EXPIRED: "פג תוקף — צריך להעלות מסמך בתוקף.",
};

/**
 * The identity check as one step, from the current check only. A retake or a
 * refusal is something to do, with the reviewer's own words.
 */
function identityStep(identity: ProApplicationView["identity"]): VerificationStep {
  const status = identity?.status ?? null;
  const state: VerificationStep["state"] = status === "VERIFIED" ? "VERIFIED" : status === "MANUAL_REVIEW" || status === "PENDING" ? "IN_REVIEW" : "NOT_STARTED";
  const reason = identity?.reasonHe ? `: ${identity.reasonHe}` : "";
  const actionHe =
    status === "RETAKE_REQUESTED" ? `ביקשנו לצלם שוב${reason}` : status === "REJECTED" ? `הבקשה לא אושרה${reason}` : state === "NOT_STARTED" ? "עוד לא צולם." : null;
  return { id: "identity", titleHe: "זהות", explainHe: "תעודת הזהות ושלוש תמונות פנים. אדם מצוות PRO NOW בודק אותן.", state, actionHe, gatesServicesHe: [] };
}

type RequirementCredential = ProApplicationView["services"][number]["requirements"][number]["credential"];

/**
 * Each requirement once. When several services share one, the first
 * requirement that has a credential speaks for it — its renewal flag with it.
 */
function requirementEntries(view: ProApplicationView): Map<string, { credential: RequirementCredential; renewalPending: boolean; mandatoryFor: string[] }> {
  const byRequirement = new Map<string, { credential: RequirementCredential; renewalPending: boolean; mandatoryFor: string[] }>();
  for (const s of view.services) {
    for (const r of s.requirements) {
      const entry = byRequirement.get(r.requirement) ?? { credential: r.credential, renewalPending: r.renewalPending, mandatoryFor: [] };
      if (entry.credential === null && r.credential) {
        entry.credential = r.credential;
        entry.renewalPending = r.renewalPending;
      }
      if (r.mandatory) entry.mandatoryFor.push(s.nameHe);
      byRequirement.set(r.requirement, entry);
    }
  }
  return byRequirement;
}

const ISRAEL_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });

/** The Israel calendar day of an instant, as DD/MM/YYYY and as a day number to count with. */
function israelDay(at: Date): { he: string; dayNumber: number } {
  const parts = ISRAEL_DAY.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const [d, m, y] = [get("day"), get("month"), get("year")];
  return { he: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`, dayNumber: Date.UTC(y, m - 1, d) / 86_400_000 };
}

/**
 * Until when a document holds, in the Israel calendar (docs/10 §Renewal):
 * soon is the last 30 days, expired is from its own day on.
 */
export function expiryNoteHe(expiresAt: string | null, noExpiry: boolean, now: Date): { validUntilHe: string | null; soon: boolean; expired: boolean } {
  if (noExpiry) return { validUntilHe: "ללא תוקף", soon: false, expired: false };
  if (!expiresAt) return { validUntilHe: null, soon: false, expired: false };
  const days = daysLeft(expiresAt, now)!;
  return { validUntilHe: `בתוקף עד ${israelDay(new Date(expiresAt)).he}`, soon: days > 0 && days <= 30, expired: days <= 0 };
}

function daysLeft(expiresAt: string | null, now: Date): number | null {
  return expiresAt ? israelDay(new Date(expiresAt)).dayNumber - israelDay(now).dayNumber : null;
}

function requirementActionHe(state: VerificationStep["state"], note: ReturnType<typeof expiryNoteHe>, renewalPending: boolean, daysUntil: number | null): string | null {
  if (renewalPending && (state === "VERIFIED" || state === "EXPIRED")) return "החידוש התקבל ונמצא בבדיקה";
  if (state === "VERIFIED" && note.soon && daysUntil !== null)
    return daysUntil === 1 ? "יפוג מחר — אפשר להעלות חידוש" : `יפוג בעוד ${daysUntil} ימים — אפשר להעלות חידוש`;
  return ACTION_HE[state] ?? null;
}

/**
 * The steps that may take a renewal now: expiring within 30 days or expired,
 * with no renewal already waiting. Kept beside the steps, not on them, so the
 * design system's step stays as it is.
 */
export function renewableStepIds(view: ProApplicationView, now: Date = new Date()): Set<string> {
  const ids = new Set<string>();
  for (const [requirement, e] of requirementEntries(view)) {
    if (!e.credential || e.renewalPending) continue;
    const note = expiryNoteHe(e.credential.expiresAt, e.credential.noExpiry, now);
    const verified = e.credential.status === "VERIFIED";
    if ((verified && (note.soon || note.expired)) || e.credential.status === "EXPIRED") ids.add(`req:${requirement}`);
  }
  return ids;
}

/** The steps whose renewal is already with the reviewers: an EXPIRED one among them takes no upload either. */
export function renewalPendingStepIds(view: ProApplicationView): Set<string> {
  const ids = new Set<string>();
  for (const [requirement, e] of requirementEntries(view)) if (e.credential && e.renewalPending) ids.add(`req:${requirement}`);
  return ids;
}

/**
 * "המסמכים שלי": the identity check, the account documents, then each service requirement once,
 * with the services it holds back. Every state is the server's; a document
 * the server has never seen is "not started", never assumed.
 */
export function verificationStepsFor(view: ProApplicationView, now: Date = new Date()): VerificationStep[] {
  const account = ACCOUNT_DOCS.map((d): VerificationStep => {
    const doc = view.documents.find((x) => x.kind === d.kind && x.status !== "REJECTED") ?? view.documents.find((x) => x.kind === d.kind);
    const state = stepState(doc?.status);
    return {
      id: `doc:${d.kind}`,
      titleHe: d.labelHe,
      explainHe: d.noteHe,
      state,
      actionHe: ACTION_HE[state] ?? null,
      gatesServicesHe: [],
    };
  });

  const credentials = [...requirementEntries(view).entries()].map(([requirement, e]): VerificationStep => {
    const info = documentInfoFor(requirement);
    const state = stepState(e.credential?.status);
    const note = expiryNoteHe(e.credential?.expiresAt ?? null, e.credential?.noExpiry ?? false, now);
    return {
      id: `req:${requirement}`,
      titleHe: info?.nameHe ?? "מסמך",
      explainHe: info?.checkHe ?? "",
      state,
      actionHe: requirementActionHe(state, note, e.renewalPending, daysLeft(e.credential?.expiresAt ?? null, now)),
      gatesServicesHe: [...new Set(e.mandatoryFor)],
      validUntilHe: note.validUntilHe,
    };
  });
  // An account approved before the identity check existed is not asked for
  // one: nobody reviews it until re-verification exists (docs/10).
  const identity = view.profile.verificationStatus === "APPROVED" && !view.identity ? [] : [identityStep(view.identity)];
  return [...identity, ...account, ...credentials];
}

function requirementsHe(requirements: string[]): string {
  return requirements.map((r) => documentInfoFor(r)?.nameHe ?? "מסמך").join(", ");
}

/** Why a service is not taking calls, in one line — the first of dispatch's own gates that stops it (a price is not one of them). */
export function blockedReasonHe(s: ProServiceEligibilityView): string | null {
  if (!s.accountApproved) return "החשבון עוד בבדיקה";
  if (!s.serviceApproved) return "השירות עוד בבדיקה";
  if (s.missing.length > 0) return `חסר: ${requirementsHe(s.missing)}`;
  if (s.expired.length > 0) return `פג תוקף: ${requirementsHe(s.expired)}`;
  if (s.unverified.length > 0) return `בבדיקה: ${requirementsHe(s.unverified)}`;
  return null;
}

export function eligibilityFor(services: ProServiceEligibilityView[]): ProServiceEligibility[] {
  return services.map((s) => {
    const blocked = blockedReasonHe(s);
    return { id: s.serviceId, nameHe: s.nameHe, mark: markFor(s.serviceCode), live: s.eligible && blocked === null, blockedByHe: blocked };
  });
}

export function shiftChipsFor(services: ProServiceEligibilityView[]): ShiftServiceChip[] {
  return eligibilityFor(services).map((e) => ({ id: e.id, nameHe: e.nameHe, mark: e.mark, live: e.live }));
}

export function pricingRowsFor(services: ProServiceEligibilityView[]): ProPricingRow[] {
  return services.map((s) => ({
    serviceId: s.serviceId,
    nameHe: s.nameHe,
    mark: markFor(s.serviceCode),
    pricingModel: s.priceModel as PricingModel,
    amountMinorUnits: s.basePriceMinorUnits,
  }));
}

const WEEKDAY_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/**
 * The earnings screen's props from the server's week.
 *
 * Paid directly (D1): there is no net. The days are drawn from what the
 * jobs came to, and each job's line is that amount — the screen is told
 * not to say "בחישוב" about money that was never ours to calculate.
 */
export function earningsPropsFor(view: ProEarningsView, now: Date = new Date()): {
  periodNetMinorUnits: number | null;
  periodGrossMinorUnits: number;
  periodJobCount: number;
  periodLabelHe: string;
  days: EarningDay[];
  jobs: EarningJob[];
  paidDirectly: boolean;
} {
  const b = view.breakdown;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const anyJob = b.days.some((d) => d.jobs > 0);
  return {
    periodNetMinorUnits: b.paidDirectly ? null : b.periodNetMinorUnits,
    periodGrossMinorUnits: b.periodGrossMinorUnits,
    periodJobCount: b.periodJobCount,
    periodLabelHe: "7 הימים האחרונים",
    days: anyJob
      ? b.days.map((d) => {
          const date = new Date(d.dateISO);
          return {
            labelHe: WEEKDAY_HE[date.getDay()] ?? "",
            netMinorUnits: b.paidDirectly ? (d.jobs > 0 ? d.grossMinorUnits : null) : d.netMinorUnits,
            jobs: d.jobs,
            isToday: date.getTime() === today.getTime(),
          };
        })
      : [],
    jobs: b.jobs.map((j) => ({
      id: j.jobId,
      serviceNameHe: j.serviceNameHe,
      mark: markFor(j.serviceCode),
      whenHe: new Date(j.completedAt).toLocaleString("he-IL", { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      grossMinorUnits: j.grossMinorUnits,
      deductions: j.deductions.map((d) => ({ labelHe: d.labelHe, minorUnits: d.minorUnits })),
      netMinorUnits: j.netMinorUnits,
    })),
    paidDirectly: b.paidDirectly,
  };
}

export const ils = (minor: number) => formatMoney(money(minor, "ILS"));

/** "לפני שבועיים": relative, so no exact date says who wrote a review. */
export function agoHe(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "היום";
  if (days < 2) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 14) return "לפני שבוע";
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  if (days < 60) return "לפני חודש";
  if (days < 365) return `לפני ${Math.floor(days / 30)} חודשים`;
  return days < 730 ? "לפני שנה" : `לפני ${Math.floor(days / 365)} שנים`;
}

/**
 * "ככה הלקוחות רואים אותך", from the server's own summary. A professional
 * who chose a drawn character is shown with it, as the customer's match
 * card does (D1); nothing is invented — no work photos, no "בתחום משנת",
 * no area name, none of which the product records.
 */
export function publicProfilePropsFor(view: ProPublicProfileView, now: Date = new Date()): {
  professional: ProfessionalSummaryView;
  services: ProProfileServiceItem[];
  reviews: ProProfileReviewItem[];
  fromPriceMinorUnits: number | null;
} {
  const prices = view.services.map((s) => s.basePriceMinorUnits).filter((p): p is number => p !== null && p > 0);
  return {
    professional: {
      ...view.professional,
      profilePhotoUrl:
        view.professional.portraitKind === "CHARACTER" ? tradeCharacterFor(view.services[0]?.serviceCode) : view.professional.profilePhotoUrl,
    },
    services: view.services.map((s) => ({
      id: s.serviceId,
      nameHe: s.nameHe,
      mark: markFor(s.serviceCode),
      priceHintHe: s.basePriceMinorUnits ? `מ־${ils(s.basePriceMinorUnits)}` : null,
    })),
    reviews: view.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      textHe: r.text,
      whenHe: agoHe(r.createdAt, now),
      reviewerLabelHe: r.reviewerLabelHe ?? "לקוח/ה",
      serviceNameHe: r.serviceNameHe,
    })),
    fromPriceMinorUnits: prices.length > 0 ? Math.min(...prices) : null,
  };
}
