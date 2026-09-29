/**
 * THE CONSISTENCY GUARD (Amit, 2026-09-29).
 *
 * *"תבנה סוכן שהתפקיד שלו כל היום לוודא שהכל תואם ומושלם — הצעות, מילות
 * מפתח, התאמה של מקצועות למה שרשום."* This is that guard, as a test that runs
 * with every other test: for all 47 services it checks that every word the
 * customer or the professional reads belongs to THAT service and to the way
 * it is paid for. It found a tow driver being offered a plumber's price
 * lines, a vet told about "spare parts", and a haircut about "special parts".
 *
 * When it fails it names the service and the sentence. Fix the words, never
 * the guard.
 */
import { describe, expect, it } from "vitest";
import {
  allServices,
  jobProgressHe,
  pilotCatalog,
  pricingKindOf,
  visitMoneyLineHe,
  visitTermsHe,
  type CatalogServiceDef,
  type JobState,
} from "@pro-now/types";
import { catalogHiddenServices, catalogHomeServices, catalogMatchRules, catalogServicePages } from "../src/catalog/catalogAdapter";
import { lowestListed, previewPriceLists, previewQuoteLines, quoteLinesFor } from "../src/catalog/priceLists";
import { priceExplainer } from "../src/pricing-copy";
import { matchServicesByText } from "../src/service-match";
import { contextCueFor } from "@pro-now/types";

const services = allServices(pilotCatalog);
const home = [...catalogHomeServices, ...catalogHiddenServices];

/** Words that belong to one trade only. A line that uses one belongs there. */
const TRADE_WORDS: Array<{ words: RegExp; owners: string[] }> = [
  { words: /ברז|סיפון|סתימ|אסלה|צנרת/, owners: ["svc-blockage", "svc-leak", "svc-tap"] },
  { words: /גריר|גרר/, owners: ["svc-towing"] },
  { words: /תספורת|זקן|(^|\s)פן($|\s)/, owners: ["svc-haircut"] },
  { words: /מניקור|פדיקור|לק ג/, owners: ["svc-nails"] },
  { words: /איפור/, owners: ["svc-makeup"] },
  { words: /עיסוי/, owners: ["svc-massage"] },
  { words: /כלב/, owners: ["svc-dog-walk", "svc-pet-groom", "svc-pet-sit", "svc-vet"] },
  { words: /(^|\s)[הלבו]?(רכב|אוטו)($|\s)|גלגל|צמיג|(^|\s)תקר($|\s)/, owners: ["svc-towing", "svc-jump-start", "svc-flat-tyre", "svc-car-lockout"] },
  { words: /צביעת|(^|\s)צבע($|\s)/, owners: ["svc-paint", "svc-clean-reno", "svc-drywall"] },
  { words: /ריסוס|תיקנים|נמלים/, owners: ["svc-pest"] },
  { words: /הובלת|הובלה/, owners: ["svc-moving"] },
  { words: /צילינדר/, owners: ["svc-cylinder"] },
  { words: /מסך|טלוויזי/, owners: ["svc-tv", "svc-computer", "svc-phone-fix"] },
  { words: /וילון|מסילה/, owners: ["svc-curtains"] },
  { words: /שיעור|בגרות/, owners: ["svc-tutor"] },
  { words: /אימון/, owners: ["svc-trainer", "svc-massage"] },
];

function foreignWords(s: CatalogServiceDef, text: string): string[] {
  return TRADE_WORDS.filter((t) => !t.owners.includes(s.id) && t.words.test(text)).map((t) => String(t.words));
}

/** Every sentence a service's own pages say about money and scope. */
function pageText(s: CatalogServiceDef): string[] {
  const page = catalogServicePages[s.id]!;
  const ex = priceExplainer(page.price, { stage: "service", listFromMinorUnits: lowestListed(s.id), quoteFirst: s.quoteBeforeDispatch, terms: page.visitTerms });
  return [home.find((h) => h.id === s.id)?.priceHint ?? "", ...page.includedHe, ...page.notIncludedHe, ex.headline, ex.detail];
}

describe("every service speaks about its own money", () => {
  for (const s of services) {
    const kind = pricingKindOf(s);
    const text = pageText(s).join(" | ");
    it(`${s.id} (${kind})`, () => {
      if (kind !== "VISIT") expect(text, "no visit fee on work that has none").not.toMatch(/דמי ביקור|אבחון/);
      if (kind === "VISIT") expect(text, "a visit service has no price list").not.toMatch(/מחירון/);
      if (kind === "LIST") expect(text).toMatch(/מחירון/);
      if (kind === "QUOTE_FIRST") expect(text).toMatch(/לפני יציאה|שאישרתם מראש/);
      if (kind !== "VISIT" && kind !== "QUOTE_FIRST") expect(text, "no quote on work priced up front").not.toMatch(/הצעת מחיר/);
      /* A vet treats and a tiler works; neither "repairs a fault". */
      if (visitTermsHe(s).workHe !== "התיקון") expect(text).not.toMatch(/התיקון|התקלה|חלקי חילוף/);
      /* Parts only where the work can need them. */
      if (["BEAUTY", "WELLNESS", "PETS"].some((d) => s.id && home.find((h) => h.id === s.id))) {
        if (/haircut|nails|makeup|massage|trainer|tutor|dog-walk|pet-sit|pet-groom|doctor|clean$/.test(s.id))
          expect(text).not.toMatch(/חלקים|חלקי/);
      }
    });
  }
});

describe("the tracking lines follow the trade", () => {
  const states: JobState[] = ["PRO_ASSIGNED", "PRO_ARRIVED", "DIAGNOSIS", "COMPLETION_PENDING"];
  for (const s of services.filter((x) => pricingKindOf(x) === "VISIT")) {
    it(s.id, () => {
      const terms = visitTermsHe(s);
      const lines = states.flatMap((st) => [visitMoneyLineHe(st, { visitFeeHe: "₪179", terms }), jobProgressHe(st, "רון", { terms })]).join(" | ");
      if (terms.workHe !== "התיקון") expect(lines).not.toMatch(/התיקון|אבחון|מאבחן/);
      expect(lines).toMatch(new RegExp(terms.workHe));
    });
  }
});

describe("price lines belong to their trade", () => {
  it("a list for every price-list service and a quick list for every priced-before-setting-off one — and none elsewhere", () => {
    for (const s of services) {
      const kind = pricingKindOf(s);
      expect(Boolean(previewPriceLists[s.id]?.length), `${s.id} list`).toBe(kind === "LIST");
      expect(Boolean(previewQuoteLines[s.id]?.length), `${s.id} quick lines`).toBe(kind === "QUOTE_FIRST");
      expect(quoteLinesFor(s.id).length > 0, `${s.id} quote screen rows`).toBe(kind === "LIST" || kind === "QUOTE_FIRST");
    }
  });
  for (const s of services) {
    it(`${s.id}: no other trade's words in its lines, prompt or symptoms`, () => {
      const lines = quoteLinesFor(s.id).map((r) => r.nameHe);
      const bad = [...lines, s.customerPhotoPromptHe ?? "", ...s.symptomsHe].flatMap((l) => foreignWords(s, l).map((w) => `${l} ~ ${w}`));
      expect(bad).toEqual([]);
    });
  }
});

describe("search finds each service by its own name and words", () => {
  for (const s of services) {
    it(s.id, () => {
      expect(matchServicesByText(s.nameHe, catalogMatchRules)[0]?.serviceId, s.nameHe).toBe(s.id);
      // A word a car shares with the home ("ננעל", "סוללה") is typed beside
      // a car, which is how it leads to the car service (docs/21 W5).
      const domain = catalogMatchRules.find((r) => r.serviceId === s.id)?.domain;
      const lost = s.keywordsHe.filter((k) => {
        const cue = contextCueFor(domain, k);
        const typed = cue ? `${cue} ${k}` : k;
        return !matchServicesByText(typed, catalogMatchRules).slice(0, 4).some((m) => m.serviceId === s.id);
      });
      expect(lost, `keywords that do not lead to ${s.nameHe}`).toEqual([]);
    });
  }
});

describe("every service has the numbers its pricing kind needs", () => {
  for (const s of services) {
    it(s.id, () => {
      const p = catalogServicePages[s.id]!.price;
      switch (pricingKindOf(s)) {
        case "VISIT": expect(p.visitFeeMinorUnits, "visit fee").toBeGreaterThan(0); break;
        case "LIST": expect(p.fixedTotalMinorUnits, "list price").toBeGreaterThan(0); break;
        case "HOURLY": expect(p.hourlyRateMinorUnits, "hourly rate").toBeGreaterThan(0); break;
        case "DISTANCE":
          expect(p.baseMinorUnits, "base fare").toBeGreaterThan(0);
          expect(s.needsDestination, "a delivery asks where to").toBe(true);
          break;
        default: break;
      }
    });
  }
});

describe("tracking lines for every kind, in both genders", () => {
  const states: JobState[] = ["PRO_ASSIGNED", "PRO_ARRIVED", "DIAGNOSIS", "IN_PROGRESS", "COMPLETION_PENDING"];
  const MASC = /(^|\s)(הגיע|יצא|מגיע|בודק|סיים|ממתין|מאבחן|התחיל|עובד|אסף|שלו|אחריו|איתו)(\s|\.|,|$)/;
  for (const s of services) {
    it(s.id, () => {
      const kind = pricingKindOf(s);
      const terms = visitTermsHe(s);
      for (const female of [false, true]) {
        const lines = states
          .flatMap((st) => [
            visitMoneyLineHe(st, { visitFeeHe: kind === "VISIT" ? "₪179" : null, hourlyRateHe: kind === "HOURLY" ? "₪110" : null, terms, kind }),
            jobProgressHe(st, female ? "מאיה" : "רון", { terms, kind, female }),
          ])
          .filter(Boolean)
          .join(" | ");
        if (kind !== "VISIT") expect(lines, `${kind} speaks of a repair`).not.toMatch(/אבחון|מאבחן|התיקון|התקלה|דמי ביקור/);
        if (kind === "HOURLY") expect(lines).toMatch(/לשעה|לפי שעה/);
        if (female) expect(lines, "masculine verb for a woman").not.toMatch(MASC);
      }
    });
  }
});
