import { documentInfoFor, formatMoney, money, pilotServiceIdForDatabaseCode, type PricingModel, type ProApplicationView, type ProEarningsView, type ProServiceEligibilityView } from "@pro-now/types";
import { catalogServicePages, type EarningDay, type EarningJob, type MarkName, type ProPricingRow, type ProServiceEligibility, type ShiftServiceChip, type VerificationStep } from "@pro-now/ui";

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

/** The account documents everyone gives (ProJoin's documents step). */
export const ACCOUNT_DOCS: ReadonlyArray<{ kind: "GOVERNMENT_ID" | "SELFIE" | "TAX_FILE"; labelHe: string; noteHe: string }> = [
  { kind: "GOVERNMENT_ID", labelHe: "תעודת זהות", noteHe: "צילום ברור של שני הצדדים, או של הרישיון" },
  { kind: "SELFIE", labelHe: "תמונת פנים", noteHe: "כדי לוודא שמי שמגיע הוא מי שנרשם" },
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
 * "המסמכים שלי": the account documents, then each service requirement once,
 * with the services it holds back. Every state is the server's; a document
 * the server has never seen is "not started", never assumed.
 */
export function verificationStepsFor(view: ProApplicationView): VerificationStep[] {
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

  const byRequirement = new Map<string, { status: string | null; mandatoryFor: string[] }>();
  for (const s of view.services) {
    for (const r of s.requirements) {
      const entry = byRequirement.get(r.requirement) ?? { status: r.credential?.status ?? null, mandatoryFor: [] };
      if (entry.status === null && r.credential) entry.status = r.credential.status;
      if (r.mandatory) entry.mandatoryFor.push(s.nameHe);
      byRequirement.set(r.requirement, entry);
    }
  }
  const credentials = [...byRequirement.entries()].map(([requirement, e]): VerificationStep => {
    const info = documentInfoFor(requirement);
    const state = stepState(e.status);
    return {
      id: `req:${requirement}`,
      titleHe: info?.nameHe ?? "מסמך",
      explainHe: info?.checkHe ?? "",
      state,
      actionHe: ACTION_HE[state] ?? null,
      gatesServicesHe: [...new Set(e.mandatoryFor)],
    };
  });
  return [...account, ...credentials];
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
