import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import {
  canReleaseJob,
  formatMoney,
  money,
  proJobFocusFor,
  proJobFocusHe,
  releaseBlockedHe,
  type JobState,
  DEFAULT_VISIT_TERMS,
  selfHe,
  type VisitTermsHe,
  type PricingKind,
} from "@pro-now/demo-types";

import { elevation, proTheme, radii, scale, spacing, tabular, tint, type } from "../theme";
import { lex } from "../lexicon";
import { ClockMark, Mark, type MarkName, PinMark, ShieldCheckMark } from "../components/marks";
import { Persona } from "../components/Persona";
import { VisitSteps } from "../components/VisitSteps";
import { ImageSlot, SectionHeader, Surface } from "../components/surfaces";

/**
 * P20 — the job the professional actually took.
 *
 * This screen was missing, and its absence was the sharpest thing the first
 * user found: the offer card was followed by nothing. A professional who
 * accepts a job and lands back on a map has been told "you won it" and
 * nothing else — not where, not for whom, not what the problem is, not what
 * to bring.
 *
 * So this is the working screen, and it is organised around the four
 * questions asked in the van, in the order they are asked:
 *
 *   1. Where am I going, and can I start driving now?
 *   2. Who am I meeting, and how do I reach them?
 *   3. What is actually wrong — in their words, and their photos?
 *   4. What am I being paid?
 *
 * PRIVACY IS THE HINGE. Everything above the fold here is information that
 * did NOT exist on the offer card, and the difference is assignment: the
 * exact address, the door code and a way to call are released only once the
 * job is assigned (/docs/12-PRIVACY.md). The number is masked in both
 * directions — neither side ends up holding the other's personal line — and
 * the screen says so rather than leaving it to be discovered.
 *
 * ONE ACTION AT A TIME. The state machine (/docs/07-JOB-STATE-MACHINE.md)
 * allows exactly one forward move from each state, so the screen shows
 * exactly one primary button. A row of equally weighted verbs is how a
 * professional taps "סיימתי" while still parking.
 */

const colors = proTheme.colors;

export interface JobMediaItem {
  id: string;
  kind: "PHOTO" | "VOICE";
  /** What the customer's photo shows, for the honest placeholder. */
  subjectHe: string;
  /** Voice note length in seconds. */
  seconds?: number;
  /** Real media URL once storage exists; null in the prototype. */
  uri?: string | null;
}

export interface ProJobBodyProps {
  status: JobState;
  serviceNameHe: string;
  mark: MarkName;
  /** Full address — released only because the job is assigned. */
  addressHe: string;
  /** Floor, entrance, door code. The difference between arriving and finding. */
  accessNoteHe: string | null;
  /** Straight-line distance is not a route; this comes from the router. */
  routeEtaMinutes: number | null;
  distanceHe: string | null;
  customerNameHe: string;
  customerSeed: string;
  /**
   * THE FIGURE THE CUSTOMER CHOSE FOR THEMSELVES.
   *
   * Amit: *"למה התמונה של בעל המקצוע והשם וגם של הלקוח לא מהדמויות
   * שבנינו?"*
   *
   * Because nothing was passing them. The monogram is the right answer
   * when we have nothing — it claims no likeness — and it was being
   * shown to a professional about somebody who had picked a character
   * out of twelve we drew. That is not a missing asset, it is a fact the
   * screen was never given.
   *
   * It is honest for exactly that reason: it is not a photograph and not
   * a guess, it is the picture the customer chose to be. Null when they
   * skipped the picker, which is a real answer, and the monogram comes
   * back.
   */
  customerPhotoUri?: string | null;
  /**
   * The top of the usual range for this service, or null when there is
   * not enough history to say — the same answer, from the same source,
   * that the customer's quote screen will show. See `price-context.ts`:
   * it refuses to speak below eight real jobs, and so does this.
   */
  usualUpToMinorUnits?: number | null;
  /** How many jobs that is. A range without its count is not evidence. */
  usualSampleSize?: number;
  /** Set when the call was placed for someone else who is at the address. */
  onSiteContactNameHe?: string | null;
  /**
   * The code this professional says at the door. The customer (or the
   * person at home) asks for it; only the assigned professional has it.
   */
  doorCodeHe?: string | null;
  /** The symptoms the customer tapped on the service page. */
  symptomsHe: string[];
  descriptionHe: string | null;
  media: JobMediaItem[];
  /** Expected payout, or null when it genuinely depends on the outcome. */
  payoutMinorUnits: number | null;
  /** Minutes since the quote was sent. Null when not waiting. */
  waitingMinutes?: number | null;
  /** Lets the professional revise a quote the customer has not answered. */
  onWithdrawQuote?: () => void;
  payoutIsEstimate: boolean;
  onNavigate?: () => void;
  onCall?: () => void;
  onMessage?: () => void;
  onAdvance?: () => void;
  onSendQuote?: () => void;
  /**
   * A price agreed before he came — a fixed-price or hourly service. Then
   * the check leads straight to work at that price ("מתחיל לעבוד · ₪120"),
   * and a quote is only for something extra the customer must approve.
   */
  agreedPriceHe?: string | null;
  onStartAgreed?: () => void;
  /**
   * WORK PRICED ONLY ONCE SOMEBODY LOOKS (Amit, 2026-09-29). The app
   * charges the visit and the diagnosis; the repair is agreed and paid
   * between the two of them. So at DIAGNOSIS the move is to finish the
   * diagnosis, not to send a quote through the app.
   */
  diagnosisOnly?: boolean;
  /** The trade's words for the visit (`visitTermsHe`). */
  visitTerms?: VisitTermsHe;
  /** How this job is paid (`pricingKindOf`) — decides the band's words. */
  kind?: PricingKind;
  /** The professional is a woman: "צאי לדרך", "לחצי". */
  proFemale?: boolean;
  onFinishDiagnosis?: () => void;
  /**
   * GIVING THE JOB BACK.
   *
   * Amit, on this screen right after accepting: *"אחרי שהוא רשם כן אני
   * לוקח, הוא לא יכול להתחרט? אין פה כפתור ביטול או חזור."*
   *
   * He could not, and that is not a safety feature — it is a screen with
   * no answer to something that happens. A van breaks down, the previous
   * job runs three hours over, somebody realises on the doorstep that
   * this is not work they are licensed for. With nowhere to say so the
   * product gets told by silence: the professional does not turn up and
   * the customer waits for somebody who was never coming.
   *
   * Offered only while `canReleaseJob` — up to the diagnosis, where the
   * cost is the customer's time and nothing else. Past that an amount is
   * held and walking away is a dispute, not a release.
   */
  onRelease?: () => void;
  width?: number;
  height?: number;
}

/** The single forward move allowed from each state, and what to call it. */
function nextAction(status: JobState): { label: string; kind: "advance" | "quote" } | null {
  switch (status) {
    case "PRO_ASSIGNED":
      return { label: "יציאה לדרך", kind: "advance" };
    case "PRO_EN_ROUTE":
      return { label: "הגעתי", kind: "advance" };
    case "PRO_ARRIVED":
      return { label: "התחלת בדיקה", kind: "advance" };
    case "DIAGNOSIS":
      return { label: "שליחת הצעת מחיר", kind: "quote" };
    case "WAITING_QUOTE_APPROVAL":
      return null; // The customer's move, not ours. No button to press.
    case "IN_PROGRESS":
      return { label: "סיימתי את העבודה", kind: "advance" };
    default:
      return null;
  }
}

const STATUS_HE: Partial<Record<JobState, string>> = {
  PRO_ASSIGNED: "העבודה שלך",
  PRO_EN_ROUTE: lex.onTheWay,
  PRO_ARRIVED: "הגעת לכתובת",
  DIAGNOSIS: "באבחון",
  WAITING_QUOTE_APPROVAL: "ממתין לאישור הלקוח",
  IN_PROGRESS: lex.working,
  COMPLETION_PENDING: "ממתין לאישור סיום",
};

/*
 * EVERY STEP LOOKS LIKE ITS OWN STEP.
 *
 * Amit, on the row of professional screens: *"כל עמוד נראה אותו דבר, כל
 * לחיצה לא מבינים את ההתקדמות — חייב שינוי בתנועתיות, במלל, בשפה, בעמוד,
 * במעברים בין השלבים."* The progress bar moved by one dot and the title
 * stayed the job's name, so five screens read as one. Each state now opens
 * with its own band: its own colour, its own big headline in the
 * professional's words, the step number out of the whole visit, and one
 * line on what to do now — and it slides in fresh at every step.
 */
const STAGE: Partial<Record<JobState, { n: number; titleHe: string; doHe: string; tint: string; glyph: string }>> = {
  PRO_ASSIGNED: { n: 1, titleHe: "העבודה שלך!", doHe: "הלקוח כבר יודע שאתה מגיע. צא לדרך כשאתה מוכן.", tint: "#2FBF8A", glyph: "✓" },
  PRO_EN_ROUTE: { n: 2, titleHe: "בדרך ללקוח", doHe: "הלקוח רואה אותך מתקדם. לחץ ״הגעתי״ כשאתה בכתובת.", tint: "#3B82F6", glyph: "➜" },
  PRO_ARRIVED: { n: 3, titleHe: "הגעת", doHe: "הצג את עצמך, ותתחיל לבדוק את מה שהלקוח תיאר.", tint: "#8B5CF6", glyph: "⌂" },
  DIAGNOSIS: { n: 4, titleHe: "בודקים מה צריך", doHe: "בודקים ומאבחנים. בתיקון — המחיר נסגר ישירות מול הלקוח; במחירון — מתחילים לפי מה שסוכם.", tint: "#F59E0B", glyph: "?" },
  WAITING_QUOTE_APPROVAL: { n: 5, titleHe: "ההצעה אצל הלקוח", doHe: "מחכים לאישור. אי אפשר להתחיל לעבוד לפני שהוא מאשר.", tint: "#EC4899", glyph: "₪" },
  IN_PROGRESS: { n: 6, titleHe: "ההצעה אושרה — עובדים", doHe: "עושים בדיוק את מה שאושר. לחץ ״סיימתי״ בסוף.", tint: "#FF6B4A", glyph: "⚒" },
  COMPLETION_PENDING: { n: 7, titleHe: "סיימת!", doHe: "הלקוח מאשר שהעבודה הושלמה, ואז נסגר התשלום.", tint: "#2FBF8A", glyph: "★" },
};
const STAGE_COUNT = 7;

/*
 * THE BAND IN HIS OWN TRADE'S WORDS (copy review, 2026-09-29): a haircut,
 * a tow, an hour of help and a delivery each read one sentence written for
 * repairs — "בודקים ומאבחנים", "ההצעה אושרה" — and a woman read "אתה".
 */
function stageFor(status: JobState, kind: PricingKind, female: boolean, workHe: string) {
  const base = STAGE[status];
  if (!base) return undefined;
  const g = (m: string, f: string) => (female ? f : m);
  const agreed = kind === "QUOTE_FIRST" ? "לפי ההצעה שאושרה" : kind === "HOURLY" ? "לפי שעה" : "לפי מה שהלקוח הזמין";
  switch (status) {
    case "PRO_ASSIGNED":
      return { ...base, doHe: `הלקוח כבר יודע ש${g("אתה מגיע", "את מגיעה")}. ${g("צא", "צאי")} לדרך ${g("כשאתה מוכן", "כשאת מוכנה")}.` };
    case "PRO_EN_ROUTE":
      return { ...base, doHe: `הלקוח רואה ${g("אותך מתקדם", "אותך מתקדמת")}. ${g("לחץ", "לחצי")} ״הגעתי״ ${g("כשאתה", "כשאת")} בכתובת.` };
    case "PRO_ARRIVED":
      return {
        ...base,
        doHe: kind === "VISIT" ? `${g("הצג", "הציגי")} את עצמך, ${g("ותתחיל", "ותתחילי")} לבדוק את מה שהלקוח תיאר.` : kind === "DISTANCE" ? `${g("אסוף", "אספי")} את המשלוח ו${g("צא", "צאי")} למסירה.` : `${g("הצג", "הציגי")} את עצמך — ${agreed}.`,
      };
    case "DIAGNOSIS":
      if (kind === "VISIT") return { ...base, titleHe: workHe === "התיקון" ? "בודקים ומאבחנים" : "בודקים מה צריך", doHe: `את המחיר של ${workHe} סוגרים ישירות מול הלקוח. באפליקציה — רק דמי הביקור.` };
      if (kind === "DISTANCE") return { ...base, titleHe: "איסוף", doHe: `${g("אסוף", "אספי")} את המשלוח ${g("ולחץ", "ולחצי")} כשיוצאים למסירה.`, glyph: "⬆" };
      return { ...base, titleHe: "מתחילים", doHe: `${agreed}. ${g("לחץ", "לחצי")} ״סיימתי״ בסוף.`, glyph: "⚒" };
    case "IN_PROGRESS":
      if (kind === "DISTANCE") return { ...base, titleHe: "בדרך למסירה", doHe: `${g("לחץ", "לחצי")} ״המשלוח נמסר״ כשהוא אצל המקבל.`, glyph: "➜" };
      return { ...base, titleHe: kind === "QUOTE_FIRST" ? "ההצעה אושרה — עובדים" : "עובדים", doHe: `${agreed}. ${g("לחץ", "לחצי")} ״סיימתי״ בסוף.` };
    case "COMPLETION_PENDING":
      return { ...base, titleHe: g("סיימת!", "סיימת!"), doHe: kind === "VISIT" ? "הלקוח מאשר שהביקור התקיים, ואז נסגר התשלום." : "הלקוח מאשר שהעבודה הושלמה, ואז נסגר התשלום." };
    default:
      return base;
  }
}

function StageBand({ status, kind = "VISIT", female = false, workHe = "התיקון" }: { status: JobState; kind?: PricingKind; female?: boolean; workHe?: string }) {
  const st = stageFor(status, kind, female, workHe);
  const enter = useRef(new Animated.Value(0)).current;
  /* The bar grows from where the last step left it, so a step is seen
     being completed rather than simply redrawn. */
  const prev = useRef<JobState | null>(null);
  const fill = useRef(new Animated.Value(st ? st.n / STAGE_COUNT : 0)).current;
  const toast = useRef(new Animated.Value(0)).current;
  const [doneHe, setDoneHe] = useState<string | null>(null);
  useEffect(() => {
    const was = prev.current ? STAGE[prev.current] : undefined;
    prev.current = status;
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (st) {
      Animated.timing(fill, { toValue: st.n / STAGE_COUNT, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
    }
    if (was && st && was.n < st.n) {
      setDoneHe(was.titleHe.replace(/[!—].*$/, "").trim());
      toast.setValue(1);
      Animated.sequence([
        Animated.delay(1100),
        Animated.timing(toast, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]).start(() => setDoneHe(null));
    }
    /*
     * ONCE PER STEP, NOT ONCE PER SECOND. `st` is a fresh object on every
     * render, and the job screen re-renders every second for its clocks —
     * so with `st` in the list the card faded in again every second. Amit:
     * *"לא מפסיק להבהב ומעצבן בעיניים."* It enters when the step changes.
     */
  }, [status, st?.n, st?.titleHe]);
  if (!st) return null;
  return (
    <Animated.View
      style={[
        styles.stage,
        { backgroundColor: st.tint + "26", borderColor: st.tint + "66" },
        { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
      ]}
    >
      {doneHe ? (
        <Animated.View style={[styles.stageDone, { opacity: toast }]} pointerEvents="none">
          <Text style={styles.stageDoneText}>✓ {doneHe} — הושלם</Text>
        </Animated.View>
      ) : null}
      <View style={styles.stageTop}>
        <Text style={[styles.stageStep, { color: st.tint }]}>שלב {st.n} מתוך {STAGE_COUNT}</Text>
        <View style={[styles.stageGlyph, { backgroundColor: st.tint }]}>
          <Text style={styles.stageGlyphText}>{st.glyph}</Text>
        </View>
      </View>
      <Text style={styles.stageTitle}>{st.titleHe}</Text>
      <Text style={styles.stageDo}>{st.doHe}</Text>
      {status === "IN_PROGRESS" || status === "DIAGNOSIS" ? <WorkClock status={status} tint={st.tint} /> : null}
      {status === "WAITING_QUOTE_APPROVAL" ? <QuoteInFlight tint={st.tint} /> : null}
      <View style={styles.stageTrack}>
        <Animated.View
          style={[
            styles.stageFill,
            { backgroundColor: st.tint, width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
          ]}
        />
      </View>
    </Animated.View>
  );
}

/*
 * THE CLOCK WHILE HE WORKS.
 *
 * Amit: *"בזמן עבודה צריך שעון שמראה כמה זמן הוא עובד — לא יכול להיות
 * עמוד סטטי."* Counted from the moment this step began on this screen, and
 * labelled as time on the job — it is a stopwatch, not a price.
 */
function WorkClock({ status, tint }: { status: JobState; tint: string }) {
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0"), ss = String(sec % 60).padStart(2, "0");
  const pulse = sec % 2 === 0;
  return (
    <View style={styles.clockRow}>
      <View style={[styles.clockDot, { backgroundColor: tint, opacity: pulse ? 1 : 0.35 }]} />
      <Text style={[styles.clockText, { color: "#FFFFFF" }]}>{mm}:{ss}</Text>
      <Text style={styles.clockLabel}>{status === "DIAGNOSIS" ? "בבדיקה" : "זמן עבודה"}</Text>
    </View>
  );
}

/*
 * THE QUOTE, ON ITS WAY AND WAITING.
 *
 * Amit: *"בזמן שממתין להצעת המחיר צריך משהו מגניב — נשלחה הצעה וממתין
 * לתשובה."* The quote flies from his side to the customer's phone, lands,
 * and the phone pulses while the answer is awaited; three dots breathe
 * under it. It says only what is true: sent, and not yet answered.
 */
function QuoteInFlight({ tint }: { tint: string }) {
  const fly = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const [dots, setDots] = useState(1);
  useEffect(() => {
    Animated.timing(fly, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 500);
    return () => { loop.stop(); clearInterval(t); };
  }, [fly, ring]);
  return (
    <View style={styles.flightRow}>
      <View style={styles.flightLane}>
        <View style={[styles.flightTrack, { borderColor: tint + "77" }]} />
        <Animated.View
          style={[
            styles.flightPaper,
            { backgroundColor: tint },
            {
              opacity: fly.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, -168] }) },
                { translateY: fly.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -18, 0] }) },
                { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-12deg"] }) },
              ],
            },
          ]}
        >
          <Text style={styles.flightPaperText}>₪</Text>
        </Animated.View>
        <View style={styles.flightPhone}>
          <Animated.View
            style={[
              styles.flightRing,
              { borderColor: tint },
              { opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.9] }) }] },
            ]}
          />
          <Text style={styles.flightPhoneText}>📱</Text>
        </View>
      </View>
      <Text style={styles.flightLabel}>ההצעה אצל הלקוח · ממתינים לתשובה{".".repeat(dots)}</Text>
    </View>
  );
}

export function ProJobBody({
  status,
  serviceNameHe,
  mark,
  addressHe,
  accessNoteHe,
  routeEtaMinutes,
  distanceHe,
  customerNameHe,
  customerSeed,
  customerPhotoUri = null,
  usualUpToMinorUnits = null,
  usualSampleSize = 0,
  onSiteContactNameHe = null,
  doorCodeHe = null,
  symptomsHe,
  descriptionHe,
  media,
  payoutMinorUnits,
  payoutIsEstimate,
  waitingMinutes,
  onWithdrawQuote,
  onRelease,
  onNavigate,
  onCall,
  onMessage,
  onAdvance,
  onSendQuote,
  agreedPriceHe = null,
  onStartAgreed,
  diagnosisOnly = false,
  visitTerms = DEFAULT_VISIT_TERMS,
  kind = "VISIT",
  proFemale = false,
  onFinishDiagnosis,
  width = 390,
  height = 780,
}: ProJobBodyProps) {
  const baseAction = nextAction(status);
  const agreed = status === "DIAGNOSIS" && agreedPriceHe && onStartAgreed;
  const finishing = status === "DIAGNOSIS" && diagnosisOnly && onFinishDiagnosis && !agreed;
  const action = agreed
    ? { label: kind === "DISTANCE" ? `אספתי — יוצאים למסירה · ${agreedPriceHe}` : `מתחילים לעבוד · ${agreedPriceHe}`, kind: "agreed" as const }
    : finishing
      ? { label: visitTerms.workHe === "התיקון" ? "סיימתי את האבחון" : "סיימתי את הבדיקה", kind: "finishDiagnosis" as const }
      : baseAction && status === "IN_PROGRESS" && kind === "DISTANCE"
        ? { ...baseAction, label: "המשלוח נמסר" }
        : baseAction;
  const photos = media.filter((m) => m.kind === "PHOTO");
  const voice = media.find((m) => m.kind === "VOICE");

  /*
   * WHAT THIS STAGE IS ABOUT — see `proJobFocusFor`, beside the state
   * machine. Amit: *"עדיין כל המסכים פה אותו דבר ואין שום שינוי בין
   * בדרך לבדיקה להצעת מחיר."* Each stage already had its own screen and
   * its own transition; what never changed was WHAT WAS ON IT. So the
   * screen arranges itself around the answer instead of showing
   * everything at every stage.
   */
  /* Each step opens at its top, where its band is — not scrolled to
     wherever the previous step was left. */
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [status]);
  const focus = proJobFocusFor(status);
  const focusHe = proJobFocusHe(status);

  /* ------------------------------------------------------------------
     WHAT THE CUSTOMER SAID IS WRONG.

     Lifted out of the flow so it can be placed rather than fixed: while
     you are driving, the person you are going to see is the next thing
     you need; from the moment you are standing there, what they
     described is. A fixed order meant one of the two was always in the
     wrong place.
     ------------------------------------------------------------------ */
  const problemBlock = (
    <View style={styles.block}>
      <SectionHeader title={kind === "VISIT" ? "מה הבעיה" : "מה הלקוח ביקש"} colors={colors} />

      {symptomsHe.length > 0 ? (
        <View style={styles.symptoms}>
          {symptomsHe.map((sx) => (
            <View key={sx} style={styles.symptom}>
              <Text style={styles.symptomText}>{sx}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {descriptionHe ? (
        <Surface colors={colors} level={1} dark style={{ marginTop: spacing.md }}>
          <Text style={styles.description}>{descriptionHe}</Text>
        </Surface>
      ) : null}

      {voice ? <VoiceNote item={voice} /> : null}

      {photos.length > 0 ? (
        <View style={styles.photoGrid}>
          {photos.map((ph) => (
            <ImageSlot
              key={ph.id}
              uri={ph.uri}
              subject={ph.subjectHe}
              ratio={1}
              colors={colors}
              dark
              style={styles.photo}
            />
          ))}
        </View>
      ) : null}

      {symptomsHe.length === 0 && !descriptionHe && media.length === 0 ? (
        <Text style={styles.emptyLine}>
          הלקוח לא הוסיף פרטים. שווה להתקשר לפני שיוצאים.
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ---------------- 1. Where ---------------- */}
        <View style={styles.head}>
          <StageBand status={status} kind={kind} female={proFemale} workHe={visitTerms.workHe} />
          {/* The band says the step; the old pill, the dots and the
              focus line said it three more times. They stay only for a
              state the band does not know. */}
          {STAGE[status] ? null : (
          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{STATUS_HE[status] ?? "העבודה שלך"}</Text>
            </View>
            <View style={styles.markBubble}>
              <Mark name={mark} size={18} color={colors.trust} />
            </View>
          </View>

          )}
          <Text style={[styles.service, STAGE[status] ? styles.serviceSmall : null]} numberOfLines={2}>
            {serviceNameHe}
          </Text>

          {/* ----------------------------------------------------------
              THE SAME FOUR STEPS THE CUSTOMER IS LOOKING AT.

              Amit: *"המסכים חייבים להתחלף כל לחיצת כפתור, כל פעולה, גם
              ללקוח וגם למקצוען."*

              A status pill says one word about now. It does not say what
              is left, and this side has a dead stretch of its own —
              WAITING_QUOTE_APPROVAL, where the professional has no
              button to press at all because the next move is the
              customer's. A word and no button reads as a screen that has
              stopped working.

              Literally the same component, from the same function beside
              the state machine, because the two of them are watching ONE
              visit. A customer told the work is at step three while the
              professional sees step two is a disagreement about a fact,
              in a product whose whole proposition is that both sides can
              trust what they are shown.
              ---------------------------------------------------------- */}
          {STAGE[status] ? null : <VisitSteps status={status} accent={colors.trust} done={colors.trust} />}

          {/* ----------------------------------------------------------
              AND ONE LINE SAYING WHAT IS YOURS TO DO.

              The customer's side has had `jobProgressHe` for a while —
              what is happening TO them. This is the other audience's
              sentence: what is happening is theirs to do. Same state
              machine, two readers, and it changes at every step, which
              is the thing he could not see.
              ---------------------------------------------------------- */}
          {focusHe && !STAGE[status] ? <Text style={styles.focus}>{focusHe}</Text> : null}

          <View style={styles.addressRow}>
            <PinMark size={15} color={colors.textSecondary} />
            <Text style={styles.address} numberOfLines={2}>
              {addressHe}
            </Text>
          </View>
          {accessNoteHe ? <Text style={styles.access}>{accessNoteHe}</Text> : null}

          {/* ----------------------------------------------------------
              THE DRIVE, ONLY WHILE THERE IS ONE.

              Drive time, distance and a navigation button are the whole
              job while you are in the van, and clutter the moment you
              are standing in the kitchen. They leave when the driving
              does. The address itself stays: it is where you are.
              ---------------------------------------------------------- */}
          {focus === "TRAVEL" ? (
            <>
              <View style={styles.metaRow}>
                {routeEtaMinutes !== null ? (
                  <View style={styles.metaChip}>
                    <ClockMark size={13} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{routeEtaMinutes} דק׳ נסיעה</Text>
                  </View>
                ) : null}
                {distanceHe ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaText}>{distanceHe}</Text>
                  </View>
                ) : null}
              </View>

              <Pressable onPress={onNavigate} accessibilityRole="button" style={styles.navBtn}>
                <Text style={styles.navLabel}>ניווט לכתובת</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        {focus === "PROBLEM" ? problemBlock : null}

        {/* ---------------- 2. Who ---------------- */}
        <View style={styles.block}>
          <SectionHeader title="הלקוח" colors={colors} />
          <Surface colors={colors} level={1} dark>
            <View style={styles.custRow}>
              {customerPhotoUri ? (
                <Image
                  source={{ uri: customerPhotoUri }}
                  style={styles.customerFace}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`הדמות של ${customerNameHe}`}
                />
              ) : (
                <Persona seed={customerSeed} size={46} ring={colors.trust} />
              )}
              <View style={styles.custText}>
                <Text style={styles.custName} numberOfLines={1}>
                  {onSiteContactNameHe ?? customerNameHe}
                </Text>
                {onSiteContactNameHe ? (
                  // The person who booked and the person at the door are not
                  // always the same, and knocking asking for the wrong name
                  // is how a job starts badly.
                  <Text style={styles.custMeta} numberOfLines={2}>
                    נמצא בבית · הקריאה הוזמנה על ידי {customerNameHe}
                  </Text>
                ) : (
                  <Text style={styles.custMeta}>הזמין את הקריאה</Text>
                )}
              </View>
            </View>

            {doorCodeHe && (status === "PRO_ASSIGNED" || status === "PRO_EN_ROUTE" || status === "PRO_ARRIVED") ? (
              <View style={styles.doorCode}>
                <Text style={styles.doorCodeLabel}>
                  הקוד שלך — {onSiteContactNameHe ?? customerNameHe} יבקש אותו
                </Text>
                <Text style={styles.doorCodeDigits}>{doorCodeHe.split("").join(" ")}</Text>
              </View>
            ) : null}

            <View style={styles.contactRow}>
              <Pressable onPress={onCall} accessibilityRole="button" style={styles.contactBtn}>
                <Text style={styles.contactLabel}>שיחה</Text>
              </Pressable>
              <Pressable onPress={onMessage} accessibilityRole="button" style={styles.contactBtn}>
                <Text style={styles.contactLabel}>הודעה</Text>
              </Pressable>
            </View>

            <View style={styles.maskRow}>
              <ShieldCheckMark size={14} color={colors.trust} />
              <Text style={styles.maskText}>
                השיחה עוברת דרך מספר מסווה. המספר הפרטי שלך לא נחשף ללקוח, ושלו לא נחשף לך.
              </Text>
            </View>
          </Surface>
        </View>

        {focus === "PROBLEM" ? null : problemBlock}

        {/* ---------------- 4. Money ---------------- */}
        <View style={styles.block}>
          <SectionHeader title={lex.payout} colors={colors} />
          <Surface colors={colors} level={1} dark>
            {payoutMinorUnits !== null ? (
              <View style={styles.payRow}>
                {kind === "HOURLY" ? <Text style={styles.payQualifier}>לשעה</Text> : payoutIsEstimate ? <Text style={styles.payQualifier}>משוער</Text> : null}
                <Text style={styles.payValue}>{formatMoney(money(payoutMinorUnits, "ILS"))}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.payUnknown}>{kind === "VISIT" ? "דמי הביקור שלך" : "לפי מה שסוכם"}</Text>
                <Text style={styles.payNote}>
                  {kind === "VISIT" ? `את המחיר של ${visitTerms.workHe} סוגרים ישירות מול הלקוח.` : "הסכום מאושר בכרטיס של הלקוח ועובר אליך אחרי שהוא מאשר."}
                </Text>
              </>
            )}
          </Surface>
        </View>
        {/* ----------------------------------------------------------------
            AND A WAY TO GIVE IT BACK.

            Last on the screen and quiet, because it is the rarest thing
            a professional does here and the most consequential — but
            present, because the alternative is somebody simply not
            turning up. See `onRelease`.

            Where it is not allowed, the screen says why rather than
            showing nothing: a control that vanishes teaches people that
            the app is broken, and this one vanishes exactly when
            somebody is most likely to go looking for it.
            ---------------------------------------------------------------- */}
        {onRelease && canReleaseJob(status) ? (
          <Pressable
            onPress={onRelease}
            accessibilityRole="button"
            accessibilityLabel="לא אוכל להגיע — שחרור הקריאה למקצוען אחר"
            style={({ pressed }) => [styles.release, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.releaseLabel}>לא אוכל להגיע — שחרור הקריאה</Text>
            <Text style={styles.releaseNote}>
              הלקוח מקבל הודעה מיד ואנחנו מחפשים לו מישהו אחר.
            </Text>
          </Pressable>
        ) : releaseBlockedHe(status) ? (
          <Text style={styles.releaseNote}>{releaseBlockedHe(status)}</Text>
        ) : null}
      </ScrollView>

      {/* ----------------------------------------------------------------
          WHAT THESE JOBS USUALLY COME TO — TOLD TO THE PROFESSIONAL FIRST.

          Amit, looking at the customer's quote screen: *"נראה כאילו
          עובדים על הלקוח ככה."*

          He was reading a box that tells the CUSTOMER a quote is above
          what these jobs usually cost. Naming the biggest line item made
          that box answerable, and it left the arrangement one-sided: the
          platform was saying something about a professional's price, to
          somebody else, while the professional had no idea it would be
          said.

          That is the part that reads as working somebody over — not the
          number, the asymmetry. So the same figure, from the same source,
          is shown here BEFORE the quote is sent. Nobody is caught out,
          and a professional who knows can price differently or put the
          reason in the note.

          It is not a limit and not a suggestion: what somebody charges is
          their own commercial decision (/CLAUDE.md §4), and this says
          only what has been paid here before.
          ---------------------------------------------------------------- */}
      {usualUpToMinorUnits !== null && usualSampleSize > 0 && action?.kind === "quote" ? (
        <View style={styles.usual}>
          <Text style={styles.usualText} numberOfLines={2}>
            עבודות כאלה כאן יצאו בדרך כלל עד{" "}
            {formatMoney(money(usualUpToMinorUnits, "ILS"))} · לפי {usualSampleSize} עבודות.
            הלקוח רואה את זה גם.
          </Text>
        </View>
      ) : null}

      {/* ---------------- The one thing to do next ---------------- */}
      {action ? (
        <View style={styles.cta}>
          <Pressable
            onPress={
              action.kind === "quote"
                ? onSendQuote
                : action.kind === "agreed"
                  ? onStartAgreed
                  : action.kind === "finishDiagnosis"
                    ? onFinishDiagnosis
                    : onAdvance
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.ctaLabel}>{action.label}</Text>
          </Pressable>
          {action.kind === "finishDiagnosis" ? (
            <Text style={styles.finishNote}>
              {`באפליקציה נגבים ${visitTerms.feeHe.replace("דמי ביקור ו", "דמי הביקור וה")}. את ${selfHe(visitTerms.workHe)} — המחיר והתשלום — סוגרים ישירות מול הלקוח.`}
            </Text>
          ) : null}
          {action.kind === "agreed" && onSendQuote ? (
            <Pressable onPress={onSendQuote} accessibilityRole="button" style={styles.extraLink}>
              <Text style={styles.extraLinkText}>יש עבודה נוספת? הצעת מחיר לתוספת — הלקוח יאשר</Text>
            </Pressable>
          ) : null}
        </View>
      ) : status === "WAITING_QUOTE_APPROVAL" ? (
        /*
         * WAITING IS A STATE, NOT A DEAD END.
         *
         * This used to be one sentence — "הכדור אצל הלקוח" — and nothing
         * else, which is accurate and useless. The professional is standing
         * in a stranger's kitchen with a tool bag, and the screen tells them
         * the ball is elsewhere and offers no way to affect anything. Two
         * things are missing and both are real: how long they have been
         * waiting, and what they can do about it.
         *
         * The elapsed minutes matter because there is no answer to "is this
         * normal?" without them. The actions matter because at some point
         * every professional has to be able to leave, and a product that
         * makes that decision awkward is a product they stop opening.
         */
        <View style={styles.cta}>
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>
              ההצעה נשלחה ללקוח. אי אפשר להתחיל לעבוד עד שהוא מאשר.
            </Text>
            {typeof waitingMinutes === "number" ? (
              <Text style={styles.waitingSince}>
                {waitingMinutes < 1
                  ? "נשלחה עכשיו"
                  : waitingMinutes === 1
                    ? "ממתין דקה"
                    : `ממתין ${waitingMinutes} דקות`}
              </Text>
            ) : null}
          </View>
          <View style={styles.waitingActions}>
            <Pressable
              onPress={onCall}
              accessibilityRole="button"
              style={({ pressed }) => [styles.waitingBtn, pressed && { opacity: 0.88 }]}
            >
              <Text style={styles.waitingBtnText}>תזכורת ללקוח</Text>
            </Pressable>
            <Pressable
              onPress={onWithdrawQuote}
              accessibilityRole="button"
              style={({ pressed }) => [styles.waitingBtn, pressed && { opacity: 0.88 }]}
            >
              <Text style={styles.waitingBtnText}>עדכון ההצעה</Text>
            </Pressable>
          </View>
        </View>
      ) : status === "COMPLETION_PENDING" ? (
        /* ----------------------------------------------------------------
           AND THE SECOND TIME THE BALL IS IN THE OTHER COURT.

           Amit: *"איפה המקצוען רואה את האישור עבודה?"*

           He could not see it because nothing was waiting for it: this
           side used to go from "סיימתי את העבודה" straight to a payout,
           settling the job on the professional's own say-so. The state
           machine has two states here for a reason, and
           /docs/09-PAYMENTS.md puts the charge behind the CUSTOMER's
           confirmation — so this is the moment that was being skipped.

           Same shape as the quote's wait, because it is the same
           situation: something has been handed over, nothing can be done
           until it comes back, and a screen that says only "waiting"
           with no way to affect anything is what makes people close an
           app. A nudge is the one honest action here — there is nothing
           to revise, because the work is done.
           ---------------------------------------------------------------- */
        <View style={styles.cta}>
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>
              אמרת שסיימת. הלקוח מאשר שהעבודה הושלמה, ואז התשלום נסגר.
            </Text>
            <Text style={styles.waitingSince}>
              התשלום נסגר על אישור הלקוח, לא על ההצהרה שלך — כך זה מוסכם משני הצדדים.
            </Text>
          </View>
          <View style={styles.waitingActions}>
            <Pressable
              onPress={onCall}
              accessibilityRole="button"
              style={({ pressed }) => [styles.waitingBtn, pressed && { opacity: 0.88 }]}
            >
              <Text style={styles.waitingBtnText}>תזכורת ללקוח</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A voice note from the customer.
 *
 * People describe a fault badly in writing and well out loud, so this is
 * worth having. The player is deliberately honest about the prototype: with
 * no real file it says so instead of miming playback, because a play button
 * that does nothing is exactly the false affordance this round was spent
 * removing.
 */
function VoiceNote({ item }: { item: JobMediaItem }) {
  const [playing, setPlaying] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const seconds = item.seconds ?? 0;

  useEffect(() => {
    if (!playing) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(1000, seconds * 1000),
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && setPlaying(false));
    return () => anim.stop();
  }, [playing, seconds, progress]);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <Surface colors={colors} level={1} dark style={{ marginTop: spacing.md }}>
      <View style={styles.voiceRow}>
        <Pressable
          onPress={() => item.uri && setPlaying((p) => !p)}
          disabled={!item.uri}
          accessibilityRole="button"
          accessibilityLabel={playing ? "עצירה" : "השמעה"}
          style={[styles.playBtn, !item.uri && { opacity: 0.4 }]}
        >
          <Text style={styles.playGlyph}>{playing ? "❙❙" : "▶"}</Text>
        </Pressable>

        <View style={styles.waveWrap}>
          <Wave />
          <Animated.View
            style={[
              styles.waveMask,
              { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["100%", "0%"] }) },
            ]}
          />
        </View>

        <Text style={styles.voiceTime}>{mmss}</Text>
      </View>
      <Text style={styles.voiceNote}>
        {item.uri
          ? "הקלטה מהלקוח"
          : "הקלטה מהלקוח · באב־טיפוס אין קובץ אמיתי, אז ההשמעה כבויה"}
      </Text>
    </Surface>
  );
}

/** A fixed decorative waveform. It is not drawn from audio and does not pretend to be. */
function Wave() {
  const bars = [6, 11, 18, 9, 22, 14, 26, 12, 19, 8, 24, 15, 10, 21, 7, 17, 12, 23, 9, 14];
  return (
    <Svg width="100%" height={28} viewBox="0 0 200 28" preserveAspectRatio="none">
      {bars.map((h, i) => (
        <Rect
          key={i}
          x={i * 10 + 2}
          y={(28 - h) / 2}
          width={4}
          height={h}
          rx={2}
          fill={colors.textSecondary}
          opacity={0.7}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  finishNote: { ...type.meta, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl", marginTop: spacing.sm },
  doorCode: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: tint.neutralDark(0.06),
    alignItems: "center",
    gap: 2,
  },
  doorCodeLabel: { ...type.meta, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl" },
  doorCodeDigits: { ...type.section, color: colors.textPrimary, letterSpacing: 4, ...tabular },
  extraLink: { alignSelf: "center", paddingVertical: spacing.sm, marginTop: spacing.xs },
  extraLinkText: { ...type.captionStrong, color: colors.textSecondary, textDecorationLine: "underline", textAlign: "center" },
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { paddingBottom: 116 },
  serviceSmall: { fontSize: scale.body, lineHeight: 24, marginTop: 0, color: "rgba(247,243,250,0.75)" },
  stage: { alignSelf: "stretch", borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.lg },
  stageTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  stageStep: { fontSize: scale.meta, fontWeight: "800", letterSpacing: 0.3, writingDirection: "rtl" },
  stageGlyph: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  stageGlyphText: { color: "#0d0a16", fontSize: scale.body, fontWeight: "900" },
  stageTitle: { color: "#FFFFFF", fontSize: scale.title, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: spacing.sm },
  stageDo: { color: "rgba(247,243,250,0.85)", fontSize: scale.meta, lineHeight: 22, textAlign: "right", writingDirection: "rtl", marginTop: spacing.xs },
  stageTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", marginTop: spacing.md, overflow: "hidden", flexDirection: "row-reverse" },
  stageFill: { height: 6, borderRadius: 3 },
  clockRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: spacing.md },
  clockDot: { width: 10, height: 10, borderRadius: 5 },
  clockText: { fontSize: scale.title, fontWeight: "900", ...tabular },
  clockLabel: { color: "rgba(247,243,250,0.7)", fontSize: scale.meta, writingDirection: "rtl" },
  flightRow: { marginTop: spacing.md },
  flightLane: { height: 64, justifyContent: "center" },
  flightTrack: { position: "absolute", left: 30, right: 30, top: 31, borderTopWidth: 2, borderStyle: "dashed" },
  flightPaper: { position: "absolute", right: 8, top: 18, width: 34, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  flightPaperText: { color: "#0d0a16", fontWeight: "900", fontSize: scale.body },
  flightPhone: { position: "absolute", left: 8, top: 10, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  flightRing: { position: "absolute", width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  flightPhoneText: { fontSize: scale.section },
  flightLabel: { color: "rgba(247,243,250,0.85)", fontSize: scale.meta, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  stageDone: { position: "absolute", top: -12, left: spacing.lg, right: spacing.lg, alignItems: "center", zIndex: 2 },
  stageDoneText: { backgroundColor: "#2FBF8A", color: "#0d0a16", fontWeight: "800", fontSize: scale.meta, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: "hidden", writingDirection: "rtl" },

  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, alignItems: "flex-end" },
  usual: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  usualText: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },

  statusRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  statusPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: tint.trust(0.16),
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.trust },
  statusText: { ...type.captionStrong, color: colors.trust, writingDirection: "rtl" },
  markBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },

  service: {
    ...type.h1,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },
  addressRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6, marginTop: spacing.sm, alignSelf: "stretch" },
  address: { ...type.body, flex: 1, fontSize: scale.meta, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  access: { ...type.caption, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl", marginTop: 2 },

  metaRow: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md },
  metaChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  metaText: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },

  navBtn: {
    alignSelf: "stretch",
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  navLabel: { ...type.bodyStrong, fontSize: scale.meta, color: colors.textPrimary },

  /*
   * A row, not a button: it is deliberately not competing with the one
   * thing this screen wants the professional to do. Still 44 tall,
   * because a target somebody has to hit while standing in a stairwell
   * is not the place to save eight points.
   */
  customerFace: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.trust,
  },
  release: {
    minHeight: 44,
    justifyContent: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
  },
  releaseLabel: {
    ...type.captionStrong,
    color: colors.statusDanger,
    textAlign: "right",
    writingDirection: "rtl",
  },
  releaseNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 2,
    lineHeight: 18,
  },
  focus: {
    ...type.body,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
    lineHeight: 22,
  },
  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  custRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  custText: { flex: 1, alignItems: "flex-end" },
  custName: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  custMeta: { ...type.caption, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },

  contactRow: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.lg },
  contactBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  contactLabel: { ...type.bodyStrong, fontSize: scale.meta, color: colors.textPrimary },

  maskRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.md },
  maskText: {
    ...type.caption,
    flex: 1,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },

  symptoms: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  symptom: {
    backgroundColor: tint.action(0.16),
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  symptomText: { ...type.captionStrong, color: colors.actionText, writingDirection: "rtl" },

  description: {
    ...type.body,
    fontSize: scale.meta,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 22,
  },

  voiceRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: tint.action(0.2),
    alignItems: "center",
    justifyContent: "center",
  },
  playGlyph: { color: colors.actionText, fontSize: scale.meta },
  waveWrap: { flex: 1, height: 28, overflow: "hidden" },
  waveMask: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: "rgba(16,12,22,0.62)" },
  voiceTime: { ...type.caption, ...tabular, color: colors.textSecondary },
  voiceNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.sm,
  },

  photoGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  photo: { flexGrow: 1, flexBasis: "30%" },

  emptyLine: { ...type.caption, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },

  payRow: { flexDirection: "row-reverse", alignItems: "baseline", gap: spacing.sm },
  payValue: { ...type.display, ...tabular, fontSize: scale.hero, lineHeight: 44, color: colors.textPrimary },
  payQualifier: { ...type.captionStrong, color: colors.statusWarning },
  payUnknown: { ...type.h2, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  payNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xs,
    lineHeight: 18,
  },

  cta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    ...elevation(3, true),
  },
  ctaBtn: {
    minHeight: 58,
    borderRadius: radii.md,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: { ...type.bodyStrong, fontSize: scale.body, color: colors.onAction },
  waiting: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  waitingSince: {
    ...type.caption,
    ...tabular,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: 4,
  },
  waitingActions: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md },
  waitingBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
  },
  waitingBtnText: { ...type.captionStrong, fontSize: scale.meta, color: colors.textPrimary },
  waitingText: { ...type.caption, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl" },
});
