/**
 * "תאר מה קרה" — turning a sentence into the right service.
 *
 * Most people do not know whether a wet patch under the sink is plumbing,
 * sealing or appliance work, and being asked to pick a category before you
 * can ask for help is the tax this product exists to remove. So the entry
 * point is a sentence, not a taxonomy.
 *
 * TWO THINGS THIS DELIBERATELY IS NOT:
 *
 * 1. **It does not match professionals.** It matches *services*. Which
 *    professional comes is decided by dispatch, from eligibility, presence
 *    and proximity (/CLAUDE.md §3 — the server is authoritative for
 *    assignment). A text box must never be able to pick a person, or the
 *    two most important guarantees in the product — verified for THIS
 *    service, actually online — would be bypassed by typing.
 *
 * 2. **It is not intelligence, and does not pretend to be.** This is a
 *    deterministic keyword matcher, small enough to read in a minute and
 *    fully unit-tested. A real intent classifier is a server feature with a
 *    model behind it; shipping a lookup table dressed up as understanding
 *    would be a mocked capability presented as a real one, which §3 rules
 *    out. The UI therefore says "נראה שזה…" and offers a choice, rather
 *    than announcing that it understood.
 *
 * When nothing matches, that is a result too: the screen says so and shows
 * the full catalogue, instead of guessing at the nearest service.
 *
 * Shared by the web app and the server (docs/21 W5): the server's
 * `POST /api/v1/match` runs this same code, so what the screen suggests and
 * what the server would answer cannot drift apart.
 */

import { allServices, type CatalogDepartmentDef } from "./catalog";
import { pilotCatalog } from "./pilot-catalog";

export interface ServiceMatchRule {
  serviceId: string;
  /** Words and fragments a person would actually type, not category names. */
  keywords: string[];
  /** The service's own name. Typing it whole is the strongest evidence there is. */
  nameHe?: string;
  /** The department the service belongs to; context words speak in departments. */
  domain?: string;
}

export interface ServiceMatch {
  serviceId: string;
  /** How many distinct rule keywords the text hit. Used only for ordering. */
  score: number;
}

/** Hebrew prefixes that would otherwise defeat a plain substring match. */
const PREFIXES = ["ה", "ו", "ב", "כ", "ל", "מ", "ש"];

/**
 * Endings a Hebrew word grows that do not change what it is about:
 * "חתולה", "חתולים", "כלבה", "מזגנים". Stripped only while at least three
 * letters remain, so "דלת" never becomes "דל".
 */
const SUFFIXES = ["ים", "ות", "ית", "ה", "ת", "י"];

function normalise(text: string): string {
  return text
    .toLowerCase()
    // Strip niqqud and punctuation; keep Hebrew, Latin and digits.
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[׳']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The word, and the word without up to two leading particles ("וה", "שה"). */
function unprefixed(w: string): string[] {
  const out = [w];
  for (const p of PREFIXES) {
    // "הגב" → "גב", "לגז" → "גז": two letters may remain after one particle.
    if (w.length > p.length + 1 && w.startsWith(p)) {
      const once = w.slice(p.length);
      out.push(once);
      for (const q of PREFIXES) {
        if (once.length > q.length + 2 && once.startsWith(q)) out.push(once.slice(q.length));
      }
    }
  }
  return out;
}

function unsuffixed(w: string): string[] {
  const out = [w];
  for (const s of SUFFIXES) {
    if (w.length - s.length >= 3 && w.endsWith(s)) out.push(w.slice(0, -s.length));
  }
  return out;
}

interface TypedWord {
  /** As typed, and with up to two particles off. */
  words: string[];
  /** Every form, including the ending-stripped ones. */
  forms: Set<string>;
  /** Which clause of the sentence it is in; punctuation separates clauses. */
  clause: number;
}

interface Typed {
  seq: TypedWord[];
  flat: string;
}

function read(text: string): Typed {
  const flat = normalise(text);
  const seq = text.split(/[,.;:!?\n]+/).flatMap((part, clause) =>
    normalise(part)
      .split(" ")
      .filter(Boolean)
      .map((w) => {
        const words = unprefixed(w);
        const forms = new Set<string>();
        for (const u of words) for (const f of unsuffixed(u)) forms.add(f);
        return { words, forms, clause };
      })
  );
  return { seq, flat: " " + flat + " " };
}

/**
 * ONE SLIP OF THE FINGER. "נחנחק" is "נחנק" typed on a phone in a hurry,
 * and the hurry is exactly when this box matters. One inserted or dropped
 * letter is forgiven from four letters up; a swapped letter only from six,
 * because below that a swap turns one real word into another ("נורה" /
 * "נורא", "מקרר" / "מקרן", "חתונה" / "חתולה").
 */
function oneSlip(a: string, b: string): boolean {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    if (la < 6) return false;
    let diff = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i] && ++diff > 1) return false;
    return diff === 1;
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  if (s.length < 4) return false;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      j++;
    }
  }
  return true;
}

/**
 * Which typed words this one keyword accounts for (by position), and how
 * surely: a word in one of its forms counts 1, a near-miss spelling less —
 * so "מכונה" is a washing machine before it is a typo for "מכונית".
 */
const SLIP_WEIGHT = 0.6;
/* Marks a letter-for-letter hit; counts as 1 in the score and breaks ties. */
const EXACT = 1.0001;
function wordHits(k: string, typed: Typed): Array<[number, number]> {
  const kForms = unsuffixed(k);
  const out: Array<[number, number]> = [];
  typed.seq.forEach((w, i) => {
    if (w.words.includes(k)) {
      /* The very word, letter for letter, edges out a word that merely shares its stem. */
      out.push([i, EXACT]);
    } else if (kForms.some((f) => w.forms.has(f)) || w.words.some((t) => t.length > 3 && k.length > 3 && t.includes(k))) {
      out.push([i, 1]);
    } else if (w.words.some((t) => oneSlip(t, k))) {
      out.push([i, SLIP_WEIGHT]);
    }
  });
  return out;
}

/* Words that join a service's name and prove nothing: "או", "על", "ו־". */
const NAME_GLUE = new Set(["או", "על", "עד", "של", "את", "עם", "הבית"]);

function sameWord(w: TypedWord, part: string): boolean {
  return unsuffixed(part).some((f) => w.forms.has(f));
}

/** The typed words a phrase covers: the same words side by side, each in any form. */
function phraseHits(k: string, typed: Typed): number[] {
  const parts = k.split(" ");
  for (let at = 0; at + parts.length <= typed.seq.length; at++) {
    if (parts.every((part, i) => sameWord(typed.seq[at + i]!, part))) {
      return parts.map((_, i) => at + i);
    }
  }
  return [];
}

function hitsOf(keyword: string, typed: Typed): Array<[number, number]> {
  const k = normalise(keyword);
  if (!k) return [];
  return k.includes(" ") ? phraseHits(k, typed).map((i) => [i, 1] as [number, number]) : wordHits(k, typed);
}

/**
 * "I DON'T NEED AN ELECTRICIAN" IS NOT A REQUEST FOR ONE.
 *
 * A keyword matcher that only counts words hears "לא צריך חשמלאי, צריך
 * אינסטלטור" as a vote for both trades. Two shapes of negation are read:
 *
 * - "לא צריך / לא רוצה / לא מחפש / אין צורך ב…": the next few words are
 *   what the person does NOT want, whatever they are.
 * - A bare "לא" directly before a trade's title ("אינסטלטור, לא חשמלאי").
 *   Only before a title: "לא מקרר", "לא נפתחת" and "לא עובד" are symptoms,
 *   and treating their "לא" as negation would erase the problem itself.
 *
 * "בלי" and "אין" alone are deliberately NOT negators: "בלי מים חמים" and
 * "אין חשמל" are the most common ways to say what is wrong.
 */
const NEGATION_OPENERS: string[][] = [
  ["לא", "צריך"], ["לא", "צריכה"], ["לא", "צריכים"],
  ["לא", "רוצה"], ["לא", "רוצים"],
  ["לא", "מחפש"], ["לא", "מחפשת"], ["לא", "מחפשים"],
  ["אין", "צורך"],
];
/** How many words after an opener are taken back, at most. */
const NEGATION_REACH = 3;
/** Words that end a negation: what follows is asked for again. */
const NEGATION_ENDS = new Set(["אבל", "אלא", "רק", "צריך", "צריכה", "צריכים", "רוצה", "רוצים"]);

/** What a professional is called. A bare "לא" before one of these negates it. */
const TRADE_TITLES = [
  "חשמלאי", "אינסטלטור", "שרברב", "מנעולן", "מדביר", "נגר", "גנן", "טכנאי", "מזגנאי",
  "וטרינר", "רופא", "ספר", "מאפרת", "מעסה", "מאמן", "צבעי", "רצף", "גבסן", "זגג",
  "הנדימן", "שיפוצניק", "מוביל", "שליח", "גרר", "מורה", "דוג ווקר",
];

function negatedPositions(typed: Typed): Set<number> {
  const out = new Set<number>();
  const at = (i: number, word: string) => typed.seq[i]?.words.includes(word) ?? false;
  typed.seq.forEach((_, i) => {
    for (const opener of NEGATION_OPENERS) {
      if (!opener.every((w, k) => at(i + k, w))) continue;
      const clause = typed.seq[i]!.clause;
      for (let j = i + opener.length; j < Math.min(typed.seq.length, i + opener.length + NEGATION_REACH); j++) {
        const w = typed.seq[j]!;
        if (w.clause !== clause || w.words.some((x) => NEGATION_ENDS.has(x))) break;
        out.add(j);
      }
    }
  });
  for (const title of TRADE_TITLES) {
    const positions = hitsOf(title, typed).map(([i]) => i);
    const first = Math.min(...positions);
    if (positions.length > 0 && (at(first - 1, "לא") || at(first - 1, "ולא"))) for (const i of positions) out.add(i);
  }
  return out;
}

/**
 * A WORD MEANS WHAT ITS SENTENCE IS ABOUT.
 *
 * "הדלת של הרכב לא נפתחת" went to the washing machine, because "לא
 * נפתחת" is how people describe a stuck washing-machine door. Once the
 * sentence names a car, the words a car shares with the rest of the home —
 * a door, a lock, a key, a battery — speak for the car, and a service
 * outside the car's department may not claim them.
 */
interface ContextRule {
  domain: string;
  /** Any of these in the sentence puts it in the domain. */
  cues: string[];
  /** Words that, in this domain, belong to the domain and nobody else. */
  shared: string[];
}

const CONTEXTS: ContextRule[] = [
  {
    domain: "VEHICLE",
    cues: ["רכב", "אוטו", "מכונית", "טנדר", "גיפ", "ג׳יפ"],
    shared: [
      "דלת", "נפתח", "נפתחת", "לא נפתחת", "מכונה", "ננעל", "ננעלתי", "ננעלה", "נעול", "מפתח",
      "מפתחות", "מנעול", "מנעולן", "תקוע", "סוללה", "לא נדלק", "חלון", "מסך", "שקע", "נורה", "אור",
    ],
  },
];

/**
 * ONE WORD, TWO THINGS. "עכבר" is a computer mouse and a rodent. The words
 * around it usually say which ("…של המחשב", "…במטבח"); when they do not,
 * the honest answer is a short question, never a coin toss between a
 * computer technician and pest control.
 */
interface AmbiguousWord {
  word: string;
  questionHe: string;
  readings: Array<{ serviceId: string; cues: string[] }>;
}

const AMBIGUOUS: AmbiguousWord[] = [
  {
    word: "עכבר",
    questionHe: "עכבר של מחשב, או עכבר בבית?",
    readings: [
      { serviceId: "svc-computer", cues: ["מחשב", "לפטופ", "מקלדת", "קליק", "לחיצה", "אלחוטי", "גלגלת", "usb"] },
      {
        serviceId: "svc-pest",
        cues: ["מטבח", "ראיתי", "רץ", "רצה", "רצים", "גללים", "חולדה", "מכרסם", "מכרסמים", "מלכודת", "קיר", "תקרה", "ארון", "מחסן"],
      },
    ],
  },
  {
    word: "מסך",
    questionHe: "מסך של טלפון, או מסך טלוויזיה לתלייה?",
    readings: [
      { serviceId: "svc-phone-fix", cues: ["טלפון", "אייפון", "פלאפון", "סלולרי", "נייד", "סמארטפון", "שבור", "נשבר", "סדוק", "מנופץ", "נפל"] },
      { serviceId: "svc-tv", cues: ["לתלות", "תלייה", "קיר", "טלוויזיה", "זרוע", "סלון"] },
    ],
  },
  {
    word: "סוללה",
    questionHe: "סוללה של הטלפון, או מצבר של הרכב?",
    readings: [
      { serviceId: "svc-phone-fix", cues: ["טלפון", "אייפון", "פלאפון", "סלולרי", "נייד", "נטען", "טעינה", "מטען"] },
      { serviceId: "svc-jump-start", cues: ["רכב", "אוטו", "מכונית", "מתניע", "מצבר", "התנעה"] },
    ],
  },
];

/**
 * The word to add to `keyword` so that it speaks for a service in `domain`,
 * or null when it needs none. A car service's "ננעל" or "סוללה" is shared
 * with the home and leads to the car only beside a car ("רכב ננעל").
 */
export function contextCueFor(domain: string | undefined, keyword: string): string | null {
  const ctx = CONTEXTS.find((c) => c.domain === domain);
  if (!ctx) return null;
  const kw = read(keyword);
  const shares = ctx.shared.some((w) => normalise(w).split(" ").every((part) => kw.seq.some((x) => sameWord(x, part))));
  return shares ? ctx.cues[0]! : null;
}

export interface MatchClarify {
  questionHe: string;
  /** Service ids, in the order to offer them. */
  options: string[];
}

interface Scored {
  ranked: ServiceMatch[];
  clarify?: MatchClarify;
}

/**
 * THE SCORE IS HOW MUCH OF THE SENTENCE A SERVICE EXPLAINS — the number of
 * typed words its keywords account for, each word counted once. Counting
 * keywords instead let "כלב", "כלבה" and "כלבים" vote three times for one
 * typed "הכלב", and a service with a long word list out-shouted the one
 * whose list held the word that actually mattered ("נחנק").
 */
function score(text: string, rules: ServiceMatchRule[]): Scored {
  const typed = read(text);
  if (typed.seq.length === 0) return { ranked: [] };

  const positionsOf = (words: string[]) => new Set(words.flatMap((w) => hitsOf(w, typed).map(([i]) => i)));
  const negated = negatedPositions(typed);

  /*
   * A cue is the word itself (with its particles), never a stem: "המכונה"
   * (the machine) and "מכונית" (a car) share one once their endings are
   * stripped, and a washing machine must not be read as a car.
   */
  const cued = (ctx: ContextRule) => typed.seq.some((w) => ctx.cues.some((c) => w.words.includes(normalise(c))));
  const absentContexts = CONTEXTS.filter((ctx) => !cued(ctx));
  const sharesWith = (keyword: string, ctx: ContextRule) => {
    const kw = read(keyword);
    return ctx.shared.some((w) => normalise(w).split(" ").every((part) => kw.seq.some((x) => sameWord(x, part))));
  };

  // Which typed words each service accounts for, and how surely.
  const coverage = new Map<string, Map<number, number>>();
  for (const rule of rules) {
    const covered = new Map<number, number>();
    /*
     * The other direction of the same rule: in a sentence that names no
     * car, a car service may not claim the words it shares with the home.
     * "איבדתי את המפתח" is a lock, not a car, until a car is mentioned.
     */
    const muted = absentContexts.filter((ctx) => ctx.domain === rule.domain);
    for (const keyword of rule.keywords) {
      if (muted.some((ctx) => sharesWith(keyword, ctx))) continue;
      for (const [i, w] of hitsOf(keyword, typed)) if (!negated.has(i)) covered.set(i, Math.max(covered.get(i) ?? 0, w));
    }
    coverage.set(rule.serviceId, covered);
  }

  for (const ctx of CONTEXTS) {
    if (!cued(ctx)) continue;
    const shared = positionsOf(ctx.shared);
    for (const rule of rules) {
      if (rule.domain === ctx.domain) continue;
      const covered = coverage.get(rule.serviceId)!;
      for (const i of shared) covered.delete(i);
    }
  }

  let clarify: MatchClarify | undefined;
  for (const amb of AMBIGUOUS) {
    const at = positionsOf([amb.word]);
    if (at.size === 0 || [...at].every((i) => negated.has(i))) continue;
    const cued = amb.readings
      .map((r) => ({ ...r, cuePositions: [...positionsOf(r.cues)].filter((i) => !at.has(i)) }))
      .filter((r) => r.cuePositions.length > 0);
    const live = [...at].filter((i) => !negated.has(i));
    const credit = (serviceId: string, positions: number[]) => {
      const covered = coverage.get(serviceId);
      if (covered) for (const i of positions) covered.set(i, Math.max(covered.get(i) ?? 0, 1));
    };
    for (const r of amb.readings) for (const i of at) coverage.get(r.serviceId)?.delete(i);
    if (cued.length === 1) {
      // The neighbour decided it: the word, and the neighbour that decided
      // it, both count for that reading.
      credit(cued[0]!.serviceId, [...live, ...cued[0]!.cuePositions]);
    } else {
      // Undecided: every reading is on the list, and the question with them.
      for (const r of amb.readings) credit(r.serviceId, live);
      clarify ??= { questionHe: amb.questionHe, options: amb.readings.map((r) => r.serviceId) };
    }
  }

  const scored: ServiceMatch[] = [];
  const exactBy = new Map<string, number>();
  for (const rule of rules) {
    const covered = coverage.get(rule.serviceId)!;
    if (covered.size === 0) continue;
    let total = [...covered.values()].reduce((a, b) => a + Math.min(1, b), 0);
    const exact = [...covered.values()].filter((w) => w === EXACT).length;
    /* The service's whole name, typed: it wins a tie it would otherwise lose. */
    if (rule.nameHe) {
      const name = normalise(rule.nameHe).split(" ").filter((p) => p.length > 1 && !NAME_GLUE.has(p));
      if (name.length > 0 && name.every((part) => typed.seq.some((w, i) => !negated.has(i) && sameWord(w, part)))) total += 0.5;
    }
    scored.push({ serviceId: rule.serviceId, score: Math.round(total * 10) / 10 });
    exactBy.set(rule.serviceId, exact);
  }

  const ranked = scored.sort(
    (a, b) => b.score - a.score || (exactBy.get(b.serviceId) ?? 0) - (exactBy.get(a.serviceId) ?? 0) || a.serviceId.localeCompare(b.serviceId)
  );

  /**
   * DROP THE LONG TAIL. A weak match beside a strong one is worse than no
   * second match at all.
   *
   * The case that forced this: "יש מים מתחת לכיור במטבח" scored 3 for
   * פתיחת סתימה — and 1 for נגרות, because a carpenter's keyword list
   * contains "מטבח". The screen then offered "נגרות" as the second
   * suggestion for a plumbing emergency, which does not read as a ranked
   * list; it reads as the app not understanding Hebrew. One shared noun is
   * coincidence, and coincidence should not get a row on the screen.
   *
   * The rule, in two parts:
   *
   *   - A single keyword hit never survives beside anything stronger. One
   *     shared noun IS the coincidence case, and no amount of arithmetic
   *     makes it evidence.
   *   - Beyond that, a match must reach half the top score.
   *
   * The top match always survives, and a genuine tie always survives — this
   * removes noise, never the answer. When the best anyone managed is a
   * single keyword, that single keyword is the answer and is kept.
   */
  const top = ranked[0]?.score ?? 0;
  const floor = top >= 2 ? Math.max(2, Math.ceil(top / 2)) : top >= 1 ? 1 : top;
  return { ranked: ranked.filter((m) => m.score >= floor), clarify };
}

export function matchServicesByText(text: string, rules: ServiceMatchRule[]): ServiceMatch[] {
  return score(text, rules).ranked;
}

/**
 * HOW SURE, IN WORDS THE SCREEN CAN ACT ON (docs/21 W5).
 *
 * Bands, not a percentage: a keyword count has no calibrated probability
 * behind it, and a number like 0.83 would claim one.
 *
 * - `high`   — one clear answer. The screen says "נראה שזה…" with a
 *              confirm button.
 * - `medium` — two close answers, or one resting on a single word. The
 *              screen offers both.
 * - `low`    — too many close answers, or a word with two meanings. The
 *              screen asks one short question (`clarify`).
 * - `none`   — nothing matched. The screen shows the categories.
 *
 * In every band the customer confirms before anything is dispatched.
 */
export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface RequestMatch {
  candidates: ServiceMatch[];
  confidence: MatchConfidence;
  clarify?: MatchClarify;
  urgentCare: UrgentCare | null;
}

/** A single survivor still needs this much evidence to be called clear. */
const CLEAR_SCORE = 1.5;
/** How far ahead of the second the first must be to be called clear. */
const CLEAR_MARGIN = 1;
/** A clarifying question never offers more than this many answers. */
const MAX_OPTIONS = 3;

export function matchRequest(text: string, rules: ServiceMatchRule[] = catalogMatchRules): RequestMatch {
  const { ranked, clarify } = score(text, rules);
  const urgentCare = urgentCareFor(text);
  if (clarify) return { candidates: ranked, confidence: "low", clarify, urgentCare };
  if (ranked.length === 0) return { candidates: [], confidence: "none", urgentCare };

  const [first, second] = ranked;
  /*
   * Nothing but a near-miss spelling ("פיצה" is one letter from "פריצה"):
   * worth asking about, never worth suggesting. The typo forgiveness that
   * rescues "נחנחק לי החתול" works because "החתול" is there beside it.
   */
  if (first!.score < 1) {
    return {
      candidates: ranked,
      confidence: "low",
      clarify: { questionHe: "התכוונתם ל…?", options: ranked.slice(0, MAX_OPTIONS).map((m) => m.serviceId) },
      urgentCare,
    };
  }
  if (!second || first!.score - second.score >= CLEAR_MARGIN) {
    return { candidates: ranked, confidence: first!.score >= CLEAR_SCORE ? "high" : "medium", urgentCare };
  }
  if (ranked.length === 2) return { candidates: ranked, confidence: "medium", urgentCare };
  return {
    candidates: ranked,
    confidence: "low",
    clarify: { questionHe: "מה מתאר את זה הכי טוב?", options: ranked.slice(0, MAX_OPTIONS).map((m) => m.serviceId) },
    urgentCare,
  };
}

/** The product's rules: every service in the catalogue, with its department. */
export function matchRulesFor(catalog: CatalogDepartmentDef[]): ServiceMatchRule[] {
  return catalog.flatMap((d) =>
    allServices([d]).map((s) => ({
      serviceId: s.id,
      keywords: [s.nameHe, ...s.keywordsHe, ...s.symptomsHe],
      nameHe: s.nameHe,
      domain: d.code,
    }))
  );
}

export const catalogMatchRules: ServiceMatchRule[] = matchRulesFor(pilotCatalog);

/**
 * WHEN THE ANSWER IS NOT A SERVICE.
 *
 * "הילד נחנק" typed into a service app has one right answer, and it is not
 * a professional eleven minutes away: it is מד״א, 101, now. The same words
 * about a cat still lead to the vet — that is what the customer asked for —
 * but with one line saying that when every minute counts, an emergency
 * clinic is the faster door.
 *
 * Deliberately narrow: only the words that mean a life is at stake, so the
 * banner is never noise on "הילד חולה" or "יש לכלב חום".
 */
const LIFE_AT_STAKE = [
  "נחנק", "נחנקת", "נחנקה", "נחנקים", "נחנקו", "נחנקתי",
  "לא נושם", "לא נושמת", "לא נושמים", "קשה לנשום", "קשיי נשימה",
  "איבד הכרה", "איבדה הכרה", "מחוסר הכרה", "חסר הכרה", "התעלף", "התעלפה",
  "דום לב", "כאבים בחזה", "כאב בחזה", "לחץ בחזה",
  "מפרכס", "מפרכסת", "פרכוס", "פרכוסים",
  "דימום חזק", "מדמם הרבה", "מדממת הרבה",
  "הורעל", "הורעלה", "הרעלה", "בלע כדורים", "בלעה כדורים",
  "התחשמל", "התחשמלה", "שבץ", "אלרגיה קשה", "התנפח",
];

const ANIMAL_WORDS = [
  "חתול", "חתולה", "חתלתול", "כלב", "כלבה", "גור", "גורה", "ארנב", "ארנבת",
  "תוכי", "ציפור", "אוגר", "שרקן", "צב", "חמוס", "חיה", "חיית", "בעל חיים",
];

export type UrgentCare = "person" | "animal";

export function urgentCareFor(text: string): UrgentCare | null {
  const typed = read(text);
  if (typed.seq.length === 0) return null;
  const hit = (k: string) => hitsOf(k, typed).length > 0;
  if (!LIFE_AT_STAKE.some(hit)) return null;
  return ANIMAL_WORDS.some(hit) ? "animal" : "person";
}
