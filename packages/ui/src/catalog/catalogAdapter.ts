import { CUSTOMER_CATEGORIES, WORLD_DISTRICTS, pricingKindOf, visitTermsHe, type DepartmentCode } from "@pro-now/types";
import { lowestListed, previewPriceLists } from "./priceLists";
import type { ProPricingRow } from "../screens/ProPricingBody";
import {
  allServices,
  browseOnly,
  pilotCatalog,
  pilotMarket,
  pilotServiceById,
  resolveMarket,
  type CatalogServiceDef,
  type CredentialKind,
  type PriceQuoteView,
} from "@pro-now/types";
import type { MarkName } from "../components/marks";
import type { CategoryServiceItem } from "../screens/CategoryBody";
import type { HomeServiceItem } from "../screens/CustomerHomeBody";
import type { ServiceDetailBodyProps } from "../screens/ServiceDetailBody";
import type { ProServiceEligibility } from "../screens/ProVerificationBody";
import type { ProServiceToggle } from "../screens/ProOnlineBody";

/**
 * One catalogue, read by every screen — including the real app.
 *
 * ---------------------------------------------------------------------
 * WHY THIS MOVED OUT OF THE GALLERY
 * ---------------------------------------------------------------------
 * It lived in `tools/design-preview`, which `/CLAUDE.md §8` calls a
 * developer-only browser gallery and not a shipping target. So the one
 * place that knew how to turn a catalogue row into something a screen can
 * render was the one place a shipping app could not import from, and
 * `apps/customer-mobile` had grown its own hand-written home grid instead
 * — which is how the app people install ended up showing different
 * services, in a different order, from the app we review.
 *
 * Presentation mapping is exactly what `packages/ui` is for.
 *
 * Before this file existed the home grid, the service page, the sentence
 * matcher and the professional's eligibility list each carried their own
 * hand-written copy of "the services". They had already drifted: the matcher
 * could route "סתימה" to a service the home grid did not show, and the
 * professional's toggles named trades the customer could not request. None
 * of that is a bug anyone reports — it is just an app that quietly
 * contradicts itself.
 *
 * So the prototype now derives all four from `pilotCatalog`. Adding a
 * service is one entry in one file; forgetting to add it to a screen is no
 * longer possible.
 *
 * WHAT STAYS OUT OF THE CATALOGUE, ON PURPOSE:
 *
 * Prices. The catalogue says HOW a service is priced (`pricingModel`) and
 * never how much, because a number written beside a service definition gets
 * read as a promise, and the only system allowed to make that promise is the
 * pricing engine on the server. The preview numbers below are therefore
 * kept here, in the fixtures layer, where they are visibly demo data.
 */

// ---------------------------------------------------------------------
// Preview-only pricing
// ---------------------------------------------------------------------

/**
 * Demo amounts. NOT a price list — no commercial decision has been made
 * (/CLAUDE.md §4), and these exist so the pricing copy has something to
 * render. A service missing from this table renders as "—" and the copy
 * says the price has not been set, which is the real state until it is.
 */
const previewPrices: Record<string, PriceQuoteView> = {
  "svc-garden": { priceModel: "VISIT_QUOTE", currency: "ILS" },
  "svc-paint": { priceModel: "VISIT_QUOTE", currency: "ILS" },
  "svc-towing": { priceModel: "VISIT_QUOTE", currency: "ILS" },
  "svc-clean-reno": { priceModel: "VISIT_QUOTE", currency: "ILS" },
  "svc-blockage": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 },
  "svc-leak": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 },
  "svc-tap": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 },
  "svc-electric": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 19900 },
  "svc-socket": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 19900 },
  "svc-lock": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 25000 },
  "svc-cylinder": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 39000 },
  "svc-ac": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 19900 },
  "svc-fridge": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 18900 },
  "svc-washer": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 18900 },
  "svc-clean": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 28500 },
  "svc-pest": { priceModel: "VISIT_QUOTE", currency: "ILS" },
  // The person-services. Fixed prices, because "how much is a haircut" is a
  // question with an answer — and a VISIT_QUOTE on a haircut would be the
  // clearest possible sign we pasted the plumbing model onto a person.
  "svc-haircut": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 9000 },
  "svc-makeup": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 30000 },
  "svc-dog-walk": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 4500 },
  "svc-pet-groom": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 15000 },
  "svc-pet-sit": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 12000 },
  "svc-doctor": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 45000 },
  "svc-jump-start": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 14900 },
  "svc-flat-tyre": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 18000 },
  "svc-car-lockout": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 25000 },
  "svc-phone-fix": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 14900 },
  "svc-furniture": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 35000 },
  "svc-curtains": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 20000 },
  "svc-tv": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 25000 },
  "svc-nails": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 12000 },
  "svc-massage": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 24000 },
  "svc-trainer": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 22000 },
  "svc-tutor": { priceModel: "FIXED", currency: "ILS", fixedTotalMinorUnits: 15000 },
  "svc-handyman": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 15900 },
  "svc-hands": {
    priceModel: "HOURLY",
    currency: "ILS",
    hourlyRateMinorUnits: 11000,
    minimumBillableMinutes: 60,
  },
  "svc-courier": {
    priceModel: "DISTANCE_TIME",
    currency: "ILS",
    baseMinorUnits: 2900,
    perKmMinorUnits: 450,
    minimumFareMinorUnits: 3900,
  },
  "svc-moving": { priceModel: "VISIT_QUOTE", currency: "ILS" },
  /* Example visit fees for every trade priced only once somebody looks — each professional sets his own. */
  "svc-gas": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 19900 },
  "svc-vet": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 25000 },
  "svc-computer": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 14900 },
  "svc-tiling": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 15000 },
  "svc-drywall": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 15000 },
  "svc-carpentry": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 15000 },
  "svc-glass": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 15900 },
  "svc-alarm": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 },
  "svc-sealing": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 },
  "svc-solar": { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 17900 },
};

function priceFor(s: CatalogServiceDef): PriceQuoteView {
  return previewPrices[s.id] ?? { priceModel: s.pricingModel, currency: "ILS" };
}

/** The one-line hint under a tile. Says the model, never invents a figure. */
function priceHint(s: CatalogServiceDef): string {
  const p = previewPrices[s.id];
  switch (s.pricingModel) {
    case "FIXED":
      /* A price list: the tile says where it starts. */
      if (previewPriceLists[s.id]) return `מחירון · החל מ־₪${(lowestListed(s.id) ?? 0) / 100}`;
      return p?.fixedTotalMinorUnits ? `מחיר קבוע ₪${p.fixedTotalMinorUnits / 100}` : "מחיר קבוע";
    case "VISIT_QUOTE":
      /* Each professional sets their own visit fee (2026-09-26), so a
         tile has no one figure to show. */
      return s.quoteBeforeDispatch ? "הצעת מחיר לפני יציאה" : "דמי ביקור לפי המקצוען";
    case "HOURLY":
      return p?.hourlyRateMinorUnits ? `₪${p.hourlyRateMinorUnits / 100} לשעה` : "תעריף שעתי";
    case "DISTANCE_TIME":
      return "לפי מרחק";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------
// Credentials, in words a customer can judge
// ---------------------------------------------------------------------

/**
 * The service page lists what was verified. It has to be readable by someone
 * who has never heard the word "credential", because the whole promise of
 * this product is that the person at the door was checked — and a promise
 * nobody can parse is not a promise.
 */
const credentialHe: Record<CredentialKind, string> = {
  IDENTITY: "זהות מאומתת",
  IDENTITY_ENHANCED: "זהות מאומתת באימות מוגבר",
  BUSINESS: "עוסק מורשה פעיל",
  LIABILITY_INSURANCE: "ביטוח צד ג׳ בתוקף",
  ELECTRICIAN_LICENSE: "רישיון חשמלאי בתוקף",
  GAS_LICENSE: "רישיון גז בתוקף",
  PEST_CONTROL_LICENSE: "היתר הדברה בתוקף",
  DRIVING_LICENSE: "רישיון נהיגה בתוקף",
  VEHICLE_INSURANCE: "ביטוח רכב בתוקף",
  PROPERTY_LINK_POLICY: "נוהל אימות זיקה לנכס",
  VEHICLE_LINK_POLICY: "נוהל אימות בעלות על הרכב",
  MEDICAL_LICENSE: "רישיון לעסוק ברפואה בתוקף",
  VETERINARY_LICENSE: "רישיון וטרינר בתוקף",
  PROFESSIONAL_CERTIFICATE: "תעודה מקצועית בתחום",
  BACKGROUND_CHECK: "בדיקת רקע",
};

export function credentialsHe(s: CatalogServiceDef): string[] {
  return s.requiredCredentials.map((c) => credentialHe[c]);
}

// ---------------------------------------------------------------------
// What each screen needs
// ---------------------------------------------------------------------

/**
 * THE HOME GRID SHOWS THE MARKET, NOT THE CATALOGUE.
 *
 * `dispatchableNow(pilotCatalog)` is "everything the product can do"; this
 * is "everything we can actually answer here, today". They are different
 * numbers and the customer must only ever see the second one. Fourteen
 * tiles where six find somebody does not read as a big catalogue — it reads
 * as a broken app.
 */
const marketSet = resolveMarket(pilotCatalog, pilotMarket);
const live = marketSet.live;
/**
 * Below the fold: the scheduled trades, and the dispatchable services that
 * simply are not open in this market yet. Both are browse-only here, but for
 * different reasons, and the UI keeps the two apart so it never tells
 * someone that a locksmith is "not urgent" when the truth is "not here yet".
 */
const browse = [...marketSet.notInThisMarket, ...browseOnly(pilotCatalog)];

/**
 * The home grid: everything dispatchable now, then the scheduled trades.
 *
 * `availableNowCount: null` everywhere on purpose. The live snapshot is the
 * only thing allowed to put a number on this screen, and a fallback count
 * baked into a fixture is exactly how the stale-number bug came back the
 * first time (see `home-supply.ts`).
 */
const departmentOf: Record<string, string> = Object.fromEntries(
  pilotCatalog.flatMap((d) => d.categories.flatMap((c) => c.services.map((s) => [s.id, d.nameHe])))
);

/**
 * WHICH DEPARTMENT A MARK BELONGS TO.
 *
 * A mark — "electrical", "plumbing" — is what a call carries when it is
 * summarised for a list or a capsule, and a department is what the world
 * knows about: it is the department that owns a district, a street and a
 * drawn professional. Nothing connected the two, so a screen holding only
 * a mark could not reach any of that.
 *
 * Built from the catalogue rather than typed out, so a mark that moves
 * department moves here with it. First service wins, which is right
 * because a mark is chosen per department in the first place.
 */
export const departmentCodeByMark: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const d of pilotCatalog) {
    for (const c of d.categories) {
      for (const sv of c.services) {
        if (!(sv.mark in out)) out[sv.mark] = d.code;
      }
    }
  }
  return out;
})();

const notInMarketIds = new Set(marketSet.notInThisMarket.map((s) => s.id));

/**
 * A mark per department, chosen for the department.
 *
 * Deriving it from the first service in the tree put a spanner on
 * "אנשים שמגיעים אליך", because that department lists the handyman first —
 * a wrench standing in for a personal trainer and a massage therapist.
 */
const departmentMarks: Record<string, MarkName> = {
  HOME_URGENT: "plumbing",
  PEOPLE: "fitness",
  HOME_CARE: "cleaning",
  LOGISTICS: "moving",
  IMPROVEMENT: "painting",
};

const departmentMarkOf: Record<string, MarkName> = Object.fromEntries(
  pilotCatalog.flatMap((d) =>
    d.categories.flatMap((c) =>
      c.services.map((s) => [s.id, departmentMarks[d.code] ?? (s.mark as MarkName)])
    )
  )
);

function toHomeItem(s: CatalogServiceDef): HomeServiceItem {
  return {
  id: s.id,
  nameHe: s.nameHe,
  mark: s.mark as MarkName,
  photoSubject: s.photoSubjectHe,
  descriptionHe: s.descriptionHe,
  departmentHe: departmentOf[s.id] ?? null,
  departmentMark: departmentMarkOf[s.id] ?? null,
  /*
   * The two "not now" reasons, kept apart all the way to the row that
   * renders them. Collapsing them here would be invisible and would make
   * the app tell a customer that a locksmith is "planned work" when the
   * truth is that we have not signed one up in their city.
   */
  comingSoon: s.activationStatus === "PILOT" && s.fulfillmentProfile !== "SCHEDULED_ONLY",
  scheduledOnly: s.fulfillmentProfile === "SCHEDULED_ONLY",
  notInMarket: notInMarketIds.has(s.id),
  availableNowCount: null,
  priceHint: priceHint(s),
  };
}

export const catalogHomeServices: HomeServiceItem[] = [...live, ...browse].map(toHomeItem);

/**
 * The services the customer lists leave out (INACTIVE: gas, doctor, vet,
 * towing), for a DEMONSTRATION that shows every part of the product — see
 * `demoOpenServiceIds`. Never part of the real lists.
 */
export const catalogHiddenServices: HomeServiceItem[] = allServices(pilotCatalog)
  .filter((s) => !catalogHomeServices.some((h) => h.id === s.id))
  .map(toHomeItem);

/** Only the NOW services, for the compact "what can I get right now" grid. */
export const catalogNowServices: HomeServiceItem[] = catalogHomeServices.filter((s) =>
  live.some((l) => l.id === s.id)
);

/**
 * "מה כלול / מה לא כלול" is generated from the pricing model rather than
 * written per service, because the dispute this section prevents is always
 * the same dispute and it is always about the pricing model.
 */
function included(s: CatalogServiceDef): string[] {
  const v = visitTermsHe(s);
  switch (pricingKindOf(s)) {
    case "QUOTE_FIRST":
      return ["המחיר שאישרתם מראש — לא משתנה בסוף", "הגעה עד הכתובת שנתתם", "בעל מקצוע מאומת לשירות הזה"];
    case "VISIT":
      return ["הגעה עד הכתובת שנתתם", v.checkHe, "בעל מקצוע מאומת לשירות הזה"];
    case "LIST":
      return ["הגעה עד הכתובת שנתתם", "מה שבחרתם מהמחירון, במחיר שראיתם", "בעל מקצוע מאומת לשירות הזה"];
    case "HOURLY":
      return ["הגעה עד הכתובת שנתתם", "עזרה בכל מה שצריך, לפי שעה", "חיוב לפי זמן עבודה בפועל"];
    case "DISTANCE":
      return ["איסוף מהכתובת שנתתם", "מסירה בכתובת היעד", "מחיר לפי מרחק בפועל"];
  }
}

/* Services on a price list whose work can need a part the list does not cover. */
const LIST_WITH_PARTS = new Set(["svc-lock", "svc-cylinder", "svc-car-lockout", "svc-flat-tyre", "svc-furniture", "svc-tv", "svc-curtains"]);

function notIncluded(s: CatalogServiceDef): string[] {
  const v = visitTermsHe(s);
  switch (pricingKindOf(s)) {
    case "QUOTE_FIRST":
      return ["עבודה נוספת מעבר להצעה — רק באישור שלכם"];
    case "VISIT":
      return [`${v.workHe} עצמו — המחיר והתשלום נסגרים ישירות מול בעל המקצוע`.replace("העבודה עצמו", "העבודה עצמה"), v.partsHe];
    case "LIST":
      return LIST_WITH_PARTS.has(s.id)
        ? ["חלקים שאינם במחירון — רק באישור שלכם", "עבודה נוספת מעבר למה שבחרתם"]
        : ["עבודה נוספת מעבר למה שבחרתם — רק באישור שלכם"];
    case "HOURLY":
      return ["חומרים וציוד", "פינוי פסולת בנפח גדול"];
    case "DISTANCE":
      return ["אריזה ופירוק", "העלאה בקומות ללא מעלית — תוספת מראש"];
  }
}

export type ServicePage = Omit<ServiceDetailBodyProps, "width" | "height">;

/**
 * Which department a service belongs to.
 *
 * Needed because the Living Map's world is chosen by department, and a
 * service alone does not know its own — the tree does. Derived here rather
 * than duplicated into each service, so adding a service to a department is
 * still one edit.
 */
export const departmentCodeByServiceId: Record<string, DepartmentCode> = (() => {
  // Built with an explicit loop rather than `Object.fromEntries`, whose
  // return type is always `{[k: string]: T}` with T widened to `string`.
  // The widening is what let a department code reach the world as a plain
  // string, which is how a caller ended up having to assert it back.
  const out: Record<string, DepartmentCode> = {};
  for (const d of pilotCatalog) {
    for (const c of d.categories) {
      for (const s of c.services) out[s.id] = d.code;
    }
  }
  return out;
})();

/**
 * Which trade a service actually belongs to, in Hebrew.
 *
 * This exists because of a real bug. The Living Map drew its candidates
 * from `personFitCandidates`, which is a barber fixture, for EVERY service
 * — so asking for "נזילה או דליפת מים" produced a match headed
 * "ספרית עד הבית · תספורות ועיצוב". Nothing about the screen was wrong;
 * the data underneath it had no connection to the request.
 *
 * A demo professional may be obviously a placeholder. It may not practise
 * the wrong trade, because that is not a placeholder — it is a wrong
 * answer rendered convincingly.
 */
export const categoryNameByServiceId: Record<string, string> = Object.fromEntries(
  pilotCatalog.flatMap((d) => d.categories.flatMap((c) => c.services.map((s) => [s.id, c.nameHe])))
);

/** Every service gets a real page. None is a fallback to the plumbing one. */
export const catalogServicePages: Record<string, ServicePage> = Object.fromEntries(
  allServices(pilotCatalog).map((s) => [
    s.id,
    {
      nameHe: s.nameHe,
      mark: s.mark as MarkName,
      photoSubject: s.photoSubjectHe,
      descriptionHe: s.descriptionHe,
      symptomsHe: s.symptomsHe,
      includedHe: included(s),
      notIncludedHe: notIncluded(s),
      price: priceFor(s),
      availableNowCount: null,
      requiredCredentialsHe: credentialsHe(s),
      /* INACTIVE too: a licensed service nobody has signed up for is not
         something to dispatch just because its supply is unknown. */
      comingSoon:
        (s.activationStatus === "PILOT" && s.fulfillmentProfile !== "SCHEDULED_ONLY") ||
        s.activationStatus === "INACTIVE",
      scheduledOnly: s.fulfillmentProfile === "SCHEDULED_ONLY",
      quoteBeforeDispatch: s.quoteBeforeDispatch ?? false,
      visitTerms: visitTermsHe(s),
    } satisfies ServicePage,
  ])
);

/**
 * The sentence matcher's rules, taken straight from the catalogue.
 *
 * This is the drift that mattered most. A keyword list maintained apart from
 * the catalogue guarantees that sooner or later someone types a real problem
 * and the app routes them to a service that is no longer offered — or to
 * nothing at all, while the service sits right there on the home screen.
 */
/**
 * Every service a DEMONSTRATION opens although it is not open for real.
 *
 * Amit, 2026-09-27: *"שיהיה אפשר לעשות הדגמה על כל חלקי האפליקציה — שלא
 * יבחרו משהו לדוגמה ואז לא יעבוד."* So the preview dispatches every
 * service now. The catalogue is unchanged: which checks a pilot service
 * needs is still an open decision (/CLAUDE.md §4), booked-for-later work
 * waits for the next stage, and licensed services wait for their licences.
 */
export const demoOpenServiceIds: ReadonlySet<string> = new Set(
  allServices(pilotCatalog)
    .filter((s) => s.activationStatus !== "ACTIVE")
    .map((s) => s.id)
);

/**
 * Every service is searchable, open or not. "נחנק לי החתול" found nothing
 * while the vet was marked coming-soon, and "we did not understand" is a
 * worse answer than the true one: the right service, with its state beside
 * it ("בקרוב"). The customer learns what exists; nothing is dispatched to a
 * service that is not open, because that is decided on the service page.
 */
/** Moved to `@pro-now/types` with the matcher (docs/21 W5). */
export { catalogMatchRules } from "@pro-now/types";

/**
 * The professional's side, derived from the same tree: which services a
 * given set of verified credentials actually unlocks, and why the others are
 * closed. The reason is generated from the missing credential, so it can
 * never say "renew your licence" about a service that never needed one.
 */
/**
 * THE DEMO PROFESSIONAL IS ONE TRADE, NOT ALL OF THEM.
 *
 * This list used to be "every live service", which put פתיחת סתימות and
 * עבודות חשמל on the same person — and Amit spotted it immediately, because
 * no plumber in Israel is also a licensed electrician. It was not a fixture
 * detail. It quietly taught the whole screen the wrong idea: that a
 * professional is a generalist who ticks boxes, rather than a tradesperson
 * with one trade and a licence to prove it.
 *
 * A professional APPLIES for the services in their trade. Verification then
 * decides which of those they may actually be dispatched for. Two different
 * things, and both have to be visible, which is why this is a list of
 * applied services rather than a list of everything.
 */
export const DEMO_PRO_TRADE_HE = "אינסטלציה";

export const DEMO_PRO_SERVICE_IDS = [
  "svc-leak",
  "svc-blockage",
  "svc-tap",
  // Water heaters are plumbing work here, not electrical work. It is the
  // one adjacent service a plumber genuinely does — and it is SCHEDULED_ONLY,
  // so it shows how a service can be armed without being a NOW service.
  "svc-solar",
] as const;

function appliedServices(ids: readonly string[]): CatalogServiceDef[] {
  return ids.map((id) => pilotServiceById[id]).filter((s): s is CatalogServiceDef => Boolean(s));
}

export function togglesFor(
  verified: CredentialKind[],
  ids: readonly string[] = DEMO_PRO_SERVICE_IDS
): ProServiceToggle[] {
  const have = new Set(verified);
  return appliedServices(ids).map((s) => {
    const missing = s.requiredCredentials.filter((c) => !have.has(c));
    return {
      id: s.id,
      nameHe: s.nameHe,
      mark: s.mark as MarkName,
      enabled: missing.length === 0,
      blockedReasonHe:
        missing.length === 0
          ? undefined
          : `כדי לקבל קריאות בשירות הזה חסר: ${missing.map((c) => credentialHe[c]).join(" · ")}`,
    };
  });
}

export function eligibilityFor(
  verified: CredentialKind[],
  ids: readonly string[] = DEMO_PRO_SERVICE_IDS
): ProServiceEligibility[] {
  const have = new Set(verified);
  return appliedServices(ids).map((s) => {
    const missing = s.requiredCredentials.filter((c) => !have.has(c));
    return {
      id: s.id,
      nameHe: s.nameHe,
      mark: s.mark as MarkName,
      live: missing.length === 0,
      blockedByHe:
        missing.length === 0 ? null : `חסר: ${missing.map((c) => credentialHe[c]).join(" · ")}`,
    };
  });
}

/**
 * What a customer photograph would be of, per service — null where a
 * photograph does not apply. Undefined for an unknown id, which the capture
 * surface reads as "we do not know yet" rather than as "no".
 */
export const photoPromptFor = (serviceId: string): string | null | undefined =>
  pilotServiceById[serviceId]?.customerPhotoPromptHe;

/** True when the customer confirms the person rather than being assigned one. */
export const isPersonFit = (serviceId: string): boolean =>
  pilotServiceById[serviceId]?.matchingMode === "PERSON_FIT" &&
  /* The drawn candidates are hairdressers; nails, a vet or a tutor never get them. */
  serviceId === "svc-haircut";

/**
 * Preview data for the personal-match screen.
 *
 * DELIBERATELY OBVIOUS PLACEHOLDERS. The portraits are illustrated, the
 * names say "תצוגה", the portfolio images have no files and render as
 * captioned placeholders — so a screenshot of this screen can never be
 * mistaken for a real professional offering real work (/CLAUDE.md §3). The
 * SHAPE is the point: what a customer needs to see before letting someone
 * into their home, and in what order.
 */
export type DemoCandidate = {
  /**
   * The illustrated figure for this trade, from `WORLD_DISTRICTS`.
   *
   * Optional because the hand-written person-fit fixtures below predate
   * it. Absent means the screen falls back to a generated `Persona`,
   * which is what every demo professional used to get — Amit on seeing
   * one: *"הפרצוף המפגר הזה. תשתמש במה שיצרנו."*
   */
  photoAssetId?: string;
  seed: string;
  displayNameHe: string;
  headlineHe: string;
  specialtiesHe: string[];
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number;
  portfolio: { id: string; uri: string | null; captionHe: string }[];
};

export const personFitCandidates: DemoCandidate[] = [
  {
    seed: "pro_barber_1",
    displayNameHe: "דוגמה ט׳",
    headlineHe: "ספרית עד הבית · תספורות ועיצוב",
    specialtiesHe: ["תספורת גבר", "עיצוב זקן", "פייד"],
    ratingAverage: 4.8,
    ratingCount: 63,
    completedJobs: 91,
    portfolio: [
      { id: "w1", uri: null, captionHe: "פייד קצר · אחרי" },
      { id: "w2", uri: null, captionHe: "תספורת ועיצוב זקן" },
      { id: "w3", uri: null, captionHe: "תספורת ילד" },
    ],
  },
  {
    seed: "pro_barber_2",
    displayNameHe: "דוגמה י׳",
    headlineHe: "ספרית עד הבית · נשים וילדים",
    specialtiesHe: ["תספורת אישה", "פן", "תספורת ילדים"],
    // No average yet, and the screen says "חדש ב-PRO NOW" rather than
    // inventing one. A single review is not a reputation.
    ratingAverage: null,
    ratingCount: 0,
    completedJobs: 4,
    portfolio: [
      { id: "w1", uri: null, captionHe: "תספורת שכבות" },
      { id: "w2", uri: null, captionHe: "פן לאירוע" },
    ],
  },
  {
    seed: "pro_barber_3",
    displayNameHe: "דוגמה י״א",
    headlineHe: "ספר עד הבית · גברים וילדים",
    specialtiesHe: ["תספורת גבר", "מכונה", "עד הבית בערב"],
    ratingAverage: 4.6,
    ratingCount: 21,
    completedJobs: 27,
    portfolio: [{ id: "w1", uri: null, captionHe: "תספורת מכונה" }],
  },
];

/**
 * The candidates the Living Map shows, for whatever was actually asked for.
 *
 * PERSON_FIT services choose a person, and for those the barber fixtures
 * above are the right shape — a portfolio, specialties, the things you
 * weigh when picking who comes to cut your hair. Everything else is
 * FASTEST_ELIGIBLE: the trade is what matters, so the demo professional is
 * labelled with the service's own category and nothing more.
 *
 * Names stay marked "תצוגה" in both branches. The fix is that the trade is
 * now true even when the person is not.
 */
export function demoCandidatesFor(serviceId: string, count = 3): DemoCandidate[] {
  if (isPersonFit(serviceId)) return personFitCandidates.slice(0, count);

  const trade = categoryNameByServiceId[serviceId] ?? "בעל מקצוע";
  /*
   * ---------------------------------------------------------------------
   * NAMES, NOT SERIAL NUMBERS
   * ---------------------------------------------------------------------
   * Amit: *"די עם הדוגמא ט והפרצוף המפגר הזה. תשתמש במה שיצרנו."*
   *
   * These were "דוגמה ט׳", "דוגמה י׳", "דוגמה י״א" — Hebrew letters used
   * as numerals, so the street read as Example 9, Example 10, Example 11.
   * A person's shopfront with a serial number over the door is the exact
   * thing that stops a world reading as a place.
   *
   * The "(תצוגה)" that followed every name was removed by Amit's decision
   * (2026-09-29, with the design review): the preview says it is a
   * demonstration once, in the demo bar and on the welcome, instead of in
   * every sentence that names somebody.
   */
  const names = ["יוסי", "מאיה", "איתי", "נועה", "רון", "שירה"];
  return Array.from({ length: count }, (_, i) => ({
    seed: `pro_${serviceId}_${i}`,
    displayNameHe: `${names[i % names.length]}`,
    headlineHe: trade,
    /*
     * THE FIGURE WE ALREADY DREW FOR THIS TRADE.
     *
     * The profile fell back to `Persona`, a generated cartoon, while
     * eleven illustrated professionals — a plumber, a hairdresser, a
     * vet — have been sitting in the asset folder since the world was
     * built. Amit: *"תשתמש במה שיצרנו."*
     *
     * Its own trade's figure, so opening a plumber's shop shows a
     * plumber. `departmentCodeByServiceId` already knows which, and
     * `WORLD_DISTRICTS` already names the file.
     */
    photoAssetId: WORLD_DISTRICTS[departmentCodeByServiceId[serviceId] ?? "HOME_URGENT"]
      ?.characterWorldAssetId,
    specialtiesHe: [],
    // No invented reputation. The screen shows a rating row only when a
    // real one exists, and in the prototype it never does.
    ratingAverage: null,
    ratingCount: 0,
    completedJobs: 0,
    portfolio: [],
  }));
}

/**
 * WHY THIS MATCH — assembled from facts, never from a score.
 *
 * Each reason has to be something the server could stand behind: a declared
 * specialty that matches what the customer actually asked for, presence
 * right now, the real distance. Nothing here is a judgement about the
 * person, and nothing is a percentage. The screen explains the match
 * instead of asserting one — which is also the only version of "AI" this
 * product can honestly show today.
 *
 * A reason with no supporting fact is simply not produced, so a thin match
 * shows one line rather than three invented ones.
 */
type Reason = {
  id: string;
  textHe: string;
  detailHe?: string | null;
  kind: "SKILL" | "LIVE" | "DISTANCE" | "HISTORY";
};

/**
 * Why this person, as a claim plus the fact underneath it.
 *
 * These were four short phrases joined by dots, and the design review read
 * them as telemetry rather than as an introduction: "פתאום אנחנו מספרים
 * סיפור במקום להציג telemetry". A claim on one line and its evidence on
 * the next is the same information and a different act — the first is a
 * dashboard, the second is someone telling you why they picked this person.
 *
 * Every field is derived from something the server knows. No score, no
 * percentage, nothing about "the algorithm" — a match confidence number
 * would be exactly the fabricated capability /CLAUDE.md §3 forbids, and it
 * is the single most tempting thing to put on this screen.
 *
 * Three, at most. The screen renders `slice(0, 3)` and a fourth reason
 * simply never appears, so the ordering here is the priority: what they
 * asked for, then whether it can happen now, then how far, then history.
 */
export function matchReasons(args: {
  specialtiesHe: string[];
  /** What the customer chose or typed, lower-cased by the caller. */
  askedForHe: string[];
  onlineNow: boolean;
  etaMinutes: number | null;
  completedJobs: number;
  ratingAverage?: number | null;
  ratingCount?: number;
  serviceNameHe?: string | null;
}): Reason[] {
  const out: Reason[] = [];

  // A specialty counts only when the customer actually mentioned it.
  const hit = args.specialtiesHe.find((sp) =>
    args.askedForHe.some((a) => a.includes(sp) || sp.includes(a))
  );
  if (hit) {
    out.push({
      id: "skill",
      textHe: "מתמחה בדיוק במה שביקשתם",
      detailHe: args.serviceNameHe ? `${hit} · ${args.serviceNameHe}` : hit,
      kind: "SKILL",
    });
  }

  if (args.onlineNow) {
    out.push({
      id: "live",
      textHe: "פנויה עכשיו וקרובה אליכם",
      detailHe:
        typeof args.etaMinutes === "number"
          ? `הגעה משוערת בעוד ${args.etaMinutes} דקות`
          : "במשמרת ברגע זה",
      kind: "LIVE",
    });
  } else if (typeof args.etaMinutes === "number") {
    out.push({
      id: "distance",
      textHe: "קרובה אליכם",
      detailHe: `הגעה משוערת בעוד ${args.etaMinutes} דקות`,
      kind: "DISTANCE",
    });
  }

  /*
   * History is a reason only when there is enough of it to mean something.
   * Twenty-five is where a completion count stops being an anecdote — and
   * the rating rides along only if it has a count behind it, because "5.0"
   * from two customers is a weaker claim than "4.9" from a hundred and the
   * screen must not let it look stronger.
   */
  if (args.completedJobs >= 25) {
    const rated =
      typeof args.ratingAverage === "number" && (args.ratingCount ?? 0) >= 10
        ? `★${args.ratingAverage.toFixed(1)} מ-${args.ratingCount} לקוחות שקיבלו ממנה שירות`
        : null;
    out.push({
      id: "history",
      textHe: `כבר עשתה ${args.completedJobs} עבודות ב-PRO NOW`,
      detailHe: rated,
      kind: "HISTORY",
    });
  }

  return out;
}

export { pilotServiceById };

/**
 * The professional's price rows, built from the same applied services the
 * toggles are built from.
 *
 * The pricing MODEL comes from the catalogue rather than from a fixture:
 * what a professional is asked to type is a property of the service, and a
 * fixture that decided it here would drift from the service page the
 * customer reads. The AMOUNTS start null — nobody has set a price yet,
 * which is the true state of a marketplace that has not opened, and is a
 * different thing from free.
 */
export function pricingRowsFor(
  verified: CredentialKind[],
  ids: readonly string[] = DEMO_PRO_SERVICE_IDS
): ProPricingRow[] {
  const have = new Set(verified);
  return appliedServices(ids).map((s) => {
    const missing = s.requiredCredentials.filter((c) => !have.has(c));
    return {
      serviceId: s.id,
      nameHe: s.nameHe,
      mark: s.mark as MarkName,
      pricingModel: s.pricingModel,
      amountMinorUnits: null,
      blockedReasonHe:
        missing.length === 0
          ? null
          : `גם אחרי שתקבע מחיר, השירות חסום עד שיושלם: ${missing.map((c) => credentialHe[c]).join(" · ")}`,
    };
  });
}

// ---------------------------------------------------------------------
// The category screen's rows
// ---------------------------------------------------------------------

/**
 * WHAT IS BEHIND EACH OF THE EIGHT FRONT DOORS.
 *
 * ---------------------------------------------------------------------
 * THE BUG THIS REPLACES
 * ---------------------------------------------------------------------
 * `apps/customer-mobile`'s category screen listed seven Hebrew strings —
 * "סתימה", "נזילה", "ברז / כיור" — hard-written into the component, and
 * every single row navigated to the same hard-coded `HOME_PLUMB_BLOCK`.
 * It ignored which category had been tapped. Choosing "חיות" and choosing
 * "רכב" both opened a plumbing list and both requested a blocked drain.
 *
 * Amit saw it from the outside and described it exactly: *"איפה כל הדברים
 * של כל המקצועות? למה אין, ולא קיים בקטלוג?"* — and /CLAUDE.md §3 names
 * the shape of it: "no hard-coded plumber-only architecture".
 *
 * ---------------------------------------------------------------------
 * REGROUPING, NEVER INVENTING
 * ---------------------------------------------------------------------
 * A customer category is a way in, not a department: "לבית" stands in
 * front of four dispatch departments at once, because nobody thinks of
 * their leaking tap as belonging to HOME_URGENT rather than IMPROVEMENT.
 * So this joins the two — the category names its departments, the
 * catalogue names each department's services — and adds nothing of its
 * own. A service that is not in `pilotCatalog` cannot appear here, which
 * is the property the hand-written list did not have.
 *
 * Order is the catalogue's order, which is the order Amit and
 * `/docs/09b-SERVICE-CATALOG.md` decided. Sorting by anything else — most
 * popular, nearest, cheapest — would be a ranking, and the customer would
 * read it as one at a moment when nothing has been ranked.
 *
 * `availableNowCount: null` everywhere, for the reason it is null on the
 * home grid: a number on this screen may come only from a live snapshot,
 * never from a constant (/CLAUDE.md §3).
 */
export const catalogCategoryServices: Record<string, CategoryServiceItem[]> = Object.fromEntries(
  CUSTOMER_CATEGORIES.map((category) => {
    const wanted = new Set<string>(category.departments);
    const rows = pilotCatalog
      .filter((d) => wanted.has(d.code as DepartmentCode))
      .flatMap((d) => d.categories.flatMap((c) => c.services))
      .map(
        (s): CategoryServiceItem => ({
          id: s.id,
          nameHe: s.nameHe,
          descriptionHe: s.descriptionHe,
          availableNowCount: null,
        })
      );
    return [category.id, rows];
  })
);

/**
 * Every category leads somewhere, checked rather than assumed.
 *
 * `customerCategoryViolations` already proves every DEPARTMENT is
 * reachable from the home screen. This proves the next link in the same
 * chain: that arriving at a category actually finds services. A category
 * whose departments hold nothing is a door onto an empty room, and it
 * fails silently — the screen renders, the customer taps, and there is
 * simply nothing there.
 */
export function categoryServiceViolations(): string[] {
  const out: string[] = [];
  for (const c of CUSTOMER_CATEGORIES) {
    const rows = catalogCategoryServices[c.id] ?? [];
    if (rows.length === 0) {
      out.push(`"${c.labelHe}" opens onto no services at all — a door with nothing behind it.`);
    }
  }
  return out;
}


/**
 * THE MARK FOR ONE SERVICE, BY ID.
 *
 * The professional's app had `"handyman"` written into two screens, for
 * every service in the marketplace: a dog walker's shift chip carrying a
 * spanner, a hairdresser's verification row carrying one too. It was a
 * placeholder because that app could not reach the catalogue, which it
 * now can.
 *
 * Falls back to the handyman mark rather than to nothing, because a chip
 * with no mark is a chip with a hole in it — and the fallback is the
 * generic tool rather than a specific one, so a wrong answer is visibly
 * a default instead of confidently the wrong trade.
 */
export function markForService(serviceId: string): MarkName {
  return catalogHomeServices.find((s) => s.id === serviceId)?.mark ?? "handyman";
}
