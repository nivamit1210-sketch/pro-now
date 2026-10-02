import React, { useEffect, useRef, useState, useMemo } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  assessArrival,
  jobProgressHe,
  paymentPromiseHe,
  visitMoneyLineHe,
  type VisitMoneyFacts,
  type PricingKind,
  DEFAULT_VISIT_TERMS,
  type VisitTermsHe,
  WORLD_DISTRICTS,
  type DepartmentCode,
  routeAt,
  alongRoute,
  worldZoomFor,
  routeProgress,
  type ArrivalSignals,
  type EtaView,
  type JobState,
  type ProfessionalSummaryView,
  type SponsorShop,
  type WorldGeo,
  buildRoadGraph,
  CUSTOMER_POINT,
  frontageNear,
  groundProject,
  metresAcrossAt,
  pitchForMetres,
  planWorld,
  plotSpotsFromGeo,
  pruneDeadEnds,
  routeAlongRoads,
} from "@pro-now/types";

import { formatCompletedJobs, formatEta, formatProNowRating } from "../format";
import { BackButton } from "../components/BackButton";
import { useSheetDrag } from "../components/useSheetDrag";
import { customerDarkTheme, depth, palette, radii, scale, spacing, tabular, tint, type } from "../theme";
import { ArrivalPromise } from "../components/ArrivalPromise";
import { ProviderPortrait } from "../components/ProviderPortrait";
import { RealMapSurface } from "../components/RealMapSurface";
import { WorldBackdrop } from "../components/livingmap/WorldBackdrop";
import { VisitSteps } from "../components/VisitSteps";
import { SponsorRow } from "../components/SponsorRow";
import { RouteLayer } from "../components/livingmap/RouteLayer";
import { type WorldAssetSources } from "../components/livingmap/AssetSlot";
import { ScreenShell } from "../components/ScreenShell";
import { ShieldCheckMark, StarMark } from "../components/marks";

/**
 * C07 — following the professional in.
 *
 * REBUILT TO THE SYSTEM (Visual System v1 §8 in the screen map). This screen
 * was the clearest example of the drift Amit spotted: a light surface, a
 * drawn street map, three stacked elevated cards, and an ETA smaller than
 * the same number on the match screen. Beside the new screens it read as a
 * different app, which it effectively was.
 *
 * Three decisions carried over from the system:
 *
 * 1. **The map IS the screen**, not a picture inside a card. This is one of
 *    the two places a real map is honest — an assignment exists and both
 *    sides need the location to execute (§11) — so it gets the whole
 *    surface and everything else floats on it.
 * 2. **Dark, and earned.** A dark customer screen requires a live state
 *    (§12). This one has the most live state in the product: someone is
 *    physically moving toward you.
 * 3. **The ETA is the hero.** "When does he arrive" is the only question
 *    this screen answers (§9), so the number that answers it is the largest
 *    thing on it — and it renders through `HeroMetric`, which means an
 *    unknown ETA is a sentence about why rather than a dash.
 *
 * WHAT IS NOT HERE: the four-step progress rail. It was decoration dressed
 * as information — the customer already knows the professional has not
 * finished, and a rail showing three greyed-out future steps mostly
 * advertises how much has not happened yet. The current state is a word,
 * and the ETA is the fact.
 */

/**
 * DARK SHEET ON A DARK MAP. The sheet was ivory, which put a hard white
 * slab across the bottom half of the one screen that is supposed to feel
 * like a single live moment — and it was the seam Amit photographed when he
 * asked for "קו אחיד".
 */
const colors = customerDarkTheme.colors;

export interface TrackingBodyProps {
  /**
   * A REAL STREET PLAN FOR THE MAP BAND.
   *
   * This is the screen Visual System v1 §11 actually allows a map on —
   * an assignment exists and both sides need the location to execute —
   * so it is the screen where a real street plan is worth the most and
   * costs the most.
   *
   * Worth the most, because the customer is asking one question ("where
   * are they") that only real geography answers. Costs the most, because
   * a figure drawn on a real street is a claim about a real address, and
   * this screen is exactly where a decorative one would once have been
   * acceptable. Nothing is plotted on it that the server did not say —
   * see `geo-truth.ts`, and note that nothing is plotted on it at all
   * until the route comes from a route and not from a drawing.
   */
  geo?: WorldGeo | null;
  /**
   * The city behind the visit, when the host can show it — our street
   * rather than the painted plate. Left out, the plate. Ignored on the
   * real map (`geo`), which is the map, not a picture.
   */
  backdrop?: React.ReactNode;
  /** The professional's trade figure, shown in the work scene while they are in the home. */
  proFigureUri?: string | null;
  /**
   * The clock on the map opens the real map, where the professional's
   * vehicle is drawn on the route. Amit: *"שעון בצד שמראה זמן וקילומטר,
   * ולחיצה על השעון — לראות איפה הוא במפה האמיתית ברכב שבנינו."*
   */
  onOpenRealMap?: () => void;
  status: JobState;
  serviceNameHe: string;
  professional: ProfessionalSummaryView;
  eta: EtaView | null;
  /**
   * WHAT IS TRUE ABOUT THE MONEY, not the sentence about it.
   *
   * This used to be `priceLineHe` — one finished string, handed over
   * once and then repeated for the whole visit. Amit: *"איך הצעת מחיר
   * תשלח אם הוא כבר סיים את העבודה? זה אמור להיות לפני."* He was reading
   * "הצעת מחיר תישלח לאישורך" on a screen where the quote had already
   * been approved, which is a sentence describing a future that has
   * happened.
   *
   * The facts are passed and the sentence is derived from them and the
   * status, by `visitMoneyLineHe`, so the words cannot fall out of step
   * with the job. Everything in here is ALREADY FORMATTED by whoever
   * knows the number — this screen never computes an amount.
   */
  money?: VisitMoneyFacts;
  /** Hebrew verbs agree with the professional: "מאיה הגיעה", not "הגיע". */
  professionalFemale?: boolean;
  /** "22:49" — the promise, computed by the server from a real route. */
  arrivalClockHe?: string | null;
  /**
   * The raw signals. The screen does NOT take a phase — it takes the facts
   * and asks `assessArrival`, so the customer's screen and the server's
   * dispatch logic can never disagree about whether an arrival is in
   * trouble. That disagreement is the failure mode Arrival Assurance
   * exists to prevent, and it is invisible when each side decides for
   * itself.
   */
  arrival?: ArrivalSignals;
  /** For RUNNING_LATE: the clock time we gave before it moved. */
  previousClockHe?: string | null;
  onGetHelp?: () => void;
  /**
   * The customer agreeing that the work is done.
   *
   * The most consequential tap in the product: the professional's claim
   * becomes the customer's agreement and the money moves
   * (/docs/09-PAYMENTS.md). Absent until a caller wires it, and the
   * screen then shows no button rather than a dead one.
   */
  onConfirmCompletion?: () => void;
  onCancelJob?: () => void;
  onCall?: () => void;
  onMessage?: () => void;
  onSafety?: () => void;
  /**
   * THE CALL IS FOR SOMEBODY ELSE. The person at the door (grandpa, a
   * partner at home) is named on the sheet, and the customer — who is
   * somewhere else — can open exactly what that person was sent.
   */
  onSiteNameHe?: string | null;
  onSiteStatusHe?: string | null;
  onOpenOnSiteView?: () => void;
  /**
   * Leave the tracking screen. The job keeps running.
   *
   * Not a cancellation — `onCancelJob` is that, and it is a different
   * control with a different consequence. This one only goes back to the
   * app, which the screen previously offered no way to do at all.
   */
  onBack?: () => void;
  /** The world art, as far as it exists. Absent falls back to the grid. */
  worldSources?: WorldAssetSources;
  /** Which trade is on the way: decides the street and the vehicle. */
  departmentCode?: string | null;
  /**
   * The ETA in seconds as it was WHEN THE JOB WAS ASSIGNED.
   *
   * Needed because progress is "how much of the trip is done", and that
   * cannot be worked out from the remaining time alone. Held by the app
   * rather than recomputed here, so a re-render never restarts the trip.
   */
  etaSecondsAtAssignment?: number | null;
  vehicleAssetId?: string;
  /**
   * SHOPS IN THE NEIGHBOURHOOD THAT PAID TO BE THERE.
   *
   * Amit: *"לקוח בזמן ההמתנה למקצוען יכול להיכנס לחנויות ואז ייפתח האתר
   * של המותג שיוכלו להזמין ממנו."*
   *
   * Passed in rather than imported, because which brands are in the
   * street is a business relationship and not a fact about this screen
   * (/CLAUDE.md §4). Empty, or absent, and the row is simply not there.
   *
   * The row shows itself only while the customer is waiting —
   * `sponsorsMayShow` inside `SponsorRow` decides, from the job's state,
   * and this screen does not get a say. Advertising does not run while
   * somebody is in your home.
   */
  sponsors?: readonly SponsorShop[];
  sponsorVenueUriFor?: (shop: SponsorShop) => string | null | undefined;
  onEnterSponsor?: (shop: SponsorShop) => void;
  animate?: boolean;
  width?: number;
  height?: number;
}

/*
 * ---------------------------------------------------------------------
 * WHILE HE IS IN YOUR HOME, THE SCREEN IS ABOUT THE WORK
 * ---------------------------------------------------------------------
 * Amit, on the map that kept showing the van "on the way" during the
 * repair: *"לא יכול להיות בזמן המתנה לעבודה רואים אותו עדיין בדרך אלייך.
 * צריך להיות שם מסך של תהליך עבודה."* From arrival to the customer's
 * sign-off the top of the screen is the visit itself: who is there, what
 * step it is at, a running clock, and the steps still to come.
 */
const ON_SITE: readonly JobState[] = ["PRO_ARRIVED", "DIAGNOSIS", "WAITING_QUOTE_APPROVAL", "IN_PROGRESS", "COMPLETION_PENDING"];
function workHeadlineHe(status: JobState, first: string, kind: PricingKind = "VISIT", terms: VisitTermsHe = DEFAULT_VISIT_TERMS, female = false, forSomeoneElse = false): { title: string; sub: string } {
  const g = (m: string, f: string) => (female ? f : m);
  const agreed = kind === "QUOTE_FIRST" ? "לפי ההצעה שאישרתם" : "לפי מה שהזמנתם";
  switch (status) {
    case "PRO_ARRIVED":
      return {
        title: `${first} ${g("הגיע", "הגיעה")}${kind === "DISTANCE" ? " לאיסוף" : " אליכם"}`,
        sub: kind === "VISIT" ? "עוד רגע מתחילים לבדוק" : kind === "HOURLY" ? "השעון מתחיל כשמתחילים לעבוד" : kind === "DISTANCE" ? "אוספים את המשלוח" : `עוד רגע מתחילים — ${agreed}`,
      };
    case "DIAGNOSIS":
      if (kind === "VISIT")
        return { title: terms.workHe === "התיקון" ? `${first} ${g("מאבחן", "מאבחנת")} את התקלה` : `${first} ${g("בודק", "בודקת")} מה צריך`, sub: forSomeoneElse ? "הצעת המחיר תגיע אליך באפליקציה" : `את המחיר של ${terms.workHe} סוגרים ישירות ${g("איתו", "איתה")}` };
      if (kind === "HOURLY") return { title: `${first} ${g("התחיל", "התחילה")}`, sub: "השעון רץ לפי זמן עבודה בפועל" };
      if (kind === "DISTANCE") return { title: `${first} ${g("אסף", "אספה")}`, sub: "בדרך למסירה" };
      return { title: `${first} ${g("מתחיל", "מתחילה")}`, sub: agreed };
    case "WAITING_QUOTE_APPROVAL": return { title: "הצעת מחיר מחכה לאישורכם", sub: "העבודה מתחילה רק אחרי שתאשרו" };
    case "IN_PROGRESS":
      if (kind === "DISTANCE") return { title: `${first} בדרך למסירה`, sub: "לפי מרחק, סוכם מראש" };
      return { title: `${first} ${g("עובד", "עובדת")}`, sub: kind === "HOURLY" ? "לפי שעה · זמן עבודה בפועל" : agreed };
    default:
      return { title: kind === "VISIT" ? "הביקור הסתיים" : kind === "DISTANCE" ? "המשלוח נמסר" : "העבודה הסתיימה", sub: "מחכה לאישור שלכם" };
  }
}
/* When the professional came in — kept across the visit's screens, so the
   clock counts the whole time in the home and not each step afresh. */
const visitStart = { at: 0 };
function WorkScene({ status, firstName, figureUri, kind = "VISIT", terms = DEFAULT_VISIT_TERMS, female = false, forSomeoneElse = false, width, height }: { status: JobState; firstName: string; figureUri: string | null; kind?: PricingKind; terms?: VisitTermsHe; female?: boolean; forSomeoneElse?: boolean; width: number; height: number }) {
  const [since] = useState(() => {
    if (!visitStart.at) visitStart.at = Date.now();
    return visitStart.at;
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [pulse]);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  const clock = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const { title, sub } = workHeadlineHe(status, firstName, kind, terms, female, forSomeoneElse);
  const done = status === "COMPLETION_PENDING";
  /* The trade's waist-up portrait: it reads at this size, and a full
     figure's feet would sit under the sheet anyway. */
  const figH = Math.round(height * 0.5);
  return (
    <View style={[styles.work, { width, height }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.workGlow, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] }) }]}
      />
      {figureUri ? (
        <Animated.Image
          source={{ uri: figureUri }}
          resizeMode="contain"
          style={{
            position: "absolute", left: 6, top: Math.round(height * 0.2), width: Math.round(figH * 0.68), height: figH,
            transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ) : null}
      <View style={[styles.workText, { left: figureUri ? Math.round(figH * 0.68) + 8 : 18 }]}>
        <View style={styles.workChip}>
          <Text style={styles.workChipText}>{done ? "✓ הסתיים" : "● עכשיו"}</Text>
        </View>
        <Text style={styles.workTitle}>{title}</Text>
        <Text style={styles.workSub}>{sub}</Text>
        <View style={styles.workClockRow}>
          <Text style={styles.workClock}>{clock}</Text>
          <Text style={styles.workClockHint}>זמן הביקור</Text>
        </View>
      </View>
    </View>
  );
}

export function TrackingBody({
  proFigureUri = null,
  backdrop,
  onOpenRealMap,
  geo = null,
  status,
  serviceNameHe,
  professional,
  eta,
  money,
  professionalFemale = false,
  arrivalClockHe = null,
  arrival,
  previousClockHe = null,
  onGetHelp,
  onConfirmCompletion,
  onCancelJob,
  onCall,
  onMessage,
  onSafety,
  onSiteNameHe = null,
  onSiteStatusHe = null,
  onOpenOnSiteView,
  onBack,
  worldSources,
  departmentCode = null,
  etaSecondsAtAssignment = null,
  vehicleAssetId,
  sponsors,
  sponsorVenueUriFor,
  onEnterSponsor,
  animate = true,
  width = 390,
  height = 780,
}: TrackingBodyProps) {
  const etaDisplay = formatEta(eta);
  const rating = formatProNowRating(professional.proNowRatingAverage, professional.proNowRatingCount);
  const jobsLine = formatCompletedJobs(professional.proNowCompletedJobs);
  // Anything past the search means a professional is attached to this job.
  const assigned = status !== "SEARCHING" && status !== "DRAFT" && status !== "OFFERING";
  /*
   * Derived, not handed over. See `money` above, and `visitMoneyLineHe`
   * in job-scene.ts for what each state is allowed to say.
   */
  const moneyLineHe = visitMoneyLineHe(status, money ?? {});

  /*
   * ---------------------------------------------------------------------
   * THE ROAD THE PROFESSIONAL ACTUALLY TAKES
   * ---------------------------------------------------------------------
   * Found once per extract and per trade rather than per frame: this
   * screen re-renders at least once a second from its own ETA clock,
   * forever, while somebody watches, and Dijkstra over a few thousand
   * junctions is not a per-frame job. `RouteLayer` has the same note
   * about its own sample table and for the same reason.
   *
   * The trade's shopfront is a stand-in for where the professional set
   * off from; the day the server sends a real origin it goes through
   * `frontageNear` and nothing else here changes.
   */
  const roadPath = useMemo(() => {
    if (!geo) return null;
    const cleaned = pruneDeadEnds(geo).geo;
    const plan = planWorld(cleaned);
    const spots = plotSpotsFromGeo(plan);
    if (spots.length === 0) return null;
    const to = frontageNear(plan, CUSTOMER_POINT);
    if (!to) return null;

    /*
     * A STAND-IN ORIGIN STILL HAS TO BE A JOURNEY AWAY.
     *
     * This used to index the plot list by the department's position in
     * `DISTRICT_SITES` — the same "somewhere in the city" rule the
     * shopfronts use. On the real extract that happened to land the
     * plumber four doors down from the customer, so the route the
     * router found was twenty-five metres long: at ROUTE's 280 metres
     * across it drew as an eighteen-pixel stub, which is why the
     * tracking screen looked like it had no route and no vehicle on it.
     * The path was there. It was the size of a doorstep.
     *
     * Until the server sends a real origin there is nothing to be
     * faithful to, so the one property worth choosing for is the one
     * this screen exists to show: that somebody is coming from
     * somewhere. The origin is the plot FURTHEST from the customer that
     * the road graph can actually reach — furthest by the roads, not by
     * the crow, because a plot across a river is not far, it is
     * unreachable.
     *
     * The day the server sends a real origin this whole block becomes
     * `frontageNear(plan, origin)` and nothing else here changes.
     */
    const graph = buildRoadGraph(plan);
    const byDistance = [...spots].sort(
      (a, b) =>
        Math.hypot(b.u - CUSTOMER_POINT.u, b.v - CUSTOMER_POINT.v) -
        Math.hypot(a.u - CUSTOMER_POINT.u, a.v - CUSTOMER_POINT.v)
    );
    for (const from of byDistance) {
      const route = routeAlongRoads(graph, from, to.at);
      /* The first leg is the plot's connector to the kerb — between the
         houses, not along a street. The van is shown from the road on. */
      if (route && route.metres > 0) {
        /*
         * ON THE ROADS AS THEY ARE DRAWN.
         *
         * The plate draws its streets in a gentle 3/4 perspective
         * (`groundProject`, at the pitch its lens implies); the route was
         * laid over it flat, so the van drifted off the streets and over
         * the houses — Amit: *"הניידת נוסעת על הבתים ולא על שום כביש."*
         * The same projection, at the same pitch, puts it back on them.
         */
        const pitch = pitchForMetres(metresAcrossAt(worldZoomFor("ROUTE"), cleaned.bounds));
        const raw = route.path.length > 3 ? route.path.slice(1) : route.path;
        return { path: raw.map((q) => groundProject(q, pitch)), metres: route.metres };
      }
    }
    return null;
  }, [geo, departmentCode]);

  /*
   * With no signals from the caller the screen assumes nothing is wrong —
   * but it assumes it by running the SAME function, with a promise that has
   * not yet passed, rather than by hard-coding a happy phase. A default
   * that bypasses the rule is a default that will survive the rule changing.
   */
  /*
   * THE JOB STATE IS PART OF THE ARRIVAL SIGNAL, AND LEAVING IT OUT WAS A
   * FABRICATED ETA.
   *
   * `assessArrival` answers "how is the journey going", and a journey
   * with no bad news in it is ON_ROUTE. It had no way to be told the
   * journey had ENDED — so on this screen, with the status line reading
   * "העבודה בעיצומה", the card above it said "בדרך אליכם" over a clock
   * counting down fourteen minutes to an arrival that had already
   * happened, for the whole length of the visit.
   *
   * The server says he is there; this passes that on rather than letting
   * the screen infer it from a countdown reaching zero, which would be
   * the same invention wearing a different hat.
   */
  // The first word of the name, the way somebody in your kitchen is
  // referred to once they are in it.
  const jobKind: PricingKind = money?.kind ?? (money?.fixedTotalHe ? "LIST" : "VISIT");
  const progressHe = jobProgressHe(status, professional.displayName.split(/\s+/)[0] ?? null, { kind: jobKind, terms: money?.terms, female: professionalFemale, forSomeoneElse: Boolean(money?.forSomeoneElse) });
  /*
   * WORK IS A STATE, SO IT DRIVES THE PICTURE.
   *
   * Taken from `status` rather than from a prop somebody sets, because
   * that is what makes it honest: the server says a professional is at
   * this address doing the work, and the screen draws that. It stops the
   * moment the state does.
   *
   * DIAGNOSIS counts. He is looking rather than fixing, and from outside
   * the door both are "he is in there, busy" — which is all the figure
   * claims.
   */
  const atWork =
    status === "DIAGNOSIS" || status === "IN_PROGRESS" || status === "WAITING_QUOTE_APPROVAL";

  const hasArrived =
    status === "PRO_ARRIVED" ||
    status === "DIAGNOSIS" ||
    status === "WAITING_QUOTE_APPROVAL" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETION_PENDING";

  const assessment = assessArrival(
    arrival
      ? { ...arrival, arrived: arrival.arrived ?? hasArrived }
      : {
          arrived: hasArrived,
          promisedArrivalMs: eta ? Date.now() + eta.etaSeconds * 1000 : null,
          lastLocationMs: Date.now(),
          nowMs: Date.now(),
        }
  );

  /*
   * ONE WORD PER STATE, AND "מעדכנים…" IS NOT ONE OF THEM.
   *
   * Three of the six states a visit passes through had no case here, so
   * they all fell to the default: a customer standing in their kitchen
   * while the professional inspected the fault was told the app was
   * "updating". It is the pill over the map and the second half of the
   * service line, so it was the loudest thing on the screen, and it said
   * nothing.
   *
   * The default stays, for a state that genuinely has not been seen yet
   * — a screen that guesses is worse than one that admits it does not
   * know — but it is no longer where most of the visit lands.
   */
  const headline =
    status === "PRO_EN_ROUTE"
      ? "בדרך אליך"
      : status === "PRO_ARRIVED"
        ? (professionalFemale ? "הגיעה אליכם" : "הגיע אליכם")
        : status === "DIAGNOSIS"
          ? (professionalFemale ? "בודקת מה צריך" : "בודק מה צריך")
          : status === "WAITING_QUOTE_APPROVAL"
            ? "מחכה לאישורכם"
            : status === "IN_PROGRESS"
              ? "העבודה בעיצומה"
              : status === "COMPLETION_PENDING"
                ? (professionalFemale ? "סיימה — מחכה לאישורכם" : "סיים — מחכה לאישורכם")
                : status === "PRO_ASSIGNED"
                  ? (professionalFemale ? "יוצאת אליכם" : "יוצא אליכם")
                  : "מעדכנים…";


  /*
   * How far through the trip, read once and shared.
   *
   * The camera and the vehicle both use it, so they cannot disagree about
   * where the professional is — and it is null, not zero, when the server
   * has given no ETA, which holds the journey still rather than creeping
   * forward at an invented speed.
   */
  /*
   * A CLOCK, SO THE SECONDS BETWEEN READINGS ARE DRAWN.
   *
   * Readings arrive every few seconds, and the figure used to be pinned to
   * the last one — motionless in the road, then a jump. `routeProgress`
   * now subtracts the elapsed seconds from the ETA the server gave, which
   * renders a claim already made rather than inventing one; it still
   * refuses to move at all without an ETA, and still stops at the door.
   *
   * Ticking once a second is enough: the vehicle eases between readings on
   * its own, so this only has to keep supplying it with somewhere to ease
   * towards.
   */
  const [tick, setTick] = useState(() => Date.now());
  /* The card that opens from the vehicle on the real map. */
  const [proCard, setProCard] = useState(false);
  const sheetDrag = useSheetDrag({ peek: 70 });
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [animate]);
  const etaReadAt = useRef(Date.now());
  const lastEta = useRef(eta?.etaSeconds ?? null);
  if ((eta?.etaSeconds ?? null) !== lastEta.current) {
    lastEta.current = eta?.etaSeconds ?? null;
    etaReadAt.current = Date.now();
  }

  const tripProgress = routeProgress({
    etaSecondsAtAssignment: etaSecondsAtAssignment ?? null,
    etaSecondsNow: eta?.etaSeconds ?? null,
    etaReadAtMs: etaReadAt.current,
    nowMs: tick,
  });

  // The map gets the top 54%; the sheet sizes itself and overlaps the rest.
  // Pulled down, the sheet leaves the screen to the map — it used to leave
  // an empty dark half instead (Amit, 2026-09-29: "נשאר חצי מסך שחור").
  const openMapH = Math.round(height * 0.54);
  const mapH = sheetDrag.folded ? height - 60 : openMapH;
  /** A real extract is a street plan, not our painting. See `RouteLayer`. */
  const plan = geo !== null;

  return (
    <ScreenShell side="customer" tone="dark" liveState="ROUTE" width={width} height={height}>
      {/* ---------------------------------------------------------------
          THE PROFESSIONAL, COMING DOWN OUR STREETS.
          ---------------------------------------------------------------
          Amit: *"גם את העמוד הזה נצטרך לעשות שאיש המקצוע הנכון נוסע אליך
          ורואים אותו זז במפה שבנינו."*

          This was an abstract dark grid with a dotted curve on it — the
          only screen in the product still happening somewhere other than
          the neighbourhood, at the exact moment the customer cares most.

          What moves is driven by PROGRESS through the server's own ETA, not
          by coordinates: the professional really is that far through the
          trip, and where they physically are is not claimed. The line under
          the map says so, and it stays until a maps vendor is chosen.
          --------------------------------------------------------------- */}
      {ON_SITE.includes(status) ? null : ((visitStart.at = 0), null)}
      <View style={{ width, height: mapH, overflow: "hidden" }}>
        {ON_SITE.includes(status) ? (
          <WorkScene
            status={status}
            firstName={professional.displayName.split(" ")[0] ?? ""}
            figureUri={proFigureUri}
            kind={jobKind}
            terms={money?.terms}
            female={professionalFemale}
            forSomeoneElse={Boolean(money?.forSomeoneElse)}
            width={width}
            height={mapH}
          />
        ) : backdrop && !geo ? (
          backdrop
        ) : worldSources ? (
          <>
            <WorldBackdrop
              width={width}
              height={mapH}
              sources={worldSources}
              departmentCode={departmentCode}
              animate={animate}
              /*
               * The same ground the stroll screen stands on. Two screens
               * showing two different cities with the same street names
               * is the drift `art-delivery.test` exists to stop, arrived
               * at from the other direction — so the extract goes to both.
               */
              geo={geo}
              /*
               * THE CAMERA FOLLOWS THEM.
               *
               * A fixed shot with a vehicle crossing it is a map with a dot
               * on it. A camera that stays with the professional as they
               * come down the street is somebody approaching — and since
               * both the camera and the vehicle read the same `progress`,
               * they cannot drift apart.
               */
              /*
               * AND IT FOLLOWS THE ROUTE THE VAN IS ACTUALLY DRIVING.
               *
               * This read `routeAt(...)` — the synthetic arc from
               * `assignment-route` — while the vehicle below was given
               * `roadPath`, the Dijkstra path over the real street graph.
               * Two different routes, so the camera sat over one stretch
               * of city while the professional drove another, and on the
               * real extract the result was a tracking screen with no
               * vehicle and no route line visible on it at all: both were
               * in frame's worth of city away.
               *
               * It is the same failure as the asserted lens, one screen
               * along — a position stated in one place and derived in
               * another. So when there is a road path, the camera reads
               * the SAME path, at the same `progress`, and the two cannot
               * come apart. Without one it falls back to the arc, which is
               * what every build with no extract still shows.
               */
              /*
               * THE CAMERA GOES WHERE THE STORY IS.
               *
               * It followed the route, which is right while somebody is
               * driving and wrong the moment they arrive: at progress 1
               * it parked over a stretch of road and the visit happened
               * off the bottom of the frame. Amit: *"חייב פה יותר תנועה
               * וחיים בזמן העבודה."* Some of that life WAS being drawn —
               * at a point the camera was not pointed at.
               *
               * Once the visit begins it holds on the customer's own
               * door, which is the only place anything is happening.
               */
              focus={
                atWork
                  ? CUSTOMER_POINT
                  : tripProgress === null
                    ? null
                    : (() => {
                        const at = roadPath
                          ? alongRoute(
                              { path: roadPath.path, drive: roadPath.path, metres: roadPath.metres },
                              tripProgress
                            ).at
                          : routeAt((departmentCode as never) ?? "HOME_URGENT", tripProgress).at;
                        /*
                         * ON A PLAN, THE JOURNEY RATHER THAN THE TRAVELLER.
                         *
                         * Following the marker keeps it dead centre and
                         * pushes the destination off the frame — so the
                         * route reads as a line leaving the screen, and
                         * the thing it exists to show, the distance still
                         * to come, is the part that is cropped. Amit:
                         * *"מה מבינים מהמסך הזה?"*
                         *
                         * Halfway between where they are and where they
                         * are going holds both ends, and it still MOVES:
                         * as the marker closes on the address the midpoint
                         * slides with it. It is only worth doing now that
                         * the band is tall enough to hold the two — see
                         * the sheet's height below.
                         *
                         * The painted plate keeps the follow shot. It is
                         * one street at eye level and the point there is
                         * watching somebody come down it.
                         */
                        /* Amit: *"רק לראות איפה הוא ברכב שלו על המפה."*
                           The vehicle is the subject of the tracking map,
                           so the camera stays on it — and on a street plan it
                           frames the way home too (2026-09-29). */
                        return geo ? { u: (at.u + CUSTOMER_POINT.u) / 2, v: (at.v + CUSTOMER_POINT.v) / 2 } : at;
                      })()
              }
              /*
               * WIDE ENOUGH TO BE A JOURNEY.
               *
               * The camera used to sit at the district shot, close enough
               * that two shopfronts filled the frame — so following
               * somebody was watching a wall go past. "ROUTE" pulls back
               * far enough that the street, the shops along it and the
               * direction of travel are all in the same picture, which is
               * the only thing that makes movement legible.
               */
              zoom={(() => {
                const z = worldZoomFor("ROUTE");
                if (!geo || tripProgress === null || atWork) return z;
                const at = roadPath
                  ? alongRoute({ path: roadPath.path, drive: roadPath.path, metres: roadPath.metres }, tripProgress).at
                  : routeAt((departmentCode as never) ?? "HOME_URGENT", tripProgress).at;
                const d = Math.max(Math.abs(at.u - CUSTOMER_POINT.u), Math.abs(at.v - CUSTOMER_POINT.v) * 1.3, 0.02);
                return Math.max(worldZoomFor("WIDE"), Math.min(z, (worldZoomFor("WIDE") * 0.62) / d));
              })()}
            >
              {/*
                * THE ROUTE AND THE VEHICLE, INSIDE THE WORLD.
                *
                * These were siblings of the backdrop, laid out against the
                * PHONE while the ground panned and zoomed underneath them.
                * A world coordinate plotted in viewport space is not a
                * position at all: the scooter appeared wherever the
                * arithmetic put it, unrelated to the road. Amit: *"כל
                * המכוניות והבניינים והנסיעה מבולגנת ממש."*
                *
                * Now they are drawn in the world's own space, so the road
                * under the wheels is the road that was painted there.
                */}
              {(world) => (
                <RouteLayer
                  width={world.width}
                  height={world.height}
                  department={(departmentCode as never) ?? "HOME_URGENT"}
                  progress={tripProgress}
                  vehicleAssetId={vehicleAssetId}
                  onPressTraveller={() => setProCard(true)}
                  /*
                   * A real extract is a street plan, so the traveller is
                   * a marker on it rather than a painted figure at a
                   * painting's scale. See `plan` in RouteLayer — and the
                   * two layers above it, the district markers and the
                   * ambient traffic, which already switch off here for
                   * the same reason.
                   */
                  plan={geo !== null}
                  /*
                   * And who the marker is, in words, because the plan
                   * has no picture to say it with. Amit: *"מה מבינים
                   * מהמסך הזה של המסלול הכחול עם הכתום?"* The first name
                   * only — the same way somebody on their way to your
                   * kitchen is referred to once the job is theirs.
                   */
                  travellerLabelHe={professional.displayName.split(/\s+/)[0] ?? undefined}
                  travellerMinutes={etaDisplay && etaDisplay.unit.includes("דק") ? Number(etaDisplay.value) : null}
                  sources={worldSources}
                  animate={animate}
                  /*
                   * THE ROAD, WHEN THERE IS A ROAD.
                   *
                   * Amit has made this complaint more than once —
                   * *"חייב שכלי הרכב יסעו כמו שצריך על הכביש"* — and
                   * every previous answer was a better curve. On a real
                   * extract the van turns left because the junction is
                   * there. See `routeAlongRoads`.
                   */
                  path={roadPath?.path ?? null}
                  pathMetres={roadPath?.metres ?? 0}
                  /*
                   * WORK IS A STATE, SO IT DRIVES THE PICTURE.
                   *
                   * Amit: *"חייב פה יותר תנועה וחיים בזמן העבודה."* Once
                   * the van has parked, the one thing the customer is
                   * waiting on — somebody in their flat, working — was
                   * not on the screen at all.
                   *
                   * Taken from `status` rather than from a prop somebody
                   * sets, because that is what makes it honest: the
                   * server says a professional is at this address doing
                   * the work, and this draws that. It stops the moment
                   * the state does.
                   *
                   * DIAGNOSIS counts. He is looking rather than fixing,
                   * and from the pavement outside both are "he is in
                   * there, busy" — which is all the figure claims.
                   */
                  atWork={atWork}
                  workerAssetId={
                    WORLD_DISTRICTS[(departmentCode as DepartmentCode) ?? "HOME_URGENT"]
                      ?.characterWorldAssetId
                  }
                />
              )}
            </WorldBackdrop>
          </>
        ) : (
          <RealMapSurface assigned={assigned} width={width} height={mapH} tone="dark" geo={geo} />
        )}
        {/* A street plan that is not a real place says so once, readably (2026-09-29). */}
        {geo && !geo.real && !ON_SITE.includes(status) ? (
          <View style={styles.demoMapTag} pointerEvents="none">
            <Text style={styles.demoMapTagText}>מפת הדגמה</Text>
          </View>
        ) : null}
      </View>

      {/*
        * THE CLOCK ON THE MAP.
        *
        * Minutes and distance exactly as the server's ETA gives them —
        * nothing computed here — while the professional is on the way.
        * Tapping it swaps to the real map, where the vehicle is on the
        * route; tapping again comes back to the city.
        */}
      {(status === "PRO_ASSIGNED" || status === "PRO_EN_ROUTE") && eta && onOpenRealMap ? (
        <Pressable
          onPress={onOpenRealMap}
          accessibilityRole="button"
          accessibilityLabel={geo ? "חזרה לעיר" : "איפה הוא עכשיו — מפה אמיתית"}
          style={({ pressed }) => [styles.etaClock, { top: Math.round(openMapH * 0.22) }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.etaClockMin}>{Math.max(1, Math.round(eta.etaSeconds / 60))}</Text>
          <Text style={styles.etaClockUnit}>דק׳</Text>
          {eta.distanceMeters !== null ? (
            <Text style={styles.etaClockKm}>{(eta.distanceMeters / 1000).toFixed(1)} ק״מ</Text>
          ) : null}
          <Text style={styles.etaClockHint}>{geo ? "חזרה לעיר" : "איפה הוא ›"}</Text>
        </Pressable>
      ) : null}

      {/*
        * WHO IS IN THAT VAN.
        *
        * Opened by tapping the vehicle on the real map. Only what the
        * server says about them: name, verifications, jobs and rating on
        * PRO NOW (hidden until there is one), and the same ETA as the clock.
        */}
      {proCard ? (
        <Pressable style={styles.proCardScrim} onPress={() => setProCard(false)} accessibilityRole="button" accessibilityLabel="סגירת פרטי המקצוען">
          <Pressable style={styles.proCard} onPress={() => {}}>
            <Text style={styles.proCardName}>{professional.displayName}</Text>
            <Text style={styles.proCardLine}>{serviceNameHe}</Text>
            {professional.verifications.length > 0 ? (
              <Text style={styles.proCardVerified}>✓ מאומת ב-PRO NOW · {professional.verifications.length} בדיקות</Text>
            ) : null}
            {rating ? <Text style={styles.proCardLine}>★ {rating.rating} ({rating.count}) ב-PRO NOW</Text> : null}
            {jobsLine ? <Text style={styles.proCardLine}>{jobsLine}</Text> : null}
            {etaDisplay ? <Text style={styles.proCardEta}>מגיע בעוד {etaDisplay.value} {etaDisplay.unit}</Text> : null}
            <View style={styles.proCardRow}>
              {onCall ? (
                <Pressable onPress={onCall} style={styles.proCardBtn} accessibilityRole="button"><Text style={styles.proCardBtnText}>שיחה</Text></Pressable>
              ) : null}
              {onMessage ? (
                <Pressable onPress={onMessage} style={styles.proCardBtn} accessibilityRole="button"><Text style={styles.proCardBtnText}>הודעה</Text></Pressable>
              ) : null}
              <Pressable onPress={() => setProCard(false)} style={styles.proCardBtn} accessibilityRole="button"><Text style={styles.proCardBtnText}>סגירה</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      ) : null}

      {/*
        * THE WORK, TIMED — on the customer's side too, so the visit never
        * sits still while he waits. A stopwatch from when this step began
        * on this screen; not a price and not an estimate.
        */}
      {/* On site the work scene carries the clock — see `WorkScene`. */}

      {onBack ? <BackButton onPress={onBack} tone="dark" /> : null}

      {/* The state, as one word, over the map. */}
      <View style={styles.statusPill} pointerEvents="none">
        <Text style={styles.statusText}>{headline}</Text>
      </View>

      {/*
        * ONE elevated surface, anchored to the BOTTOM and sized by its
        * content. Pinning it to a fraction of the screen left a stretch of
        * empty white under the last line on a tall phone — the sheet has as
        * much to say as it has, and the map takes the rest.
        */}
      {/*
        * THE SHEET IS BOUNDED AND IT SCROLLS.
        *
        * It used to be anchored to the bottom and sized purely by its
        * content, on the theory that a sheet should say as much as it has
        * to say. That is right until it has more to say than the phone is
        * tall — an assurance line, a professional, three actions, a price
        * line and a masking note — and then it grows upward past the top of
        * the screen and the overflow is simply clipped, with no way to
        * reach it. Amit: *"גם פה לא נגלל ולא זז."*
        *
        * So it is capped at the space the map is not using, plus a little
        * of the map's own, and anything beyond that scrolls. The map keeps
        * its share on a tall phone; on a short one the sheet can take more
        * of the screen rather than losing its last line.
        */}
      {/* ----------------------------------------------------------------
          AND IT GIVES THE MAP ROOM WHILE SOMEBODY IS DRIVING.

          Amit, on the real map: *"מה מבינים מהמסך הזה של המסלול הכחול
          עם הכתום?"* — and then, plainly, *"לא טוב."*

          The sheet may grow until only the top 42% of the map band is
          left, which is about 190pt on a phone. A painted street reads
          fine in 190pt: it is one road at eye level and the van coming
          down it is the whole story. A street PLAN does not — 190pt of a
          city holds one end of a journey and crops the other, so the
          route leaves the frame and you never see where it is going.
          That is the fault behind both of his sentences, and it is a
          layout decision rather than anything about the drawing.

          So while somebody is actually driving on a plan, the sheet
          keeps only what it needs and the map keeps the rest. The
          sheet's own order is unchanged and it scrolls, so the two
          things being waited on — the clock and the five steps — are
          still the first things under it.

          It reverts the moment the driving does. Once the visit begins
          the map is a house with somebody working in it and the sheet is
          the screen.
          ---------------------------------------------------------------- */}
      <Animated.View
        style={[
          styles.sheet,
          /* Pulled up, the visit takes nearly the whole screen. */
          /* On site the work scene above is the news, so the sheet starts low
             enough to leave it on screen (it still scrolls and pulls up) —
             except at the end, when the sheet holds the one thing to do:
             confirm and pay. On a small phone that button sat under the fold. */
          { maxHeight: sheetDrag.expanded ? height - 90 : height - openMapH * ((plan && !atWork && tripProgress !== null) || (backdrop && (status === "PRO_ASSIGNED" || status === "PRO_EN_ROUTE")) || (ON_SITE.includes(status) && status !== "COMPLETION_PENDING") ? 0.9 : 0.42) },
          { transform: [{ translateY: sheetDrag.y }] },
        ]}
        onLayout={sheetDrag.measure}
      >
        {/* Pull down to see the whole map; up to bring the visit back. */}
        <View {...sheetDrag.bind} style={styles.sheetDragZone}>
          <View style={styles.grabber} />
        </View>

        {/*
          * THE PROMISE IS THE SHEET'S FIRST LINE, not a number in a corner.
          * ספץ's equivalent screen has no ETA at all — their answer to "he
          * did not arrive" is that you telephone him. Ours states a clock
          * time, says out loud when it moves, and carries its own way out.
          */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.sm }}
          bounces={false}
        >
        <ArrivalPromise
          assessment={assessment}
          arrivalClockHe={arrivalClockHe}
          minutesAway={etaDisplay && etaDisplay.unit.includes("דק") ? Number(etaDisplay.value) : null}
          previousClockHe={previousClockHe}
          displayNameHe={professional.displayName}
          female={professionalFemale}
          onGetHelp={onGetHelp}
          onCancel={onCancelJob}
          width={width - spacing.lg * 2}
        />

        {/*
          * WHAT IS HAPPENING, AND WHAT WILL BE ASKED OF YOU.
          *
          * Once the arrival code is verified the journey is over, so
          * everything the arrival card had been saying stops being true
          * and the screen went quiet: a status word, and nothing else.
          * Amit: *"אחרי הקוד הגעתי לפה, לא קורה פה כלום."* `jobProgressHe`
          * lives beside the state machine so the sentence and the state
          * cannot drift; it promises no times, because a state does not
          * know any.
          */}
        {progressHe ? <Text style={styles.progress}>{progressHe}</Text> : null}

        {onSiteNameHe ? (
          <Pressable
            onPress={onOpenOnSiteView}
            accessibilityRole="button"
            accessibilityLabel={`מה ${onSiteNameHe} רואה בטלפון`}
            style={({ pressed }) => [styles.onSite, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.onSiteTitle} numberOfLines={1}>הקריאה בשביל {onSiteNameHe}</Text>
              <Text style={styles.onSiteSub} numberOfLines={2}>
                {onSiteStatusHe ?? `${onSiteNameHe} קיבל/ה הודעה עם פרטי המקצוען וקוד לדלת`}
              </Text>
            </View>
            <Text style={styles.onSiteGo}>מה {onSiteNameHe.split(" ")[0]} רואה ›</Text>
          </Pressable>
        ) : null}

        {/* ----------------------------------------------------------------
            WHERE THAT SENTENCE SITS IN THE WHOLE VISIT.

            Amit: *"בשלב שהמקצוען התחיל לבדוק ועד להצעת מחיר אין שום דבר
            בזמן העבודה, אין שום תחלופה במסך."*

            The sentence above was the only thing on this screen that ever
            moved, and between the knock and a price it does not move for
            minutes. It says where you are; it does not say where that IS.

            Four steps with one marked says both, and the mark advances at
            every real transition — so something visibly changes each time
            something happens, and never in between. No times, no
            percentage, no bar filling up: a step is behind you, the one
            you are in, or ahead. See `visitStepsHe`.
            ---------------------------------------------------------------- */}
        <VisitSteps status={status} accent={colors.action} done={colors.trust} />

        {/* ----------------------------------------------------------------
            THE ONE MOVE THAT IS THE CUSTOMER'S, AND IT WAS NOT ON THE
            SCREEN.

            Amit: *"סיום ותשלום, סתם לחצתי על הכפתור לא קרה כלום."*

            At COMPLETION_PENDING this screen said "סיים — ממתין לאישור"
            and offered no way to give it. The headline asked the customer
            for something and the screen had no control that answered —
            so the only buttons in reach were שיחה, הודעה and בטיחות, and
            pressing one of those did exactly what it says, which is
            nothing about finishing.

            It is also the most consequential tap in the product: the
            professional's claim becomes the customer's agreement, and the
            money moves. /docs/09-PAYMENTS.md puts the charge behind THIS
            tap rather than behind the professional's, which is the whole
            reason the state machine has two states here instead of one.
            So the button says what it does rather than "סיום".

            And a quiet way out beside it, because "he says he is finished
            and he is not" needs somewhere to go that is not silence.
            ---------------------------------------------------------------- */}
        {status === "COMPLETION_PENDING" && onConfirmCompletion ? (
          <View style={styles.confirmBlock}>
            {/* ----------------------------------------------------------
                AND WHY THIS TAP IS THE ONE THAT MATTERS.

                Amit's rule: the amount was HELD when the quote was
                approved, and it moves on this. Saying so here is what
                makes the button worth reading — otherwise it is a
                courtesy confirmation, and somebody who thinks the money
                already went has no reason to be careful with it.
                ---------------------------------------------------------- */}
            <Text style={styles.holdNote}>
              {money?.paidDirectly
                ? "כאן מאשרים שהעבודה הסתיימה. באפליקציה לא עובר כסף — את הסכום משלמים ישירות לבעל המקצוע."
                : paymentPromiseHe("COMPLETION_PENDING", "customer")}
            </Text>
            <Pressable
              onPress={onConfirmCompletion}
              accessibilityRole="button"
              accessibilityLabel={money?.paidDirectly ? "אישור שהעבודה הושלמה" : "אישור שהעבודה הושלמה, ומעבר לתשלום"}
              style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }]}
            >
              {/*
                * THE SECOND OF TWO APPROVALS, NAMED.
                *
                * Amit: *"צריך פעם אחת אישור הצעת מחיר, פעם שנייה אישור
                * תשלום בסיום העבודה."* Two on purpose — one of the
                * price, one of the payment — so this one says which it
                * is, and carries the amount for the same reason the
                * first one does: a button about money that hides the
                * number asks somebody to agree to it blind.
                *
                * The amount comes from the approved quote and is absent
                * when there is none, in which case the button says what
                * it does and nothing about a figure it has not been
                * given.
                */}
              <Text style={styles.confirmLabel}>
                {money?.paidDirectly
                  ? "אישור שהעבודה הסתיימה"
                  : money?.approvedTotalHe
                  ? `אישור תשלום · ${money.approvedTotalHe}`
                  : money?.fixedTotalHe
                    ? `אישור תשלום · ${money.fixedTotalHe}`
                    : money?.visitFeeHe
                      ? `אישור תשלום · ${money.visitFeeHe} ${(money.terms ?? DEFAULT_VISIT_TERMS).feeSubjectHe.replace(/(^| )ה/g, "$1").replace(" וה", " ו")}`
                      : jobKind === "VISIT"
                        ? "אישור — הביקור התקיים"
                        : "אישור תשלום — העבודה הושלמה"}
              </Text>
            </Pressable>
            <Pressable
              onPress={onGetHelp}
              accessibilityRole="button"
              accessibilityLabel="משהו לא תקין בעבודה"
              style={({ pressed }) => [styles.confirmQuiet, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.confirmQuietLabel}>משהו לא תקין</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.service} numberOfLines={1}>
          {serviceNameHe} · {headline}
        </Text>

        <View style={styles.divider} />

        <View style={styles.proRow}>
          <ProviderPortrait
            photoUri={professional.profilePhotoUrl}
            displayNameHe={professional.displayName}
            size={54}
            tone="dark"
          />
          <View style={styles.proText}>
            <Text style={styles.proName} numberOfLines={1}>
              {professional.displayName}
            </Text>
            <View style={styles.proMeta}>
              {rating ? (
                <>
                  <StarMark size={13} />
                  <Text style={styles.proMetaStrong}>{rating.rating}</Text>
                  <Text style={styles.proMetaDim}>({rating.count})</Text>
                </>
              ) : null}
              {rating && jobsLine ? <Text style={styles.proMetaDim}>·</Text> : null}
              {jobsLine ? <Text style={styles.proMetaDim}>{jobsLine}</Text> : null}
            </View>
          </View>
          {professional.verifications.includes("IDENTITY_VERIFIED") ? (
            <View style={styles.verified}>
              <ShieldCheckMark size={17} color={colors.trust} />
            </View>
          ) : null}
        </View>

        {/* Contact. No phone number crosses this boundary. */}
        {onCall || onMessage || onSafety ? (
          <View style={styles.actions}>
            <Act labelHe="שיחה" onPress={onCall} />
            <Act labelHe="הודעה" onPress={onMessage} />
            <Act labelHe="בטיחות" onPress={onSafety} danger />
          </View>
        ) : null}

        {moneyLineHe ? <Text style={styles.price}>{moneyLineHe}</Text> : null}
        {/* Only where calling or messaging exists: then the numbers really are masked. */}
        {onCall || onMessage ? <Text style={styles.masked}>המספרים מוסתרים משני הצדדים</Text> : null}

        {/* ----------------------------------------------------------------
            THE PAID STREET, LAST.

            Below the money line and below everything about the visit,
            because nothing here is about the visit. The row removes
            itself once the professional arrives — see `SponsorRow`.
            ---------------------------------------------------------------- */}
        {sponsors && sponsors.length > 0 ? (
          <SponsorRow
            status={status}
            shops={sponsors}
            venueUriFor={sponsorVenueUriFor}
            onEnter={onEnterSponsor}
            width={width - spacing.xl * 2}
          />
        ) : null}
        </ScrollView>
      </Animated.View>
    </ScreenShell>
  );
}

function Act({
  labelHe,
  onPress,
  danger,
}: {
  labelHe: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  // A button that does nothing is a promise the screen cannot keep.
  if (!onPress) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={labelHe}
      style={({ pressed }) => [styles.act, pressed && { opacity: 0.88 }]}
    >
      <Text style={[styles.actText, danger && { color: colors.statusDanger }]} numberOfLines={1}>
        {labelHe}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  demoMapTag: { position: "absolute", left: 12, top: 74, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(14,10,20,0.75)", borderWidth: 1, borderColor: "rgba(247,243,250,0.18)" },
  demoMapTagText: { color: "rgba(247,243,250,0.85)", fontSize: scale.micro, fontWeight: "700", writingDirection: "rtl" },
  onSite: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: tint.neutralDark(0.05),
  },
  onSiteTitle: { ...type.metaStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  onSiteSub: { ...type.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  onSiteGo: { ...type.metaStrong, color: colors.actionText, writingDirection: "rtl" },
  work: { backgroundColor: "#1B1226", overflow: "hidden" },
  workGlow: {
    position: "absolute", left: -60, top: -40, width: 320, height: 320, borderRadius: 160,
    backgroundColor: "rgba(47,191,138,0.18)",
  },
  workText: { position: "absolute", right: 16, top: 66, alignItems: "flex-end" },
  workChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(47,191,138,0.18)", marginBottom: 8 },
  workChipText: { color: "#7FE3BC", fontSize: scale.micro, fontWeight: "800", writingDirection: "rtl" },
  workTitle: { color: "#FFFFFF", fontSize: scale.section, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  workSub: { color: "rgba(247,243,250,0.75)", fontSize: scale.meta, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  workClockRow: { marginTop: 12, alignItems: "flex-end" },
  workClock: { color: "#FFFFFF", fontSize: scale.hero, fontWeight: "900", fontVariant: ["tabular-nums"] },
  workClockHint: { color: "#7FE3BC", fontSize: scale.micro, fontWeight: "700", writingDirection: "rtl" },
  sheetDragZone: { alignSelf: "stretch", alignItems: "center", paddingVertical: 6, minHeight: 26 },
  proCardScrim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(8,6,14,0.55)", justifyContent: "center", padding: 22, zIndex: 20 },
  proCard: { backgroundColor: "#1b1624", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  proCardName: { color: "#FFFFFF", fontSize: scale.section, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  proCardLine: { color: "rgba(247,243,250,0.8)", fontSize: scale.meta, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  proCardVerified: { color: "#7FE3BC", fontSize: scale.meta, fontWeight: "700", textAlign: "right", writingDirection: "rtl", marginTop: 8 },
  proCardEta: { color: "#FF9A6B", fontSize: scale.body, fontWeight: "800", textAlign: "right", writingDirection: "rtl", marginTop: 10 },
  proCardRow: { flexDirection: "row-reverse", gap: 8, marginTop: 14 },
  proCardBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center" },
  proCardBtnText: { color: "#F7F3FA", fontWeight: "700" },
  etaClock: {
    position: "absolute", left: 12, width: 84, paddingVertical: 10, borderRadius: 18,
    alignItems: "center", backgroundColor: "rgba(23,18,31,0.88)",
    borderWidth: 1, borderColor: "rgba(255,107,74,0.55)",
  },
  etaClockMin: { color: "#FFFFFF", fontSize: scale.title, fontWeight: "800", lineHeight: 34 },
  etaClockUnit: { color: "rgba(247,243,250,0.8)", fontSize: scale.micro, marginTop: -2 },
  etaClockKm: { color: "#FF9A6B", fontSize: scale.meta, fontWeight: "700", marginTop: 6 },
  etaClockHint: { color: "rgba(247,243,250,0.7)", fontSize: scale.micro, marginTop: 6 },
  statusPill: {
    position: "absolute",
    top: spacing.lg,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    minHeight: 34,
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: "rgba(16,12,22,0.82)",
  },
  statusText: { ...type.captionStrong, fontSize: scale.meta, color: "#FFFFFF", writingDirection: "rtl" },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: spacing.xl,
    backgroundColor: depth.panel.low,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // Elevation only — a surface is raised or outlined, never both (§5).
    shadowColor: palette.ink900,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },

  progress: {
    ...type.body,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },
  confirmBlock: { marginTop: spacing.lg, gap: spacing.sm },
  holdNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },
  confirmBtn: {
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.action,
  },
  confirmLabel: { ...type.bodyStrong, color: colors.onAction },
  confirmQuiet: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  confirmQuietLabel: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },

  service: {
    ...type.meta,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },

  proRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  proText: { flex: 1, alignItems: "flex-end", gap: 2 },
  proName: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  proMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 4, flexWrap: "wrap" },
  proMetaStrong: { ...type.caption, ...tabular, color: colors.textPrimary, fontWeight: "700" },
  proMetaDim: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  verified: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11,124,100,0.1)",
  },

  actions: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.lg },
  act: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: depth.panel.high,
  },
  actText: { ...type.captionStrong, fontSize: scale.meta, color: colors.textPrimary },

  price: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.lg,
  },
  masked: {
    ...type.caption,
    fontSize: scale.micro,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 4,
  },
});
