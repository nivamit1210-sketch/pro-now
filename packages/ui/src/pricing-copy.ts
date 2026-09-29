import { DEFAULT_VISIT_TERMS, formatMoney, money, selfHe, type PriceQuoteView, type VisitTermsHe } from "@pro-now/types";

import { formatMinimumBillable } from "./format";

/**
 * Turns the structured price quote into Hebrew the customer can act on.
 * Kept as a pure function so each pricing model's wording is a testable
 * assertion rather than JSX buried in a branch.
 */
export function priceExplainer(
  price: PriceQuoteView,
  /**
   * `service` is the page before anybody is found. A visit fee is set by
   * each professional (Amit, 2026-09-26), so there it has no one figure —
   * a tester asked, of the number that used to sit there, *"של מי המחיר?
   * לבעלי המקצוע יש מחירים שונים."* It is shown on the person instead.
   */
  opts: { stage?: "service" | "match"; proFirstNameHe?: string | null; listFromMinorUnits?: number | null; quoteFirst?: boolean; terms?: VisitTermsHe } = {}
): { headline: string; detail: string } {
  const m = (v: number | null | undefined) =>
    v === null || v === undefined ? null : formatMoney(money(v, "ILS"));

  switch (price.priceModel) {
    case "FIXED": {
      /* A price list: each professional prices each kind of job (2026-09-29). */
      const from = m(opts.listFromMinorUnits ?? null);
      const total = m(price.fixedTotalMinorUnits);
      if (from) {
        return {
          headline: `מחירון · החל מ־${from}`,
          detail:
            "כל מקצוען קובע מחיר לכל סוג עבודה. בוחרים מה להזמין, רואים את המחיר שלו לפני שמאשרים — והסכום מאושר בכרטיס ועובר אליו רק אחרי שתאשרו שהעבודה הושלמה.",
        };
      }
      return {
        headline: total ?? "—",
        detail: total
          ? "מחיר לפי המחירון של המקצוען. הסכום מאושר בכרטיס ועובר אליו אחרי שתאשרו שהעבודה הושלמה."
          : "המחיר טרם הוגדר לשירות זה.",
      };
    }
    case "VISIT_QUOTE": {
      /* Priced before anybody sets off (Amit, 2026-09-29). */
      if (opts.quoteFirst) {
        return {
          headline: "הצעת מחיר לפני יציאה",
          detail:
            "מתארים ומצלמים. המקצוען מסתכל ושולח מחיר, ורק אחרי שתאשרו הוא יוצא. הסכום מאושר בכרטיס ועובר אליו אחרי שתאשרו שהעבודה הושלמה.",
        };
      }
      const t = opts.terms ?? DEFAULT_VISIT_TERMS;
      const the = t.feeHe.replace("דמי ביקור ו", "דמי הביקור וה");
      if (opts.stage === "service") {
        return {
          headline: "דמי ביקור לפי המקצוען",
          detail:
            `כל מקצוען קובע את ${the} שלו — ותראו אותם אצל מי שנמצא, לפני שאתם מאשרים. באפליקציה לא עובר כסף: את ${the} ואת ${selfHe(t.workHe)} משלמים ישירות למקצוען.`,
        };
      }
      const fee = m(price.visitFeeMinorUnits);
      const whose = opts.proFirstNameHe ? `${the} של ${opts.proFirstNameHe}.` : `${t.feeHe}.`;
      return {
        headline: fee ?? "—",
        detail: fee
          ? `${whose} באפליקציה לא עובר כסף: משלמים ישירות למקצוען, וגם את ${selfHe(t.workHe)} סוגרים מול המקצוען.`
          : "דמי הביקור טרם הוגדרו לשירות זה.",
      };
    }
    case "HOURLY": {
      const rate = m(price.hourlyRateMinorUnits);
      const min = formatMinimumBillable(price.minimumBillableMinutes);
      return {
        headline: rate ? `${rate} לשעה` : "—",
        detail: min
          ? `חיוב לפי זמן עבודה בפועל, עם מינימום של ${min}.`
          : "חיוב לפי זמן עבודה בפועל.",
      };
    }
    case "DISTANCE_TIME": {
      const base = m(price.baseMinorUnits);
      const perKm = m(price.perKmMinorUnits);
      const floor = m(price.minimumFareMinorUnits);
      return {
        headline: base ? `${base} + ${perKm ?? "—"} לק״מ` : "—",
        detail: floor ? `מחיר מינימום לנסיעה: ${floor}.` : "המחיר הסופי נקבע לפי המרחק בפועל.",
      };
    }
    default:
      return { headline: "—", detail: "מודל התמחור לשירות זה טרם הוגדר." };
  }
}
