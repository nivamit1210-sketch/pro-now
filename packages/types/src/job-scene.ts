import type { JobState } from "./job";
import type { LivingMapPhase } from "./living-map";
import { DEFAULT_VISIT_TERMS, selfHe, type PricingKind, type VisitTermsHe } from "./catalog";

/**
 * WHAT THE WORLD IS DOING, DERIVED FROM WHAT THE JOB IS DOING.
 *
 * ---------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT A `useState` IN A SCREEN
 * ---------------------------------------------------------------------
 * The Living Map has four phases and the server has seventeen job states.
 * Until now the mapping between them existed only inside the design
 * gallery, where a human clicked "next step" — so the phase was whatever
 * the reviewer said it was, and the real app never took part.
 *
 * The moment the real app polls `/v1/jobs/:id`, somebody has to answer
 * "the job says PRO_EN_ROUTE, what is the world showing?" — and the
 * dangerous way to answer it is a `switch` inside a screen, because a
 * screen cannot be tested and because the next screen that needs the same
 * answer will write a second, slightly different `switch`.
 *
 * ---------------------------------------------------------------------
 * THE ONE RULE THAT MATTERS
 * ---------------------------------------------------------------------
 * Amit's phase split, in his words:
 *
 *   "השלב של החיפוש יהיה שלב שהרדאר שלנו עובר בלי כפתור לחיצות, עם הדמות
 *    בין הרחובות... השלב של המשחק מגיע בשלב ההמתנה לאיש מקצוע. לדוגמה, יש
 *    20 דקות עד שהוא מגיע, ב-20 דקות האלה אני רוצה שיהיה משחק."
 *
 * Searching SHOWS. Waiting PLAYS. `LivingMapScene` already enforces this —
 * it only lets the customer steer in `ASSIGNED_ROUTE` — which means this
 * mapping is what decides whether the arrows appear. Get it wrong by one
 * state and either the game shows up while we are still looking (Amit's
 * "no buttons" rule broken) or it never shows up at all.
 *
 * ---------------------------------------------------------------------
 * AND THE TWO PHASES THIS FUNCTION CANNOT RETURN
 * ---------------------------------------------------------------------
 * `CANDIDATES_FOUND` and `MATCH_REVEAL` need real people: the first needs
 * a list of eligible candidates, the second needs exactly one chosen one.
 * `GET /v1/jobs/:id` returns neither — it gives a status and an assigned
 * professional's ID, not a roster. Returning `CANDIDATES_FOUND` from a
 * status alone would mean drawing bubbles for candidates nobody named,
 * which is /CLAUDE.md §3's fabricated supply wearing a costume.
 *
 * So this function answers from the job alone and the screen upgrades to
 * `MATCH_REVEAL` only once `/v1/jobs/:id/match` has actually handed it a
 * professional. A caller with no match data gets a world that is honestly
 * still searching.
 */
export function scenePhaseForJob(status: JobState): LivingMapPhase {
  switch (status) {
    /*
     * Still looking. DRAFT is here because a job that has not been sent is
     * not a job that has found anybody — and showing the search is a
     * better answer than a blank screen if a draft ever reaches here.
     */
    case "DRAFT":
    case "SEARCHING":
    case "OFFERING":
      return "SEARCHING";

    /*
     * Somebody is coming. Everything from assignment to the end of the
     * visit is the same world: the customer's figure in the street with a
     * professional on the way to them or already there.
     *
     * PRO_ARRIVED through IN_PROGRESS stay here deliberately. The screen
     * that owns those moments is Tracking, and this map is not it — but if
     * a customer is still on this screen when the knock comes, the world
     * should not snap back to "searching" as if the job had evaporated.
     */
    case "PRO_ASSIGNED":
    case "PRO_EN_ROUTE":
    case "PRO_ARRIVED":
    case "DIAGNOSIS":
    case "WAITING_QUOTE_APPROVAL":
    case "IN_PROGRESS":
    case "COMPLETION_PENDING":
      return "ASSIGNED_ROUTE";

    /*
     * Over, one way or another. There is no fifth phase for "finished", and
     * inventing one here would be a scene nobody has designed. The screen
     * navigates away on these states; the phase is what it shows for the
     * frame before it does, and a quiet search is the safe frame.
     */
    default:
      return "SEARCHING";
  }
}

/**
 * Whether this screen is still the thing standing between the customer and
 * their money.
 *
 * Leaving before anyone is assigned cancels the request; leaving afterwards
 * is only navigation, because the professional is already on the way. The
 * back control changes from a labelled pill to a bare chevron on exactly
 * this boundary, and `SearchingBody` takes the label rather than deciding
 * it, so the decision lives here where it can be tested.
 */
export function leavingCancels(status: JobState): boolean {
  return scenePhaseForJob(status) === "SEARCHING" && status !== "CANCELLED";
}

/** Job states this screen has nothing left to show, and must hand on. */
export function sceneIsOver(status: JobState): boolean {
  return status === "CANCELLED" || status === "CLOSED" || status === "DISPUTED";
}

/**
 * WHAT IS HAPPENING NOW, AND WHAT HAPPENS NEXT.
 *
 * ---------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------
 * Amit, on the visit: *"חייב לעבוד על מסך העבודה בעיצומה, זה לא מובן
 * בכלל. אחרי הקוד הגעתי לפה, לא קורה פה כלום."*
 *
 * He is right and the screen was not broken — it was silent. Once the
 * arrival code is verified the journey is over, so everything that
 * screen had been saying (a countdown, a clock, "בדרך אליך") stops being
 * true, and what replaced it was a status word: "העבודה בעיצומה". That
 * is a label, not an answer. A person standing in their own kitchen
 * watching a stranger work wants to know two things — what is he doing,
 * and what is going to be asked of me — and neither was anywhere on the
 * screen.
 *
 * So each state says both, in one sentence, and the second half is
 * always the customer's own next move. Nothing here promises a time:
 * "how long will the diagnosis take" is not knowable from a state, and
 * inventing it would be the same fabrication as an invented ETA
 * (/CLAUDE.md §3).
 *
 * It lives beside the state machine rather than in a screen for the same
 * reason `arrivalHeadlineHe` does: the words and the state must not be
 * able to drift apart, and they drift the moment they are in different
 * files.
 */
export function jobProgressHe(
  status: JobState,
  firstNameHe?: string | null,
  /** A price-list job (a haircut, a dog walk) rather than a repair priced only once somebody looks. */
  opts: { fixed?: boolean; terms?: VisitTermsHe; female?: boolean; kind?: PricingKind; forSomeoneElse?: boolean } = {}
): string | null {
  const who = firstNameHe ?? "המקצוען";
  const g = (m: string, f: string) => (opts.female ? f : m);
  const kind: PricingKind = opts.kind ?? (opts.fixed ? "LIST" : "VISIT");
  /* Work that is not a repair has its own sentences — never "מאבחן" on a haircut, an hour of help or a delivery. */
  if (kind !== "VISIT") {
    switch (status) {
      case "PRO_ARRIVED":
        return kind === "DISTANCE" ? `${who} ${g("הגיע לאיסוף", "הגיעה לאיסוף")}.` : `${who} ${g("הגיע", "הגיעה")}. עוד רגע מתחילים.`;
      case "DIAGNOSIS":
        return kind === "HOURLY"
          ? `${who} ${g("התחיל", "התחילה")}. השעון רץ לפי זמן עבודה בפועל.`
          : kind === "DISTANCE"
            ? `${who} ${g("אסף", "אספה")} ${g("ויוצא", "ויוצאת")} למסירה.`
            : `${who} ${g("מתחיל", "מתחילה")} — ${kind === "QUOTE_FIRST" ? "לפי ההצעה שאישרתם" : "לפי מה שהזמנתם"}.`;
      case "IN_PROGRESS":
        return kind === "DISTANCE" ? `${who} בדרך למסירה.` : `${who} ${g("עובד עכשיו. כשיסיים", "עובדת עכשיו. כשתסיים")} תקבלו סיכום לאישור לפני התשלום.`;
      case "COMPLETION_PENDING":
        return `${who} ${g("סיים וממתין", "סיימה וממתינה")} לאישור שלכם שהכול תקין.`;
      default:
        break;
    }
  }
  const t = opts.terms ?? DEFAULT_VISIT_TERMS;
  switch (status) {
    case "PRO_ARRIVED":
      return `${who} ${g("הגיע. עכשיו הוא בודק", "הגיעה. עכשיו היא בודקת")} מה צריך.`;
    case "DIAGNOSIS":
      /* Amit, 2026-09-29: the app charges the visit and the diagnosis; the repair is settled between you. */
      /* Ordered for someone else: the price comes here, never settled at their door (Amit, 2026-10-01). */
      if (!opts.fixed && opts.forSomeoneElse)
        return `${who} ${t.workHe === "התיקון" ? g("מאבחן", "מאבחנת") : g("בודק", "בודקת")}. הצעת המחיר תגיע אליך באפליקציה — בבית לא סוגרים מחיר.`;
      return opts.fixed
        ? `${who} ${g("בודק", "בודקת")} מה צריך. עוד רגע מתחילים לפי מה שהזמנתם.`
        : `${who} ${t.workHe === "התיקון" ? g("מאבחן", "מאבחנת") : g("בודק", "בודקת")}. את ${t.feeSubjectHe} ואת המחיר של ${t.workHe} סוגרים ישירות ${g("איתו", "איתה")} — באפליקציה לא עובר כסף.`;
    case "WAITING_QUOTE_APPROVAL":
      return "הצעת המחיר מחכה לאישור שלכם. אפשר לאשר, לשאול או לסרב.";
    case "IN_PROGRESS":
      return `${who} ${g("עובד עכשיו. כשיסיים", "עובדת עכשיו. כשתסיים")} תקבלו סיכום לאישור לפני התשלום.`;
    case "COMPLETION_PENDING":
      return `${who} ${g("סיים וממתין", "סיימה וממתינה")} לאישור שלכם שהכול תקין.`;
    default:
      // Before he arrives, the arrival assurance owns the words.
      return null;
  }
}

/**
 * ---------------------------------------------------------------------
 * THE SHAPE OF A VISIT, WITH A MARK WHERE YOU ARE IN IT
 * ---------------------------------------------------------------------
 * Amit: *"בשלב שהמקצוען התחיל לבדוק ועד להצעת מחיר אין שום דבר בזמן
 * העבודה, אין שום תחלופה במסך."*
 *
 * `jobProgressHe` answers "what is happening" in one sentence, and it was
 * the only thing on the screen that moved. Between a professional
 * arriving and a price appearing, minutes pass with one unchanging line
 * of text — so a person standing in their kitchen has no way to tell the
 * app is still alive, let alone how much of this is left.
 *
 * A sentence says where you are. It does not say where that IS. Four
 * steps with one of them marked says both, and it changes at every
 * transition — so the screen visibly moves each time something real
 * happens, and never in between.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No times, no percentage, no bar
 * filling up. How long a diagnosis takes is not knowable from a state
 * and inventing it is the same fabrication as an invented ETA
 * (/CLAUDE.md §3). A step is either behind you, the one you are in, or
 * ahead — three honest answers, and no fourth one pretending to measure.
 */
export interface VisitStep {
  labelHe: string;
  state: "DONE" | "NOW" | "AHEAD";
}

/**
 * The five steps, in order. Fixed: a job does not reorder itself.
 *
 * "בדרך" was added after the first version shipped with four. Amit:
 * *"תעבוד על המעברים ועל הזמן שהטכנאי בדרך ועד שהוא מגיע."*
 *
 * The tracker began at the knock, on the reasoning that the journey owns
 * the screen until then — a countdown, a map, somebody moving towards
 * you. That is true about ATTENTION and it was the wrong conclusion. The
 * countdown says how long; it does not say what this is the first of. A
 * person watching a stranger drive toward their flat wants the shape of
 * the whole thing, and the journey is the part of it they are in.
 */
/* No "הצעת מחיר" step: repairs are no longer quoted through the app (2026-09-29). */
const VISIT_STEPS_HE = ["בדרך", "בדיקה", "העבודה", "סיום ותשלום"] as const;

/**
 * Which step a job state sits in, or null before the visit has begun.
 *
 * Null matters, and it now means something narrower: before anybody has
 * ACCEPTED there is no job to show the shape of. A tracker during the
 * search would be drawing four steps of a thing that may never happen,
 * on the one screen in the product that must not imply supply it does
 * not have (/CLAUDE.md §3).
 */
export function visitStepIndex(status: JobState): number | null {
  switch (status) {
    /*
     * Somebody has accepted and is coming. Assigned and en route are one
     * step because they are one thing to the person waiting: the
     * difference is whether a van has pulled out, which is not their
     * business and would move the mark for something they cannot see.
     */
    case "PRO_ASSIGNED":
    case "PRO_EN_ROUTE":
      return 0;
    case "PRO_ARRIVED":
    case "DIAGNOSIS":
    case "WAITING_QUOTE_APPROVAL":
      return 1;
    case "IN_PROGRESS":
      return 2;
    case "COMPLETION_PENDING":
      return 3;
    /*
     * The work is over and the money has moved. The last step reads as
     * done rather than current — a tracker still pointing at "סיום
     * ותשלום" after payment says the visit is unfinished when it is not.
     */
    case "COMPLETED":
    case "PAYMENT_PENDING":
    case "PAYMENT_CAPTURED":
    case "REVIEW_PENDING":
    case "CLOSED":
      return VISIT_STEPS_HE.length;
    default:
      return null;
  }
}

export function visitStepsHe(status: JobState): VisitStep[] | null {
  const at = visitStepIndex(status);
  if (at === null) return null;
  return VISIT_STEPS_HE.map((labelHe, i) => ({
    labelHe,
    state: i < at ? "DONE" : i === at ? "NOW" : "AHEAD",
  }));
}

/**
 * ---------------------------------------------------------------------
 * THE ONE LINE ABOUT MONEY, WHICH SAID THE SAME THING ALL VISIT
 * ---------------------------------------------------------------------
 * Amit, reading the tracking panel: *"איך הצעת מחיר תשלח אם הוא כבר סיים
 * את העבודה? זה אמור להיות לפני."*
 *
 * The order in the state machine was never wrong — diagnosis, quote,
 * approval, work, payment, and no work may start before an approval.
 * What was wrong is that the screen carried ONE sentence, handed to it
 * once by the caller, and kept saying it: *"דמי ביקור ₪179 · הצעת מחיר
 * תישלח לאישורך"*. True at the knock. Still on the screen while the
 * quote sat waiting for an answer, and still there after it had been
 * approved and the work was underway — at which point it describes a
 * future that has already happened, and reads as though the app has lost
 * track of the job. He drew the right conclusion from a real fault.
 *
 * So the money line is DERIVED, like the step tracker beside it, and it
 * lives here for the same reason: the sentence and the state must not be
 * able to drift apart, and they drift the moment they live in different
 * files.
 *
 * WHAT IT WILL NOT DO. It never names a number it was not given. Every
 * amount is passed in already formatted by whoever actually knows it —
 * the server, through the quote — and each state has a wording for
 * having the number and a wording for not having it. That is the
 * difference between a screen that reports and a screen that guesses
 * (/CLAUDE.md §3), and the states where money has MOVED say nothing at
 * all here: no payment provider has been chosen (§4), so this file is
 * not the place that gets to claim somebody was charged.
 */
export interface VisitMoneyFacts {
  /**
   * The visit fee the customer agreed to when they asked, formatted —
   * e.g. "₪179". Null when the service has none.
   */
  visitFeeHe?: string | null;
  /** The total of a quote that is waiting for an answer, formatted. */
  pendingTotalHe?: string | null;
  /** The total of the quote the customer APPROVED, formatted. */
  approvedTotalHe?: string | null;
  /**
   * A price agreed in full BEFORE anyone was dispatched — a FIXED
   * service, formatted.
   *
   * It is not a fourth amount to add to the others: it replaces the
   * whole conversation. On a fixed-price job there is no quote coming,
   * so every sentence below about one waiting, arriving or being
   * approved would be a promise about a thing that will never happen.
   */
  fixedTotalHe?: string | null;
  /** The trade's own words for the visit (`visitTermsHe`). */
  terms?: VisitTermsHe;
  /** How the service is paid for (`pricingKindOf`); decides which sentences exist at all. */
  kind?: PricingKind;
  /**
   * Ordered for someone else (Amit, 2026-10-01): a repair is not settled at
   * the door — the professional's quote comes to the person who ordered,
   * in the app. Under D1 it is approved on sending, so no line says the
   * orderer approves or pays in the app.
   */
  forSomeoneElse?: boolean;
  /** HOURLY: the rate, formatted — "₪110". */
  hourlyRateHe?: string | null;
  /**
   * No money moves through the app (docs/21 §5 D1): every amount is paid
   * to the professional directly, so no line may speak of approving,
   * holding or releasing a payment.
   */
  paidDirectly?: boolean;
}

export function visitMoneyLineHe(status: JobState, facts: VisitMoneyFacts = {}): string | null {
  const fee = facts.visitFeeHe ?? null;
  const t = facts.terms ?? DEFAULT_VISIT_TERMS;
  if (facts.paidDirectly) {
    const agreed = facts.approvedTotalHe ?? facts.fixedTotalHe ?? null;
    if (status === "IN_PROGRESS") {
      return agreed ? `הצעת המחיר: ${agreed} · משלמים ישירות למקצוען` : "משלמים ישירות למקצוען · באפליקציה לא עובר כסף";
    }
    if (status === "COMPLETION_PENDING") {
      const due = agreed ?? fee;
      return due ? `${due} · לתשלום ישירות למקצוען` : "משלמים ישירות למקצוען · באפליקציה לא עובר כסף";
    }
  }
  /* By the hour: the rate while he works, the total once he is done. */
  if (facts.kind === "HOURLY") {
    switch (status) {
      case "COMPLETION_PENDING":
        return facts.approvedTotalHe ? `לתשלום ${facts.approvedTotalHe} · אחרי שתאשרו שהעבודה הושלמה` : "הסכום לפי זמן העבודה · אחרי שתאשרו";
      case "PRO_ASSIGNED": case "PRO_EN_ROUTE": case "PRO_ARRIVED": case "DIAGNOSIS": case "IN_PROGRESS":
        return facts.hourlyRateHe ? `${facts.hourlyRateHe} לשעה · לפי זמן עבודה בפועל` : "לפי שעה · לפי זמן עבודה בפועל";
      default:
        return null;
    }
  }
  /* By distance: the price was shown before he set off. */
  if (facts.kind === "DISTANCE" && !facts.fixedTotalHe) {
    switch (status) {
      case "COMPLETION_PENDING":
        return facts.approvedTotalHe ? `לתשלום ${facts.approvedTotalHe} · אחרי שתאשרו שהמשלוח נמסר` : "לתשלום אחרי שתאשרו שהמשלוח נמסר";
      case "PRO_ASSIGNED": case "PRO_EN_ROUTE": case "PRO_ARRIVED": case "DIAGNOSIS": case "IN_PROGRESS":
        return facts.approvedTotalHe ? `${facts.approvedTotalHe} · לפי מרחק, סוכם מראש` : "לפי מרחק · המחיר הוצג לפני שאישרתם";
      default:
        return null;
    }
  }

  /*
   * The price was settled before the van moved, so the only thing that
   * changes across the visit is the tense — and the last change is the
   * one that matters: it becomes payable when the customer agrees the
   * work is done, not when the professional says so.
   */
  if (facts.fixedTotalHe || facts.kind === "LIST" || facts.kind === "QUOTE_FIRST") {
    const agreed = facts.fixedTotalHe ?? "המחיר שסוכם";
    switch (status) {
      case "PRO_ASSIGNED":
      case "PRO_EN_ROUTE":
      case "PRO_ARRIVED":
      case "DIAGNOSIS":
      case "WAITING_QUOTE_APPROVAL":
      case "IN_PROGRESS":
        return `${agreed} · סוכם מראש, משלמים ישירות למקצוען`;
      case "COMPLETION_PENDING":
        return `לתשלום ${agreed} · אחרי שתאשרו שהעבודה הושלמה`;
      default:
        return null;
    }
  }

  switch (status) {
    /*
     * Nobody has looked at anything yet, so the only honest numbers are
     * the fee that was agreed when the call was sent and the promise
     * that a price will come before any work does.
     */
    /*
     * WORK PRICED ONLY ONCE SOMEBODY LOOKS (Amit, 2026-09-29): the app
     * charges the visit and the diagnosis, and that is all it charges.
     * What the repair costs is agreed between the customer and the
     * professional at the door, and paid to him directly — so no line
     * here promises a quote the app will carry.
     */
    case "PRO_ASSIGNED":
    case "PRO_EN_ROUTE":
    case "PRO_ARRIVED":
      if (facts.forSomeoneElse) return fee ? `${t.feeHe} ${fee} · אחר כך הצעת מחיר אליך באפליקציה` : `${t.feeHe} לפי המקצוען · אחר כך הצעת מחיר אליך באפליקציה`;
      return fee
        ? `${t.feeHe} ${fee} · משלמים ישירות למקצוען`
        : `${t.feeHe} לפי המקצוען · משלמים ישירות למקצוען`;

    /*
     * He is looking now. The promise is the same and its TIMING is what
     * changed, which is the whole point of a line that moves: it tells
     * you the next thing is close rather than repeating the brochure.
     */
    case "DIAGNOSIS":
      if (facts.forSomeoneElse) return `אחרי ${t.feeSubjectHe} הצעת המחיר תגיע אליך באפליקציה · בבית לא סוגרים מחיר`;
      return fee
        ? `${fee} על ${t.feeSubjectHe} · את ${selfHe(t.workHe)} סוגרים ישירות מול המקצוען`
        : `את ${selfHe(t.workHe)} סוגרים ישירות מול המקצוען`;

    /*
     * The ball is in the customer's court, and this is the moment the
     * "not charged until you approve" promise has to be visible — it is
     * worth nothing on the screens where there is nothing to approve.
     * The visit fee is not restated: it is offset against the quote, so
     * naming both here reads as two charges.
     */
    case "WAITING_QUOTE_APPROVAL":
      return facts.pendingTotalHe
        ? `הצעת מחיר על סך ${facts.pendingTotalHe} ממתינה לאישורכם · לא מחויב עד שתאשרו`
        : "הצעת מחיר ממתינה לאישורכם · לא מחויב עד שתאשרו";

    /*
     * Approved, and the work is running against exactly that version.
     * Saying the amount back is the reassurance the customer wants while
     * somebody is in their kitchen: the price cannot move under them.
     */
    case "IN_PROGRESS":
      return facts.approvedTotalHe
        ? `אישרתם ${facts.approvedTotalHe} · זה הסכום לעבודה הזו`
        : "העבודה מתבצעת לפי ההצעה שאישרתם";

    /*
     * He says he is done; the customer has not agreed yet. The amount is
     * "לתשלום" and not "שולם", because nothing has been captured and
     * because the customer's agreement is the thing standing between the
     * two.
     */
    case "COMPLETION_PENDING":
      return facts.approvedTotalHe
        ? `לתשלום ${facts.approvedTotalHe} · אחרי שתאשרו שהעבודה הושלמה`
        : fee
          ? `לתשלום ${fee} · ${t.feeHe.replace("דמי ביקור", "דמי הביקור").replace(/ו(אבחון|בדיקה)$/, "וה$1")}, אחרי שתאשרו`
          : "הסכום לתשלום ייסגר אחרי שתאשרו שהביקור הושלם";

    /*
     * Everything else — before a professional exists, and after the
     * money has moved. The screens that own those moments say it
     * themselves, and a panel still talking about a quote on either side
     * of the visit is the fault this function was written for.
     */
    default:
      return null;
  }
}

/**
 * ---------------------------------------------------------------------
 * WHAT THE PROFESSIONAL IS SUPPOSED TO BE DOING RIGHT NOW
 * ---------------------------------------------------------------------
 * Amit, pressing through a visit on the professional's side: *"עדיין כל
 * המסכים פה אותו דבר ואין שום שינוי בין בדרך לבדיקה להצעת מחיר, הכל
 * נשאר באותו מסך."*
 *
 * The screens WERE separate screens by then — each state has its own key
 * and its own transition. What he was describing is the other half of
 * the same complaint and the harder one: the screen showed the same
 * things in the same order at every stage. The address, the drive time
 * and a navigation button are the whole job while you are driving and
 * clutter once you are standing in the kitchen; the customer's photos
 * and their description are the whole job at the diagnosis and noise
 * while you are still in the van. Everything was always there, so
 * nothing ever changed.
 *
 * `jobProgressHe` is the customer's version of this sentence. This is
 * the professional's, and it is deliberately a different sentence: the
 * customer is told what is happening TO them, and the professional is
 * told what is theirs to do. Same state machine, two audiences.
 *
 * Nothing here promises a time and nothing counts anything, for the same
 * reason as everywhere else in this file.
 */
export function proJobFocusHe(status: JobState): string | null {
  switch (status) {
    case "PRO_ASSIGNED":
      return "העבודה שלך. הלקוח כבר יודע שאתה מגיע.";
    case "PRO_EN_ROUTE":
      return "בדרך לכתובת. הלקוח רואה אותך מתקדם על המפה.";
    case "PRO_ARRIVED":
      return "הגעת. שווה להסתכל על מה שהלקוח תיאר לפני שמתחילים.";
    case "DIAGNOSIS":
      return "בבדיקה. כשתסיים, לוחצים ״סיימתי״ — את המחיר של העבודה עצמה סוגרים ישירות מול הלקוח.";
    case "WAITING_QUOTE_APPROVAL":
      return "ההצעה אצל הלקוח. אי אפשר להתחיל לעבוד לפני שהוא מאשר.";
    case "IN_PROGRESS":
      return "ההצעה אושרה. אפשר לעבוד לפי מה שסוכם.";
    case "COMPLETION_PENDING":
      return "אמרת שסיימת. הלקוח מאשר שהעבודה הושלמה, ואז נסגר התשלום.";
    default:
      return null;
  }
}

/**
 * WHICH PART OF THE JOB SCREEN IS THE POINT AT THIS STAGE.
 *
 * Not a style and not a layout — an answer to "what is this person
 * looking at right now", which the screen then arranges itself around.
 * It lives here because it is a fact about the state machine: the
 * address stops mattering at the moment somebody arrives, and the
 * customer's description starts mattering at the same moment.
 */
export type ProJobFocus = "TRAVEL" | "PROBLEM" | "MONEY";

export function proJobFocusFor(status: JobState): ProJobFocus | null {
  switch (status) {
    case "PRO_ASSIGNED":
    case "PRO_EN_ROUTE":
      return "TRAVEL";
    case "PRO_ARRIVED":
    case "DIAGNOSIS":
      return "PROBLEM";
    case "WAITING_QUOTE_APPROVAL":
    case "IN_PROGRESS":
    case "COMPLETION_PENDING":
      return "MONEY";
    default:
      return null;
  }
}

/**
 * ---------------------------------------------------------------------
 * THE PRICE COMES BEFORE THE WORK, AND THAT IS A RULE, NOT A LAYOUT
 * ---------------------------------------------------------------------
 * Amit, twice: *"איך הצעת מחיר תשלח אם הוא כבר סיים את העבודה? זה אמור
 * להיות לפני"*, and then *"זה אמור להיות לפני שהוא עובד בכלל, ההצעת
 * מחיר."*
 *
 * He is right and it is the single most important ordering in the
 * product: nobody works in somebody's home before that person has agreed
 * what it costs. The order is already enforced by the state machine —
 * DIAGNOSIS → WAITING_QUOTE_APPROVAL → IN_PROGRESS, with no edge that
 * skips the middle — and by the screens, where the only control at a
 * diagnosis opens the quote form and the only thing that leaves the wait
 * is the customer's answer.
 *
 * What it did not have was a test. Everything he has caught in the last
 * day has been something that was true once and quietly stopped being
 * true, so the rule he keeps restating gets written down as a check
 * rather than as a sentence.
 *
 * The canonical order of a visit, from which both the tracker and this
 * are derived. Not the full state list: this is the path a visit takes
 * when nothing goes wrong, and it is the only thing the order rule is
 * about.
 */
export const VISIT_ORDER: readonly JobState[] = [
  "PRO_ASSIGNED",
  "PRO_EN_ROUTE",
  "PRO_ARRIVED",
  "DIAGNOSIS",
  "WAITING_QUOTE_APPROVAL",
  "IN_PROGRESS",
  "COMPLETION_PENDING",
];

/** The invariants of that order, as a test rather than as a comment. */
export function visitOrderViolations(): string[] {
  const out: string[] = [];
  const at = (s: JobState) => VISIT_ORDER.indexOf(s);

  // The one Amit keeps restating.
  if (!(at("WAITING_QUOTE_APPROVAL") < at("IN_PROGRESS"))) {
    out.push("work happens before the customer has approved a price");
  }
  // And the one it depends on: a price is written after somebody looked.
  if (!(at("DIAGNOSIS") < at("WAITING_QUOTE_APPROVAL"))) {
    out.push("a price is quoted before anybody has looked at the fault");
  }
  // Nobody looks at a fault before arriving at it.
  if (!(at("PRO_ARRIVED") < at("DIAGNOSIS"))) {
    out.push("the diagnosis happens before the professional arrives");
  }
  // Money moves last, and only after the customer agrees it is finished.
  if (at("COMPLETION_PENDING") !== VISIT_ORDER.length - 1) {
    out.push("something happens after the customer confirms the work is done");
  }

  /*
   * And the tracker must agree with all of it. Two orderings that are
   * written down separately are two orderings that will disagree — the
   * customer being told step three while the professional is shown step
   * two is the exact failure this product cannot afford.
   */
  for (let i = 1; i < VISIT_ORDER.length; i += 1) {
    const prev = visitStepIndex(VISIT_ORDER[i - 1]!);
    const now = visitStepIndex(VISIT_ORDER[i]!);
    if (prev === null || now === null) {
      out.push(`${VISIT_ORDER[i - 1]} → ${VISIT_ORDER[i]} is not part of the tracker`);
    } else if (now < prev) {
      out.push(`the tracker goes backwards from ${VISIT_ORDER[i - 1]} to ${VISIT_ORDER[i]}`);
    }
  }

  return out;
}

/**
 * ---------------------------------------------------------------------
 * CAN THE PROFESSIONAL STILL GET OUT OF IT?
 * ---------------------------------------------------------------------
 * Amit, on the job screen right after accepting: *"אחרי שהוא רשם כן אני
 * לוקח, הוא לא יכול להתחרט? אין פה כפתור ביטול או חזור."*
 *
 * He could not, and that is not a safety feature — it is a screen with
 * no answer to something that happens. A van breaks down, a previous job
 * runs three hours over, somebody realises on the doorstep that this is
 * not work they are licensed for. A product with no way to say so gets
 * told by silence: the professional simply does not turn up, and the
 * customer waits for somebody who was never coming.
 *
 * WHERE THE LINE IS. Up to and including the diagnosis, releasing a job
 * costs the customer time and nothing else: no price has been agreed and
 * no money is committed, so the honest thing is to hand them back to
 * dispatch immediately. From the moment a quote is waiting, the money is
 * involved — an amount is held on approval (see `payment-moments.ts`) —
 * and walking away from that is not a release, it is a dispute. Those
 * need different machinery and a policy nobody has written
 * (/CLAUDE.md §4 lists cancellation fees as an open decision), so this
 * refuses to pretend otherwise rather than offering a button that would
 * quietly do the wrong thing.
 *
 * What this deliberately does NOT decide: whether releasing costs the
 * professional anything, and what repeated releases do to their
 * dispatch. Both are business rules and both are open.
 */
export function canReleaseJob(status: JobState): boolean {
  switch (status) {
    case "PRO_ASSIGNED":
    case "PRO_EN_ROUTE":
    case "PRO_ARRIVED":
    case "DIAGNOSIS":
      return true;
    default:
      return false;
  }
}

/** Why there is no way out here, when there is not one. */
export function releaseBlockedHe(status: JobState): string | null {
  if (canReleaseJob(status)) return null;
  switch (status) {
    case "WAITING_QUOTE_APPROVAL":
    case "IN_PROGRESS":
    case "COMPLETION_PENDING":
      return "העבודה כבר התחילה, אז אי אפשר לשחרר את הקריאה מכאן. אם משהו השתבש — פנייה לתמיכה.";
    default:
      return null;
  }
}
