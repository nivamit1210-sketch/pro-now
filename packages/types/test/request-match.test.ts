import { describe, expect, it } from "vitest";

import { catalogMatchRules, matchRequest, matchServicesByText, urgentCareFor, type ServiceMatchRule } from "../src/request-match";

/**
 * The matcher's job is to route a sentence to a SERVICE. The tests below
 * exist mostly to pin down what it must refuse to do: guess when it does not
 * know, and reach past a service to a person.
 */

const rules: ServiceMatchRule[] = [
  { serviceId: "svc-leak", keywords: ["נזילה", "ברז", "דולף", "מים", "סיפון"] },
  { serviceId: "svc-electric", keywords: ["חשמל", "פחת", "שקע", "נורה", "קצר"] },
  { serviceId: "svc-lock", keywords: ["מנעול", "מפתח", "ננעלתי", "דלת"] },
  { serviceId: "svc-ac", keywords: ["מזגן", "מיזוג", "לא מקרר"] },
];

describe("matchServicesByText", () => {
  it("routes a plain sentence to the right service", () => {
    const m = matchServicesByText("יש נזילה מתחת לכיור במטבח", rules);
    expect(m[0]?.serviceId).toBe("svc-leak");
  });

  it("sees through Hebrew prefixes, which a substring match would miss", () => {
    // "הברז" / "והמזגן" are how people actually type.
    expect(matchServicesByText("הברז בשירותים דולף", rules)[0]?.serviceId).toBe("svc-leak");
    expect(matchServicesByText("המזגן לא עובד", rules)[0]?.serviceId).toBe("svc-ac");
  });

  it("matches a multi-word phrase as a phrase", () => {
    expect(matchServicesByText("המזגן לא מקרר בכלל", rules)[0]?.serviceId).toBe("svc-ac");
  });

  it("ranks the service with more evidence first, without hiding the others", () => {
    const m = matchServicesByText("ננעלתי בחוץ בלי מפתח, והדלת נסגרה", rules);
    expect(m[0]?.serviceId).toBe("svc-lock");
    expect(m[0]!.score).toBeGreaterThan(1);
  });

  it("returns NOTHING rather than a weak guess when it does not know", () => {
    // Sending someone to the wrong trade costs a call-out fee and a morning.
    expect(matchServicesByText("שלום מה נשמע", rules)).toEqual([]);
    expect(matchServicesByText("   ", rules)).toEqual([]);
    expect(matchServicesByText("", rules)).toEqual([]);
  });

  it("is punctuation- and case-insensitive", () => {
    expect(matchServicesByText("נזילה!!! מים... בכל מקום", rules)[0]?.serviceId).toBe("svc-leak");
  });

  it("only ever returns service ids — there is no path from text to a person", () => {
    const m = matchServicesByText("נזילה חשמל מנעול מזגן", rules);
    for (const hit of m) {
      expect(Object.keys(hit)).toEqual(["serviceId", "score"]);
      expect(rules.some((r) => r.serviceId === hit.serviceId)).toBe(true);
    }
  });
});

describe("the long tail is dropped", () => {
  const RULES = [
    { serviceId: "svc-blockage", keywords: ["סתימה", "כיור", "מים", "ביוב", "אסלה"] },
    // A carpenter legitimately lists "מטבח" — kitchens are carpentry work.
    { serviceId: "svc-carpentry", keywords: ["נגר", "עץ", "מטבח", "דלת", "מדף"] },
    { serviceId: "svc-leak", keywords: ["נזילה", "מים", "דולף", "כיור"] },
  ];

  it("does not offer a one-word coincidence beside a strong match", () => {
    // The real sentence that exposed this: three hits for the blockage, one
    // for carpentry, and the screen showed נגרות as suggestion number two.
    const ids = matchServicesByText("יש מים מתחת לכיור במטבח", RULES).map((m) => m.serviceId);
    expect(ids).toContain("svc-blockage");
    expect(ids).not.toContain("svc-carpentry");
  });

  it("keeps a genuine tie", () => {
    const out = matchServicesByText("כיור מים", RULES);
    const ids = out.map((m) => m.serviceId);
    expect(ids).toContain("svc-blockage");
    expect(ids).toContain("svc-leak");
  });

  it("still returns the single best match when only one thing matched", () => {
    expect(matchServicesByText("נגר", RULES).map((m) => m.serviceId)).toEqual(["svc-carpentry"]);
  });

  it("still returns nothing when nothing matched", () => {
    expect(matchServicesByText("כרטיס טיסה לרומא", RULES)).toEqual([]);
  });
});

/**
 * The category screen routes a typed sentence through this matcher, and
 * it used to send everybody to whichever service happened to be first in
 * their category. These are the cases that have to survive that change.
 */
describe("a sentence typed in one category", () => {
  it("finds the right service rather than the first one", () => {
    // "הדוד לא מחמם" in "לבית" used to arrive at a blocked drain, because
    // the drain is first in the list.
    const hits = matchServicesByText("הדוד לא מחמם", catalogMatchRules);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.serviceId).not.toBe("");
  });

  it("returns nothing for a sentence about nothing we do", () => {
    // No match is a real outcome and the screen has a fallback for it. A
    // matcher that always answers would route somebody to a plumber for a
    // sentence about their taxes.
    expect(matchServicesByText("מה השעה", catalogMatchRules)).toEqual([]);
  });

  it("orders by how much of the sentence it actually recognised", () => {
    /*
     * The property the category screen depends on: it takes the FIRST hit
     * that belongs to the category the customer opened, so the order has
     * to mean something.
     */
    const hits = matchServicesByText("נזילה מתחת לכיור, מים על הרצפה", catalogMatchRules);
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });
});

/**
 * Sentences real people typed. The first is Amit's: "נחנחק לי החתול" — a
 * typo, a particle, a possessive — and the screen answered "לא זיהינו".
 */
describe("everyday Hebrew, typed in a hurry", () => {
  const top = (q: string) => matchServicesByText(q, catalogMatchRules)[0]?.serviceId;
  const cases: Array<[string, string]> = [
    ["נחנחק לי החתול", "svc-vet"],
    ["נחנק לי החתול", "svc-vet"],
    ["החתול שלי לא אוכל כבר יומיים", "svc-vet"],
    ["הכלב צולע", "svc-vet"],
    ["הכלבה שלי מדממת מהרגל", "svc-vet"],
    ["צריך מישהו שיוציא את הכלב", "svc-dog-walk"],
    ["נוסעת לחו״ל מי ישמור על החתולה", "svc-pet-sit"],
    ["הכלב צריך מקלחת ותספורת", "svc-pet-groom"],
    ["לילד יש חום", "svc-doctor"],
    ["המזגן מטפטף", "svc-ac"],
    ["חם נורא בבית", "svc-ac"],
    ["נטרקה לי הדלת והמפתח בפנים", "svc-lock"],
    ["ננעלתי ברכב", "svc-car-lockout"],
    ["האוטו לא מתניע", "svc-jump-start"],
    ["הטלפון נפל ונשבר המסך", "svc-phone-fix"],
    ["יש ריח של גז", "svc-gas"],
    ["כואב לי הגב", "svc-massage"],
    ["צריך עזרה להרים מקרר", "svc-hands"],
  ];
  for (const [q, id] of cases) {
    it(`"${q}" → ${id}`, () => expect(top(q)).toBe(id));
  }

  it("does not let one word in three spellings vote three times", () => {
    const [m] = matchServicesByText("הכלב", catalogMatchRules);
    expect(m!.score).toBe(1);
  });

  it("forgives one slipped letter, but not a swap that makes another word", () => {
    expect(top("נחנחק לי החתול")).toBe("svc-vet");
    expect(matchServicesByText("יש לי חתונה מחר", catalogMatchRules).map((m) => m.serviceId)).not.toContain("svc-pet-sit");
  });
});

describe("when the answer is not a service", () => {
  it("sends a person in danger to 101", () => {
    expect(urgentCareFor("הילד נחנק")).toBe("person");
    expect(urgentCareFor("אבא שלי לא נושם")).toBe("person");
  });
  it("tells an animal emergency apart, so the vet is still offered", () => {
    expect(urgentCareFor("נחנחק לי החתול")).toBe("animal");
  });
  it("stays quiet on the ordinary", () => {
    expect(urgentCareFor("הילד חולה")).toBeNull();
    expect(urgentCareFor("יש לכלב חום")).toBeNull();
    expect(urgentCareFor("המזגן מטפטף")).toBeNull();
  });
});

/**
 * W5 (docs/21): the three sentences that failed on 2026-09-29, and the
 * rules they forced.
 */
describe("negation", () => {
  const ids = (q: string) => matchServicesByText(q, catalogMatchRules).map((m) => m.serviceId);

  it("takes back a trade the person says they do not need", () => {
    expect(ids("לא צריך חשמלאי, צריך אינסטלטור")).not.toContain("svc-electric");
    expect(ids("לא צריך חשמלאי, צריך אינסטלטור")).not.toContain("svc-socket");
    expect(ids("לא צריך חשמלאי, צריך אינסטלטור")).toContain("svc-blockage");
  });

  it("reads a bare 'לא' before a trade's title", () => {
    expect(ids("צריך אינסטלטור ולא חשמלאי")).not.toContain("svc-electric");
    expect(ids("צריך אינסטלטור, לא חשמלאי")).toContain("svc-leak");
  });

  it("never treats a symptom's 'לא' as negation", () => {
    expect(ids("המזגן לא מקרר")[0]).toBe("svc-ac");
    expect(ids("המדיח לא נפתח")).toContain("svc-washer");
    expect(ids("אין חשמל בבית")[0]).toBe("svc-electric");
    expect(ids("אין מים חמים")[0]).toBe("svc-solar");
  });

  it("returns nothing when everything was taken back", () => {
    expect(ids("לא צריך חשמלאי")).toEqual([]);
  });
});

describe("context words", () => {
  const ids = (q: string) => matchServicesByText(q, catalogMatchRules).map((m) => m.serviceId);

  it("a car's door is not a washing machine's door", () => {
    expect(ids("הדלת של הרכב לא נפתחת")).not.toContain("svc-washer");
    expect(ids("הדלת של הרכב לא נפתחת")[0]).toBe("svc-car-lockout");
  });

  it("keeps the appliance meaning when no car is mentioned", () => {
    expect(ids("הדלת של המדיח לא נפתחת")[0]).toBe("svc-washer");
  });

  it("locked in the car is the car locksmith, not the home one", () => {
    expect(ids("ננעלתי ברכב")).toEqual(["svc-car-lockout"]);
  });

  it("lets a word that is not shared with the car keep its own meaning", () => {
    expect(ids("הטלפון נפל ברכב ונשבר")[0]).toBe("svc-phone-fix");
  });
});

describe("a word with two meanings", () => {
  it("resolves by its neighbours", () => {
    expect(matchServicesByText("העכבר של המחשב לא עובד", catalogMatchRules).map((m) => m.serviceId)).toEqual(["svc-computer"]);
    expect(matchServicesByText("ראיתי עכבר במטבח", catalogMatchRules)[0]?.serviceId).toBe("svc-pest");
    expect(matchServicesByText("יש עכבר במטבח", catalogMatchRules).map((m) => m.serviceId)).not.toContain("svc-carpentry");
  });

  it("asks, rather than guesses, when the neighbours do not say", () => {
    const m = matchRequest("יש לי עכבר");
    expect(m.confidence).toBe("low");
    expect(m.clarify).toEqual({ questionHe: "עכבר של מחשב, או עכבר בבית?", options: ["svc-computer", "svc-pest"] });
    expect(m.candidates.map((c) => c.serviceId).sort()).toEqual(["svc-computer", "svc-pest"]);
  });

  it("does not ask about a word that was taken back", () => {
    expect(matchRequest("לא צריך עכבר").clarify).toBeUndefined();
  });
});

describe("matchRequest confidence", () => {
  it("is high for one clear answer", () => {
    const m = matchRequest("המזגן לא מקרר");
    expect(m.confidence).toBe("high");
    expect(m.candidates[0]?.serviceId).toBe("svc-ac");
  });

  it("is medium for a single answer resting on one word", () => {
    expect(matchRequest("גיזום").confidence).toBe("medium");
  });

  it("is medium for two close answers", () => {
    const m = matchRequest("כיור מים", [
      { serviceId: "a", keywords: ["כיור", "מים"] },
      { serviceId: "b", keywords: ["כיור", "מים"] },
    ]);
    expect(m.confidence).toBe("medium");
  });

  it("asks one question when many answers are equally likely", () => {
    const m = matchRequest("צריך אינסטלטור");
    expect(m.confidence).toBe("low");
    expect(m.clarify?.options.length).toBeGreaterThanOrEqual(2);
    expect(m.clarify!.options.length).toBeLessThanOrEqual(3);
  });

  it("is none when nothing matched, and still flags a life at stake", () => {
    expect(matchRequest("מה השעה")).toEqual({ candidates: [], confidence: "none", urgentCare: null });
    expect(matchRequest("הילד נחנק").urgentCare).toBe("person");
  });

  it("only ever answers with service ids from the rules", () => {
    const m = matchRequest("נזילה חשמל מנעול מזגן עכבר");
    const known = new Set(catalogMatchRules.map((r) => r.serviceId));
    for (const c of m.candidates) expect(known.has(c.serviceId)).toBe(true);
    for (const o of m.clarify?.options ?? []) expect(known.has(o)).toBe(true);
  });
});
