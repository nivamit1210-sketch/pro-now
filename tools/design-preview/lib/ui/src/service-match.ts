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
 */

export interface ServiceMatchRule {
  serviceId: string;
  /** Words and fragments a person would actually type, not category names. */
  keywords: string[];
  /** The service's own name. Typing it whole is the strongest evidence there is. */
  nameHe?: string;
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
}

interface Typed {
  seq: TypedWord[];
  flat: string;
}

function read(text: string): Typed {
  const flat = normalise(text);
  const seq = flat
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      const words = unprefixed(w);
      const forms = new Set<string>();
      for (const u of words) for (const f of unsuffixed(u)) forms.add(f);
      return { words, forms };
    });
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
 * THE SCORE IS HOW MUCH OF THE SENTENCE A SERVICE EXPLAINS — the number of
 * typed words its keywords account for, each word counted once. Counting
 * keywords instead let "כלב", "כלבה" and "כלבים" vote three times for one
 * typed "הכלב", and a service with a long word list out-shouted the one
 * whose list held the word that actually mattered ("נחנק").
 */
export function matchServicesByText(text: string, rules: ServiceMatchRule[]): ServiceMatch[] {
  const typed = read(text);
  if (typed.seq.length === 0) return [];

  const scored: ServiceMatch[] = [];
  const exactBy = new Map<string, number>();
  const slipOnly = new Set<string>();
  for (const rule of rules) {
    const covered = new Map<number, number>();
    for (const keyword of rule.keywords)
      for (const [i, w] of hitsOf(keyword, typed)) covered.set(i, Math.max(covered.get(i) ?? 0, w));
    if (covered.size === 0) continue;
    let score = [...covered.values()].reduce((a, b) => a + Math.min(1, b), 0);
    const exact = [...covered.values()].filter((w) => w === EXACT).length;
    /* The service's whole name, typed: it wins a tie it would otherwise lose. */
    if (rule.nameHe) {
      const name = normalise(rule.nameHe).split(" ").filter((p) => p.length > 1 && !NAME_GLUE.has(p));
      if (name.length > 0 && name.every((part) => typed.seq.some((w) => sameWord(w, part)))) score += 0.5;
    }
    scored.push({ serviceId: rule.serviceId, score: Math.round(score * 10) / 10 });
    exactBy.set(rule.serviceId, exact);
    if ([...covered.values()].every((w) => w < 1)) slipOnly.add(rule.serviceId);
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
  const kept = ranked.filter((m) => m.score >= floor);
  /*
   * A WORD SPELLED EXACTLY BEATS ONE THAT ONLY LOOKS LIKE IT.
   *
   * "ספרית" (a hairdresser) is one letter from "ספריה" (a bookcase), and the
   * two scored the same — so a hairdresser joining was offered furniture
   * assembly. When something matched properly, a match made of near-spellings
   * alone is dropped.
   */
  if (kept.some((m) => !slipOnly.has(m.serviceId))) return kept.filter((m) => !slipOnly.has(m.serviceId));
  return kept;
}

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
