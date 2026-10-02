import {
  DEFAULT_VISIT_TERMS,
  pilotServiceById,
  pilotServiceIdForDatabaseCode,
  pricingKindOf,
  visitTermsHe,
  type PriceModel,
  type PricingKind,
  type ProJobDetailView,
  type VisitTermsHe,
} from "@pro-now/types";
import { ORDERER_FALLBACK_HE } from "@pro-now/ui";

/**
 * What the professional's job screen offers at the door (docs/18 ROADMAP,
 * 2026-09-29 "two kinds of work"; Dvir, 2026-10-02).
 *
 * On an ordinary visit-and-diagnosis job the app carries the visit fee and
 * nothing else: the repair is agreed and paid between the customer and the
 * professional, so "סיימתי את האבחון" ends the visit and asks the
 * customer to confirm. Only when the job was ordered for someone else is
 * the repair quoted in the app — the person at the door is not the one who
 * decides, so the quote goes to the person who ordered.
 */
export interface ProJobPlan {
  kind: PricingKind;
  visitTerms: VisitTermsHe;
  /** Finish the diagnosis — no quote in the app. */
  diagnosisOnly: boolean;
  /** Ordered for someone else: whose quote it is (the orderer's name). */
  quoteGoesToHe: string | null;
}

const KIND_BY_PRICE_MODEL: Record<PriceModel, PricingKind> = {
  VISIT_QUOTE: "VISIT",
  FIXED: "LIST",
  HOURLY: "HOURLY",
  DISTANCE_TIME: "DISTANCE",
};

export function proJobPlan(j: Pick<ProJobDetailView, "serviceCode" | "priceModel" | "onSiteNameHe" | "customerNameHe">): ProJobPlan {
  const pilotId = pilotServiceIdForDatabaseCode(j.serviceCode);
  const def = pilotId ? pilotServiceById[pilotId] : undefined;
  const kind = def ? pricingKindOf(def) : (KIND_BY_PRICE_MODEL[j.priceModel] ?? "VISIT");
  const visitTerms = def ? visitTermsHe(def) : DEFAULT_VISIT_TERMS;
  const forSomeoneElse = Boolean(j.onSiteNameHe);
  return {
    kind,
    visitTerms,
    diagnosisOnly: j.priceModel === "VISIT_QUOTE" && kind === "VISIT" && !forSomeoneElse,
    quoteGoesToHe: forSomeoneElse ? j.customerNameHe.trim() || ORDERER_FALLBACK_HE : null,
  };
}
