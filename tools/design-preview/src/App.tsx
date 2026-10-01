import { recognisePhoto, understandText } from "./recognise";
import { isDaytime } from "./daylight";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { CARD_REST, customerCategoryById, categoryForDepartment, liveAreaLineHe, DEMO_WORLD, WORLD_DISTRICTS, type DepartmentCode, type CandidatePresence, type LivingMapPhase, type LivingMapState, themeForDepartment,
  ROAD_PLATE_ASSET_ID,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_HE,
  supportEmailUrl,
  supportHoursHe,
  whatsappUrl,
} from "@pro-now/demo-types";
import {
  discover,
  emptyDiscoveries,
  GROUND_GRASS_ID,
  GROUND_MATERIAL_IDS,
  type DiscoveryState,
  type WorldGeo,
} from "@pro-now/demo-types";
import { AVATARS, avatarById, formatMoney, greetingAt, money, screenKey, travelAssetFor, VISIT_ORDER, withAfterHours, type AvatarChoice, type PriceListItem } from "@pro-now/demo-types";
import { matchServicesByText } from "@pro-now/demo-ui";
import { canSaveSession, clearSession, loadSession, saveSession, savedAgoHe } from "./session";
import { HAIR_DISCOVERY_IDS } from "@pro-now/demo-ui";

import type { WorldAssetSources } from "@pro-now/demo-ui";
import { worldSources } from "./worldSources";
import { City, CITY_SHOP_DEPARTMENTS } from "./city/City";
import CITY_PHONE_FILES from "./city/phoneFiles.json";

import { PREVIEW_SPONSORS } from "./sponsors";

/**
 * WHAT THE PROFESSIONAL'S APP ACTUALLY CARRIES.
 *
 * One file. The customer's journey happens inside the world — choosing a
 * character, walking the street, arriving at a shop — so their app ships
 * the whole pack, about eight megabytes. The professional's shift screen
 * wants somewhere to BE, not a cast, so it ships the plate and nothing
 * else: `DistrictLayer` draws nothing for a district whose art is
 * missing and `WorldLife` skips a moment whose asset is absent, which
 * makes a pack of one file a complete and correct world.
 *
 * The gallery is given exactly that rather than its own richer pack. A
 * gallery that shows a better screen than the product is the two-worlds
 * problem that cost a whole night once already.
 */
/*
 * THE PROFESSIONAL'S APP CARRIES THE GROUND AND NOTHING ELSE.
 *
 * It has no shopfronts and no avatars — the city is a band at the top of
 * the shift screen, not a place anybody walks. What it does need is every
 * layer of the GROUND, and the material tiles were missed when they were
 * added: the plate arrived and the stone and the grass did not, so the
 * real street corridor had no pavement in it on that side only.
 */
const proWorldSources: WorldAssetSources = Object.fromEntries(
  [ROAD_PLATE_ASSET_ID, GROUND_GRASS_ID, ...GROUND_MATERIAL_IDS]
    .filter((id) => worldSources[id])
    .map((id) => [id, worldSources[id]!])
);

import fixtureGeo from "../geo/fixture_grid.json";

import { ProOnboardingBody, type OnboardingResult, type OnboardingService } from "@pro-now/demo-ui";
import { ActiveJobCapsule, OrdersDock, AddressPickerBody, AppHeader, AppMenuBody, AvatarPickerBody, IntroBody, customerDarkTheme, FocusSheet, ScreenTransition, ArrivalVerifyBody, OnSiteBody, CallsListBody, CAPSULE_HEIGHT, ChatBody, ConnectionBanner, CategoryBody, CustomerHomeBody, CustomerProfileBody, customerTheme, DescribeFaultBody, JobClosedBody, JobCompleteBody, MatchConfirmBody, NavGlyph, Persona, PhoneAuthBody, ProEarningsBody, ProJobBody, ProJobSettledBody, ProOfferBody, ProOnlineBody, ProPricingBody, ProProfileBody, ProQuoteBuilderBody, ProServicesBody, ProShiftBody, proTheme, ProVerificationBody, ProVerificationStepBody, QuoteApprovalBody, radii, scale, SearchingBody, ServiceDetailBody, SponsorShopBody, AdvertiseBody, StrollBody, Sheet, spacing, tint, TrackingBody, type as t, WelcomeBody } from "@pro-now/demo-ui";
import type { JobMediaItem, LiveLocationState, MarkName, NavGlyphName, ProPricingRow } from "@pro-now/demo-ui";
import type { AuthStage, ChatMessage, ConnectionState } from "@pro-now/demo-ui";
import { onboardingDocsFor, canHandOffToMaps, categoryAsksForPerson, mapsHandoffUrl, buildIntakeBrief, pilotIntakeByService, pilotServiceById, pricingKindOf, readAvailability, visitTermsHe, APPROVAL_STEPS_HE } from "@pro-now/demo-types";
import type { IntakeAnswer, IntakeBriefLine, MapsPlatform, OfferCardView, PriceModel } from "@pro-now/demo-types";
import type { JobState, ProPresenceState } from "@pro-now/demo-types";

import { IdentityCheck } from "./IdentityCheck";
import type { DockOrder, QuoteMedia, SavedAddress } from "@pro-now/demo-ui";
import { goBack, installBackGesture, openOverlay, pushBackEntry, readScroll, restoreScroll, setBackHandler } from "./backGesture";
import { matchFixture, offerFixture } from "./fixtures";
import {
  catalogHomeServices,
  demoOpenServiceIds,
  catalogHiddenServices,
  catalogMatchRules,
  priceListFor,
  quoteLinesFor,
  deliveryFare,
  PREVIEW_DELIVERY_KM,
  lowestListed,
  catalogServicePages,
  departmentCodeByMark,
  departmentCodeByServiceId,
  categoryNameByServiceId,
  eligibilityFor,
  isPersonFit,
  matchReasons,
  demoCandidatesFor,
  personFitCandidates,
  photoPromptFor,
  pricingRowsFor,
  togglesFor,
} from "@pro-now/demo-ui";
import { useCapture } from "./useCapture";
import {
  availabilitySnapshot,
  callsList,
  chatSeed,
  customerOpenCall,
  customerQuickReplies,
  earningDays,
  earningJobs,
  proQuickReplies,
  verificationSteps,
  jobDescription,
  jobMedia,
  jobSymptoms,
  profileReviews,
  profileServices,
  profileWorkPhotos,
  quoteFixture,
  receiptLines,
  priceContextFixture,
} from "./screenFixtures";

/**
 * PRO NOW — the playable prototype.
 *
 * This is not the component gallery. The gallery answers "is each screen
 * well made"; this answers the only question that matters before build:
 * **does using it feel like one product?** So it navigates for real — taps
 * go somewhere, back goes back, and the two sides of the marketplace are a
 * switch away from each other.
 *
 * What it is NOT, and must never be mistaken for:
 *
 * - There is no server. Every number is a fixture, and the banner says so on
 *   first open. A prototype that quietly looks live is how a demo becomes a
 *   promise nobody agreed to (/CLAUDE.md §3, and the reason `dev` fixtures
 *   are labelled rather than hidden).
 * - The availability snapshot is a real `AreaAvailabilityView` read through
 *   the real `readAvailability`, so the freshness and UNKNOWN rules behave
 *   here exactly as they will in production — including going quiet.
 *
 * The state machine below mirrors /docs/07-JOB-STATE-MACHINE.md's happy path
 * closely enough to be worth arguing with, which is the point of a
 * prototype.
 */

/** "14:22" in the device's own locale-free form. */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * THE REQUEST THE CUSTOMER ACTUALLY MADE — carried across to the other side.
 *
 * Until now the two halves of the prototype were sealed off from each other:
 * the customer described a leak, and the professional then received a
 * hard-coded fixture about a different leak. Every individual screen was
 * right and the product it described did not exist, because the one thing a
 * marketplace IS — a thing someone said arriving at someone who can answer
 * it — was the part being faked.
 *
 * Now what the customer types, taps, records and photographs becomes the
 * offer card on the professional's phone. Switch sides and you are reading
 * your own words back. That is also the only honest way to review the
 * intake: three taps on the customer's screen either turn into something a
 * professional can act on, or they do not, and no amount of fixture writing
 * will tell you which.
 */
export interface LiveRequest {
  serviceId: string;
  serviceNameHe: string;
  serviceCode: string;
  markName: string;
  priceModel: PriceModel;
  intakeBrief: IntakeBriefLine[];
  /** What was ordered from the price list (catalogue example amounts). */
  items?: Array<{ id: string; nameHe: string; amountMinorUnits: number }>;
  /** Priced by the professional before he sets off; and where to, for a trip. */
  quoteFirst?: boolean;
  destinationHe?: string | null;
  /** Set when the call is for someone else, who is the one at the door. */
  onSiteNameHe?: string | null;
  /** The address as saved: "רמת גן · קומה 1, דירה 4". */
  addressHe?: string | null;
  textHe: string;
  photos: number;
  voiceSeconds: number | null;
  areaLabelHe: string;
  typicalMinutes?: [number, number] | null;
  createdAtMs: number;
  /** "קריאה לדוגמה" — no customer is on the other side. */
  sample?: boolean;
}

type CustomerTab = "home" | "calls" | "card" | "menu";
type ProTab = "shift" | "earnings" | "verify" | "profile";
type Side = "customer" | "pro";
/** Before either side's app: the landing page and the sign-in. */
type Gate =
  | { name: "welcome" }
  | { name: "auth"; side: Side }
  /**
   * WHERE ARE WE, AND WHY AM I BEING ASKED THIS.
   *
   * Three slides between signing in and the app, before the avatar rather
   * than after it — because the avatar only makes sense once somebody
   * knows there is a street to walk down. Amit: *"איפה מסך ראשון הסבר על
   * האפליקציה לפני האווטאר? איך הוא יבין למה הוא נכנס?"*
   *
   * Both sides see it, with their own three: the customer's questions
   * from the pavement, the professional's from behind the counter.
   * Skipping is an answer and is recorded as one, exactly like the
   * avatar's — see `introSeen`.
   */
  | { name: "intro"; side: Side }
  /** A new professional joining — see ProOnboardingBody (Amit, 2026-09-29). */
  | { name: "onboard"; initial?: OnboardingResult | null; startStep?: number; approved?: boolean; from?: "welcome" | "menu" | "sent" | "shopOpen" | "pro" }
  /** Sent for approval: work arrives only after PRO NOW approves. */
  | { name: "onboardSent"; result: OnboardingResult }
  /** Approved (demo): the shop opens. */
  | { name: "shopOpen"; result: OnboardingResult }
  /**
   * WHO WALKS DOWN THE STREET.
   *
   * Sits between signing in and the app, and only for a customer who has
   * not answered it before. Amit: *"בבניית פרופיל לקוח יבנה את האווטאר
   * שלו... פשוט ממש, שלוקח 20 שניות עד דקה, שלא ידלגו — לא חובה."*
   *
   * "Not mandatory" is why the ANSWER is recorded rather than the choice:
   * somebody who skipped has answered, and must not be asked again every
   * time they open the app. That is the difference between optional and
   * nagging.
   */
  | { name: "avatar" };

type CustomerRoute =
  | { name: "home" }
  | { name: "address" }
  /**
   * A CATEGORY IS A DESTINATION, NOT A REDIRECT.
   *
   * Tapping "לבית" used to open the first service behind it, so the app
   * announced that the customer had a blocked drain before they said
   * anything. Amit: *"למה אני לוחץ על בית ומכניס אותי ישר לאינסטלטור?"*
   * Now it goes somewhere: that trade's street, and the short question.
   */
  /**
   * THE STREET, AS ITS OWN PLACE.
   *
   * Amit: *"עכשיו לראות איך הוא במפה זז — אני לא רואה ולא מבין."* Walking
   * was built and then hidden inside the dispatch wait, reachable only by
   * somebody who had already sent a real request for help. It has a door
   * on the home screen now. See `StrollBody`.
   */
  | { name: "stroll" }
  /*
   * THE SAME STREET, WITH A CAMERA IN IT.
   *
   * A full-bleed WebGL scene rather than a react-native-web tree, so it
   * is returned above the app's own chrome rather than as a body. It
   * lives in the preview and not in `packages/ui` for the reason given
   * on `StrollBody.onEnterCity`: react-native cannot host WebGL without
   * `expo-gl`, and pretending otherwise by shipping it from the shared
   * package would put a component in there that only one of the three
   * consumers can render.
   */
  | { name: "city"; enterShopId?: string; from?: "assigned" | "enroute" | "stroll" }
  | { name: "category"; categoryId: string }
  | { name: "service"; serviceId: string }
  | { name: "describe"; serviceId: string; symptomsHe: string[] }
  | { name: "chat" }
  /**
   * ONE ROUTE FOR FOUR PHASES. Searching, found, reveal and route are the
   * same mounted Living Map scene changing shape — not four destinations.
   * Amit's note was that the transitions between cards made no sense, and
   * four routes would have kept producing four hard cuts however well each
   * one was drawn.
   */
  | { name: "living"; serviceId: string; phase: LivingMapPhase }
  /** PERSON_FIT only: the system proposes, the customer confirms. */
  | { name: "matchconfirm"; serviceId: string; index: number }
  /*
   * THE VISIT HAS MORE THAN ONE MOMENT IN IT.
   *
   * There were three stages and the last of them, "arrived", stood for
   * everything from the knock to the final handshake. So approving a
   * price returned to the same screen it was opened from, whose only way
   * forward was "המקצוען שלח הצעת מחיר" — the quote again. Amit:
   * *"אחרי אישור הצעת מחיר זה מחזיר אותי לפה. למה אני חוזר לאותו עמוד?
   * איפה עמוד סיכום עבודה? איך נגמרת עבודה בין לקוח למקצוען?"*
   *
   * "diagnosis" is the stretch between the knock and the price, "working"
   * is after it was approved, and "done" is the professional saying he
   * has finished and waiting for the customer to agree. Each one has its
   * own sentence on the screen (`jobProgressHe`) and its own next step,
   * so the visit ends somewhere instead of circling.
   */
  | { name: "tracking"; stage: "assigned" | "enroute" | "arrived" | "diagnosis" | "working" | "done" }
  | { name: "onsite"; stage: "assigned" | "enroute" | "arrived" | "diagnosis" | "working" | "done" }
  /** The minute before the knock. See ArrivalVerifyBody. */
  | { name: "arrival" }
  | { name: "quote" }
  | { name: "complete" }
  /*
   * THE LAST SCREEN OF A JOB.
   *
   * Amit: *"חייב עוד מסך כלשהו אחרי המסך של החשבונית לפני שחוזרים
   * לתפריט."* Sending a review went straight to `home` — a stranger came
   * to your flat, did work, took money, you rated them, and the app put
   * you back at a grid of categories as though none of it had happened.
   * The professional has had `ProJobSettledBody` closing the same job for
   * months.
   */
  | { name: "closed"; ratingGiven: number | null }
  /*
   * INSIDE A SHOP THAT PAID TO BE IN THE STREET.
   *
   * Amit: *"לקוח בזמן ההמתנה למקצוען יכול להיכנס לחנויות ואז ייפתח
   * האתר של המותג."* `from` is the waiting stage it was entered from,
   * so closing the shop puts the customer back where they were rather
   * than at the top of the job.
   */
  /*
   * `from` is WHERE YOU WERE, not a stage of the job.
   *
   * It was `"assigned" | "enroute"` — the two tracking stages — so
   * entering Lust from the STREET and pressing back put you on the
   * tracking screen, which is not where you were and not a place you
   * asked to be. A shop is somewhere you step into from somewhere, and
   * leaving it returns you there.
   */
  | { name: "sponsor"; shopId: string; from: "assigned" | "enroute" | "stroll" }
  /** The page for a business owner who wants a shop of their own. */
  | { name: "advertise"; fromWelcome?: true };

/**
 * DEEP LINK TO ONE LIVING MAP PHASE — `?phase=SEARCHING`, `CANDIDATES_FOUND`,
 * `MATCH_REVEAL`, `ASSIGNED_ROUTE`, with an optional `&service=svc-leak`.
 *
 * The four phases are one scene that advances itself on a timer, which is
 * correct for a person using the app and useless for anyone reviewing it:
 * the found state is on screen for two seconds, so capturing it means
 * racing a clock. This pins the scene to a single phase and stops the
 * timer, so a review, a screenshot or the audit walker can look at one
 * phase for as long as it needs to. It is inert unless the parameter is
 * present, and the preview app is developer-only.
 */
const PHASES: readonly LivingMapPhase[] = [
  "SEARCHING",
  "CANDIDATES_FOUND",
  "MATCH_REVEAL",
  "ASSIGNED_ROUTE",
];
const PINNED: { phase: LivingMapPhase; serviceId: string } | null = (() => {
  const q = new URLSearchParams(window.location.search);
  const raw = q.get("phase");
  if (!raw) return null;
  const phase = PHASES.find((p) => p === raw.toUpperCase());
  if (!phase) return null;
  return { phase, serviceId: q.get("service") ?? "svc-leak" };
})();

/**
 * TEMPORARY — REVIEW CYCLE. Remove once the Living Map screenshots are taken.
 *
 * The artifact host does not forward a query string into the preview frame,
 * so `?phase=` works locally and not there. This walks the four phases on a
 * slow loop from boot so each one can be captured from the published
 * artifact without touching the app.
 */
const REVIEW_CYCLE = false;
const REVIEW_PHASE_MS = 9000;

/**
 * Every service page, derived from the catalogue.
 *
 * This used to be a two-entry map with `?? serviceDetailLeak` behind it,
 * which meant tapping "מזגן" opened a page headed "תיקון נזילה" — the app
 * confidently answering a question nobody asked. A catalogue that knows
 * every service can also produce a page for every service, so the fallback
 * is gone along with the bug.
 */
const SERVICE_PAGES: typeof catalogServicePages = Object.fromEntries(
  Object.entries(catalogServicePages).map(([id, page]) => [
    id,
    /* A demonstration opens everything — see `demoOpenServiceIds`. */
    demoOpenServiceIds.has(id) ? { ...page, comingSoon: false, scheduledOnly: false } : page,
  ])
);
/*
 * A SAMPLE CALL IN THE PROFESSIONAL'S OWN TRADE.
 *
 * Amit, joined as a vet: *"כל המלל פה לא קשור למקצוען שבניתי."* The demo
 * call ("שלח אליי עכשיו קריאה לדוגמה") was always the plumbing leak. For a
 * professional who joined, it is his first service, at the demo's own
 * sample address, with nothing the customer did not say.
 */
function sampleRequestFor(serviceId: string, cityHe?: string | null): LiveRequest {
  const city = cityHe?.trim() || null;
  const page = SERVICE_PAGES[serviceId]!;
  const def = pilotServiceById[serviceId];
  return {
    serviceId,
    serviceNameHe: page.nameHe,
    serviceCode: def?.code ?? serviceId,
    markName: page.mark,
    priceModel: page.price.priceModel,
    intakeBrief: [],
    items: page.price.priceModel === "FIXED" ? priceListFor(serviceId).slice(0, 1) : undefined,
    quoteFirst: Boolean(def?.quoteBeforeDispatch),
    destinationHe: def?.needsDestination ? "רמת גן" : null,
    addressHe: city ? `רחוב הרצל 12, ${city} · קומה 3, דירה 9 · קוד לבניין 1408` : "רחוב הברזל 12, רמת אביב, תל אביב · קומה 3, דירה 9 · קוד לבניין 1408",
    textHe: "",
    photos: 0,
    voiceSeconds: null,
    areaLabelHe: city ?? "רמת אביב, תל אביב",
    typicalMinutes: def?.typicalMinutes ?? null,
    createdAtMs: Date.now(),
    sample: true,
  };
}
/* The same opening for the lists the service pages are reached from. */
/**
 * The code the professional says at the door. In production it comes from
 * the server with the assignment — a code a client can derive is a code an
 * impostor's client can derive — so the preview carries one fixed code and
 * shows the same one on all three screens that need it.
 */
const DOOR_CODE = "4821";

const HOME_SERVICES = [...catalogHomeServices, ...catalogHiddenServices].map((s2) =>
  demoOpenServiceIds.has(s2.id) ? { ...s2, comingSoon: false, scheduledOnly: false, notInMarket: false } : s2
);

/** A sentence the keywords missed, read for meaning (see recognise.ts). */
const understandHome = (text: string) =>
  understandText(text, HOME_SERVICES.map((x) => ({ id: x.id, nameHe: x.nameHe })));

/**
 * What the professional in this prototype has actually had verified.
 * Everything on the pro side — which services toggle on, what the
 * verification screen lists as blocked — is computed from this one array, so
 * the two screens cannot disagree about the same person.
 */
const DEMO_VERIFIED = ["IDENTITY", "BUSINESS", "LIABILITY_INSURANCE"] as const;
const proEligibility = eligibilityFor([...DEMO_VERIFIED]);
const DEFAULT_PRO_SERVICES = togglesFor([...DEMO_VERIFIED]);

/**
 * The prototype has no server, so it re-stamps its fixture snapshot on a
 * timer — the same thing a real poll does. That keeps the freshness rule
 * running for real rather than disabling it: the counts are live because
 * something keeps refreshing them, and if this timer stopped, the screen
 * would go quiet exactly as production would.
 */
function useLiveSnapshot() {
  const [stampedAt, setStampedAt] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setStampedAt(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return useMemo(
    () => ({ ...availabilitySnapshot, computedAt: new Date(stampedAt).toISOString() }),
    [stampedAt]
  );
}

/**
 * The connection state, from the browser rather than from a toggle.
 *
 * `navigator.onLine` is genuinely wired here: switching the phone to
 * aeroplane mode changes the banner. When the connection returns the app
 * spends a moment in `reconnecting` before declaring itself online, because
 * "the radio is back" and "we have fresh data" are different facts and
 * collapsing them is how a stale ETA gets presented as current.
 */
function useConnection(): [ConnectionState, () => void] {
  const [state, setState] = useState<ConnectionState>(() =>
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOffline = () => setState("offline");
    const goOnline = () => {
      setState("reconnecting");
      setTimeout(() => setState("online"), 1400);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const retry = useCallback(() => {
    setState("reconnecting");
    setTimeout(
      () => setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online"),
      1200
    );
  }, []);

  return [state, retry];
}

export function App() {
  const { width, height } = useWindowDimensions();
  // The prototype fills whatever it is given: a phone at home-screen size,
  // or a centred phone-shaped frame on a laptop.
  const w = Math.min(430, width);
  const h = height;

  // A pinned phase (`?phase=`) is a request to look at one screen. Sending
  // the reviewer through welcome and sign-in first would defeat that.
  const [gate, setGate] = useState<Gate | null>(PINNED || REVIEW_CYCLE ? null : { name: "welcome" });
  /*
   * The last review session, so a reload comes back to the side you were
   * on with what you typed still there. Only inputs are restored — see
   * `session.ts` for why a live job never is.
   */
  const restored = useMemo(() => loadSession(), []);
  const [side, setSide] = useState<Side>(restored?.side ?? "customer");
  useEffect(() => {
    saveSession({ side });
  }, [side]);

  /*
   * ONE LISTENER, IN THE ONE COMPONENT THAT IS ALWAYS MOUNTED.
   *
   * It used to live inside `CustomerApp`, which is unmounted the moment
   * you switch to the professional side — so the phone's back button went
   * from "go back one screen" to "leave the prototype" at exactly the
   * point Amit was reviewing the professional flow. See `backGesture.ts`.
   */
  useEffect(() => installBackGesture(), []);

  /*
   * THE PHONE'S BACK, BEFORE EITHER APP (Amit: "החזור לא מחזיר אותי אחורה").
   *
   * During sign-in, the explanation and the join, the gesture used to leave
   * the demo altogether. Now it does what the screen's own back does: a
   * join step goes to the previous step (or back to the summary when
   * editing), an edit returns to where it was opened, and the rest return
   * to the welcome. A fresh entry is kept in history so the next back stays
   * inside too.
   */
  useEffect(() => {
    if (!gate || gate.name === "welcome") return;
    pushBackEntry();
    return setBackHandler(() => {
      if (gate.name === "onboard") onboardBack.current?.();
      /* The picker opened from inside the app closes back into it, keeping the figure. */
      else if (gate.name === "avatar" && avatarFromApp.current) { avatarFromApp.current = false; pickingForStroll.current = false; setGate(null); }
      else if (gate.name !== "onboardSent" && gate.name !== "shopOpen") setGate({ name: "welcome" });
      pushBackEntry();
      return true;
    });
  }, [gate]);

  /**
   * Switching sides is a navigation and is recorded as one.
   *
   * Back from the first professional screen returns to the customer side
   * rather than out of the page — which is what the gesture means when
   * the thing you did to get here was press a button on screen.
   */
  const switchTo = useCallback((s: Side) => {
    backSide.current = sideRef.current;
    setSide(s);
    pushBackEntry();
  }, []);
  const sideRef = useRef<Side>(restored?.side ?? "customer");
  const backSide = useRef<Side | null>(null);
  useEffect(() => {
    sideRef.current = side;
  }, [side]);

  /**
   * What happens when a side has run out of screens to go back through.
   *
   * If the customer pressed "מקצוען" to get here, back returns them; if
   * they opened the prototype on this side, there is genuinely nothing
   * behind and the page is allowed to close. Returning `false` is that
   * second answer, and it is deliberate: a web page you cannot back out
   * of is a worse bug than the one this fixes.
   */
  const backOut = useCallback(() => {
    const previous = backSide.current;
    if (previous === null) return false;
    backSide.current = null;
    setSide(previous);
    return true;
  }, []);

  /**
   * The avatar, and whether the question has been answered at all.
   *
   * Two values rather than one, because `null` is ambiguous on its own: it
   * is both "has not been asked" and "was asked and said no". Only the
   * second may skip the screen.
   */
  const [avatar, setAvatar] = useState<AvatarChoice>(restored?.avatar ?? null);
  const avatarAnswered = useRef(restored?.avatarAnswered ?? false);
  /*
   * Seen once, never again — the same rule as the avatar's answer. An
   * explanation that reappears every morning is not an explanation, it is
   * an obstacle.
   */
  /* `introSeenV2`: the explainer was rewritten on 2026-09-25, so anybody
     who saw the old one is shown the new one once. */
  /* Per side: the customer's explanation and the professional's are different screens. */
  const introSeenBy = useRef<Record<Side, boolean>>({
    customer: restored?.introSeenSides?.includes("customer") ?? restored?.introSeenV2 ?? false,
    pro: restored?.introSeenSides?.includes("pro") ?? false,
  });
  /** Whether this device's professional has been through joining (the demo). */
  const proOnboarded = useRef(restored?.proOnboarded ?? false);
  /** Phone numbers that have finished signing up, per side (demo: kept on this device). */
  const registered = useRef<Record<string, { customer?: boolean; pro?: boolean }>>(restored?.registered ?? {});
  const lastPhone = useRef<string | null>(null);
  /**
   * Whether any avatar art has actually arrived.
   *
   * The whole screen is gated on this. See the comment at the call site
   * for why an empty picker is worse than no picker at all.
   */
  /*
   * ---------------------------------------------------------------------
   * WALKING WITH BORROWED FACES — AND WHY THIS NOW STARTS ON
   * ---------------------------------------------------------------------
   * The picker and the walk are both finished and both invisible until
   * the twenty-four avatar files land, because nothing in this product
   * draws a figure it does not have. That is right in the app. This lets
   * the GALLERY borrow the professional figures that have arrived, and it
   * is deliberately wrong in the way that matters most — they face the
   * camera and a real avatar is seen from behind — so nobody can mistake
   * it for the finished thing. See `standInAvatars.ts`.
   *
   * IT WAS OFF BY DEFAULT, AND THAT WAS THE WHOLE PROBLEM. Amit:
   * *"כל המשחקיות לא טובה, משחקיות."*
   *
   * Measured rather than guessed. Holding an arrow on the route screen
   * moves the world 111px to the east and nothing at all north, south or
   * west — the camera starts clamped against the bottom of the plate, so
   * most of a walk is invisible even when the figure IS moving. And there
   * was no figure: the only avatar image on the page was the PORTRAIT in
   * the header. So the game he was asked to judge was holding an arrow
   * and watching a street slide, with nobody on it.
   *
   * `standInAvatars.ts` names three things that keep this from becoming
   * the thing it stands in for: it is off by default, it is labelled, and
   * the figures face the wrong way on purpose. Two of the three are
   * untouched. The first one was costing the only person who reviews this
   * the one feature he keeps asking about — *"רוצה חוויה של טיול ברחוב…
   * שירגישו כמו VR"* — and a safeguard whose whole effect is that the
   * reviewer never sees the feature is protecting nobody.
   *
   * The control is still there, still says "הדגמה", and still turns it
   * off. This is the developer gallery, which /CLAUDE.md §8 is explicit
   * is not a shipping target; the apps have no such flag and still draw
   * nothing until the art lands.
   */
  /*
   * ---------------------------------------------------------------------
   * AND IT IS OFF AGAIN, BECAUSE THE REASON IT WAS ON HAS GONE
   * ---------------------------------------------------------------------
   * Amit, walking the street with an avatar he had just chosen: *"במשחק
   * זה הבעל מקצוע ולא האווטאר שבחרתי."*
   *
   * He is right, and the note above explains exactly how it happened:
   * this was turned on because with it off there was NOBODY on the
   * street at all — the twelve `avatar_NN_world_back` files have never
   * been drawn, so the walker had nothing to render and rendered
   * nothing. Borrowing a trade figure was better than an empty street.
   *
   * That is no longer the choice. `walkingFallbackFor` draws the chosen
   * avatar's PORTRAIT on a pin — a convention everybody reads as "you
   * are here", claiming nothing about a figure that has not been drawn —
   * so with the stand-in off the person walking the street is now HIS
   * FACE rather than nobody. Between somebody else's body and your own
   * face on a marker, the marker is the one that is true.
   *
   * The borrowed body stays one tap away, still labelled "הדגמה", for
   * judging the FEEL of walking — which is what it was added to answer
   * and the one question the pin cannot.
   */
  /*
   * The borrowed figures are no longer switchable, and they were never
   * on: `standIn` started false and the control that turned it on is
   * deleted. What the street draws is the customer's own character,
   * which is the only honest answer now that there is one.
   */

  const art = worldSources;

  /**
   * THE GROUND, SWITCHABLE, SO THE TWO CAN BE COMPARED.
   *
   * Amit: *"אני רוצה לחבר מפה אמיתית שונראה איך העולם שלנו והקוד שלנו
   * יושב עליה."* The word doing the work there is *ונראה* — see. Not
   * "replace the plate with a map", but show me our city standing on a
   * real one so I can judge whether it sits.
   *
   * A switch is therefore the deliverable, not a migration. Flip it and
   * the same walker, the same trades and the same camera are on real
   * street geometry; flip it back and they are on the painting. Anything
   * that only works on one of the two grounds shows up in one tap.
   *
   * The extract shipped here is a FIXTURE — `real: false`, watermarked on
   * the artwork, and refused by `plotViolations` as a real place. Amit's
   * own neighbourhood arrives by running `fetch-geo.mjs` on a machine
   * whose network is allowed to reach OpenStreetMap; this container's is
   * not, and that is policy rather than a fault.
   */
  const [realMap, setRealMap] = useState(false);
  const geo = realMap ? (fixtureGeo as unknown as WorldGeo) : null;

  const avatarArtReady = AVATARS.some((a) => art[a.portraitAssetId]);

  /** Sides this device has already signed in on. See `session.ts`. */
  const authedSides = useRef<Set<Side>>(new Set(restored?.authedSides ?? []));
  const enter = useCallback((s: Side) => {
    if (authedSides.current.has(s)) {
      /* A professional who has not joined yet joins first — signed in or not (Amit, 2026-09-30). */
      if (s === "pro" && !proOnboarded.current) {
        setGate({ name: "onboard" });
        return;
      }
      setSide(s);
      setGate(null);
      return;
    }
    setGate({ name: "auth", side: s });
  }, []);
  /** The request in flight, shared by both sides. See `LiveRequest`. */
  const [liveRequest, setLiveRequest] = useState<LiveRequest | null>(null);
  /*
   * A PRICE NAMED BEFORE ANYBODY SETS OFF (towing, moving, painting…).
   * The professional answers the offer with it; the customer approves it
   * on the match card, and only then is he assigned (Amit, 2026-09-29).
   */
  const [preQuote, setPreQuote] = useState<{ serviceId: string; amount: number; notesHe: string } | null>(null);
  const [preQuoteApprovedAt, setPreQuoteApprovedAt] = useState<number | null>(null);
  /**
   * THE QUOTE, CROSSING BACK THE OTHER WAY.
   *
   * The professional's screen correctly refuses to offer a button at
   * WAITING_QUOTE_APPROVAL — it is the customer's move — but in the
   * prototype the two sides were sealed, so the move could never arrive and
   * the professional simply stopped. The same bug as the request, in the
   * opposite direction, and it is the one place in the whole flow where the
   * product deliberately blocks one person on another.
   */
  /*
   * THE QUOTE ITSELF CROSSES THE BRIDGE NOW, NOT JUST ITS TIMESTAMP.
   *
   * Amit: *"לפחות שהכל יהיה שקוף מול הלקוח שיופיע לו גם."* This held a
   * `sentAtMs` and nothing else, so the customer's approval screen
   * rendered a FIXTURE — lines written by nobody, for a job nobody had
   * looked at — while the professional's side pretended to have sent
   * something. The two sides were telling different stories about the
   * same quote.
   */
  /**
   * A request from the professional's side to show the customer their
   * waiting quote — see `onSeeAsCustomer`. One-shot: CustomerApp clears
   * it once it has navigated, so a later visit to that side does not
   * re-open a quote somebody already answered.
   */
  const [openQuoteOnce, setOpenQuoteOnce] = useState(false);

  /**
   * The same shape, for the door to the street: the picker was opened by
   * that door, so once a figure exists the street is where to go.
   *
   * A ref rather than state because the picker replaces the customer's
   * whole app while it is up — nothing re-renders on it, and a render
   * between the tap and the answer would be the only thing state buys.
   */
  const pickingForStroll = useRef(false);
  /* Opened from the menu or the street door rather than the first run: its back returns to the app. */
  const avatarFromApp = useRef(false);
  const [openStrollOnce, setOpenStrollOnce] = useState(false);
  const [openAdvertiseOnce, setOpenAdvertiseOnce] = useState(false);
  const [introSlide, setIntroSlide] = useState(0);
  /** The same one-shot for the other wait: "is the work finished?" */
  const [openCompletionOnce, setOpenCompletionOnce] = useState(false);

  /**
   * THE WAY BACK, AFTER THE CUSTOMER HAS ANSWERED.
   *
   * Amit, standing on the customer's screen having just approved a
   * quote: *"איך אני חוזר לצד המקצוען אחרי שאישרתי את ההצעה מצד
   * הלקוח?"* The crossing has always been in the header — but it is a
   * plain switch that is there on every screen of the app, saying
   * nothing about the fact that the ball is now back in the other
   * court. The professional's side got a labelled row for exactly this
   * moment; this is its mirror, and the loop is only closed with both.
   */
  const [returnToPro, setReturnToPro] = useState(false);

  /**
   * WHERE THE CUSTOMER WAS, ACROSS A CROSSING.
   *
   * The two sides are two apps: switching unmounts one and mounts the
   * other, so everything the customer's side held goes with it. That was
   * invisible while nobody crossed mid-job — and the moment a labelled
   * row invites you to cross and come back, it becomes "I approved a
   * quote, went to look at his screen, came back, and my job was gone".
   *
   * A ref rather than state: nothing up here should re-render because
   * the customer moved between their own screens.
   */
  const customerMemory = useRef<CustomerMemory | null>(null);
  const [proJobState, setProJobState] = useState<JobState | null>(null);
  /* "פנוי בעוד XX דקות", set on the professional's side and read on the customer's. */
  const [proAvailableAt, setProAvailableAt] = useState<number | null>(null);
  const [proName, setProName] = useState<string | null>(null);
  /* Who joined on this device, as he described himself — the pro app is his. */
  const [joinedPro, setJoinedPro] = useState<OnboardingResult | null>(() => loadSession()?.joinedPro ?? null);
  const startShiftOnEnter = useRef(false);
  /* The join's own "back", so the phone's back gesture steps through it. */
  const onboardBack = useRef<(() => boolean) | null>(null);
  /* Whether the professional who joined is on shift — the customer side finds his shop only then. */
  const [joinedOnline, setJoinedOnline] = useState(false);
  /* The professional's own prices, as he set them — what the customer is shown. */
  const [proPrices, setProPrices] = useState<{ byService: Record<string, number | null>; afterHoursPct: number | null }>({ byService: {}, afterHoursPct: null });
  /* A price agreed before he came (fixed/hourly): it is the job's total. */
  const [agreedTotal, setAgreedTotal] = useState<{ amount: number; nameHe: string } | null>(null);

  /**
   * And the professional's, for exactly the same reason and a worse
   * symptom: his side held the JOB. Crossing to the customer to answer a
   * quote destroyed the call he was on, so coming back showed an empty
   * shift — the customer had approved a job that, on the other screen,
   * had never happened.
   */
  const proMemory = useRef<ProMemory | null>(null);

  /* The last quote's total, kept past its approval (which clears
     `pendingQuote`) so the professional is paid what was approved. */
  const [quoteTotal, setQuoteTotal] = useState<number | null>(null);
  const [pendingQuote, setPendingQuote] = useState<{
    sentAtMs: number;
    draft: { lines: { id: string; description: string; quantity: number; unitPriceMinorUnits: number; kind: string }[]; notesHe: string; media?: QuoteMedia } | null;
  } | null>(null);
  const [quoteDecision, setQuoteDecision] = useState<"APPROVED" | "DECLINED" | null>(null);
  /**
   * THE CUSTOMER SAID THE WORK IS DONE.
   *
   * Amit: *"איפה המקצוען רואה את האישור עבודה?"* The professional's
   * side had nowhere for this to arrive, because nothing was waiting
   * for it — their own "סיימתי" used to settle the job by itself. It
   * crosses the same way the quote's answer does, through the shell,
   * which is this prototype's stand-in for the server.
   */
  const [completionConfirmed, setCompletionConfirmed] = useState(false);
  /**
   * THE PROFESSIONAL GAVE THE JOB BACK.
   *
   * Amit: *"אחרי שהוא רשם כן אני לוקח, הוא לא יכול להתחרט?"* He can, up
   * to the diagnosis — and the whole point is that the customer finds
   * out at once rather than by nobody arriving. So it crosses the same
   * way every other fact between the two sides does.
   */
  const [jobReleased, setJobReleased] = useState(false);
  /* Who is at home for the call that was sent — kept after the professional takes it (the request itself is cleared then). */
  const [jobOnSite, setJobOnSite] = useState<string | null>(null);
  /**
   * The prototype notice. It covers the address row while it is up, so it
   * takes itself away — a permanent overlay on the first thing a reviewer
   * wants to tap is a worse lie about the product than the one the notice is
   * there to prevent.
   */
  const [notice, setNotice] = useState(true);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(false), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const [connection, retryConnection] = useConnection();
  // Measured rather than assumed: the banner's height depends on how much
  // text the current state needs, and guessing it leaves a gap or a clip.
  const [bannerH, setBannerH] = useState(0);
  useEffect(() => {
    if (connection === "online") setBannerH(0);
  }, [connection]);

  return (
    <View style={[styles.root, { backgroundColor: side === "pro" ? proTheme.colors.bg : customerDarkTheme.colors.bg }]}>
      <View style={{ width: w, height: h, overflow: "hidden" }}>
        {/*
          * The banner sits IN the layout rather than over it. An overlay
          * would cover whichever header happened to be beneath it, and a
          * message about the data being wrong should not hide the data.
          */}
        <View onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}>
          <ConnectionBanner
            state={connection}
            colors={side === "pro" ? proTheme.colors : customerTheme.colors}
            duringLiveJob
            onRetry={retryConnection}
          />
        </View>

        {/*
          * THE DOOR ANIMATES TOO.
          *
          * The three steps before the app — the landing page, the sign-in,
          * and the app itself opening — were a hard cut, and they are the
          * first three things anybody sees. Going in slides forward; the
          * back control on the sign-in slides back, because it is a back
          * and the model works that out on its own.
          *
          * `side: "gate"` here for all three, including the app, so that
          * opening the app reads as one move into it rather than as a
          * change of product. Once inside, each app runs its own
          * transitions and this one holds still.
          */}
        {/*
          * Sized and clipped, because the transition positions its child
          * absolutely: without this it would be laid out over the
          * connection banner above rather than under it.
          */}
        <View style={{ height: h - bannerH, overflow: "hidden" }}>
        <ScreenTransition
          transitionKey={
            gate?.name === "auth"
              ? `gate:auth:${gate.side}`
              : gate?.name === "welcome"
                ? "gate:welcome"
                : gate?.name === "intro"
                  ? "gate:intro"
                  : gate?.name === "avatar"
                    ? "gate:avatar"
                    : gate?.name === "onboard"
                      ? "gate:onboard"
                      : gate?.name === "onboardSent"
                        ? "gate:onboardSent"
                        : gate?.name === "shopOpen"
                          ? "gate:shopOpen"
                          : "gate:app"
          }
          screen={{ side: "gate", name: gate?.name === "auth" ? "auth" : gate?.name === "welcome" ? "welcome" : "home" }}
        >
        {gate?.name === "welcome" ? (
          <WelcomeBody
            worldSources={art}
            /* The whole city — Amit: *"לא רוצה פתיחה של המספרה, רוצה של
               העיר כולה"* — and ours, not the old painted street. */
            /* The painted street of our shops with their neon — Amit's pick
               for the first picture, day or night. */
            background={<WelcomeScene />}
            onAdvertise={() => {
              /* A business owner is not asked to sign in to leave a lead. */
              setSide("customer");
              setGate(null);
              setOpenAdvertiseOnce(true);
            }}
            /*
             * Straight in if this device has signed in on that side before.
             * The welcome screen itself is kept — it is the screen Amit
             * reviews most and skipping it would make it unreachable
             * without a reset — but the phone number and the code are not
             * asked twice. The code screen accepts any six digits because
             * there is no server to check them against, so remembering that
             * it was passed claims nothing that was not already true.
             */
            onCustomer={() => enter("customer")}
            onProfessional={() => enter("pro")}
            width={w}
            height={h - bannerH}
          />
        ) : gate?.name === "auth" ? (
          <AuthGate
            side={gate.side}
            onDone={(phone) => {
              authedSides.current.add(gate.side);
              saveSession({ authedSides: [...authedSides.current] });
              setSide(gate.side);
              lastPhone.current = phone;
              /*
               * SOMEBODY WHO IS ALREADY REGISTERED GOES STRAIGHT IN (Amit,
               * 2026-09-30: "מקצוען שכבר נרשם… ישר ייכנס לעמוד שלו… צריך
               * לחשוב על כולם"). The same number on this side before means no
               * explanation, no character, no joining — his own page.
               */
              if (registered.current[phone]?.[gate.side]) {
                if (gate.side === "pro") proOnboarded.current = true;
                introSeenBy.current[gate.side] = true;
                setGate(null);
                return;
              }
              if (gate.side === "customer") {
                registered.current = { ...registered.current, [phone]: { ...registered.current[phone], customer: true } };
                saveSession({ registered: registered.current });
              }
              /*
               * A customer who has never been asked meets the avatar once
               * — BUT ONLY IF THERE ARE FACES TO CHOOSE BETWEEN.
               *
               * I shipped this screen with twelve empty tiles reading
               * "דמות 1", "דמות 2", and Amit's answer was the right one:
               * *"זה רחוק מחווית משתמש שמחה. איפה הדמויות? נוראי."* A
               * screen whose entire content is choosing between faces,
               * with no faces, is a form.
               *
               * It is also me breaking our own rule. Everywhere else in
               * this product missing art renders NOTHING rather than a
               * placeholder, precisely so an unfinished thing never looks
               * like a finished one. A whole screen deserves the same
               * treatment: not asking is better than asking badly, and
               * the question appears by itself the day the faces land.
               *
               * A professional never sees it either: they are not the one
               * walking down the street.
               */
              /*
               * The explanation first, then the character. In that order,
               * because "which of these twelve people are you" is a
               * strange question until somebody has been told there is a
               * city to be one of them in.
               */
              if (!introSeenBy.current[gate.side]) {
                setGate({ name: "intro", side: gate.side });
                return;
              }
              if (gate.side === "pro" && !proOnboarded.current) {
                setGate({ name: "onboard" });
                return;
              }
              const canAsk = gate.side === "customer" && !avatarAnswered.current && avatarArtReady;
              setGate(canAsk ? { name: "avatar" } : null);
            }}
            onBack={() => setGate({ name: "welcome" })}
            width={w}
            height={h - bannerH}
          />
        ) : gate?.name === "intro" ? (
          <IntroBody
            side={gate.side === "pro" ? "PRO" : "CUSTOMER"}
            /* Called, not mounted: `null` must reach IntroBody so that the
               whole-city slide falls back to its painted plate. */
            background={IntroBackdrop({ side: gate.side === "pro" ? "pro" : "customer", slide: introSlide }) ?? undefined}
            onSlide={setIntroSlide}
            sources={gate.side === "pro" ? proWorldSources : art}
            /*
             * THE REAL CITY BEHIND THE THREE SENTENCES.
             *
             * Amit: *"שהמצלמה תזוז ותתמקד בעולם שלנו ובמה שרשום — אם
             * רשום עיר שיראו את העיר, אם רשום אווטאר שיראו אווטאר."*
             *
             * Slide one says "a whole city of professionals", so the
             * camera is above the street looking down it. Slide two
             * says "pick a character and walk", so it is behind the
             * figure, close. Slide three is about a shop you can walk
             * into, so it frames a shopfront.
             *
             * The HUD is off: a joystick on a slide is a promise that
             * the picture is playable, and it is not — it is being
             * looked at. Same world, same code, no controls.
             */
            /*
             * ---------------------------------------------------------
             * THE CITY BEHIND THE INTRO: BUILT, MEASURED, NOT SWITCHED ON
             * ---------------------------------------------------------
             * Amit: *"שהמצלמה תזוז ותתמקד בעולם שלנו ובמה שרשום — אם
             * רשום עיר שיראו את העיר, אם רשום אווטאר שיראו אווטאר."*
             *
             * It works, and it looks like the thing he asked for: slide
             * one above the street, slide two behind the figure, slide
             * three on a shopfront, with the HUD off because a joystick
             * on a slide promises a picture is playable when it is not.
             *
             * It is not wired up, and the reason is measured rather
             * than felt. With it:
             *
             *     verify:a11y — 4 screens audited, 18 UNREACHABLE
             *
             * Without it:
             *
             *     verify:a11y — 21 screens audited, 0 unreachable
             *
             * The city mounts a WebGL context and fetches about thirty
             * megabytes of texture before the first sentence can be
             * read, and the page is busy enough for the rest of the
             * walk to fall apart behind it. The audit is not the
             * victim here, it is the instrument: what it is reporting
             * is that onboarding now blocks on the whole world
             * loading, which on a phone over mobile data is a dark
             * screen before anybody has done anything.
             *
             * So the painted plate — instant, and three real camera
             * moves over one place — carries the intro until the city
             * can load lazily: the shot each slide needs, when that
             * slide arrives. `background` and `onSlide` on IntroBody
             * and `shot`/`hud` on City are the whole API for it, and
             * they are already here.
             *
             *   background={<City hud={false} shot={INTRO_SHOTS[introSlide]} />}
             */
            onDone={() => {
              introSeenBy.current[gate.side] = true;
              saveSession({ introSeenV2: true, introSeenSides: (Object.keys(introSeenBy.current) as Side[]).filter((k) => introSeenBy.current[k]) });
              if (gate.side === "pro" && !proOnboarded.current) {
                setGate({ name: "onboard" });
                return;
              }
              const canAsk =
                gate.side === "customer" && !avatarAnswered.current && avatarArtReady;
              setGate(canAsk ? { name: "avatar" } : null);
            }}
            width={w}
            height={h - bannerH}
          />
        ) : gate?.name === "onboard" ? (
          <ProOnboardingBody
            services={ONBOARD_SERVICES}
            matchRules={catalogMatchRules}
            fields={ONBOARD_FIELDS}
            editing={Boolean(gate.approved)}
            shopFor={onboardShopFor}
            onPickFile={pickLocalFile}
            renderIdentity={({ nameHe, done }) => <IdentityCheck nameHe={nameHe} onPickFile={pickIdPhoto} onDone={done} />}
            renderShopPreview={(d) => (
              <FacadeWithSign
                facadeUri={onboardShopFor(d.serviceId).facadeUri}
                result={{ nameHe: "", businessHe: "", serviceIds: d.serviceId ? [d.serviceId] : [], customServicesHe: [], shopNameHe: d.shopNameHe, brandColor: d.brandColor, logoUri: d.logoUri, photoUri: null, shopSkipped: false, city: "", radiusKm: 0 }}
                px={d.heightPx}
              />
            )}
            extractColor={dominantColor}
            backgroundUri="./world/splash_city.webp"
            areaMapUri="./world/world_neighbourhood.webp"
            lineupUris={["home", "hair", "auto", "pets", "care"].map((id) => `./world/character_${id}_icon.webp`)}
            initial={gate.initial ?? null}
            startStep={gate.startStep}
            backRef={onboardBack}
            /* Back out of the join returns to wherever it was opened from —
               an edit never drops him on the welcome screen. */
            onExit={() => {
              const r = gate.initial ?? null;
              if (gate.from === "shopOpen" && r) setGate({ name: "shopOpen", result: r });
              else if (gate.from === "sent" && r) setGate({ name: "onboardSent", result: r });
              else if (gate.from === "pro" || gate.from === "menu") setGate(null);
              else setGate({ name: "welcome" });
            }}
            onDone={(r) => {
              proOnboarded.current = true;
              const ph = lastPhone.current;
              if (ph) registered.current = { ...registered.current, [ph]: { ...registered.current[ph], pro: true } };
              /* He is himself from the moment he sends — never the sample pro, even after a reload of the side. */
              setJoinedPro(r);
              saveSession({ proOnboarded: true, registered: registered.current, joinedPro: r });
              /* An edit from inside his app saves straight back to his app; designing
                 the shop after approval returns to the open shop, not to the queue. */
              if (gate.from === "pro") { setSide("pro"); setGate(null); }
              else setGate(gate.approved ? { name: "shopOpen", result: r } : { name: "onboardSent", result: r });
            }}
            width={w}
            height={h - bannerH}
          />
        ) : gate?.name === "onboardSent" ? (
          <OnboardSent
            docsGiven={(gate.result.uploadedDocIds?.length ?? 0) > 0}
            missing={missingForWork(gate.result)}
            onFinish={() => setGate({ name: "onboard", initial: gate.result, startStep: 3, from: "sent" })}
            onEnterAnyway={() => {
              setJoinedPro(gate.result);
              saveSession({ joinedPro: gate.result });
              setSide("pro");
              setGate(null);
            }}
            shopNameHe={gate.result.shopNameHe}
            color={gate.result.brandColor}
            onEdit={() => setGate({ name: "onboard", initial: gate.result, from: "sent" })}
            onApprove={() => setGate({ name: "shopOpen", result: gate.result })}
            width={w}
            height={h - bannerH}
          />
        ) : gate?.name === "shopOpen" ? (
          <ShopOpen
            result={gate.result}
            facadeUri={onboardShopFor(gate.result.serviceIds[0] ?? null).facadeUri}
            onDesign={gate.result.shopSkipped ? () => setGate({ name: "onboard", initial: gate.result, startStep: 5, approved: true, from: "shopOpen" }) : undefined}
            onEdit={() => setGate({ name: "onboard", initial: gate.result, startStep: 7, approved: true, from: "shopOpen" })}
            onStart={() => {
              /* "להתחיל משמרת" starts the shift — it used to land offline. */
              startShiftOnEnter.current = true;
              setJoinedPro(gate.result);
              saveSession({ joinedPro: gate.result });
              setSide("pro");
              setGate(null);
            }}
            width={w}
            height={h - bannerH}
          />
        ) : gate?.name === "avatar" ? (
          <AvatarPickerBody
            value={avatar}
            sources={art}
            onBack={
              avatarFromApp.current
                ? () => {
                    if (!goBack()) {
                      avatarFromApp.current = false;
                      pickingForStroll.current = false;
                      setGate(null);
                    }
                  }
                : undefined
            }
            onChoose={(id) => {
              setAvatar(id);
              avatarAnswered.current = true;
              avatarFromApp.current = false;
              saveSession({ avatar: id, avatarAnswered: true });
              setGate(null);
              /*
               * If the picker was opened BY the door to the street, the
               * door finishes what it started. Without this the person
               * taps an invitation, answers a question, and lands on the
               * home screen — which is the picker's own behaviour
               * leaking out as "I pressed something and it went
               * somewhere else".
               */
              if (pickingForStroll.current) setOpenStrollOnce(true);
              pickingForStroll.current = false;
            }}
            /*
             * Skipping is an ANSWER, recorded as one. Treating it as a
             * deferral means asking again tomorrow, which is what makes an
             * optional step feel compulsory.
             */
            onSkip={avatarFromApp.current && avatar ? undefined : () => {
              avatarFromApp.current = false;
              setAvatar(null);
              avatarAnswered.current = true;
              saveSession({ avatar: null, avatarAnswered: true });
              setGate(null);
              // Skipped, so there is still nobody to walk: no street.
              pickingForStroll.current = false;
            }}
            width={w}
            height={h - bannerH}
          />
        ) : side === "customer" ? (
          <CustomerApp
            ownPro={joinedPro && joinedOnline ? joinedPro : null}
            width={w}
            height={h - bannerH}
            onSwitch={() => switchTo("pro")}
            onStartOnboarding={() => setGate({ name: "onboard", from: "menu" })}
            onSignOut={() => {
              /* Signing out forgets where the customer was (it used to reopen on the menu). */
              customerMemory.current = null;
              authedSides.current.clear();
              saveSession({ authedSides: [] });
              setGate({ name: "welcome" });
            }}
            onBackOut={backOut}
            onSendRequest={(r) => {
              setLiveRequest(r);
              setJobOnSite(r.onSiteNameHe ?? null);
              setPreQuote(null);
              setPreQuoteApprovedAt(null);
            }}
            preQuote={preQuote}
            onApprovePreQuote={(amount) => {
              setPreQuoteApprovedAt(Date.now());
              setQuoteTotal(amount);
              setAgreedTotal({ amount, nameHe: "לפי ההצעה שאישרתם" });
            }}
            pendingQuote={pendingQuote}
            openQuoteOnce={openQuoteOnce}
            onQuoteOpened={() => setOpenQuoteOnce(false)}
            openCompletionOnce={openCompletionOnce}
            onCompletionOpened={() => setOpenCompletionOnce(false)}
            jobReleased={jobReleased}
            onReleaseSeen={() => setJobReleased(false)}
            /*
             * REOPENING THE PICKER, WHICH ONLY THE SHELL CAN DO.
             *
             * Skipping the avatar is a real answer and it is the one most
             * people give — so the door to the street, which needs a
             * figure to walk, disappeared for most people. It stays now
             * and picks a figure on the way; this is the only way back
             * into the picker, because the picker is a gate over the whole
             * app rather than a screen inside it.
             *
             * Undefined while the portraits have not arrived: a picker
             * with nothing in it is worse than no door.
             */
            onPickAvatar={
              avatarArtReady
                ? () => {
                    pickingForStroll.current = true;
                    avatarFromApp.current = true;
                    setGate({ name: "avatar" });
                  }
                : undefined
            }
            /* "הדמות שלי" in the menu: change the figure and come back to the menu, not into the street. */
            liveOnSiteNameHe={jobOnSite}
            onBackToWelcome={() => {
              customerMemory.current = null;
              setGate({ name: "welcome" });
            }}
            onChangeAvatar={
              avatarArtReady
                ? () => {
                    pickingForStroll.current = false;
                    avatarFromApp.current = true;
                    setGate({ name: "avatar" });
                  }
                : undefined
            }
            openStrollOnce={openStrollOnce}
            onStrollOpened={() => setOpenStrollOnce(false)}
            openAdvertiseOnce={openAdvertiseOnce}
            onAdvertiseOpened={() => setOpenAdvertiseOnce(false)}
            memory={customerMemory}
            proJobState={proJobState}
            proAvailableAtMs={proAvailableAt}
            onProName={setProName}
            acceptedProName={proName}
            proPrices={proPrices}
            agreedTotal={agreedTotal}
            onConfirmCompletion={() => {
              setCompletionConfirmed(true);
              setReturnToPro(true);
            }}
            returnToPro={returnToPro}
            onReturnToPro={() => {
              setReturnToPro(false);
              switchTo("pro");
            }}
            onQuoteDecision={(d) => {
              setQuoteDecision(d);
              setPendingQuote(null);
              /*
               * Either answer puts the professional back to work — an
               * approval starts the job, a decline sends him back to the
               * diagnosis with the customer still standing there. So the
               * way back is offered for both.
               */
              setReturnToPro(true);
            }}
            avatar={avatar}
            art={art}
            geo={geo}
            realMap={realMap}
            onToggleRealMap={() => setRealMap((r) => !r)}
          />
        ) : (
          /* His app opens slowly, as a reveal rather than a cut (Amit: "שיפתח המסך של המקצוען לאט באפקט מעניין"). */
          <div style={{ width: w, height: h - bannerH, animation: "pnProIn .9s cubic-bezier(.2,.7,.2,1) both" }}>
            <style>{"@keyframes pnProIn{from{opacity:0;transform:scale(1.04);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}"}</style>
          <ProApp
            geo={geo}
            width={w}
            height={h - bannerH}
            onSwitch={() => switchTo("customer")}
            skipHowItWorks={proOnboarded.current}
            onBackOut={backOut}
            request={liveRequest}
            onTakeRequest={() => setLiveRequest(null)}
            pendingQuote={pendingQuote}
            sentQuoteLines={pendingQuote?.draft?.lines ?? null}
            approvedQuoteTotal={quoteTotal}
            sentQuoteNotes={pendingQuote?.draft?.notesHe ?? ""}
            quoteDecision={quoteDecision}
            onSendQuote={(draft) => {
              setQuoteDecision(null);
              setPendingQuote({ sentAtMs: Date.now(), draft });
              setQuoteTotal(draft ? draft.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceMinorUnits, 0) : null);
            }}
            onQuoteSeen={() => setQuoteDecision(null)}
            /*
             * Crosses to the customer and asks for the quote. The shell
             * owns the side, so it is the only place that can do both —
             * and `openQuote` is a one-shot flag rather than a route,
             * because CustomerApp owns its own routing and the shell
             * must not reach into it.
             */
            memory={proMemory}
            onReleaseJob={(sample) => { if (!sample) setJobReleased(true); }}
            /*
             * A SAMPLE CALL HAS NO CUSTOMER TO CROSS TO. Crossing showed the
             * customer's sample screens — "יוסי", a tap washer — beside his
             * carpentry job (button audit, 2026-10-01). For a sample call the
             * customer's answer arrives by itself a moment later.
             */
            onSampleCustomer={(what) => {
              if (what === "prequote") {
                setPreQuoteApprovedAt(Date.now());
                if (preQuote) { setQuoteTotal(preQuote.amount); setAgreedTotal({ amount: preQuote.amount, nameHe: "לפי ההצעה שאישרתם" }); }
              } else if (what === "quote") { setQuoteDecision("APPROVED"); setPendingQuote(null); }
              else setCompletionConfirmed(true);
            }}
            /*
             * Carried across from the picker, which runs on the other
             * side of the app. `art` rather than `worldSources` so the
             * gallery's borrowed figures work here too.
             */
            customerFaceUri={(() => {
              const id = avatar ? AVATARS.find((a) => a.id === avatar)?.portraitAssetId : null;
              const src = id ? art[id] : undefined;
              return src && typeof src === "object" && "uri" in src && typeof src.uri === "string"
                ? src.uri
                : null;
            })()}
            completionConfirmed={completionConfirmed}
            onCompletionSeen={() => setCompletionConfirmed(false)}
            onJobChange={setProJobState}
            availableAtMs={proAvailableAt}
            onAvailableAtChange={setProAvailableAt}
            selfNameHe={joinedPro ? joinedPro.nameHe.trim() || proName : proName}
            joined={joinedPro}
            onOnlineChange={setJoinedOnline}
            onEditJoin={joinedPro ? () => setGate({ name: "onboard", initial: joinedPro, startStep: 7, approved: true, from: "pro" }) : undefined}
            /* Not approved yet: finish the identity check and documents, then the approval runs. */
            onFinishJoin={joinedPro ? () => setGate({ name: "onboard", initial: joinedPro, startStep: 3, from: "sent" }) : undefined}
            startShift={startShiftOnEnter.current}
            onShiftStarted={() => { startShiftOnEnter.current = false; }}
            onPricesChange={setProPrices}
            onAgreedStart={(amount, nameHe) => {
              setQuoteTotal(amount);
              setAgreedTotal({ amount, nameHe });
            }}
            preQuoteSent={preQuote}
            preQuoteApprovedAt={preQuoteApprovedAt}
            onSendPreQuote={(q) => setPreQuote(q)}
            onSeeAsCustomer={(what) => {
              /*
               * Two waits, two destinations. The quote is a screen of its
               * own; the confirmation that the work is done lives on the
               * tracking panel, at the stage that asks for it.
               */
              if (what === "completion") setOpenCompletionOnce(true);
              else if (what === "quote") setOpenQuoteOnce(true);
              switchTo("customer");
            }}
          />
          </div>
        )}
        </ScreenTransition>
        </View>

        {/*
          * THE REVIEW CONTROL FOR THE WALK.
          *
          * Only while the real avatar art is missing, because the moment
          * it lands this is not a choice anybody should be offered — it is
          * just a worse version of the thing.
          *
          * It says what it is before it says what it does, like every
          * demo control here. A demo control that can be mistaken for the
          * product is worse than no demo control.
          */}
        {notice && !gate ? (
          // Offset by the banner, which is in the layout above this overlay.
          // Without it the prototype notice lands on top of the message
          // saying the data may be wrong — the less important of the two.
          /* Taps pass through it (button audit: it swallowed the first tap on the back
             button and the address row beneath it); it leaves by itself. */
          <View pointerEvents="none" style={[styles.notice, { top: bannerH + spacing.lg }]}>
            <Text style={styles.noticeText}>
              אב־טיפוס. אין שרת — כל הנתונים הם דוגמאות.
            </Text>
            {/*
              * WHAT IS REMEMBERED, SAID WHERE IT MATTERS.
              *
              * Amit asked when the prototype would start saving what he
              * chooses so a flow can be tested for real. It does now — and
              * the second line is not decoration: a reviewer who does not
              * know their answers are kept will assume a stale address is
              * a bug, and one who thinks EVERYTHING is kept will expect a
              * job to still be running. Both sentences are needed.
              */}
            {canSaveSession() ? (
              <Text style={styles.noticeSub}>
                {savedAgoHe(restored, Date.now()) ?? "מה שתבחרו ותכתבו יישמר במכשיר הזה"} · קריאה
                פעילה לא נשמרת
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Sign-in, with the timers and the failure it will have in production.
 *
 * The resend countdown and the rejected-code path are here rather than
 * skipped, because they are most of what sign-in actually feels like: a
 * screen that only ever shows the happy path teaches nobody whether the
 * unhappy one is survivable.
 */
function AuthGate({
  side,
  onDone,
  onBack,
  width,
  height,
}: {
  side: Side;
  /** Signed in: the verified phone number, digits only. */
  onDone: (phone: string) => void;
  onBack: () => void;
  width: number;
  height: number;
}) {
  const [stage, setStage] = useState<AuthStage>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const sendCode = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setStage("code");
      setResendIn(30);
    }, 700);
  };

  return (
    <PhoneAuthBody
      side={side}
      stage={stage}
      phone={phone}
      onChangePhone={setPhone}
      code={code}
      onChangeCode={(v) => {
        setCode(v.replace(/\D/g, "").slice(0, 6));
        setError(null);
      }}
      resendInSeconds={resendIn}
      errorHe={error}
      busy={busy}
      onSubmitPhone={sendCode}
      onSubmitCode={() => {
        // A rejected code is a normal event and the screen has to survive it,
        // so one value is deliberately refused.
        if (code === "000000") {
          setError("הקוד לא נכון. אפשר לנסות שוב או לבקש קוד חדש.");
          return;
        }
        setBusy(true);
        setTimeout(() => {
          setBusy(false);
          onDone(phone.replace(/\D/g, ""));
        }, 600);
      }}
      onResend={() => setResendIn(30)}
      onBack={() => (stage === "code" ? setStage("phone") : onBack())}
      width={width}
      height={height}
    />
  );
}

// ---------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------

/**
 * WHAT THE CUSTOMER'S SIDE MUST NOT FORGET WHEN IT IS NOT ON SCREEN.
 *
 * The mirror of `ProMemory`, for the same reason: the two sides are two
 * apps and crossing unmounts one of them. What is kept is what a person
 * would be startled to lose — where they were, and what they approved.
 *
 * The approved quote is kept as LINES and not only as a total, because
 * the closing screen tells them what was done in the professional's own
 * words, and those words exist nowhere else once the pending quote has
 * been answered and cleared.
 */
/* ---------------------------------------------------------------------
   JOINING (Amit, 2026-09-29) — the pieces the onboarding screen borrows.
   --------------------------------------------------------------------- */
const ONBOARD_SERVICES: OnboardingService[] = Object.keys(SERVICE_PAGES).map((id) => {
  const def = pilotServiceById[id];
  const p = SERVICE_PAGES[id]!.price;
  return {
    id,
    nameHe: SERVICE_PAGES[id]!.nameHe,
    categoryHe: categoryNameByServiceId[id] ?? "",
    groupId: departmentCodeByServiceId[id] ?? undefined,
    kind: def ? pricingKindOf(def) : "VISIT",
    visitFee: p?.visitFeeMinorUnits ?? null,
    hourly: p?.hourlyRateMinorUnits ?? null,
    deliveryBase: p?.baseMinorUnits ?? null,
    perKm: p?.perKmMinorUnits ?? null,
    list: priceListFor(id),
  };
});
/* How long a call waits for his answer. Amit: 30 seconds was not enough to
   read it — "לא מספיקים לקרוא את כל הפרטים ונגמר הזמן". */
const OFFER_SECONDS = 60;
/* The trades as pictures for the join — short words, our own characters (Amit: most can barely read). */
const ONBOARD_FIELDS: ReadonlyArray<{ id: string; labelHe: string; iconUri: string }> = (
  [
    /* [department, words under the picture, whose drawn character] — DEPT_SHOP is declared further down. */
    ["HOME_URGENT", "תיקונים בבית", "home"], ["IMPROVEMENT", "שיפוצים", "build"], ["APPLIANCES", "מזגנים ומכשירים", "appliance"], ["HOME_CARE", "ניקיון וגינה", "care"],
    ["VEHICLE", "רכב", "auto"], ["LOGISTICS", "הובלות ושליחויות", "move"], ["PETS", "חיות", "pets"], ["BEAUTY", "יופי", "hair"],
    ["WELLNESS", "כושר ובריאות", "well"], ["TECH", "מחשבים וטלפונים", "tech"], ["ODD_JOBS", "עזרה בבית", "help"],
  ] as const
)
  .filter(([id]) => ONBOARD_SERVICES.some((x) => x.groupId === id))
  .map(([id, labelHe, who]) => ({ id, labelHe, iconUri: `./world/character_${who}_icon.webp` }));
/* The trade's own shopfront and drawn professional, for "your shop in our street". */
function onboardShopFor(serviceId: string | null): { facadeUri: string; characterUri: string } {
  const dept = serviceId ? departmentCodeByServiceId[serviceId] ?? "" : "";
  /* A trade with its own house in the street stands in front of it — the vet
     has a clinic, not the pet shop (Amit, joining as a vet, 2026-09-30). */
  const own: Record<string, string> = { "svc-vet": "vet", "svc-nails": "nails" };
  /* No service of ours (only his own new one): the general shop, never plumbing. */
  const shop = (serviceId && own[serviceId]) || (dept && DEPT_SHOP[dept]) || "help";
  const drawn = ["appliance", "auto", "build", "care", "hair", "help", "home", "move", "pets", "tech", "well"];
  /* An electrician is not the plumber with a wrench: the tool-belt technician stands in. */
  const figure = serviceId && /svc-(electric|socket|alarm|solar)/.test(serviceId) ? "appliance" : shop;
  return { facadeUri: `./world/m/shop_${shop}.webp`, characterUri: `./world/character_${drawn.includes(figure) ? figure : "home"}_icon.webp` };
}
/*
 * HIM, AT HIS OWN DOOR.
 *
 * Amit: *"שיהיה פה גם הדמות שבחר או הדמות האמיתית שלו."* A real photo is
 * shown as a round portrait at the doorway; without one, his trade's drawn
 * character stands there.
 */
function AtTheDoor({ result, color }: { result: OnboardingResult; color: string }) {
  if (result.photoUri)
    return <img src={result.photoUri} alt="" style={{ position: "absolute", left: "50%", bottom: "6%", width: 72, height: 72, marginLeft: 26, borderRadius: 36, objectFit: "cover", border: `3px solid ${color}`, boxShadow: `0 0 18px ${color}` }} />;
  return <img src={onboardShopFor(result.serviceIds[0] ?? null).characterUri.replace("_icon.", "_world.")} alt="" style={{ position: "absolute", left: "50%", bottom: 0, height: "40%", marginLeft: 18, filter: "drop-shadow(0 10px 14px rgba(0,0,0,.55))" }} />;
}
/* "PRO NOW" above his business name — the sign of every shop he opens with us (Amit). */
function ProNowMark({ size }: { size: number }) {
  return (
    <span style={{ display: "block", direction: "ltr", fontSize: size, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.1 }}>
      <span style={{ color: "#fff" }}>PRO </span><span style={{ color: "#FF6B4A" }}>NOW</span>
    </span>
  );
}
/*
 * HIS SIGN, ON HIS FACADE — painted over the drawn "PRO NOW <trade>" sign at
 * the same place it sits on every facade (33.5%–50% of its height), the way
 * the 3D street paints it. `px` is the facade's rendered height.
 */
function FacadeWithSign({ facadeUri, result, px, lit = Infinity, style }: { facadeUri: string; result: OnboardingResult; px: number; lit?: number; style?: React.CSSProperties }) {
  const c = result.brandColor;
  const name = (result.shopNameHe || result.businessHe || result.nameHe).trim();
  const bh = px * 0.165;
  const nameSize = Math.max(10, Math.min(bh * 0.44, (px * 0.7) / Math.max(4, name.length) * 1.6));
  return (
    <div style={{ position: "absolute", left: "50%", bottom: 0, height: px, aspectRatio: "1", transform: "translateX(-50%)", ...style }}>
      <img src={facadeUri} alt="" style={{ width: "100%", height: "100%", display: "block" }} />
      <div style={{ position: "absolute", left: "8%", right: "8%", top: "33.5%", height: "16.5%", borderRadius: bh * 0.2, border: `2px solid ${c}`, background: "#120c1c", boxShadow: `0 0 ${bh * 0.5}px ${c}`, display: "flex", alignItems: "center", justifyContent: "center", gap: bh * 0.14, padding: `0 ${bh * 0.16}px`, direction: "rtl" }}>
        {result.logoUri ? <img src={result.logoUri} alt="" style={{ width: bh * 0.7, height: bh * 0.7, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${c}` }} /> : null}
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.05, minWidth: 0 }}>
          <ProNowMark size={Math.max(8, bh * 0.24)} />
          <span aria-label={name} style={{ fontSize: nameSize, fontWeight: 900, color: "#fff", whiteSpace: "nowrap" }}>
            {[...name].map((ch, i) => (
              <span key={i} style={{ opacity: i < lit ? 1 : 0.12, textShadow: i < lit ? `0 0 8px ${c}, 0 0 18px ${c}` : "none", animation: i === lit - 1 ? "pnFlick .35s" : undefined }}>{ch}</span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}
/* His shop as he designed it: which house, its full name, colour and logo. */
function ownShopDesign(r: OnboardingResult): { id: string; nameHe: string; colorHex: string; logoUri: string | null } {
  return { id: ownShopId(r), nameHe: (r.shopNameHe || r.businessHe || r.nameHe).trim(), colorHex: r.brandColor, logoUri: r.logoUri };
}
/* Which house in our street is his: the shop of his first trade. */
/*
 * WHAT STANDS BETWEEN HIM AND WORK.
 *
 * Amit (2026-10-01): you may skip ahead to see the app, but until the
 * identity check (card + face) and the required documents are done you are
 * not approved for work. Empty means approved.
 */
function missingForWork(r: OnboardingResult): string[] {
  const out: string[] = [];
  if (!r.identityVerified) out.push("אימות זהות");
  const given = new Set(r.uploadedDocIds ?? []);
  const left = onboardingDocsFor(r.serviceIds).filter(
    (d) => d.level !== "RECOMMENDED" && !d.whenHe && d.id !== "ID" && d.id !== "SELFIE" && !given.has(d.id)
  ).length;
  if (left > 0) out.push(left === 1 ? "מסמך חובה אחד" : `${left} מסמכי חובה`);
  return out;
}
function ownShopId(r: OnboardingResult): string {
  const m = onboardShopFor(r.serviceIds[0] ?? null).facadeUri.match(/shop_([a-z]+)\.webp/);
  return m?.[1] ?? "help";
}
/* The device's own picker: a photo, a scan or a PDF — nothing leaves the phone in the demo. */
/*
 * A VOICE NOTE, recorded on this device and kept on it (a blob URL). Used by
 * the professional to explain a quote in his own voice. Resolves false when
 * there is no microphone or it is not allowed here.
 */
const voiceRecorder = (() => {
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  return {
    start: async (): Promise<boolean> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream);
        chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.start();
        startedAt = Date.now();
        return true;
      } catch {
        return false;
      }
    },
    stop: (): Promise<{ uri: string; seconds: number } | null> =>
      new Promise((resolve) => {
        const r = rec;
        if (!r) return resolve(null);
        r.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
          resolve({ uri: URL.createObjectURL(blob), seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) });
        };
        rec = null;
        r.stop();
      }),
  };
})();
/* The ID card: straight to the back camera on a phone (a computer offers its file picker). */
function pickIdPhoto(): Promise<{ uri: string; name: string } | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    /* In the page, not floating: iPhone Safari sometimes drops the choice of a picker that is not
       attached to the document — the photo "did not load" (Amit, 2026-10-01). */
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.onchange = () => {
      const f = input.files?.[0];
      resolve(f ? { uri: URL.createObjectURL(f), name: f.name } : null);
      input.remove();
    };
    input.click();
  });
}
function pickLocalFile(): Promise<{ uri: string; name: string } | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    /* In the page, not floating: iPhone Safari sometimes drops the choice of a picker that is not
       attached to the document — the photo "did not load" (Amit, 2026-10-01). */
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.onchange = () => {
      const f = input.files?.[0];
      resolve(f ? { uri: URL.createObjectURL(f), name: f.name } : null);
      input.remove();
    };
    input.click();
  });
}
/* A logo's brand colour: the most frequent vivid pixel, ignoring white, black and transparent. */
function dominantColor(uri: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const img = new window.Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 48;
      c.height = 48;
      const g = c.getContext("2d");
      if (!g) return resolve(null);
      g.drawImage(img, 0, 0, 48, 48);
      const px = g.getImageData(0, 0, 48, 48).data;
      const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i]!, gg = px[i + 1]!, b = px[i + 2]!, a = px[i + 3]!;
        const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
        if (a < 128 || max < 40 || min > 225 || max - min < 40) continue;
        const k = `${r >> 5}-${gg >> 5}-${b >> 5}`;
        const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n += 1; e.r += r; e.g += gg; e.b += b;
        buckets.set(k, e);
      }
      const best = [...buckets.values()].sort((x, y) => y.n - x.n)[0];
      if (!best) return resolve(null);
      const hex = (v: number) => Math.round(v / best.n).toString(16).padStart(2, "0");
      resolve(`#${hex(best.r)}${hex(best.g)}${hex(best.b)}`);
    };
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}
/*
 * AFTER SENDING — the true state, nothing ticking by itself (design review:
 * checks that "finish" in three seconds are fake verification). Received;
 * in the queue; waiting. Only the demo bar moves it forward.
 */
function OnboardSent({ shopNameHe, color, onEdit, onApprove, width, height, docsGiven = true, missing = [], onFinish, onEnterAnyway }: { shopNameHe: string; color: string; onEdit: () => void; onApprove: () => void; width: number; height: number; docsGiven?: boolean; /* What still stops approval; empty = approved. */ missing?: string[]; onFinish?: () => void; onEnterAnyway?: () => void }) {
  const blocked = missing.length > 0;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [pulse]);
  /*
   * THE REVIEW MOVES BY ITSELF.
   *
   * Amit: *"למה הדגמה לא חלק מהאופציה? אני רוצה שהכל יעבוד."* The approval
   * waited on a "(הדגמה)" button. Now each check completes in turn and the
   * shop opens on its own. (In the product a person at PRO NOW approves; the
   * demo plays that wait in a few seconds.)
   */
  const [at, setAt] = useState(blocked ? 0 : 1);
  /* The handler is a fresh arrow on every render of the shell; a ref keeps the timers from restarting. */
  const approve = useRef(onApprove);
  approve.current = onApprove;
  useEffect(() => {
    /* Missing identity or documents: the check stops at the first step, and nothing is approved. */
    if (blocked) return;
    if (at > APPROVAL_STEPS_HE.length) {
      const t = setTimeout(() => approve.current(), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAt((n) => n + 1), 1500);
    return () => clearTimeout(t);
  }, [at, blocked]);
  /* Nothing is ticked that was not given: skipped documents say so (UX audit). */
  const state = (i: number) => (blocked ? (i === 0 ? "חסר" : "ממתין") : i === 0 && !docsGiven ? "יושלם אחר כך" : i < at ? "✓ עבר" : i === at ? "בבדיקה…" : "ממתין");
  return (
    <View style={{ width, height, backgroundColor: "#0F0B17" }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 64 }}>
        <View style={{ alignSelf: "center", width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: color, backgroundColor: "rgba(255,255,255,0.05)", marginBottom: 22 }}>
          <Text style={{ color: "#fff", fontSize: scale.hero, fontWeight: "900" }}>{blocked ? "!" : "✓"}</Text>
        </View>
        <Text style={{ color: "#fff", fontSize: scale.title, fontWeight: "900", textAlign: "center" }}>הבקשה נשלחה</Text>
        <Text style={{ color: "rgba(247,243,250,0.75)", fontSize: scale.body, textAlign: "center", marginTop: 6, marginBottom: 26 }}>
          {blocked ? `כדי לקבל עבודות חסר: ${missing.join(" ו")}` : at > APPROVAL_STEPS_HE.length ? "אושר! פותחים את החנות…" : shopNameHe ? `״${shopNameHe}״ כמעט ברחוב.` : "החנות שלך כמעט ברחוב."}
        </Text>
        {APPROVAL_STEPS_HE.map((t, i) => (
          <View key={t} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 10 }}>
            <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
              {i === at ? (
                <Animated.View style={{ position: "absolute", width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#FF9A6B", opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }} />
              ) : null}
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: i < at ? "#2FBF8A" : i === at ? "#FF5C38" : "rgba(255,255,255,0.1)" }}>
                <Text style={{ color: "#fff", fontSize: scale.meta, fontWeight: "900" }}>{i < at ? "✓" : i + 1}</Text>
              </View>
            </View>
            <Text style={{ flex: 1, color: i <= at ? "#fff" : "rgba(247,243,250,0.62)", fontSize: scale.meta, fontWeight: "700", textAlign: "right" }}>{t}</Text>
            <Text style={{ color: i < at ? "#2FBF8A" : i === at ? "#FFB08A" : "rgba(247,243,250,0.5)", fontSize: scale.micro, fontWeight: "800" }}>{state(i)}</Text>
          </View>
        ))}
        {blocked ? (
          <>
            <Pressable onPress={onFinish} accessibilityRole="button" style={{ alignSelf: "stretch", minHeight: 54, borderRadius: 27, backgroundColor: "#FF6B4A", alignItems: "center", justifyContent: "center", marginTop: 22 }}>
              <Text style={{ color: "#fff", fontSize: scale.body, fontWeight: "900" }}>השלמת הרישום</Text>
            </Pressable>
            <Pressable onPress={onEnterAnyway} accessibilityRole="button" style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: "rgba(247,243,250,0.8)", fontSize: scale.meta, fontWeight: "800" }}>כניסה לאפליקציה בינתיים</Text>
            </Pressable>
          </>
        ) : (
        <Pressable onPress={onEdit} accessibilityRole="button" style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: 18, paddingHorizontal: 16 }}>
          <Text style={{ color: "#FF9A6B", fontSize: scale.meta, fontWeight: "800" }}>עריכת הפרטים</Text>
        </Pressable>
        )}
      </View>
    </View>
  );
}

/*
 * THE SHOP OPENS — the moment approval lands. His facade, his sign lighting
 * letter by letter in his colour, one line, one button (design review).
 */
function ShopOpen({ result, facadeUri, onStart, onDesign, onEdit, width, height }: { result: OnboardingResult; facadeUri: string; onStart: () => void; onDesign?: () => void; onEdit?: () => void; width: number; height: number }) {
  const name = result.shopNameHe || result.nameHe || "החנות שלך";
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLit((n) => (n >= name.length ? n : n + 1)), 90);
    return () => clearInterval(t);
  }, [name.length]);
  const c = result.brandColor;
  return (
    <View style={{ width, height, backgroundColor: "#0F0B17", alignItems: "center" }}>
      <style>{"@keyframes pnFlick{0%,100%{opacity:1}40%{opacity:.35}45%{opacity:1}70%{opacity:.6}72%{opacity:1}}@keyframes pnRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}"}</style>
      <div style={{ position: "relative", width: "100%", height: Math.round(height * 0.52), overflow: "hidden", background: "radial-gradient(120% 90% at 50% 25%, #3A2166 0%, #160F26 70%)" }}>
        <FacadeWithSign facadeUri={facadeUri} result={result} px={Math.round(height * 0.52 * 0.88)} lit={lit} />
        <AtTheDoor result={result} color={c} />
        <div style={{ position: "absolute", left: "50%", bottom: -60, width: 320, height: 120, transform: "translateX(-50%)", borderRadius: "50%", background: c, opacity: 0.25, filter: "blur(30px)" }} />
      </div>
      <div style={{ padding: "26px 24px 0", textAlign: "center", direction: "rtl", animation: "pnRise .6s .9s both" }}>
        <div style={{ color: "#fff", fontSize: scale.title, fontWeight: 900 }}>החנות שלך פתוחה.</div>
        <div style={{ color: "rgba(247,243,250,.75)", fontSize: scale.body, marginTop: 8 }}>
          הקריאות מגיעות במשמרת, לפי המיקום שלך.
        </div>
      </div>
      <View style={{ position: "absolute", bottom: 92, flexDirection: "row-reverse", gap: 18 }}>
        {onDesign ? (
          <Pressable onPress={onDesign} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text style={{ color: "#FF9A6B", fontSize: scale.meta, fontWeight: "800" }}>לעצב את החנות</Text>
          </Pressable>
        ) : null}
        {onEdit ? (
          <Pressable onPress={onEdit} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text style={{ color: "#FF9A6B", fontSize: scale.meta, fontWeight: "800" }}>עריכת הפרטים</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={onStart} accessibilityRole="button" style={({ pressed }) => ({ position: "absolute", left: 24, right: 24, bottom: 28, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#FF5C38", transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <Text style={{ color: "#fff", fontSize: scale.body, fontWeight: "900" }}>להתחיל משמרת</Text>
      </Pressable>
    </View>
  );
}

/*
 * THE SHIFT IS HIS SHOP.
 *
 * From the UX review (Amit: "סומך על הצוות"): the shift screen's picture is
 * the shop he built when he joined, standing in our city with his sign.
 * Off shift the shutter is down and the lamps are low; "התחלת משמרת" rolls it
 * up and the sign lights. His own art, no new promise: it says only whether
 * he is on shift.
 */
function ShiftStorefront({ result, online }: { result: OnboardingResult; online: boolean }) {
  const facade = onboardShopFor(result.serviceIds[0] ?? null).facadeUri;
  const c = result.brandColor;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 90% at 50% 20%, #3A2166 0%, #160F26 72%)" }}>
      {/* Keyframes, not transitions: the shift screen is rebuilt when the shift
          starts or ends, so a transition never had a "before" to move from and
          the shutter snapped (UX audit). These play from the start each time. */}
      <style>{"@keyframes pnSignBreathe{0%,100%{opacity:1}50%{opacity:.78}}@keyframes pnShutterUp{from{transform:scaleY(1)}to{transform:scaleY(0)}}@keyframes pnShutterDown{from{transform:scaleY(0)}to{transform:scaleY(1)}}@keyframes pnLightOn{from{opacity:0}to{opacity:1}}@keyframes pnShopWake{from{filter:brightness(.5) saturate(.6)}to{filter:brightness(.92) saturate(.95)}}@keyframes pnShopSleep{from{filter:brightness(.92) saturate(.95)}to{filter:brightness(.5) saturate(.6)}}@keyframes pnDim{from{opacity:0}to{opacity:.28}}@keyframes pnUndim{from{opacity:.28}to{opacity:0}}"}</style>
      {/* Quieter than before (Amit: "יותר נעים לעין, שלא לוקח פוקוס"): a softer city, the shop a touch dimmer. */}
      <img src={CITY_BG.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: CITY_BG.pos, opacity: 0.22, filter: "blur(3px)" }} />
      {/*
        * THE SHUTTER IS THE STATE (Amit: "שיורגש שהחלון באמת נפתח… והמסך
        * יתבהר; ביציאה התריס נסגר והמסך מתכהה"). Opening: the shutter rolls
        * up over 0.9s, the shop lights a moment after it passes halfway, and
        * the whole band brightens a touch. Closing is slower, 1.1s, and heavier.
        */}
      <div style={{ position: "absolute", inset: 0, background: "#000", opacity: online ? 0 : 0.28, animation: online ? "pnUndim .9s ease-out both" : "pnDim 1.4s ease-in both", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: "50%", bottom: 0, height: "88%", transform: "translateX(-50%)", animation: online ? "pnShopWake .6s ease-out .45s both" : "pnShopSleep 1.4s ease-in both" }}>
        <div style={{ position: "absolute", left: "8%", right: "8%", top: "48%", bottom: 0, background: `radial-gradient(60% 70% at 50% 60%, ${c}55, transparent 70%)`, opacity: online ? 1 : 0, animation: online ? "pnLightOn .7s ease-out .5s both" : undefined, pointerEvents: "none" }} />
        <FacadeWithSign facadeUri={facade} result={result} px={185} style={{ position: "relative", left: 0, transform: "none", height: "100%" }} />
        {/* The shutter over the shopfront: down off shift, rolled up on it. */}
        <div
          style={{
            position: "absolute", left: "11%", right: "11%", top: "52%", bottom: "5%",
            background: "repeating-linear-gradient(180deg, #5b5566 0 7px, #474252 7px 9px)",
            boxShadow: "inset 0 -6px 12px rgba(0,0,0,.45)",
            transformOrigin: "top", transform: online ? "scaleY(0)" : "scaleY(1)",
            animation: online ? "pnShutterUp .9s cubic-bezier(.2,.7,.2,1) .1s both" : "pnShutterDown 1.4s cubic-bezier(.6,0,.4,1) both",
          }}
        />
      </div>
      {online ? <AtTheDoor result={result} color={c} /> : null}
    </div>
  );
}

/* Shops whose drawn professional is a woman, and the names she goes by. */
const FEMALE_FIGURE = new Set(["hair", "nails", "pets", "well"]);
const FEMALE_NAMES_HE = new Set(["מאיה", "נועה", "שירה"]);

interface CustomerMemory {
  route: CustomerRoute;
  /* The tab too: back from the professional's side or from the avatar picker returns to the menu it left. */
  tab?: CustomerTab;
  approvedTotalMinor: number | null;
  approvedLines: readonly { id: string; descriptionHe: string; totalMinorUnits: number }[] | null;
}

function CustomerApp({
  ownPro = null,
  width,
  height,
  onSwitch,
  onStartOnboarding,
  onSignOut,
  onBackOut,
  onSendRequest,
  preQuote = null,
  onApprovePreQuote,
  pendingQuote,
  openQuoteOnce,
  onQuoteOpened,
  openCompletionOnce,
  onCompletionOpened,
  jobReleased,
  onReleaseSeen,
  onPickAvatar,
  onChangeAvatar,
  onBackToWelcome,
  liveOnSiteNameHe = null,
  openStrollOnce,
  proJobState = null,
  proAvailableAtMs = null,
  onProName,
  acceptedProName = null,
  proPrices = { byService: {}, afterHoursPct: null },
  agreedTotal = null,
  onStrollOpened,
  openAdvertiseOnce,
  onAdvertiseOpened,
  memory,
  returnToPro,
  onReturnToPro,
  onConfirmCompletion,
  onQuoteDecision,
  avatar,
  art,
  geo,
  realMap,
  onToggleRealMap,
}: {
  width: number;
  height: number;
  onSwitch: () => void;
  /** Demo: walk through joining as a new professional. */
  onStartOnboarding?: () => void;
  /** Sign out: the next sign-in with a registered number goes straight in. */
  onSignOut?: () => void;
  /** A price named before dispatch, and approving it (quote-first services). */
  preQuote?: { serviceId: string; amount: number; notesHe: string } | null;
  onApprovePreQuote?: (amount: number) => void;
  /**
   * Called when this side has no screen left behind it. Returns true if
   * the gesture was used to leave for the other side, false to let the
   * browser close the page. See `backGesture.ts`.
   */
  onBackOut: () => boolean;
  onSendRequest: (r: LiveRequest) => void;
  /** A quote the professional sent and the customer has not answered. */
  pendingQuote: {
    sentAtMs: number;
    draft: { lines: { id: string; description: string; quantity: number; unitPriceMinorUnits: number; kind: string }[]; notesHe: string; media?: QuoteMedia } | null;
  } | null;
  /**
   * Set when the professional asked, from their own side, to see this
   * quote as the customer — the review control on their demo row. It is
   * a request rather than a route: this component owns its routing, and
   * the shell must not reach into it.
   */
  openQuoteOnce: boolean;
  /** Cleared as soon as we have acted on it, so it fires exactly once. */
  onQuoteOpened: () => void;
  /** The professional is waiting to be told the work is finished. */
  openCompletionOnce?: boolean;
  onCompletionOpened?: () => void;
  /** The professional gave the job back and the customer has to be told. */
  jobReleased?: boolean;
  onReleaseSeen?: () => void;
  /**
   * Reopens the avatar picker. Undefined while its art has not arrived.
   * The picker is a gate above this component, so this is the only way
   * somebody who skipped it can answer again.
   */
  onPickAvatar?: () => void;
  onChangeAvatar?: () => void;
  /* Back from the business page that the welcome's door opened. */
  onBackToWelcome?: () => void;
  /** The call that was sent, if it was for someone else: who is at home. */
  liveOnSiteNameHe?: string | null;
  /**
   * Where the professional's side of the visit is, mirrored by the shell.
   * Only used to move the customer's screen on when the professional does
   * something the customer would see at the door.
   */
  proJobState?: JobState | null;
  /** When the professional said he will be free, if he did. */
  proAvailableAtMs?: number | null;
  /** The name of the professional the customer accepted, for the other side. */
  onProName?: (name: string | null) => void;
  /** The professional who opened his shop in this demo, while he is on shift. */
  ownPro?: OnboardingResult | null;
  /** The professional the customer accepted, kept by the shell across side switches. */
  acceptedProName?: string | null;
  proPrices?: { byService: Record<string, number | null>; afterHoursPct: number | null };
  agreedTotal?: { amount: number; nameHe: string } | null;
  /** A figure was just chosen because the street was asked for. */
  openStrollOnce?: boolean;
  onStrollOpened?: () => void;
  /** Open the advertiser's page once, from the welcome's business door. */
  openAdvertiseOnce?: boolean;
  onAdvertiseOpened?: () => void;
  /**
   * Where this side was the last time it was mounted — see the shell.
   * Held above because crossing to the professional unmounts all of this.
   */
  memory?: React.MutableRefObject<CustomerMemory | null>;
  /** The customer has answered a quote, so the professional has a move. */
  returnToPro?: boolean;
  onReturnToPro?: () => void;
  /** The customer agreed the work is finished. See `completionConfirmed`. */
  onConfirmCompletion?: () => void;
  onQuoteDecision: (d: "APPROVED" | "DECLINED") => void;
  /**
   * Who the customer walks the street as. Owned above, because the picker
   * runs before this component exists — and `null` is the answer for
   * everybody who skipped it, which the whole app has to handle.
   */
  avatar: AvatarChoice;
  /** The art that has arrived — or, in review, the borrowed stand-ins. */
  art: WorldAssetSources;
  geo: WorldGeo | null;
  realMap: boolean;
  onToggleRealMap: () => void;
}) {
  const snapshot = useLiveSnapshot();
  /**
   * ONE reading, shared by the home grid and by every service page opened
   * from it. Two independent reads of the same snapshot can land either side
   * of the freshness boundary and disagree on screen.
   */
  const supply = readAvailability(snapshot, Date.now());
  const [tab, setTab] = useState<CustomerTab>(PINNED || REVIEW_CYCLE ? "home" : (memory?.current?.tab ?? "home"));
  const capture = useCapture();
  /* What the recording said, into the text box (see useCapture). */
  const [dictated, setDictated] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (capture.transcript) setDictated((d) => ({ text: capture.transcript, n: (d?.n ?? 0) + 1 }));
  }, [capture.transcript]);
  /* What the photo shows, recognised (see recognise.ts). */
  const [photoMatch, setPhotoMatch] = useState<{ serviceId: string | null; seenHe: string } | null>(null);
  const [recognising, setRecognising] = useState(false);
  const photoCount = capture.photos.length;
  useEffect(() => {
    if (photoCount === 0) {
      setPhotoMatch(null);
      return;
    }
    const files = capture.photos.map((ph) => ph.file).filter((f): f is Blob => !!f);
    if (files.length === 0) return;
    let live = true;
    setRecognising(true);
    void recognisePhoto(files, HOME_SERVICES.map((x) => ({ id: x.id, nameHe: x.nameHe }))).then((r) => {
      if (!live) return;
      setRecognising(false);
      if (r) setPhotoMatch({ serviceId: r.serviceId, seenHe: r.problemHe });
      if (r?.problemHe) setDictated((d) => ({ text: r.problemHe, n: (d?.n ?? 0) + 1 }));
    });
    return () => {
      live = false;
    };
    // A new photo is the trigger; the list itself is read inside.
  }, [photoCount]);
  /*
   * The last review session, read once. Everything seeded from it below is
   * an INPUT the person supplied; nothing about a live job is restored.
   */
  const saved = useMemo(() => loadSession(), []);
  /*
   * ONE ORDER'S WORDS BELONG TO THAT ORDER.
   *
   * The text, the photos, the recording and the destination were kept
   * app-wide, so "ציפורניים" typed for nails turned up in a towing request
   * and on the tow driver's screen (Amit, 2026-09-29). They now belong to
   * the service they were written for (`draftFor`) and to one request:
   * starting another service, or a new order after one was sent, starts
   * clean. See the effect under `route`.
   */
  const [faultText, setFaultText] = useState(saved?.faultServiceId ? saved?.faultText ?? "" : "");
  const [draftFor, setDraftFor] = useState<string | null>(saved?.faultServiceId ?? null);
  const draftSent = useRef(false);
  /* The someone-else address is chosen for ONE order, never kept for the next. */
  const addressPickedSinceSend = useRef(false);
  const [chat, setChat] = useState<ChatMessage[]>(chatSeed);
  const [sheet, setSheet] = useState<null | "call" | "safety" | "payment" | "released">(null);
  /* The phone's back closes an open sheet and stays on the screen under it (button audit #11). */
  useEffect(() => (sheet ? openOverlay(() => setSheet(null)) : undefined), [sheet]);
  /**
   * THE HANDOFF, RECORDED RATHER THAN PERFORMED.
   *
   * Pressing "לאתר של Lust" in the shipping app hands the URL to the
   * platform's own browser and PRO NOW is done with it. In this gallery
   * it is written down instead: a developer tool that navigates a review
   * session away to a commercial site — mid-walk, mid-screenshot — is a
   * surprise, and the thing worth SHOWING is that the app announced the
   * handoff before making it, which is on the screen either way.
   */
  const [sponsorHandoff, setSponsorHandoff] = useState<string | null>(null);
  /** Same, for the advertiser lead: shown back, never posted anywhere. */
  const [advertiseLead, setAdvertiseLead] = useState<string | null>(null);

  /*
   * WHICH SHOP IS OPEN.
   *
   * Amit: *"כל חנות כזו בעצם תהיה הכרטיס, שם יקפוץ פרופיל המקצוען."* The
   * venue was decorative until now — a building you cannot open is a
   * picture of a choice rather than a choice.
   */
  const [openVenue, setOpenVenue] = useState<string | null>(null);
  /**
   * A REQUEST TO TRAVEL, from the card back down to the street.
   *
   * Amit: *"ואם אני עושה דלג אז חוזר לרחוב ועובר לחנות הבאה."* The card
   * is above the map, so skipping has to ask the map to make the same
   * move a tap on a shopfront makes: out, along, in.
   */
  const [enterVenue, setEnterVenue] = useState<string | null>(null);
  /** The total the customer actually approved, for the panel to say back. */
  const [approvedTotalMinor, setApprovedTotalMinor] = useState<number | null>(
    memory?.current?.approvedTotalMinor ?? null
  );
  /** The lines of that quote, for the closing screen's account of the work. */
  const [approvedLines, setApprovedLines] = useState<CustomerMemory["approvedLines"]>(
    memory?.current?.approvedLines ?? null
  );

  /**
   * The professional's own lines, shaped as the quote the screen renders.
   *
   * The total is summed here for DISPLAY only. In the product the server
   * builds it with `buildQuoteVersion` and binds it to a version hash
   * that the customer approves — so if the two ever disagreed the
   * server's would be the one that counts, and this screen has always
   * been careful to render the total it was GIVEN rather than one it
   * worked out. That stays true: this is the caller doing the sum, not
   * the screen.
   */
  const writtenQuote = useMemo(() => {
    const draft = pendingQuote?.draft;
    if (!draft || draft.lines.length === 0) return null;
    const lineItems = draft.lines.map((l, i) => ({
      id: `w${i}`,
      quoteId: "quote_written",
      description: l.description,
      quantity: l.quantity,
      unitPriceMinorUnits: l.unitPriceMinorUnits,
      kind: l.kind as "LABOR" | "MATERIALS" | "OTHER",
    }));
    return {
      ...quoteFixture,
      id: "quote_written",
      lineItems,
      /* His words or none — never the fixture's sentence about a cracked siphon. */
      notes: draft.notesHe,
      totalMinorUnits: draft.lines.reduce(
        (sum, l) => sum + Math.round(l.quantity * l.unitPriceMinorUnits),
        0
      ),
    };
  }, [pendingQuote]);

  /*
   * Seeded from the last review session, so a reload lands where you were
   * with what you typed still in the boxes. See `session.ts` for the line
   * between "what the person chose" (saved) and "what the server owns"
   * (never saved).
   */
  /*
   * ONLY ADDRESSES THIS PERSON GAVE (Amit, 2026-10-01: "אין לי כח לדוגמאות,
   * רוצה אמת"). No sample home, office or grandpa: each address typed (or the
   * device's location) is kept here and offered again next time.
   */
  const [myAddresses, setMyAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string>("");
  const [live, setLive] = useState<LiveLocationState>({ status: "idle" });

  /* An address typed on the picker is the address — it wins over the saved one that was highlighted (button audit #20). */
  const [typedAddress, setTypedAddress] = useState<string | null>(null);
  const savedChosen = myAddresses.find((a) => a.id === addressId) ?? null;
  const hasAddress = Boolean(typedAddress || savedChosen);
  const chosen: SavedAddress = typedAddress
    ? { id: "addr_typed", labelHe: typedAddress, formattedHe: typedAddress, forSomeoneElseNameHe: null }
    : savedChosen ?? { id: "", labelHe: "לאן להגיע?", formattedHe: "", forSomeoneElseNameHe: null };
  /*
   * THE PERSON AT THE DOOR, when the call is for someone else — typed on
   * the address screen, or carried by a saved address such as "אצל סבא".
   */
  const [onSiteTyped, setOnSiteTyped] = useState<{ forId: string | null; nameHe: string } | null>(null);
  /*
   * The call already sent knows whose door it is — crossing to the
   * professional's side and back must not turn grandpa's call into your own
   * (the address choice is not kept across that crossing; the request is).
   */
  const onSiteNameHe =
    onSiteTyped && onSiteTyped.forId === addressId ? onSiteTyped.nameHe : chosen.forSomeoneElseNameHe ?? null;
  // The label on the home screen says whose door this is. Forgetting that a
  // call is for someone else is how a professional ends up at the wrong flat.
  /* The job on screen: who is at home, from the call that was sent when this device no longer holds the choice. */
  /* Who is at home for the order in focus, when it was restored from the dock (several orders). */
  const [onSiteOverride, setOnSiteOverride] = useState<string | null | undefined>(undefined);
  const jobOnSiteHe = onSiteOverride !== undefined ? onSiteOverride : onSiteNameHe ?? liveOnSiteNameHe;
  const addressLabel = onSiteNameHe
    ? `${chosen.labelHe} · עבור ${onSiteNameHe}`
    : (chosen.formattedHe.split(" · ")[0] || chosen.labelHe);

  /*
   * A real permission request, not a decoration. If the device refuses or
   * cannot answer, the screen says so — it never invents a position.
   */
  const askLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLive({ status: "unavailable" });
      return;
    }
    setLive({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLive({
          status: "ready",
          // A coordinate is not a street. Turning one into an address needs a
          // geocoding vendor, which is still an open decision (CLAUDE.md §4),
          // so the honest thing to show is the position itself.
          coarseLabelHe: `מיקום נוכחי · ${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`,
        }),
      (err) => setLive({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);
  /* The "on the way" moment after accepting — see `OnTheWay`. */
  const [onTheWayAt, setOnTheWayAt] = useState<number | null>(null);
  /* When he set off — kept for the whole trip (the overlay above clears its own). */
  const [tripStartedAt, setTripStartedAt] = useState<number | null>(null);
  /* Which of the found professionals is on the card — see `onAnother`. */
  const [pick, setPick] = useState(0);
  /*
   * THE NEXT PROFESSIONAL PRICES IT TOO. Turning down a price on a
   * quote-first call passes it to the next professional, who answers with
   * his own. The preview's other candidates are fixtures, so their answer
   * is simulated a few seconds later; only the demo professional's price
   * is typed on the other side of the app.
   */
  const [otherQuote, setOtherQuote] = useState<{ pick: number; amount: number } | null>(null);
  /*
   * ONE PROFESSIONAL, ONE NAME, ON EVERY SCREEN.
   *
   * The match card said "יוסי", the visit screens said "דוגמה א׳" and the
   * professional's own app said "דוגמה ד׳" — three names for the person
   * the customer had just said yes to. The name on the card they accepted
   * is the name, everywhere after.
   */
  /* Seeded from the shell: switching to the professional's side and back
     remounts this screen, and the customer's tracker then named the demo
     plumber instead of the hairdresser they had accepted. */
  const [matchedName, setMatchedName] = useState<string | null>(acceptedProName);
  /* The name the first candidate had — the demo professional. */
  const matchedFirstRef = useRef<string | null>(null);

  /* The street a service was opened from, kept alive (paused) behind it — see `cityLayer`. */
  const [keptCity, setKeptCity] = useState<CustomerRoute | null>(null);
  const [route, setRoute] = useState<CustomerRoute>(
    /*
     * A pin or a review cycle is an instruction about where to open and
     * wins; otherwise a crossing back lands where it left off rather
     * than on the home screen. See `memory` in the shell.
     */
    PINNED
      ? { name: "living", serviceId: PINNED.serviceId, phase: PINNED.phase }
      : REVIEW_CYCLE
        ? { name: "living", serviceId: "svc-leak", phase: "SEARCHING" }
        : (memory?.current?.route ?? { name: "home" })
  );
  const routeServiceId = route.name === "living" ? route.serviceId : null;
  const routePhase = route.name === "living" ? route.phase : null;
  useEffect(() => {
    if (!routeServiceId || routePhase !== "MATCH_REVEAL") return;
    if (!pilotServiceById[routeServiceId]?.quoteBeforeDispatch || pick % 3 === 0 || otherQuote?.pick === pick) return;
    const t = setTimeout(() => {
      const example: Record<string, number> = { "svc-towing": 45000, "svc-moving": 60000, "svc-clean-reno": 90000, "svc-paint": 150000, "svc-garden": 40000, "svc-pest": 40000 };
      const base = preQuote?.serviceId === routeServiceId ? preQuote.amount : example[routeServiceId] ?? 45000;
      setOtherQuote({ pick, amount: Math.round((base * (1 + 0.08 * (pick % 3))) / 1000) * 1000 });
    }, 3500);
    return () => clearTimeout(t);
  }, [routeServiceId, routePhase, pick, otherQuote?.pick, preQuote]);
  /**
   * The intake answers live in the app, not in the screen, because they
   * travel: they are what the professional's offer card is built from two
   * screens later. Keyed by question id, last answer wins.
   */
  const [intakeAnswers, setIntakeAnswers] = useState<IntakeAnswer[]>(
    (saved?.intakeAnswers as IntakeAnswer[] | undefined) ?? []
  );
  /**
   * A sentence typed on the category screen that matched nothing there.
   *
   * It comes back to the home screen's field rather than being dropped, so
   * the full catalogue gets a chance to answer it. Held here because it
   * travels between two screens.
   */
  const [homeQuery, setHomeQuery] = useState<string | null>(null);
  /** The service this journey is about, kept after the route moves on. */
  const [lastRequestedId, setLastRequestedId] = useState<string | null>(saved?.lastServiceId ?? null);
  /**
   * The name of whatever the customer is actually tracking.
   *
   * Four screens after the request — searching, tracking, quote, complete —
   * were hard-coded to "תיקון נזילה בברז". Ask for a fridge and the app
   * spent the next four screens telling you a plumber was on the way about a
   * tap. Every screen was individually correct; the journey was fiction.
   */
  const trackedService = useMemo(() => {
    const id =
      route.name === "service" || route.name === "describe" || route.name === "living"
        ? route.serviceId
        : lastRequestedId;
    const page = id ? SERVICE_PAGES[id] : undefined;
    return {
      // Carried so the tracking screen knows which street the professional
      // comes down and what they are driving.
      id: id ?? null,
      nameHe: page?.nameHe ?? "תיקון נזילה בברז",
      mark: (page?.mark ?? "plumbing") as MarkName,
      /*
       * And what was agreed about money before anybody set off. The
       * tracking panel's one money line is derived from this and the
       * job's state — a fixed-price service must never be told a quote
       * is coming, because none is.
       */
      price: page?.price ?? null,
    };
  }, [route, lastRequestedId]);

  /*
   * WRITE WHAT WAS CHOSEN, NEVER WHAT IS LIVE.
   *
   * The address, the text, the answers and the last service asked about —
   * inputs, all of them. The route is deliberately absent: restoring
   * "מקצוען בדרך אליך · 9 דקות" after a night away would be fabricating a
   * live job, which is the same class of mistake as inventing availability
   * and more convincing because the reviewer created it themselves.
   */
  useEffect(() => {
    saveSession({
      side: "customer",
      addressId,
      faultText,
      faultServiceId: draftFor,
      intakeAnswers,
      lastServiceId: lastRequestedId,
    });
  }, [addressId, faultText, draftFor, intakeAnswers, lastRequestedId]);

  const answerIntake = useCallback((a: IntakeAnswer) => {
    setIntakeAnswers((prev) => [...prev.filter((p) => p.questionId !== a.questionId), a]);
  }, []);
  /*
   * WHAT IS BEING ORDERED FROM A PRICE LIST (Amit, 2026-09-29): for work
   * priced by its kind, the customer ticks lines from the list and that
   * is all they are asked. Kept per service, so a haircut's ticks never
   * price a dog walk.
   */
  const [picked, setPicked] = useState<{ serviceId: string; ids: string[] } | null>(null);
  /* Where to, for towing and moving. */
  const [destinationHe, setDestinationHe] = useState("");
  const draftRouteId = route.name === "service" || route.name === "describe" ? route.serviceId : null;
  const clearDraft = useCallback(() => {
    setFaultText("");
    setDestinationHe("");
    setIntakeAnswers([]);
    setPicked(null);
    capture.reset();
  }, [capture.reset]);
  useEffect(() => {
    if (!draftRouteId) return;
    const stale = draftSent.current || (draftFor !== null && draftFor !== draftRouteId);
    if (stale) {
      clearDraft();
      if (draftSent.current && !addressPickedSinceSend.current) {
        const a = myAddresses.find((x) => x.id === addressId);
        if (a?.forSomeoneElseNameHe || onSiteTyped) {
          setAddressId(myAddresses.find((x) => !x.forSomeoneElseNameHe)?.id ?? "");
          setOnSiteTyped(null);
        }
      }
      draftSent.current = false;
    }
    if (draftFor !== draftRouteId) setDraftFor(draftRouteId);
    // Only a change of service or a new order decides this.
  }, [draftRouteId]);
  /* Something captured on the home screen starts a new draft of its own. */
  const homeCaptured = capture.photos.length + (capture.voice ? 1 : 0);
  useEffect(() => {
    if (homeCaptured === 0 || route.name !== "home") return;
    if (draftSent.current || draftFor !== null) {
      setFaultText("");
      setDestinationHe("");
      setIntakeAnswers([]);
      setPicked(null);
      setDraftFor(null);
      draftSent.current = false;
    }
  }, [homeCaptured]);
  const pickedIdsFor = (serviceId: string) => (picked?.serviceId === serviceId ? picked.ids : []);
  const togglePick = useCallback((serviceId: string, id: string) => {
    setPicked((cur) => {
      const ids = cur?.serviceId === serviceId ? cur.ids : [];
      return { serviceId, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] };
    });
  }, []);
  /**
   * The ordered lines at one professional's prices (`own`: his base, which
   * scales the example list) — their names and their total.
   */
  const orderFor = useCallback(
    (serviceId: string, own: number | null) => {
      const rows = priceListFor(serviceId, own);
      const ids = picked?.serviceId === serviceId ? picked.ids : [];
      const chosen = rows.filter((r) => ids.includes(r.id));
      if (chosen.length === 0) return null;
      return {
        namesHe: chosen.map((r) => r.nameHe).join(" + "),
        amountMinorUnits: chosen.reduce((sum, r) => sum + r.amountMinorUnits, 0),
      };
    },
    [picked]
  );
  const [elapsed, setElapsed] = useState(0);
  /*
   * The waiting game is OPT-IN and off by default. It is a hypothesis test,
   * not a feature: does anyone want to touch the world while they wait?
   * Defaulting it on would answer the question by forcing it.
   */
  /**
   * The neighbourhood's discoveries, for the length of one wait.
   *
   * Local and unpersisted on purpose. Nothing found here survives the
   * screen — no points, no wallet, no loyalty — because a reward is a
   * commercial decision nobody has made (/CLAUDE.md §4).
   */
  const [discoveries, setDiscoveries] = useState<DiscoveryState>(() => emptyDiscoveries(HAIR_DISCOVERY_IDS));

  // A tracked job needs somewhere to go next; the prototype offers the same
  // advances the server would push. Computed BEFORE the body height, because
  // the demo strip takes its own space rather than covering the app's.
  /**
   * A way to SEE the personal-match flow before those services launch.
   *
   * The barber, the masseuse and the trainer are PILOT: the verification
   * policy for being alone with a person has not been decided, so they are
   * not orderable. But the flow they need is built and has to be reviewable
   * — so it is reachable through the demo strip, which announces itself as
   * not part of the app, rather than by quietly making a service orderable
   * that is not.
   */
  const previewMatch =
    tab === "home" && route.name === "service" && isPersonFit(route.serviceId)
      ? {
          label: "הצג איך נראית התאמה אישית",
          next: () => go({ name: "matchconfirm", serviceId: route.serviceId, index: 0 }),
        }
      : null;

  const arrivalAdvance =
    tab === "home" && route.name === "arrival"
      ? {
          label: "אימתתי את הקוד — הוא נכנס",
          next: () => advanceTo({ name: "tracking", stage: "arrived" }),
        }
      : null;

  /*
   * ONE STEP FORWARD PER STAGE, AND THE LAST ONE ENDS THE JOB.
   *
   * This used to fall through to "sent a quote" for everything that was
   * not assigned or en route — so approving a price landed back on a
   * screen whose only button offered the same quote again, and a visit
   * could never finish. The chain now runs knock → diagnosis → price →
   * work → finished → summary, which is the sequence a real visit has.
   */
  const advance =
    tab === "home" && route.name === "tracking"
      ? route.stage === "assigned"
        ? { label: "המקצוען יצא לדרך", next: () => advanceTo({ name: "tracking", stage: "enroute" }) }
        : route.stage === "enroute"
          ? { label: "המקצוען כמעט אצלך", next: () => advanceTo({ name: "arrival" }) }
          : route.stage === "arrived"
            ? {
                label: "המקצוען מתחיל לבדוק",
                next: () => advanceTo({ name: "tracking", stage: "diagnosis" }),
              }
            : route.stage === "diagnosis"
              ? trackedService.price?.priceModel === "VISIT_QUOTE" && !(trackedService.id && pilotServiceById[trackedService.id]?.quoteBeforeDispatch)
                ? { label: "המקצוען סיים את האבחון", next: () => advanceTo({ name: "tracking", stage: "done" }) }
                : { label: "המקצוען התחיל לעבוד", next: () => advanceTo({ name: "tracking", stage: "working" }) }
              : route.stage === "working"
                ? {
                    label: "המקצוען סיים את העבודה",
                    next: () => advanceTo({ name: "tracking", stage: "done" }),
                  }
                : {
                    label: "סיכום העבודה",
                    next: () => {
                      if (hasLiveJob) recordDone();
                      setHasLiveJob(false);
                      setRateCall(null);
                      advanceTo({ name: "complete" });
                    },
                  }
      : null;

  /* Quote-first: the price comes from the other side of the app. */
  const preQuoteWait =
    tab === "home" &&
    route.name === "living" &&
    route.phase !== "ASSIGNED_ROUTE" &&
    pilotServiceById[route.serviceId]?.quoteBeforeDispatch &&
    preQuote?.serviceId !== route.serviceId
      ? { label: "מעבר לצד המקצוען — הוא שולח מחיר", next: onSwitch }
      : null;

  const liveJobScreen =
    (route.name === "living" && route.phase === "ASSIGNED_ROUTE") || route.name === "tracking";
  const peekPro = liveJobScreen ? { label: "הצצה לצד המקצוען", next: () => onSwitch() } : null;
  const demo = advance ?? arrivalAdvance ?? previewMatch ?? preQuoteWait ?? peekPro;

  /**
   * A thin utility row instead of a bar at the bottom. It is 56px and it
   * carries two destinations, not four.
   */
  /*
   * ON EVERY SCREEN EXCEPT THE JOB'S OWN.
   *
   * The capsule exists so a live job is never lost while the customer is
   * doing something else. On the job's own screens it is noise — the whole
   * screen is already about that job — and the first version showed it
   * while merely browsing a service page, advertising an unrelated call.
   */
  const jobScreens = [
    "living",
    "tracking",
    "arrival",
    "chat",
    "quote",
    "complete",
    "matchconfirm",
  ];
  /*
   * ---------------------------------------------------------------
   * NOBODY IS ON THEIR WAY UNTIL SOMEBODY IS
   * ---------------------------------------------------------------
   * Amit: *"למה זה מופיע פה אם לא הזמנתי בעל מקצוע?? רק בזמן שהוא
   * בדרך שיופיע."*
   *
   * He is right, and this is the worst kind of bug in this product
   * rather than a cosmetic one. `customerOpenCall` is a FIXTURE — a
   * sample call that exists so the screens that list calls have
   * something to list — and the capsule read it unconditionally. So
   * the home screen told every customer, on first launch, before they
   * had asked for anything, that a named professional was fourteen
   * minutes away.
   *
   * That is a fabricated claim about supply on the most-seen surface
   * in the app (/CLAUDE.md §3), and it was there because a fixture
   * that is right for a LIST is wrong for an ASSERTION. A list says
   * "here are some calls". A capsule says "somebody is coming, now".
   *
   * So the capsule is gated on a job this session actually started:
   * set when the customer accepts a match, cleared when the work is
   * summarised or closed. The fixture still feeds the calls list,
   * where it was never a lie.
   */
  const [hasLiveJob, setHasLiveJob] = useState(false);
  /* The quote for someone at home was approved here: their page says "אישר ושילם". */
  const [quoteApprovedForOther, setQuoteApprovedForOther] = useState(false);
  /* The professional's voice note on a quote, played here. */
  const quoteAudio = useRef<HTMLAudioElement | null>(null);
  const [quoteVoicePlaying, setQuoteVoicePlaying] = useState(false);
  const toggleQuoteVoice = useCallback((uri: string) => {
    if (typeof Audio === "undefined") return;
    const cur = quoteAudio.current;
    if (cur && !cur.paused) {
      cur.pause();
      setQuoteVoicePlaying(false);
      return;
    }
    const a = cur && cur.src === uri ? cur : new Audio(uri);
    quoteAudio.current = a;
    a.onended = () => setQuoteVoicePlaying(false);
    void a.play().then(() => setQuoteVoicePlaying(true)).catch(() => setQuoteVoicePlaying(false));
  }, []);
  /* A past call opened from "הקריאות שלי" to rate it — its own name, professional and total (button audit #21). */
  const [rateCall, setRateCall] = useState<{ nameHe: string; totalMinorUnits: number | null; proNameHe: string | null; whenHe: string } | null>(null);

  /*
   * ---------------------------------------------------------------
   * THE MINUTES ARE A STATEMENT, AND TIME PASSES
   * ---------------------------------------------------------------
   * Amit: *"שיראו התקדמות כאילו היא צועדת לאט ומתקדמת לפי המרחק."*
   *
   * The rule is that we never invent progress. The distinction that
   * keeps this honest is the one `routeProgress` already draws: there
   * is a difference between INVENTING a position and RENDERING a
   * claim somebody already made.
   *
   * The server said fourteen minutes. Fourteen minutes is a statement
   * about time passing, so counting those minutes down and walking
   * the figure the same fraction of the way is showing that
   * statement, not adding to it. What would be invention is moving
   * without an ETA at all, or walking past the door when the ETA runs
   * out — and neither can happen here: with no ETA the figure walks on
   * the spot and the road moves under it instead, and the fraction is
   * clamped at 1.
   *
   * The first reading is remembered, because a fraction needs a
   * denominator and one of two numbers is not a fraction.
   */
  const firstEta = useRef<{ minutes: number; atMs: number } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const openEta = customerOpenCall[0]?.etaMinutes ?? null;
  useEffect(() => {
    if (openEta === null) { firstEta.current = null; return; }
    if (!firstEta.current) firstEta.current = { minutes: openEta, atMs: Date.now() };
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [openEta]);

  const seen = firstEta.current;
  const elapsedMin = seen ? (nowMs - seen.atMs) / 60000 : 0;
  const liveEta =
    seen ? Math.max(0, Math.ceil(seen.minutes - elapsedMin)) : openEta;
  const liveProgress =
    seen && seen.minutes > 0
      ? Math.max(0, Math.min(1, elapsedMin / seen.minutes))
      : null;

  /*
   * ---------------------------------------------------------------------
   * SEVERAL ORDERS AT ONCE (Amit, 2026-10-01; out/multi-order-spec.md)
   * ---------------------------------------------------------------------
   * The screens still show one order — the one "in focus". The others are
   * parked here, each with its own clock, professional and stage, and are
   * restored when chosen from the dock, the switcher or the city's strip.
   * The demo's professional side serves the newest order (`proBoundId`).
   */
  type ParkedOrder = {
    id: string;
    seq: number;
    serviceId: string | null;
    nameHe: string;
    mark: MarkName;
    proNameHe: string | null;
    route: CustomerRoute;
    tripStartedAt: number | null;
    eta: { minutes: number; atMs: number } | null;
    approvedTotalMinor: number | null;
    approvedLines: CustomerMemory["approvedLines"];
    quoteApprovedForOther: boolean;
    onSiteHe: string | null;
  };
  const [parked, setParked] = useState<ParkedOrder[]>([]);
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
  const orderSeq = useRef(0);
  const proBoundId = useRef<string | null>(null);
  /* The order's own screen to return to, remembered while the person walks elsewhere. */
  const lastJobRoute = useRef<CustomerRoute | null>(null);
  useEffect(() => {
    if (["living", "tracking", "arrival", "quote"].includes(route.name)) lastJobRoute.current = route;
  }, [route]);
  const ETA_MIN = Math.round((matchFixture.eta?.etaSeconds ?? 840) / 60);
  /* Each order counts from its own acceptance — the second one no longer inherits the first one's clock. */
  const startOrderClock = () => {
    firstEta.current = { minutes: ETA_MIN, atMs: Date.now() };
  };
  const [orderToast, setOrderToast] = useState<{ titleHe: string; metaHe: string; orderId: string | null } | null>(null);
  useEffect(() => {
    if (!orderToast) return;
    const t = setTimeout(() => setOrderToast(null), 6000);
    return () => clearTimeout(t);
  }, [orderToast]);


  /*
   * The drawn professional for the trade that was called out, from the
   * same lookup the tracking screen already uses for the face. A trade
   * with no drawing simply has none, and the capsule keeps its
   * silhouette — which is true of every trade.
   */
  const capsuleFigureUri = useMemo(() => {
    const mark = trackedService.mark;
    const dept = mark ? (departmentCodeByMark[mark] as DepartmentCode | undefined) : null;
    const id = dept ? WORLD_DISTRICTS[dept]?.characterWorldAssetId : null;
    const src = id ? art[id] : undefined;
    return src && typeof src === "object" && "uri" in src && typeof src.uri === "string"
      ? src.uri
      : null;
  }, [art, trackedService.mark]);

  /* Two orders or more: the dock (below) replaces the one-order capsule. */
  const multiOrder = parked.length > 0 && (hasLiveJob || route.name === "living");
  const showDock = multiOrder && !jobScreens.includes(route.name) && tab !== "calls";
  const capsule = multiOrder
    ? null
    : pendingQuote && route.name !== "quote"
      ? {
          textHe: "הצעת מחיר ממתינה לאישורך",
          etaMinutes: null,
          onPress: () => go({ name: "quote" }),
        }
      : hasLiveJob && customerOpenCall.length > 0 && !jobScreens.includes(route.name)
      ? {
          textHe: `${matchedName ?? "המקצוען"} · ${route.name === "tracking" && !["assigned", "enroute"].includes(route.stage) ? "אצלך" : "בדרך אליך"}`,
          etaMinutes: liveEta,
          progress: liveProgress,
          figureUri: capsuleFigureUri,
          onPress: () => go(lastJobRoute.current ?? { name: "tracking", stage: "enroute" }),
        }
      : null;

  /*
   * THE WAY BACK TO THE OTHER SIDE, AT THE MOMENT IT MATTERS.
   *
   * Amit, having just approved a quote as the customer: *"איך אני חוזר
   * לצד המקצוען אחרי שאישרתי את ההצעה מצד הלקוח?"* The switch has always
   * been in the header, on every screen — which is exactly why it does
   * not answer this: a control that is always there says nothing about
   * now. The professional's side gained a labelled row for the crossing
   * out; this is the crossing back, offered only while the professional
   * actually has a move to make, and only on the job's own screens where
   * it is about the thing in front of you.
   *
   * A review control, and it says so like every other one in this row.
   */
  /* The way back to his side stays wherever the customer's answer took them —
     the payment and rating screens included (button audit). */
  const showReturnToPro = (returnToPro ?? false) && route.name !== "home";

  const UTIL = 56;
  const bodyH =
    height -
    UTIL -
    (demo ? DEMO_H : 0) -
    (showReturnToPro ? DEMO_H : 0) -
    (capsule || showDock ? CAPSULE_HEIGHT : 0);

  /**
   * The live job, as one sentence. Present only while there is a job to
   * talk about — a capsule that is always there is a navigation bar with
   * extra steps.
   */


  /**
   * THE SEARCH ADVANCES ITSELF, the way the server will — so the wait is
   * experienced rather than described.
   *
   * And it now advances through PHASES of one scene rather than navigating
   * between screens: SEARCHING → CANDIDATES_FOUND → MATCH_REVEAL, and then
   * the customer decides. That last stop is the fix for the thing Amit
   * caught: *"הוא ישר מעביר אותי לדף מקצוען בדרך אליך בלי שבחרתי אותו
   * בכלל."* Delegating the choice is not the same as declining to be told
   * who is coming.
   */
  useEffect(() => {
    if (route.name !== "living") {
      setElapsed(0);
      return;
    }
    if (route.phase !== "SEARCHING" && route.phase !== "CANDIDATES_FOUND") return;
    // A pinned phase is being looked at, not lived through. Let it stand still.
    if (PINNED || REVIEW_CYCLE) return;
    const started = Date.now();
    const serviceId = route.serviceId;
    const fromPhase = route.phase;
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - started) / 1000);
      setElapsed((e) => e + 1);
      if (fromPhase === "SEARCHING" && secs >= 5) {
        setRoute({ name: "living", serviceId, phase: "CANDIDATES_FOUND" });
      } else if (fromPhase === "CANDIDATES_FOUND" && secs >= 2) {
        setRoute({ name: "living", serviceId, phase: "MATCH_REVEAL" });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [route]);

  /** TEMPORARY — see REVIEW_CYCLE. */
  useEffect(() => {
    if (!REVIEW_CYCLE) return;
    const id = setInterval(() => {
      setRoute((r) => {
        if (r.name !== "living") return { name: "living", serviceId: "svc-leak", phase: "SEARCHING" };
        const next = PHASES[(PHASES.indexOf(r.phase) + 1) % PHASES.length] ?? "SEARCHING";
        return { name: "living", serviceId: r.serviceId, phase: next };
      });
    }, REVIEW_PHASE_MS);
    return () => clearInterval(id);
  }, []);

  /*
   * Routes live under the "home" tab, so navigating to one from another tab
   * has to move the tab as well. The first version did not, and tapping a
   * live call in the calls list silently did nothing — the route changed
   * underneath a tab that was still rendering its own screen. Keeping the
   * tab switch inside `go` makes that impossible to forget at a call site.
   */
  /**
 * The services a customer category actually covers, in this catalogue.
 *
 * This replaced a function that returned the FIRST service and opened it —
 * a shortcut that made tapping "לבית" mean "I have a blocked drain". A
 * category is several departments wide; the only honest thing to do with a
 * tap on one is to show what it contains and ask.
 */
function servicesForCategory(category: { departments: readonly string[] }) {
  return HOME_SERVICES.filter((s2) =>
    category.departments.includes(departmentCodeByServiceId[s2.id] ?? "")
  );
}

const go = useCallback((r: CustomerRoute) => {
    /*
     * The stack remembers WHERE YOU WERE, not where you are going. That
     * distinction was the bug: the stack was filled by an effect watching
     * `route`, so it recorded the screen you had just arrived at — and a
     * back then popped the screen you were standing on and "returned" you
     * to it. Pressing back appeared to do nothing, or, once the browser's
     * own history had drifted a step out of line with ours, landed on some
     * screen from earlier in the session. Amit's original question —
     * *"איך חוזרים אחורה במסכים של הלקוח?"* — was still only half answered:
     * there was a control on every screen, and it did not reliably go back.
     */
    backStack.current = [...backStack.current, { route: hereRef.current, tab: tabRef.current, scroll: readScroll() }].slice(-40);
    setRoute(r);
    if (r.name !== "home") setTab("home");
    pushHistory();
  }, []);
  /*
   * THE ARROW GOES WHERE YOU CAME FROM.
   *
   * Every screen used to send its arrow to a fixed place — the service
   * page to home, the chat to the route map — while the phone's back went
   * to the screen actually visited. Now both pop the same history; the
   * fixed place is only the fallback for a screen opened with nothing
   * behind it.
   */
  const back = useCallback((fallback: CustomerRoute) => {
    if (backStack.current.length > 0 && goBack()) return;
    setRoute(fallback);
    setTab("home");
  }, []);
  /*
   * A STEP OF THE JOB, NOT A PLACE TO RETURN TO.
   *
   * The visit moving on (arrived → diagnosis → working → done → summary)
   * replaces the screen rather than stacking it, so back never walks into
   * a stage that is over (button audit #10). `fresh` also forgets what was
   * behind: once the request is accepted, back leaves the job for home
   * instead of reopening the match card that dispatches it again (#5–#7).
   */
  const advanceTo = useCallback((r: CustomerRoute, fresh = false) => {
    if (fresh) backStack.current = [];
    setRoute(r);
    setTab("home");
  }, []);

  /* Following the professional is the real map, with his vehicle on the
     route — Amit: *"מפת מעקב אחרי המקצוען, רק לראות איפה הוא ברכב שלו."* */
  /* Following him is the real map with his vehicle on the route (Amit, 2026-09-29:
     the 3D drive belongs to the waiting screen only). */
  const followPro = useCallback(() => {
    if (!realMap) onToggleRealMap();
    go({ name: "tracking", stage: "enroute" });
  }, [realMap, onToggleRealMap, go]);

  /* A fixed or hourly price agreed before he came is what is paid. */
  useEffect(() => {
    if (!agreedTotal) return;
    setApprovedTotalMinor(agreedTotal.amount);
    setApprovedLines([{ id: "agreed", descriptionHe: agreedTotal.nameHe, totalMinorUnits: agreedTotal.amount }]);
  }, [agreedTotal]);

  /*
   * WHEN HE KNOCKS, THE CUSTOMER'S SCREEN KNOWS.
   *
   * Amit, of the customer's screen still showing the van "on the way"
   * after the professional had pressed "הגעתי": it cannot be. The shell
   * mirrors the professional's side (`proJobState`), and the moment the
   * visit is at the door the customer's wait turns into the visit.
   */
  useEffect(() => {
    /* The professional's side serves one order (the newest); its moves belong to that order only. */
    if (focus && proBoundId.current && focus.id !== proBoundId.current) return;
    if (proJobState === "COMPLETION_PENDING" && route.name === "tracking" && (route.stage === "working" || route.stage === "diagnosis" || route.stage === "arrived")) {
      advanceTo({ name: "tracking", stage: "done" });
      return;
    }
    /* Straight to work at an agreed price: no quote step to wait at. */
    if (proJobState === "IN_PROGRESS" && route.name === "tracking" && (route.stage === "arrived" || route.stage === "diagnosis")) {
      advanceTo({ name: "tracking", stage: "working" });
      return;
    }
    if (proJobState !== "PRO_ARRIVED" && proJobState !== "DIAGNOSIS" && proJobState !== "WAITING_QUOTE_APPROVAL") return;
    const stillWaiting =
      (route.name === "living" && route.phase === "ASSIGNED_ROUTE") ||
      (route.name === "tracking" && (route.stage === "assigned" || route.stage === "enroute" || route.stage === "arrived"));
    if (stillWaiting) {
      if (realMap) onToggleRealMap();
      advanceTo({ name: "tracking", stage: "diagnosis" });
    }
    /* His quote is waiting: it opens for whoever ordered, rather than waiting to be found (Amit, 2026-10-01). */
    if (proJobState === "WAITING_QUOTE_APPROVAL" && pendingQuote && route.name !== "quote") go({ name: "quote" });
    // Only the professional's move triggers this, not every route change.
  }, [proJobState]);

  /**
   * Move to a tab, recording where you were so back can return there.
   *
   * A tab is a sibling of home rather than a step into it (see
   * `navigation-flow.ts`), so the transition barely moves — but it is still
   * a navigation, and leaving it out of the history is what made the back
   * gesture fall out of the app.
   */
  /*
   * THE OTHER SIDE ASKED FOR THIS SCREEN.
   *
   * Amit: *"איך אני מאשר כרגע את הקריאה מצד הלקוח לראות שזה עובד?"* The
   * answer was already in the app — the customer gets a capsule saying a
   * quote is waiting — but finding it meant knowing to press "לקוח" and
   * then noticing a strip above the tab bar. So the professional's demo
   * row now crosses over and lands here directly.
   *
   * It runs through `go`, not `setRoute`, so the move is a real
   * navigation: it animates, it moves the tab, and back returns to
   * wherever the customer actually was.
   */
  useEffect(() => {
    if (!openQuoteOnce) return;
    onQuoteOpened();
    if (!pendingQuote) return;
    go({ name: "quote" });
  }, [openQuoteOnce, onQuoteOpened, pendingQuote, go]);

  /*
   * AND THE DOOR TO THE STREET FINISHES ITS OWN SENTENCE.
   *
   * The picker unmounts this component, so the intent is held above and
   * arrives back here as a one-shot. `avatar` is checked rather than
   * trusted: a skip answers "no figure", and walking an empty street is
   * the thing the door exists not to do.
   */
  /*
   * The other crossing: straight to the stage that asks the customer
   * whether the work is finished. Same one-shot shape as the quote's.
   */
  useEffect(() => {
    if (!openCompletionOnce) return;
    onCompletionOpened?.();
    advanceTo({ name: "tracking", stage: "done" });
  }, [openCompletionOnce, onCompletionOpened, advanceTo]);

  /*
   * TOLD AT ONCE, AND PUT BACK IN THE QUEUE.
   *
   * The professional released the job. The customer's screen must not
   * keep tracking somebody who is not coming — which is the state the
   * product had before, arrived at by the professional simply not
   * turning up. The sheet says what happened; behind it the search has
   * already started again, because that is what actually protects them.
   */
  useEffect(() => {
    if (!jobReleased) return;
    onReleaseSeen?.();
    setSheet("released");
    go({ name: "living", serviceId: lastRequestedId ?? "svc-leak", phase: "SEARCHING" });
  }, [jobReleased, onReleaseSeen, lastRequestedId, go]);

  useEffect(() => {
    if (!openAdvertiseOnce) return;
    onAdvertiseOpened?.();
    backStack.current = [];
    setRoute({ name: "advertise", fromWelcome: true });
    pushHistory();
  }, [openAdvertiseOnce, onAdvertiseOpened, go]);

  useEffect(() => {
    if (!openStrollOnce) return;
    onStrollOpened?.();
    if (avatar === null) return;
    go({ name: "stroll" });
  }, [openStrollOnce, onStrollOpened, avatar, go]);

  /**
   * ONE DOOR, TWO ANSWERS.
   *
   * With a figure it opens the street. Without one it opens the picker
   * and comes back here — and the card says which of the two it is, so
   * nobody taps "walk the street" and gets a questionnaire. When the
   * portraits have not arrived there is no door at all, because a picker
   * with nothing in it is worse than no invitation.
   */
  const strollDoor = avatar ? () => go({ name: "stroll" }) : onPickAvatar;

  const goTab = useCallback((t: CustomerTab) => {
    backStack.current = [...backStack.current, { route: hereRef.current, tab: tabRef.current }].slice(-40);
    setTab(t);
    /* The screen under the menu stays (a live job stays a live job); back returns to it (button audit #4). */
    pushHistory();
  }, []);

  /*
   * ---------------------------------------------------------------------
   * THE PHONE'S OWN BACK GESTURE
   * ---------------------------------------------------------------------
   * Amit: *"איך חוזרים אחורה במסכים של הלקוח?"* Adding a visible control to
   * every screen answers half of it. The other half is that he is reviewing
   * this in a browser on a phone, where the swipe-from-the-edge and the
   * Android back button are how people leave a screen — and here they did
   * nothing at all, or worse, left the prototype entirely.
   *
   * Navigation lives in React state rather than in the URL, so the history
   * stack has to be maintained by hand: every `go` pushes an entry, and a
   * `popstate` is routed into the same `back()` the on-screen control uses.
   * The two are then the same action by construction, which is the only way
   * they stay in agreement as screens are added.
   *
   * The entries are deliberately empty of state. The artifact host strips
   * query strings (this is the same constraint that killed `?phase=`), so a
   * URL-encoded route would survive locally and silently break in the one
   * place Amit actually looks at it.
   */
  const backStack = useRef<{ route: CustomerRoute; tab: CustomerTab; scroll?: number }[]>([]);
  /*
   * Where we are RIGHT NOW, readable from a callback that was created on
   * the first render. `go` is memoised with no dependencies on purpose —
   * every screen holds a handler built from it — so it cannot close over
   * the current route, and a ref is what lets it record the screen it is
   * leaving without being rebuilt on every navigation.
   */
  const hereRef = useRef<CustomerRoute>({ name: "home" });
  /* Off the service/describe screens (and not back in the street), the kept street is let go. */
  useEffect(() => {
    if (keptCity && !["service", "describe", "city", "stroll"].includes(route.name)) setKeptCity(null);
    if (route.name === "city" || route.name === "stroll") setKeptCity(null);
  }, [route.name]);
  const tabRef = useRef<CustomerTab>("home");
  const pushHistory = pushBackEntry;

  /*
   * The listener itself now lives in the shell, because it has to outlive
   * this component: switching to the professional side unmounts
   * `CustomerApp`, and with it went the only thing listening for the
   * phone's back button. See `backGesture.ts`.
   *
   * What is registered here is what "back" MEANS on the customer side,
   * which is still this component's business and nobody else's.
   */
  useEffect(
    () =>
      setBackHandler(() => {
        /* The business page opened from the welcome's door goes back to the welcome. */
        if (hereRef.current.name === "advertise" && hereRef.current.fromWelcome && onBackToWelcome) {
          onBackToWelcome();
          return true;
        }
        const previous = backStack.current.pop();
        if (previous) {
          setRoute(previous.route);
          restoreScroll(previous.scroll ?? 0);
          // The tab comes back too. Going back from a screen opened out of
          // the calls list used to land on the home tab, which is a
          // different place from the one you left.
          setTab(previous.tab);
          return true;
        }
        // Nothing left on this side. Away from home, back is home (a live
        // job stays reachable from its capsule); at home, if we arrived from
        // the professional side the gesture takes us back there.
        if (hereRef.current.name !== "home" || tabRef.current !== "home") {
          setRoute({ name: "home" });
          setTab("home");
          pushHistory();
          return true;
        }
        return onBackOut();
      }),
    [onBackOut, onBackToWelcome]
  );

  // Keep the "where we are" refs in step with the state they mirror. This
  // does NOT push anything: `go` does the pushing, because only `go` knows
  // that a move is happening rather than a re-render.
  useEffect(() => {
    hereRef.current = route;
    tabRef.current = tab;
    /*
     * And the same two facts one level up, so a crossing to the
     * professional's side and back lands where it left off rather than
     * on the home screen. See `memory` in the shell.
     */
    if (memory) memory.current = { route, tab, approvedTotalMinor, approvedLines };
  }, [route, tab, approvedTotalMinor, approvedLines, memory]);

  /**
   * WHERE THE CUSTOMER IS, as the transition model understands it.
   *
   * Two facts, and they are not the same fact. The KEY is identity: change
   * it and a transition plays. The SCREEN is position in the journey:
   * compare it with the last one and the direction falls out.
   *
   * What is deliberately left out of the subject matters as much as what is
   * in it. The living map's phase and the tracking stage both change while
   * you are standing still — the world is searching, then it has found
   * someone, then they are driving — and those are one scene changing
   * shape. Feeding them in would cut a continuous journey into four page
   * loads, which is the exact fault the whole thing was built to fix.
   */
  /**
   * The professional behind the shop that was just opened.
   *
   * The sheet showed `matchFixture.professional` whatever you tapped, so
   * being driven into "דוגמה ט׳"'s shop opened a card headed "דוגמה א׳".
   * Caught in a screenshot of the exact journey Amit asked about.
   *
   * The demo candidates have no reputation of their own and that is
   * deliberate (`demoCandidatesFor`): a derived candidate nobody has
   * hired shows "חדש ב-PRO NOW" rather than a borrowed 4.86. So the
   * fixture's numbers are dropped along with its name — taking the name
   * from one person and the rating from another would be worse than the
   * bug being fixed.
   */
  const openVenueProfessional = useMemo(() => {
    const base = matchFixture.professional;
    const index = openVenue?.match(/^demo-cand-(\d+)$/)?.[1];
    if (index === undefined) return base;
    const serviceId = route.name === "living" ? route.serviceId : null;
    if (!serviceId) return base;
    const candidate = demoCandidatesFor(serviceId, 3)[Number(index)];
    if (!candidate) return base;
    return {
      ...base,
      id: candidate.seed,
      displayName: candidate.displayNameHe,
      /*
       * The figure drawn for this trade, instead of a generated cartoon.
       * Amit: *"תשתמש במה שיצרנו."* `worldSources` holds the delivered
       * art; a trade with no figure yet falls back to `Persona`, which is
       * the same honest "we do not have a picture of this person".
       */
      profilePhotoUrl: (() => {
        // `WorldAssetSources` is typed as React Native's source union, and
        // on web every entry is the `{ uri }` object form. Narrowed here
        // rather than cast, so a future entry of another shape falls back
        // to Persona instead of rendering nothing.
        const src = candidate.photoAssetId ? worldSources[candidate.photoAssetId] : undefined;
        return src && typeof src === "object" && "uri" in src && typeof src.uri === "string"
          ? src.uri
          : null;
      })(),
      proNowCompletedJobs: candidate.completedJobs ?? 0,
      proNowRatingAverage: candidate.ratingAverage,
      proNowRatingCount: candidate.ratingCount ?? 0,
      // Somebody else's Google rating is not this person's. Absent is the
      // honest value and the profile is built to show nothing for it.
      externalReputation: null,
    };
  }, [openVenue, route]);

  /**
   * INSIDE THE SHOP, IF THE TRADE HAS AN INSIDE DRAWN.
   *
   * Amit: *"איך עושים שבלחיצה על המקצוען נכנסים לתוך החנות שלו ממש
   * בפנים, שיראו את הדברים הקטנים שעבדנו עליהם?"*
   *
   * The trade comes from the SERVICE the customer asked about, which is
   * what decides whose street this is — not from the venue's id, which
   * is only which of three candidates was pressed. The interior is named
   * by `venueInteriorAssetId`, so the day one lands in the pack under
   * its name, pressing that trade's shop opens into it with no change
   * here. Today the barber is the only trade that has one.
   */
  /**
   * THE PROFESSIONAL THE CUSTOMER IS WATCHING, WITH A FACE.
   *
   * Amit: *"למה התמונה של בעל המקצוע והשם לא מהדמויות שבנינו?"* The
   * fixture carries `profilePhotoUrl: null`, so every screen fell back
   * to a monogram — while eleven trade characters sat in the pack, and
   * the candidate cards two screens earlier were already using them.
   *
   * It is the TRADE's figure, not a likeness of a person: an
   * illustration of a plumber, on a demonstration professional whose
   * name says "(תצוגה)". That is the same claim the candidate cards
   * make and it is a small one. The day a real professional uploads a
   * photo, the server sends it and this is never consulted.
   */
  /*
   * A visit for work priced only once somebody looks: the visit-and-
   * diagnosis fee is the whole in-app charge (Amit, 2026-09-29) — the
   * demo professional's own fee when he set one.
   */
  const diagnosisFee =
    trackedService.price?.priceModel === "VISIT_QUOTE" && !(trackedService.id && pilotServiceById[trackedService.id]?.quoteBeforeDispatch)
      ? (trackedService.id ? proPrices.byService[trackedService.id] : undefined) ?? trackedService.price.visitFeeMinorUnits ?? null
      : null;
  const trackedProfessional = useMemo(() => {
    /* The accepted professional's own record: the demo pro's if it was him, new otherwise. */
    /* The professional who joined today is new: no rating, no jobs (UX audit: he showed 4.9★ · 342). */
    const isJoined = Boolean(ownPro && matchedName && matchedName === ownPro.nameHe.trim());
    const isDemoPro = !isJoined && (!matchedName || matchedName === matchedFirstRef.current);
    const base = matchedName
      ? {
          ...matchFixture.professional,
          displayName: matchedName,
          ...(isDemoPro ? {} : { proNowRatingAverage: null, proNowRatingCount: 0, proNowCompletedJobs: 0 }),
        }
      : matchFixture.professional;
    const dept = trackedService.id ? departmentCodeByServiceId[trackedService.id] : null;
    const id = dept ? WORLD_DISTRICTS[dept]?.characterPortraitAssetId : null;
    const src = id ? art[id] : undefined;
    const uri =
      src && typeof src === "object" && "uri" in src && typeof src.uri === "string" ? src.uri : null;
    return uri ? { ...base, profilePhotoUrl: uri } : base;
  }, [trackedService, art, matchedName, ownPro]);

  /* ---- several orders: park, restore, and how each one reads ---- */
  const JOB_ROUTES = ["living", "tracking", "arrival", "quote"];
  const routeForPro = (pj: JobState | null): CustomerRoute | null =>
    pj === "PRO_ARRIVED" || pj === "DIAGNOSIS" ? { name: "tracking", stage: "diagnosis" }
    : pj === "WAITING_QUOTE_APPROVAL" ? (pendingQuote ? { name: "quote" } : { name: "tracking", stage: "diagnosis" })
    : pj === "IN_PROGRESS" ? { name: "tracking", stage: "working" }
    : pj === "COMPLETION_PENDING" ? { name: "tracking", stage: "done" }
    : null;
  const parkCurrent = (): ParkedOrder | null =>
    focus && hasLiveJob
      ? {
          id: focus.id,
          seq: focus.seq,
          /* The order's own service — at the moment of parking the screen may already show the next one. */
          serviceId: lastRequestedId,
          nameHe: (lastRequestedId ? SERVICE_PAGES[lastRequestedId]?.nameHe : null) ?? trackedService.nameHe,
          mark: ((lastRequestedId ? SERVICE_PAGES[lastRequestedId]?.mark : null) ?? trackedService.mark) as MarkName,
          proNameHe: matchedName ?? trackedProfessional.displayName,
          route: (JOB_ROUTES.includes(route.name) ? route : lastJobRoute.current) ?? { name: "tracking", stage: "enroute" },
          tripStartedAt,
          eta: firstEta.current,
          approvedTotalMinor,
          approvedLines,
          quoteApprovedForOther,
          onSiteHe: jobOnSiteHe,
        }
      : null;
  const restore = (o: ParkedOrder) => {
    setFocus({ id: o.id, seq: o.seq });
    setLastRequestedId(o.serviceId);
    setMatchedName(o.proNameHe);
    setHasLiveJob(true);
    setTripStartedAt(o.tripStartedAt);
    firstEta.current = o.eta;
    setApprovedTotalMinor(o.approvedTotalMinor);
    setApprovedLines(o.approvedLines);
    setQuoteApprovedForOther(o.quoteApprovedForOther);
    setOnSiteOverride(o.onSiteHe);
    /* The order the professional's side serves may have moved on while it was parked. */
    const moved = o.id === proBoundId.current ? routeForPro(proJobState) : null;
    lastJobRoute.current = moved ?? o.route;
    return lastJobRoute.current;
  };
  /* Open an order from the dock, the switcher, the city's strip, the calls list or a toast. */
  const openOrder = (id: string) => {
    if (focus && id === focus.id) {
      go(lastJobRoute.current ?? { name: "tracking", stage: "enroute" });
      return;
    }
    const target = parked.find((o) => o.id === id);
    if (!target) return;
    const cur = parkCurrent();
    setParked((ps) => [...ps.filter((o) => o.id !== id), ...(cur ? [cur] : [])]);
    const r = restore(target);
    /* Switching is a replace on an order's own screens — back never walks through orders. */
    if (JOB_ROUTES.includes(route.name)) advanceTo(r);
    else go(r);
  };
  /* The order in focus ended: the next one waiting comes into focus (no screen change). */
  useEffect(() => {
    if (hasLiveJob || parked.length === 0) return;
    if (["complete", "closed", "living", "matchconfirm", "describe", "service", "quote"].includes(route.name)) return;
    const [next, ...rest] = [...parked].sort((a, b) => a.seq - b.seq);
    setParked(rest);
    restore(next!);
  }, [hasLiveJob, parked.length, route.name]);

  const minutesLeft = (eta: { minutes: number; atMs: number } | null) =>
    eta ? Math.max(0, Math.ceil(eta.minutes - (nowMs - eta.atMs) / 60000)) : null;
  const readOrder = (r: CustomerRoute | null, pj: JobState | null, quoteWaits: boolean, left: number | null) => {
    if (quoteWaits) return { statusHe: "הצעה לאישור", onSite: true, attention: true, driving: false };
    if (pj === "PRO_ARRIVED") return { statusHe: "אצלך", onSite: true, attention: false, driving: false };
    if (pj === "DIAGNOSIS") return { statusHe: "בבדיקה", onSite: true, attention: false, driving: false };
    if (pj === "IN_PROGRESS") return { statusHe: "בעבודה", onSite: true, attention: false, driving: false };
    if (pj === "COMPLETION_PENDING") return { statusHe: "לאישור סיום", onSite: true, attention: true, driving: false };
    if (!r) return { statusHe: "בדרך", onSite: false, attention: false, driving: true };
    if (r.name === "living") return r.phase === "ASSIGNED_ROUTE" ? { statusHe: left !== null && left <= 3 ? "מתקרב" : "בדרך", onSite: false, attention: false, driving: true } : { statusHe: "מחפשים", onSite: false, attention: false, driving: false };
    if (r.name === "arrival") return { statusHe: "ליד הדלת", onSite: true, attention: true, driving: false };
    if (r.name === "quote") return { statusHe: "הצעה לאישור", onSite: true, attention: true, driving: false };
    if (r.name === "tracking") {
      if (r.stage === "assigned" || r.stage === "enroute") return { statusHe: left !== null && left <= 3 ? "מתקרב" : "בדרך", onSite: false, attention: false, driving: true };
      if (r.stage === "arrived") return { statusHe: "אצלך", onSite: true, attention: false, driving: false };
      if (r.stage === "diagnosis") return { statusHe: "בבדיקה", onSite: true, attention: false, driving: false };
      if (r.stage === "working") return { statusHe: "בעבודה", onSite: true, attention: false, driving: false };
      return { statusHe: "לאישור סיום", onSite: true, attention: true, driving: false };
    }
    return { statusHe: "בדרך", onSite: false, attention: false, driving: true };
  };
  const dockOrders: DockOrder[] = (() => {
    const out: DockOrder[] = [];
    const searching = route.name === "living" && route.phase !== "ASSIGNED_ROUTE";
    if (focus && (hasLiveJob || searching)) {
      const r = JOB_ROUTES.includes(route.name) ? route : lastJobRoute.current;
      const bound = focus.id === proBoundId.current;
      const rd = readOrder(r, bound ? proJobState : null, bound && Boolean(pendingQuote), liveEta);
      out.push({
        id: focus.id, seq: focus.seq, serviceNameHe: trackedService.nameHe, proNameHe: hasLiveJob ? matchedName ?? trackedProfessional.displayName : null,
        mark: trackedService.mark, statusHe: rd.statusHe, etaMinutes: rd.driving ? liveEta : null, progress: rd.driving ? liveProgress : null,
        onSite: rd.onSite, attention: rd.attention, focused: true,
      });
    }
    for (const o of parked) {
      const bound = o.id === proBoundId.current;
      const left = minutesLeft(o.eta);
      const rd = readOrder(o.route, bound ? proJobState : null, bound && Boolean(pendingQuote), left);
      out.push({
        id: o.id, seq: o.seq, serviceNameHe: o.nameHe, proNameHe: o.proNameHe, mark: o.mark, statusHe: rd.statusHe,
        etaMinutes: rd.driving ? left : null,
        progress: rd.driving && o.eta && o.eta.minutes > 0 ? Math.min(1, (nowMs - o.eta.atMs) / 60000 / o.eta.minutes) : null,
        onSite: rd.onSite, attention: rd.attention, focused: false,
      });
    }
    return out;
  })();
  /* A parked order getting close (or at the door) says so wherever the person is — the city's promise "נקרא לכם כשהוא מתקרב". */
  const toldClose = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const o of dockOrders) {
      if (o.focused || o.etaMinutes === null || o.etaMinutes > 3 || toldClose.current.has(o.id)) continue;
      toldClose.current.add(o.id);
      setOrderToast({ titleHe: `${(o.proNameHe ?? "המקצוען").split(" ")[0]} מתקרב`, metaHe: `${o.serviceNameHe} · עוד ${o.etaMinutes} דק׳`, orderId: o.id });
    }
  }, [nowMs]);

  /*
   * "הקריאות שלי" holds THIS customer's call while one is live — the service
   * they asked for and the professional who took it — never the sample
   * "תקלת חשמל בסלון" (button audit #23). With no live call there is no live row.
   */
  /*
   * WHAT REALLY HAPPENED, AND NOTHING ELSE (Amit, 2026-10-01: "רוצה אמת").
   * The calls list, the profile's history and the home's recent chips are
   * built from the jobs finished in this visit — not from sample history.
   */
  const [doneJobs, setDoneJobs] = useState<
    { id: string; serviceId: string | null; nameHe: string; mark: MarkName; proNameHe: string; totalMinorUnits: number | null; rating: number | null }[]
  >([]);
  const recordDone = () =>
    setDoneJobs((cur) => [
      { id: `done_${Date.now()}`, serviceId: trackedService.id, nameHe: trackedService.nameHe, mark: trackedService.mark, proNameHe: trackedProfessional.displayName, totalMinorUnits: approvedTotalMinor ?? diagnosisFee ?? null, rating: null },
      ...cur,
    ]);
  const myCalls = useMemo<typeof callsList>(() => {
    const past: typeof callsList = doneJobs.map((d) => ({
      id: d.id,
      serviceNameHe: d.nameHe,
      mark: d.mark,
      stateHe: "הושלם",
      whenHe: "היום",
      live: false,
      proNameHe: d.proNameHe,
      proSeed: null,
      etaMinutes: null,
      totalMinorUnits: d.totalMinorUnits,
      myRating: d.rating,
    }));
    const sample = callsList.find((c) => c.live);
    if (!sample) return past;
    /* One live row per order — the one in focus and every parked one — in order of creation. */
    const live = dockOrders
      .filter((o) => o.proNameHe)
      .sort((a, b) => a.seq - b.seq)
      .map((o) => ({
        ...sample,
        id: o.focused ? "call_live" : o.id,
        serviceNameHe: o.serviceNameHe,
        mark: o.mark,
        proNameHe: o.proNameHe,
        stateHe: o.statusHe,
        etaMinutes: o.etaMinutes,
        attention: o.attention,
        stage: ({ "מחפשים": 0, "בדרך": 0, "מתקרב": 0, "ליד הדלת": 1, "אצלך": 1, "בבדיקה": 2, "הצעה לאישור": 2, "בעבודה": 3, "לאישור סיום": 4 } as Record<string, number>)[o.statusHe] ?? 0,
        forHe: o.focused ? jobOnSiteHe : parked.find((x) => x.id === o.id)?.onSiteHe ?? null,
      }));
    return [...live, ...past];
  }, [dockOrders, doneJobs, jobOnSiteHe, parked]);

  /*
   * WHEN THE VISIT WAS, AND HOW LONG — measured, not written in. The
   * receipt said "היום, 14:20 · 55 דקות" at every hour of the day.
   */
  const visitStartRef = useRef<number | null>(null);
  if (route.name === "tracking" && route.stage !== "assigned" && route.stage !== "enroute" && visitStartRef.current === null) {
    visitStartRef.current = Date.now();
  }
  if (route.name === "home") visitStartRef.current = null;
  const visitWhenHe = (() => {
    const start = visitStartRef.current;
    if (start === null) return "היום";
    const d = new Date(start);
    const mins = Math.max(1, Math.round((Date.now() - start) / 60_000));
    return `היום, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} · ${mins === 1 ? "דקה" : `${mins} דקות`}`;
  })();

  /**
   * WHICH SHOP IS NEXT ALONG THE STREET.
   *
   * The candidates the search found, in the order it found them, wrapped
   * — so "next" from the last one is the first rather than a dead end.
   * Null when there is only one to see.
   */
  const nextVenueId = useMemo(() => {
    const serviceId = route.name === "living" ? route.serviceId : lastRequestedId;
    if (!serviceId || !openVenue) return null;
    const ids = demoCandidatesFor(serviceId, 3).map((_, i) => `demo-cand-${i}`);
    if (ids.length < 2) return null;
    const at = ids.indexOf(openVenue);
    if (at < 0) return null;
    return ids[(at + 1) % ids.length] ?? null;
  }, [route, lastRequestedId, openVenue]);

  const shopInteriorUri = useMemo(() => {
    /*
     * EVERY SCREEN THAT IS ABOUT A SERVICE, not only the map.
     *
     * This read the service off the living map and otherwise fell back
     * to the last REQUESTED one — so on the match screen, which is
     * reached before anything is requested, it had nothing and drew
     * nothing. The trade is on the route wherever the route is about a
     * trade.
     */
    const serviceId =
      route.name === "living" ||
      route.name === "matchconfirm" ||
      route.name === "service" ||
      route.name === "describe"
        ? route.serviceId
        : lastRequestedId;
    const dept = serviceId ? departmentCodeByServiceId[serviceId] : null;
    const id = dept ? WORLD_DISTRICTS[dept]?.venueInteriorAssetId : null;
    if (!id) return null;
    const src = art[id];
    return src && typeof src === "object" && "uri" in src && typeof src.uri === "string"
      ? src.uri
      : null;
  }, [route, lastRequestedId, art]);

  const screenNow = useMemo(() => {
    // Off the home tab, the tab IS the screen: the calls list and the card
    // are siblings of home, not steps into it.
    const name = tab === "home" ? route.name : tab;
    const subject =
      tab !== "home"
        ? null
        : route.name === "category"
          ? route.categoryId
          : route.name === "service" || route.name === "describe" || route.name === "living" || route.name === "matchconfirm"
            ? route.serviceId
            /*
             * THE VISIT'S STAGES ARE SEPARATE SCREENS. The living map's
             * phases are not, and the difference is real rather than
             * taste.
             *
             * Amit: *"המסכים חייבים להתחלף כל לחיצת כפתור, כל פעולה, גם
             * ללקוח וגם למקצוען"*, and about this stretch in particular:
             * *"אין שום תחלופה במסך."*
             *
             * The four living-map phases are ONE scene changing shape
             * while the customer stands still — searching, found,
             * revealed, en route — and cutting them into page loads is
             * the exact fault that scene was built to fix.
             *
             * A tracking stage is the opposite: something happened. He
             * arrived; he finished looking; a price came; you approved
             * it. Each is a different set of facts and a different next
             * move, and arriving at one deserves the same slide as
             * arriving anywhere else. It also means each opens at the
             * top rather than inheriting the last one's scroll.
             */
            : route.name === "tracking"
              ? route.stage
              : null;
    return {
      key: screenKey({ side: "customer", name, subject }),
      screen: { side: "customer" as const, name },
    };
  }, [tab, route]);

  const body = useMemo(() => {
    if (tab === "card") {
      return (
        <CustomerProfileBody
          displayNameHe="עמית"
          seed="cust_demo_1"
          homeAreaLabelHe={availabilitySnapshot.areaLabel}
          /* No card was added — the payment vendor is still an open decision. */
          paymentLabelHe={null}
          /* The call that is really open — this person's, never the sample "תקלת חשמל בסלון". */
          openCalls={hasLiveJob ? myCalls.filter((c) => c.live).map((c) => ({ id: c.id, serviceNameHe: c.serviceNameHe, mark: c.mark, stateHe: c.stateHe, etaMinutes: c.etaMinutes, proSeed: c.proSeed ?? "pro", proNameHe: c.proNameHe ?? "" })) : []}
          history={doneJobs.map((d) => ({ id: d.id, serviceNameHe: d.nameHe, mark: d.mark, metaHe: "היום · הושלם", proSeed: d.id, proNameHe: d.proNameHe, totalMinorUnits: d.totalMinorUnits ?? 0, myRating: d.rating }))}
          lifetimeSpendMinorUnits={doneJobs.length ? doneJobs.reduce((sum, d) => sum + (d.totalMinorUnits ?? 0), 0) : null}
          onOpenCall={() => goTab("calls")}
          /*
           * A review session that remembers what you typed needs an
           * obvious way back to a first-run state, or the second test of
           * the sign-up flow runs with last week's answers in the boxes.
           * Reloads afterwards so every screen re-seeds from nothing.
           */
          onResetReviewSession={() => {
            clearSession();
            if (typeof window !== "undefined") window.location.reload();
          }}
          reviewSavedHe={savedAgoHe(saved, Date.now())}
          onEditAddresses={() => go({ name: "address" })}
          onEditPayment={() => setSheet("payment")}
          onBack={() => back({ name: "home" })}
          width={width}
          height={bodyH}
        />
      );
    }

    if (tab === "menu") {
      /* ----------------------------------------------------------------
         EVERY ROW HERE GOES SOMEWHERE THAT EXISTS.

         `AppMenuBody` drops a row with no handler, so this list is also
         the honest inventory of what the customer side can actually do.
         Settings and "צור קשר" are absent because the support channel is
         an open decision (/CLAUDE.md §4) — a switch that controls nothing
         and a contact row pointing nowhere would make the real rows
         beside them suspect.
         ---------------------------------------------------------------- */
      return (
        <AppMenuBody
          groups={[
            {
              titleHe: "הדגמה",
              items: [
                {
                  id: "demo-pro",
                  labelHe: "הצצה לצד המקצוען",
                  detailHe: "איך הקריאה נראית אצל מי שמקבל אותה",
                  onPress: onSwitch,
                },
                {
                  id: "demo-join",
                  labelHe: "הצטרפות כמקצוען",
                  detailHe: "איך בעל מקצוע חדש מקים חנות ומצטרף",
                  onPress: onStartOnboarding,
                },
              ],
            },
            {
              titleHe: "העבודות שלי",
              items: [
                {
                  id: "calls",
                  labelHe: "הקריאות שלי",
                  detailHe: "היסטוריה, קריאה פעילה ודירוגים",
                  onPress: () => goTab("calls"),
                },
              ],
            },
            {
              titleHe: "החשבון",
              items: [
                {
                  id: "card",
                  labelHe: "החשבון שלי",
                  detailHe: "פרטים, אמצעי תשלום והיסטוריית חיובים",
                  onPress: () => goTab("card"),
                },
                {
                  id: "signout",
                  labelHe: "התנתקות",
                  detailHe: "כניסה חוזרת עם אותו מספר — ישר לעמוד שלך",
                  onPress: onSignOut,
                },
                {
                  id: "address",
                  labelHe: "הכתובות שלי",
                  detailHe: "לאן שולחים את המקצוען",
                  onPress: () => {
                    setTab("home");
                    go({ name: "address" });
                  },
                },
                {
                  id: "avatar",
                  labelHe: "הדמות שלי",
                  detailHe: "מי מטייל ברחוב בזמן ההמתנה",
                  onPress: onChangeAvatar,
                },
              ],
            },
            {
              titleHe: "עזרה",
              items: [
                {
                  id: "whatsapp",
                  labelHe: "ואטסאפ",
                  detailHe: SUPPORT_WHATSAPP_HE,
                  onPress: () => {
                    /*
                     * Handed to whatever WhatsApp the person already
                     * has, the same way an address is handed to their
                     * own maps app — see `maps-handoff`. It chooses no
                     * vendor and needs no integration: it is a link.
                     */
                    void Linking.openURL(whatsappUrl("שלום, אני צריך עזרה ב-PRO NOW"));
                  },
                },
                {
                  id: "email",
                  labelHe: "אימייל",
                  detailHe: SUPPORT_EMAIL,
                  onPress: () => {
                    void Linking.openURL(supportEmailUrl("פנייה מ-PRO NOW"));
                  },
                },
              ],
            },
            {
              titleHe: "העולם",
              items: [
                {
                  id: "stroll",
                  labelHe: "טיול בשכונה",
                  detailHe: "בלי בקשה פתוחה",
                  onPress: strollDoor,
                },
                {
                  id: "advertise",
                  labelHe: "יש לך עסק?",
                  detailHe: "פתיחת חנות בשכונה של PRO NOW",
                  onPress: () => {
                    setTab("home");
                    go({ name: "advertise" });
                  },
                },
              ],
            },
          ]}
          footnoteHe={supportHoursHe()}
          onBack={() => back({ name: "home" })}
          width={width}
          height={bodyH}
        />
      );
    }

    if (tab === "calls") {
      return (
        <CallsListBody
          calls={myCalls}
          onOpen={(id) => {
            const c = myCalls.find((x) => x.id === id);
            if (c?.live) {
              if (id === "call_live") go(lastJobRoute.current ?? { name: "tracking", stage: "enroute" });
              else openOrder(id);
            }
            /* A call still waiting for its rating opens that call's summary, not a generic sheet. */
            else if (c && c.myRating === null) {
              setRateCall({ nameHe: c.serviceNameHe, totalMinorUnits: c.totalMinorUnits, proNameHe: c.proNameHe, whenHe: c.whenHe });
              go({ name: "complete" });
            } else setSheet("payment");
          }}
          onRate={(id) => {
            /* The rating opens for the call that was pressed, not for the last visit (button audit #21). */
            const c = myCalls.find((x) => x.id === id);
            setRateCall(c && !c.live ? { nameHe: c.serviceNameHe, totalMinorUnits: c.totalMinorUnits, proNameHe: c.proNameHe, whenHe: c.whenHe } : null);
            go({ name: "complete" });
          }}
          onBack={() => back({ name: "home" })}
          onApproveQuote={() => go({ name: "quote" })}
          onNewCall={() => {
            setRoute({ name: "home" });
            setTab("home");
          }}
          width={width}
          height={bodyH}
        />
      );
    }

    switch (route.name) {
      case "address":
        return (
          <AddressPickerBody
            saved={myAddresses}
            selectedId={addressId || null}
            liveLocation={live}
            onUseLiveLocation={askLocation}
            onSelect={(id) => { addressPickedSinceSend.current = true; setAddressId(id); setTypedAddress(null); }}
            onConfirm={(r) => {
              addressPickedSinceSend.current = true;
              /* What was typed (or the device's location) becomes one of my addresses, chosen now and offered next time. */
              const typed = r.typedHe.length > 3 ? r.typedHe : !r.addressId && live.status === "ready" ? live.coarseLabelHe : null;
              const who = r.forSomeoneElse && r.recipientNameHe ? r.recipientNameHe.trim() : null;
              let id = r.addressId ?? addressId;
              if (typed) {
                id = `addr_${Date.now()}`;
                const label = who ? `אצל ${who}` : typed.split(/[,·]/)[0]!.trim();
                setMyAddresses((cur) => [...cur, { id, labelHe: label, formattedHe: typed, forSomeoneElseNameHe: who }]);
                setAddressId(id);
              }
              setTypedAddress(null);
              setOnSiteTyped(who ? { forId: id, nameHe: who } : null);
              /* Confirming returns to where the picker was opened, and the picker leaves the history. */
              back({ name: "home" });
            }}
            onBack={() => back({ name: "home" })}
            width={width}
            height={bodyH}
          />
        );
      /*
       * THE STREET. A place of its own, reached from the home screen —
       * see the route above for why it is not inside the dispatch wait
       * any more.
       *
       * Walking up to a shop opens the TRADE, never a person: this
       * screen draws districts and no venues, so it never suggests
       * anybody is behind a door before the server has been asked.
       */
      case "stroll":
        return (
          <StrollBody
            avatar={avatar}
            sources={art}
            geo={geo}
            /* The paid shops stand in this street like any other. */
            sponsors={PREVIEW_SPONSORS}
            /* A shop is a place you walk into — the new room, not a page (Amit, 2026-09-29). */
            onEnterSponsor={(shop) => go({ name: "city", enterShopId: shop.id, from: "stroll" })}
            onOpenDepartment={(department) => {
              const category = categoryForDepartment(department);
              if (category) go({ name: "category", categoryId: category.id });
            }}
            onBack={() => back({ name: "home" })}
            onEnterCity={() => go({ name: "city" })}
            width={width}
            height={bodyH}
          />
        );
      case "category": {
        const category = customerCategoryById(route.categoryId);
        if (!category) return null;
        return (
          <CategoryBody
            backdrop={(warmCity(), <TradeBackdrop dept={category.faceDepartment} />)}
            category={category}
            services={servicesForCategory(category).map((s2) => ({
              id: s2.id,
              nameHe: s2.nameHe,
              descriptionHe: s2.descriptionHe ?? null,
              /*
               * Read from the same snapshot every other number on screen
               * reads, and null when the snapshot did not mention this
               * service — silence rather than a zero that would read as
               * "nobody is free".
               */
              availableNowCount: supply.supplyFor(s2.id).count,
            }))}
            worldSources={art}
            /*
             * "מה צריך?" OR "את מי צריך?" — decided from the catalogue,
             * not typed into the screen.
             *
             * Amit: *"מתלבט איתך אם צריך פה את התפקידים גם של האנשי
             * מקצוע ולא רק בעיות."* On a category whose every service is
             * a PERSON — a barber, a makeup artist, a trainer — there is
             * no fault to describe, and the thing the customer has in
             * mind is a role. The catalogue already says which those are
             * (`matchingMode: "PERSON_FIT"`, the same field that makes
             * them show who is coming before you commit), so the question
             * is derived from it and cannot drift out of agreement with
             * the way the match is actually made.
             */
            asksForPerson={categoryAsksForPerson(
              servicesForCategory(category)
                .map((s2) => pilotServiceById[s2.id])
                .filter((s2): s2 is NonNullable<typeof s2> => Boolean(s2))
            )}
            onSelectService={(id) => { if (SERVICE_PAGES[id]) go({ name: "service", serviceId: id }); }}
            /*
             * TYPED, NOT TAPPED.
             *
             * Run through the SAME matcher the home screen uses, so the
             * two cannot disagree about what a sentence means — but scoped
             * to this category, because the customer has already told us
             * the area and a match outside it is the app ignoring what
             * they said.
             *
             * No match is a real outcome and is handled rather than
             * swallowed: the text goes back to the home screen's field,
             * where the full catalogue can answer it and the suggestions
             * appear. That is a better answer than a confident wrong
             * service, and it never leaves the customer holding a sentence
             * with nowhere to put it.
             */
            onDescribe={(textHe) => {
              const inCategory = new Set(servicesForCategory(category).map((s2) => s2.id));
              const best = matchServicesByText(
                textHe,
                catalogMatchRules.filter((r) => inCategory.has(r.serviceId))
              )[0];
              if (best) {
                setFaultText(textHe);
                setDraftFor(best.serviceId);
                draftSent.current = false;
                go({ name: "service", serviceId: best.serviceId });
                return;
              }
              setHomeQuery(textHe);
              go({ name: "home" });
            }}
            onBack={() => back({ name: "home" })}
            width={width}
            height={bodyH}
          />
        );
      }
      case "service": {
        const page = SERVICE_PAGES[route.serviceId]!;
        /*
         * THE COUNT HAS TO COME FROM THE SAME SNAPSHOT THE HOME SCREEN USED.
         *
         * It did not, and the consequence was severe rather than cosmetic:
         * the page's CTA switches on `availableNowCount > 0`, so with the
         * count hard-null EVERY service page showed "בדיקה מחדש" instead of
         * "בקשת בעל מקצוע עכשיו" — and the entire describe-the-fault flow,
         * the voice note, the photos, the matcher, all of it, was
         * unreachable from the app. The screens existed; no tap led to them.
         *
         * Reading the same snapshot here means the service page and the tile
         * that opened it can never disagree, and they expire together.
         */
        const reading = supply.supplyFor(route.serviceId);
        return (
          <ServiceDetailBody
            forSomeoneElseHe={onSiteNameHe ? onSiteNameHe.replace(/ \(תצוגה\)$/, "") : null}
            ongoingHe={
              dockOrders.filter((o) => o.proNameHe).length === 1
                ? (() => {
                    const first = (dockOrders.find((o) => o.proNameHe)!.proNameHe ?? "").split(" ")[0] ?? "";
                    return `${first} ${FEMALE_NAMES_HE.has(first) ? "ממשיכה" : "ממשיך"} בדרך אליך · זו הזמנה נוספת`;
                  })()
                : dockOrders.filter((o) => o.proNameHe).length > 1
                  ? `${dockOrders.filter((o) => o.proNameHe).length} הזמנות ממשיכות כרגיל · זו הזמנה נוספת`
                  : null
            }
            {...page}
            /* No problem chips before calling — words, a recording, a photo (Amit, 2026-09-29). */
            symptomsHe={[]}
            priceListFromMinorUnits={lowestListed(route.serviceId)}
            availableNowCount={reading.count}
            width={width}
            height={bodyH}
            onBack={() => back({ name: "home" })}
            onRequestNow={(symptomsHe, noteHe) => {
              // What they typed on the service page IS the description.
              // Carrying it means the describe screen opens with their own
              // words already in it, rather than asking the same question
              // one screen later and throwing the first answer away.
              if (noteHe) setFaultText((cur) => (cur ? cur : noteHe));
              go({ name: "describe", serviceId: route.serviceId, symptomsHe });
            }}
            onRecheck={() => go({ name: "home" })}
          />
        );
      }
      case "chat":
        return (
          <ChatBody
            side="customer"
            counterpartNameHe={trackedProfessional.displayName}
            counterpartSeed={matchFixture.professional.id}
            jobTitleHe={trackedService.nameHe}
            jobOpen
            messages={chat}
            quickRepliesHe={customerQuickReplies}
            onSend={(t) => setChat((c) => [...c, { id: `m${c.length}`, from: "customer", textHe: t, atHe: nowHHMM() }])}
            onCall={() => setSheet("call")}
            onBack={() => back({ name: "tracking", stage: "enroute" })}
            width={width}
            height={bodyH}
          />
        );
      case "describe": {
        const page = SERVICE_PAGES[route.serviceId]!;
        return (
          <DescribeFaultBody
            serviceNameHe={page.nameHe}
            mark={page.mark}
            symptomsHe={route.symptomsHe}
            photoPromptHe={photoPromptFor(route.serviceId)}
            voiceExampleHe={pilotServiceById[route.serviceId]?.symptomsHe[0] ?? null}
            /* No problem questions before calling (Amit, 2026-09-29): words, a recording, a photo. */
            priceList={priceListFor(route.serviceId).map((r) => ({ id: r.id, nameHe: r.nameHe, amountHe: formatMoney(money(r.amountMinorUnits, "ILS")) }))}
            pickedIds={pickedIdsFor(route.serviceId)}
            onTogglePick={(id) => togglePick(route.serviceId, id)}
            destination={
              pilotServiceById[route.serviceId]?.needsDestination
                ? {
                    valueHe: destinationHe,
                    onChange: setDestinationHe,
                    placeholderHe: route.serviceId === "svc-towing" ? "למשל: מוסך בבני ברק, או הבית" : route.serviceId === "svc-courier" ? "למשל: רחוב הרצל 10, תל אביב" : "למשל: רחוב הרצל 10, קומה 2",
                  }
                : null
            }
            livePriceHe={(() => {
              const def = pilotServiceById[route.serviceId];
              switch (def ? pricingKindOf(def) : null) {
                case "QUOTE_FIRST": return "המקצוען יסתכל על התמונות והפרטים וישלח מחיר · הוא יוצא רק אחרי שתאשרו";
                case "VISIT": {
                  const t = visitTermsHe({ id: route.serviceId });
                  /* For someone else, the repair is quoted to whoever ordered (Amit, 2026-10-01). */
                  if (onSiteNameHe) return `באפליקציה: ${t.feeHe}, ואחרי האבחון הצעת מחיר אליך לאישור · בבית לא משלמים כלום`;
                  return `באפליקציה משלמים רק ${t.feeHe} · את ${t.workHe} סוגרים ישירות מול המקצוען`;
                }
                case "LIST": {
                  const o = orderFor(route.serviceId, null);
                  return o ? `${o.namesHe} · ${formatMoney(money(o.amountMinorUnits, "ILS"))} לפי המחירון לדוגמה` : "בחרו מה להזמין מהמחירון";
                }
                case "HOURLY": return "לפי שעה · המחיר לשעה של המקצוען מוצג לפני שתאשרו";
                case "DISTANCE": return "לפי מרחק · המחיר מוצג לפני שתאשרו";
                default: return null;
              }
            })()}
            detailsNoteHe={(() => {
              const def = pilotServiceById[route.serviceId];
              switch (def ? pricingKindOf(def) : null) {
                case "QUOTE_FIRST": return "לפי התיאור והתמונות המקצוען קובע את המחיר — ככל שתפרטו, המחיר מדויק יותר.";
                case "VISIT": return "התיאור, ההקלטה והתמונות עוזרים למקצוען להגיע מוכן. את דמי הביקור שלו תראו לפני שתאשרו.";
                case "LIST": return "כל מקצוען קובע את המחירון שלו — ותראו את המחיר שלו לפני שתאשרו.";
                default: return "התיאור, ההקלטה והתמונות עוזרים למקצוען להגיע מוכן.";
              }
            })()}
            text={faultText}
            onChangeText={setFaultText}
            photos={capture.photos}
            onAddPhoto={capture.addPhoto}
            onAddFromLibrary={capture.addFromLibrary}
            onRemovePhoto={capture.removePhoto}
            voice={capture.voice}
            recording={capture.recording}
            recordSeconds={capture.recordSeconds}
            canRecord={capture.canRecord}
            recordBlockedHe={capture.recordBlockedHe}
            onStartRecord={capture.startRecord}
            onStopRecord={capture.stopRecord}
            onDeleteVoice={capture.deleteVoice}
            onBack={() => back({ name: "service", serviceId: route.serviceId })}
            onSend={() => {
              /* No address yet (no sample one any more): ask for it first; back returns here with the text kept. */
              if (!hasAddress) {
                go({ name: "address" });
                return;
              }
              /* A second order while one is live: the first is parked, keeps its clock and stays in the dock. */
              if (hasLiveJob) {
                const cur = parkCurrent();
                if (cur) setParked((ps) => [...ps, cur]);
                setHasLiveJob(false);
                setMatchedName(null);
                setApprovedTotalMinor(null);
                setApprovedLines(null);
              }
              setOnSiteOverride(undefined);
              orderSeq.current = Math.max(orderSeq.current, focus?.seq ?? 0, ...parked.map((o) => o.seq)) + 1;
              setFocus({ id: `ord_${orderSeq.current}`, seq: orderSeq.current });
              proBoundId.current = `ord_${orderSeq.current}`;
              /*
               * Everything the customer gave, packed once and handed over.
               * `buildIntakeBrief` is the same pure function the offer card
               * renders from, so what the professional sees cannot drift
               * from what was actually answered — and an unanswered
               * question is dropped here rather than travelling as an empty
               * row.
               */
              const def = pilotServiceById[route.serviceId];
              onSendRequest({
                serviceId: route.serviceId,
                serviceNameHe: page.nameHe,
                serviceCode: def?.code ?? route.serviceId,
                markName: page.mark,
                priceModel: page.price.priceModel,
                intakeBrief: buildIntakeBrief(
                  pilotIntakeByService[route.serviceId],
                  intakeAnswers
                ),
                items: priceListFor(route.serviceId).filter((r) => pickedIdsFor(route.serviceId).includes(r.id)),
                quoteFirst: Boolean(pilotServiceById[route.serviceId]?.quoteBeforeDispatch),
                destinationHe: pilotServiceById[route.serviceId]?.needsDestination ? destinationHe.trim() || null : null,
                onSiteNameHe,
                addressHe: chosen.formattedHe,
                textHe: faultText,
                photos: capture.photos.length,
                voiceSeconds: capture.voice?.seconds ?? null,
                areaLabelHe: addressLabel,
                typicalMinutes: def?.typicalMinutes ?? null,
                createdAtMs: Date.now(),
              });
              setLastRequestedId(route.serviceId);
              setQuoteApprovedForOther(false);
              draftSent.current = true;
              addressPickedSinceSend.current = false;
              setOtherQuote(null);
              setPick(0);
              go({ name: "living", serviceId: route.serviceId, phase: "SEARCHING" });
            }}
            width={width}
            height={bodyH}
          />
        );
      }
      case "living": {
        /*
         * THE DEMO CANDIDATES, AND WHY THEY ARE SHAPED LIKE THIS.
         *
         * `CandidatePresence` has `lat?: never` and `lng?: never`, so these
         * fixtures physically cannot carry a position — which is the point.
         * The prototype shows three bubbles because three candidates exist
         * in the fixture, not to make the ring look better; `foundHeadlineHe`
         * counts the same array, so the number on screen and the number of
         * people can never disagree.
         */
        /* The name follows the drawn figure standing in that shop, so a
           card never says "מאיה" over a man in overalls. */
        /* His own shop answers first when he does this and is on shift. */
        const his = Boolean(ownPro && ownPro.serviceIds.includes(route.serviceId));
        const shopOf = (i: number) => {
          if (his && i === 0) return ownShopId(ownPro!);
          const d = departmentCodeByServiceId[route.serviceId] ?? "";
          const l = DEPT_SHOPS[d] ?? [DEPT_SHOP[d] ?? "home"];
          return l[i % l.length]!;
        };

        const namesFor = (i: number) =>
          his && i === 0
            ? ownPro!.nameHe.trim()
            : (FEMALE_FIGURE.has(shopOf(i)) ? [...FEMALE_NAMES_HE] : ["יוסי", "איתי", "רון"])[i % 3]!;
        const cands: CandidatePresence[] = demoCandidatesFor(route.serviceId, 3).map((c, i) => ({
          candidateId: `demo-cand-${i}`,
          displayNameHe: `${namesFor(i)}`,
          professionHe: c.headlineHe,
          /* The trade's own drawn professional, so the card has a face. */
          photoUri: his && i === 0 ? ownPro!.photoUri ?? onboardShopFor(route.serviceId).characterUri : `./world/character_${shopOf(i)}_icon.webp`,
          /*
           * Carried through from the fixture rather than invented here. A
           * derived candidate has no rating and no jobs, so `matchFactsHe`
           * returns nothing and the sheet shows "חדש ב-PRO NOW" — which is
           * true of a professional nobody has hired yet.
           */
          /*
           * The first candidate IS the demo professional — the one whose
           * profile, tracking card and own app the demo then shows — so he
           * carries that record here too. The card said "חדש ב-PRO NOW"
           * about a man whose profile says 342 jobs. The others stay new.
           */
          /* He joined today: no rating, no jobs — "חדש ב-PRO NOW", which is true. */
          ratingAverage: his && i === 0 ? null : i === 0 ? matchFixture.professional.proNowRatingAverage : c.ratingAverage,
          ratingCount: his && i === 0 ? 0 : i === 0 ? matchFixture.professional.proNowRatingCount : c.ratingCount,
          completedJobs: his && i === 0 ? 0 : i === 0 ? matchFixture.professional.proNowCompletedJobs : c.completedJobs,
          state:
            route.phase === "SEARCHING"
              ? ("CHECKING" as const)
              : i === pick % 3 && (route.phase === "MATCH_REVEAL" || route.phase === "ASSIGNED_ROUTE")
                ? ("CHOSEN" as const)
                : ("ELIGIBLE" as const),
        })).slice(0, his ? 1 : 3);
        /* When the professional who joined is the one on shift for this, he is
           the only one found — no invented second and third (UX audit). */

        const page = SERVICE_PAGES[route.serviceId];
        /* He said "free in XX": the wait is part of when he arrives. */
        const waitMin = proAvailableAtMs !== null ? Math.max(0, Math.ceil((proAvailableAtMs - Date.now()) / 60_000)) : 0;
        const travelMin = matchFixture.eta ? Math.round(matchFixture.eta.etaSeconds / 60) : null;
        const etaMin = travelMin === null ? null : travelMin + waitMin;
        const arrival = etaMin === null ? null : new Date(Date.now() + etaMin * 60_000);
        const arrivalClockHe =
          arrival === null
            ? null
            : `${String(arrival.getHours()).padStart(2, "0")}:${String(arrival.getMinutes()).padStart(2, "0")}`;

        const living: LivingMapState = {
          phase: route.phase,
          theme: themeForDepartment(departmentCodeByServiceId[route.serviceId] ?? "HOME_URGENT"),
          adapter: DEMO_WORLD,
          /*
           * NOBODY IS NAMED DURING THE SEARCH.
           *
           * This used to show two CHECKING bubbles here, which was a
           * reasonable guess before Amit said what the search is:
           * *"השלב של החיפוש יהיה שלב שהרדאר שלנו עובר בלי כפתור לחיצות,
           * עם הדמות בין הרחובות ומחפש איש מקצוע."* No buttons, nobody
           * named — the camera touring the shops with the figure walking
           * it IS the search being shown.
           *
           * And the app cannot do otherwise even if it wanted to:
           * `GET /v1/jobs/:id` returns a status, not a roster, so
           * `scenePhaseForJob` never produces a named candidate before
           * assignment. Two floating names over the city was the gallery
           * showing a search that cannot happen — the same two-worlds
           * problem as the home screen, on the screen Amit reviews most.
           */
          candidates: route.phase === "SEARCHING" ? [] : cands,
          /*
           * No journey on the demo world. `livingMapViolations` refuses a
           * real position over invented streets, and that refusal is the
           * whole reason the invented city is allowed to exist.
           */
          journey: null,
        };

        return (
          <View style={{ width, height: bodyH }}>
          <SearchingBody
            /* The city we built behind the search, not the old plate — the
               street itself, the same for every trade. */
            backdrop={route.phase === "ASSIGNED_ROUTE" ? (
              <RouteCity serviceId={route.serviceId} etaSeconds={(etaMin ?? 14) * 60} startedAtMs={tripStartedAt} moving proFirstNameHe={(cands[pick % cands.length]?.displayNameHe ?? "") || null} />
            ) : (
              <SearchCity
                dept={departmentCodeByServiceId[route.serviceId] ?? null}
                found={route.phase !== "SEARCHING"}
                pick={pick}
                proName={his && pick % 3 === 0 ? (ownPro!.shopNameHe || ownPro!.nameHe) : (cands[pick % cands.length]?.displayNameHe ?? "")}
                own={his && pick % 3 === 0 ? { ...ownShopDesign(ownPro!), figureUri: ownPro!.photoUri ?? onboardShopFor(route.serviceId).characterUri.replace("_icon.", "_world.") } : null}
              />
            )}
            onOpenRealMap={followPro}
            geo={route.phase === "ASSIGNED_ROUTE" ? null : geo}
            liveEta={
              route.phase === "ASSIGNED_ROUTE" && etaMin !== null
                ? (() => {
                    const first = cands[pick % cands.length]?.displayNameHe ?? "";
                    const start = tripStartedAt ?? Date.now();
                    return {
                      proFirstNameHe: first,
                      female: FEMALE_NAMES_HE.has(first),
                      proPhotoUri: `./world/character_${shopOf(pick)}_icon.webp`,
                      serviceNameHe: onSiteNameHe ? `${page?.nameHe ?? ""} · אצל ${onSiteNameHe.replace(/ \(תצוגה\)$/, "")}` : page?.nameHe ?? "",
                      arrivalAtMs: start + etaMin * 60_000,
                      startedAtMs: start,
                    };
                  })()
                : null
            }
            onStroll={() => strollDoor?.()}
            strollFrames={Array.from({ length: 8 }, (_, i) => `./world/avatar_amit_walk_0${i + 1}.webp`)}
            waitDetailsHe={(() => {
              if (route.phase !== "ASSIGNED_ROUTE" || !page) return [];
              const def = pilotServiceById[route.serviceId];
              const k = def ? pricingKindOf(def) : null;
              const ils = (n: number | null | undefined) => (n ? formatMoney(money(n, "ILS")) : null);
              const own = pick % cands.length === 0 ? proPrices.byService[route.serviceId] ?? null : null;
              const order = k === "LIST" ? orderFor(route.serviceId, own) : null;
              const priceHe =
                k === "LIST" ? (order ? `${order.namesHe} · ${ils(order.amountMinorUnits)}` : null)
                : k === "QUOTE_FIRST" ? (preQuote?.serviceId === route.serviceId ? `${ils(preQuote.amount)} · כפי שאישרתם` : null)
                : k === "VISIT" ? (() => { const f = ils(own ?? page.price?.visitFeeMinorUnits); return f ? `${f} · ${visitTermsHe({ id: route.serviceId }).feeHe}` : null; })()
                : k === "HOURLY" ? (() => { const r = ils(own ?? page.price?.hourlyRateMinorUnits); return r ? `${r} לשעה` : null; })()
                : k === "DISTANCE" ? (() => { const f = ils(deliveryFare(page.price ?? {})); return f ? `${f} · לפי מרחק` : null; })()
                : null;
              return [
                { labelHe: "העבודה", valueHe: page.nameHe },
                /* When he arrives is in the card above — said once. */
                ...(priceHe ? [{ labelHe: "המחיר", valueHe: priceHe }] : []),
                ...(destinationHe.trim() ? [{ labelHe: "לאן", valueHe: destinationHe.trim() }] : []),
                { labelHe: "הכתובת", valueHe: addressLabel },
              ];
            })()}
            strollAvatarUri={(() => {
              const c = avatarById(avatar);
              return c ? ((art?.[c.portraitAssetId] as { uri?: string } | undefined)?.uri ?? null) : null;
            })()}
            strollShopUris={["hair", "pets", "home", "lust", "auto", "care", "vet", "build"].map((id) => `./world/m/shop_${id}.webp`)}

            worldSources={art}
            /*
             * THE SHOPS IN THE STREET THAT PAID TO BE THERE.
             *
             * Amit: *"לא הגיוני שאני צריך לגלול עד לפה בשביל למצוא את
             * זה. למה אין מבנה של לאסט במפה??"* The row at the foot of
             * the tracking sheet stays — it is the readable, scrollable
             * copy — but this is where a shop is actually FOUND, by
             * walking past it.
             */
            sponsors={PREVIEW_SPONSORS}
            onEnterSponsor={(shop) => go({ name: "city", enterShopId: shop.id, from: "enroute" })}
            /*
             * AND EVERY OTHER DOOR IN THE STREET.
             *
             * Amit: *"שגם זה יהיה לחיץ ויפתח את החנות והכרטיס שלו."*
             * The card that opens is about the trade — `TradeCard`, and
             * the note there about why it must never read as a profile
             * — and its one action is the catalogue for that trade,
             * which is the honest thing a building without a person
             * behind it can offer.
             */
            onOpenTrade={(department) => {
              const category = categoryForDepartment(department);
              if (category) go({ name: "category", categoryId: category.id });
            }}
            departmentCode={departmentCodeByServiceId[route.serviceId]}
            serviceNameHe={page?.nameHe ?? ""}
            living={living}
            etaMinutes={route.phase === "SEARCHING" ? null : etaMin}
            arrivalClockHe={route.phase === "SEARCHING" ? null : arrivalClockHe}
            /*
             * The fee on the person, once there is a person. Each
             * professional sets their own (Amit, 2026-09-26); the preview
             * has one figure per service, shown as this one's.
             */
            availableInHe={waitMin > 0 && route.phase !== "SEARCHING" ? `פנוי בעוד ${waitMin} דק׳` : null}
            onSiteNameHe={route.phase === "ASSIGNED_ROUTE" ? jobOnSiteHe : null}
            onOpenOnSite={() => go({ name: "onsite", stage: "enroute" })}
            /*
             * THIS PROFESSIONAL'S PRICE, in one sentence. The demo pro (the
             * first candidate) shows what he set on his own pricing screen,
             * with his night/Shabbat surcharge when it applies; the others
             * show the catalogue's example figure.
             */
            visitFeeHe={(() => {
              if (route.phase === "SEARCHING" || !page?.price) return null;
              const cand = cands[pick % cands.length];
              const first = cand?.displayNameHe ?? "";
              const isDemoPro = pick % cands.length === 0;
              const pm = page.price.priceModel;
              /* Priced before dispatch: the line is his price, or that it is on its way. */
              if (pilotServiceById[route.serviceId]?.quoteBeforeDispatch) {
                const q =
                  isDemoPro && preQuote?.serviceId === route.serviceId
                    ? preQuote
                    : !isDemoPro && otherQuote?.pick === pick
                      ? { amount: otherQuote.amount, notesHe: "" }
                      : null;
                return q
                  ? `ההצעה של ${first}: ${formatMoney(money(q.amount, "ILS"))}${q.notesHe ? ` · ${q.notesHe}` : ""} · מאושר בכרטיס ועובר ל${first} אחרי שתאשרו שהעבודה הושלמה`
                  : FEMALE_FIGURE.has(shopOf(pick))
                    ? `${first} מסתכלת על התמונות והפרטים ושולחת מחיר…`
                    : `${first} מסתכל על התמונות והפרטים ושולח מחיר…`;
              }
              const own = isDemoPro ? proPrices.byService[route.serviceId] ?? null : null;
              /* A price-list job is priced by what was ordered, at this professional's prices. */
              const chosen = pm === "FIXED" ? orderFor(route.serviceId, own) : null;
              const base =
                chosen?.amountMinorUnits ??
                own ??
                (pm === "VISIT_QUOTE" ? page.price.visitFeeMinorUnits : pm === "FIXED" ? page.price.fixedTotalMinorUnits : pm === "HOURLY" ? page.price.hourlyRateMinorUnits : pm === "DISTANCE_TIME" ? deliveryFare(page.price) : null) ??
                null;
              if (base === null || base === undefined) return null;
              const { amountMinorUnits, surchargePercent } = withAfterHours(base, isDemoPro ? proPrices.afterHoursPct : null, new Date());
              const amt = formatMoney(money(amountMinorUnits, "ILS"));
              const extra = surchargePercent > 0 ? ` · כולל תוספת לילה/שבת ${surchargePercent}%` : "";
              return pm === "FIXED"
                ? `המחיר של ${first}${chosen ? ` · ${chosen.namesHe}` : ""}: ${amt}${extra} · מאושר בכרטיס ועובר ל${first} אחרי שתאשרו שהעבודה הושלמה`
                : pm === "HOURLY"
                  ? `התעריף של ${first}: ${amt} לשעה${extra}`
                  : pm === "DISTANCE_TIME"
                    ? (() => {
                        const fare = deliveryFare(page.price);
                        return fare ? `המחיר של ${first}: ${formatMoney(money(fare, "ILS"))} · לפי כ־${PREVIEW_DELIVERY_KM} ק״מ עד היעד` : null;
                      })()
                  : pm === "VISIT_QUOTE"
                    ? jobOnSiteHe
                      ? `${visitTermsHe({ id: route.serviceId }).feeHe} של ${first}: ${amt}${extra} · אחרי האבחון הצעת מחיר אליך לאישור`
                      : `${visitTermsHe({ id: route.serviceId }).feeHe} של ${first}: ${amt}${extra} · זה כל מה שמשולם באפליקציה`
                    : null;
            })()}
            checkingEligibility={route.phase !== "SEARCHING"}
            discoveries={discoveries}
            onFound={(id) => setDiscoveries((d) => discover(d, id))}
            onPlayAction={(action) => {
              /*
               * EVERY ROUTE OUT OF THE WAIT IS A REAL DESTINATION.
               *
               * That was the note, and half of it was untrue: only two of
               * the drawer's four actions went anywhere. "לשחק עוד" and
               * "בינתיים" did nothing at all — the exact failure this
               * comment was written about, sitting under the comment.
               *
               * They go to the street. Amit: *"לקוח בזמן ההמתנה למקצוען
               * יכול להיכנס לחנויות."* The wait IS the street; walking it
               * is the thing there is to do while somebody drives to you,
               * and it is the only place the sponsored shops mean
               * anything.
               */
              if (action === "JOB_DETAILS") go({ name: "tracking", stage: "enroute" });
              if (action === "FOLLOW_PRO") followPro();
              if (action === "PLAY_MORE" || action === "WHILE_YOU_WAIT") strollDoor?.();
            }}
            acceptLabelHe={
              pilotServiceById[route.serviceId]?.quoteBeforeDispatch
                ? (pick % cands.length === 0 ? preQuote?.serviceId === route.serviceId : otherQuote?.pick === pick)
                  ? `אישור ההצעה — ${(cands[pick % cands.length]?.displayNameHe ?? "")} יוצא`
                  : "מחכים להצעת המחיר…"
                : undefined
            }
            acceptDisabled={
              Boolean(pilotServiceById[route.serviceId]?.quoteBeforeDispatch) &&
              !(pick % cands.length === 0 ? preQuote?.serviceId === route.serviceId : otherQuote?.pick === pick)
            }
            onAccept={() => {
              const chosen = cands[pick % cands.length]?.displayNameHe ?? null;
              matchedFirstRef.current = cands[0]?.displayNameHe ?? null;
              setMatchedName(chosen);
              onProName?.(chosen);
              /* Approving the price is what assigns him (quote-first services). */
              if (pilotServiceById[route.serviceId]?.quoteBeforeDispatch) {
                const amount = pick % cands.length === 0 ? preQuote?.amount : otherQuote?.pick === pick ? otherQuote.amount : undefined;
                if (amount !== undefined) onApprovePreQuote?.(amount);
              }
              setOnTheWayAt(Date.now());
              setTripStartedAt(Date.now());
              startOrderClock();
              if (parked.length > 0) setOrderToast({ titleHe: parked.length === 1 ? "שתי הזמנות פעילות" : `${parked.length + 1} הזמנות פעילות`, metaHe: `${parked.map((o) => `${(o.proNameHe ?? "").split(" ")[0]} (${o.nameHe})`).join(" · ")} — ממשיכים כרגיל`, orderId: null });
              setHasLiveJob(true);
              advanceTo({ name: "living", serviceId: route.serviceId, phase: "ASSIGNED_ROUTE" }, true);
            }}
            /*
             * Turned down: the camera lifts and goes into the next shop —
             * for every service. A person-fit service used to swap to a
             * separate confirmation card instead, which read as choosing the
             * person rather than moving on (a tester, on "הראה לי התאמה אחרת").
             */
            onAnother={his ? undefined : () => setPick((n) => n + 1)}
            onSafety={() => setSheet("safety")}
            onOpenProfile={(id) => setOpenVenue(id)}
            /*
             * SKIP TAKES YOU TO THE NEXT SHOP, not just off this card.
             * Amit: *"ואם אני עושה דלג אז חוזר לרחוב ועובר לחנות הבאה."*
             * The scene runs its own journey for it — see `enterVenueId`.
             */
            enterVenueId={enterVenue}
            onEnterHandled={() => setEnterVenue(null)}
            profileOpen={openVenue !== null}
            /*
             * WHO IS WALKING. Whatever they picked at the start, or null
             * if they skipped it — in which case the street still works,
             * there is simply nobody in it and the camera goes back to
             * looking at places rather than following a person.
             */
            avatar={avatar}
            /*
             * THE WAY OUT, AND WHAT IT COSTS.
             *
             * Amit found this screen with no back control at all, which was
             * the worst place to have none: the request is out, nobody has
             * answered, and the only thing to do was wait.
             *
             * Before an assignment, going back means the request stops — so
             * it is labelled "ביטול הבקשה" rather than drawn as a chevron.
             * A bare arrow would have let someone end their own call for
             * help with a gesture they made without reading. Once a
             * professional is en route the label disappears, because then
             * leaving is only leaving: the job keeps running and the calls
             * list still holds it.
             */
            onBack={() =>
              /* Waiting for him: back is home, the job keeps running (#7). Before that it is a
                 cancel, and the cancelled match leaves the history so back cannot revive it (#5). */
              route.phase === "ASSIGNED_ROUTE"
                ? back({ name: "home" })
                : back({ name: "service", serviceId: route.serviceId })
            }
            backLabelHe={route.phase === "ASSIGNED_ROUTE" ? null : "ביטול הבקשה"}
            width={width}
            height={bodyH}
          />
          {onTheWayAt ? (
            <OnTheWay
              homeUri={(() => {
                const c = avatarById(avatar);
                return c ? ((art?.[c.portraitAssetId] as { uri?: string } | undefined)?.uri ?? null) : null;
              })()}
              shop={shopOf(pick)}
              vehicle={fleetTradeFor(route.serviceId)}
              proName={namesFor(pick)}
              etaMinutes={Math.round((matchFixture.eta?.etaSeconds ?? 840) / 60)}
              onSiteNameHe={jobOnSiteHe}
              own={ownPro && namesFor(pick) === ownPro.nameHe.trim() ? ownPro : null}
              onDone={() => setOnTheWayAt(null)}
            />
          ) : null}
          </View>
        );
      }
      case "matchconfirm": {
        const page = SERVICE_PAGES[route.serviceId]!;
        const c = personFitCandidates[route.index % personFitCandidates.length]!;
        const etaMin = matchFixture.eta ? Math.round(matchFixture.eta.etaSeconds / 60) : null;
        /*
         * The arrival clock, computed from the ETA rather than stored. "14
         * דקות" is a duration; "אצלך בערך ב-22:48" is a plan, and a person
         * deciding whether to let someone into their home is making a plan.
         */
        const arrival = etaMin === null ? null : new Date(Date.now() + etaMin * 60_000);
        // No ETA means no arrival time — not a guessed one.
        const arrivalClockHe =
          arrival === null
            ? null
            : `${String(arrival.getHours()).padStart(2, "0")}:${String(
                arrival.getMinutes()
              ).padStart(2, "0")}`;
        return (
          <MatchConfirmBody
            serviceNameHe={page.nameHe}
            displayNameHe={c.displayNameHe}
            headlineHe={c.headlineHe}
            /*
             * No photo, and no illustrated stand-in either. A face on a
             * proposed professional — drawn or photographed — asserts that
             * this specific person exists and is free right now. The
             * monogram occupies exactly the space a real approved photo
             * will, so nothing about this screen changes on the day one
             * arrives.
             */
            photoUri={null}
            portfolio={c.portfolio}
            /*
             * Their place, from inside it. Derived from the service being
             * asked about — which on this screen is also the trade — so
             * the day an interior lands under its name it appears here
             * with no change. Today the barber is the only one drawn.
             */
            shopInteriorUri={shopInteriorUri}
            reasons={matchReasons({
              specialtiesHe: c.specialtiesHe,
              // What the customer actually said — their typed sentence and
              // whichever symptoms they tapped. Nothing else counts as
              // having been asked for.
              askedForHe: [
                faultText.toLowerCase(),
                ...intakeAnswers.flatMap((a) => a.optionIds ?? []),
                ...(page.symptomsHe ?? []),
              ].filter(Boolean),
              onlineNow: true,
              etaMinutes: etaMin,
              completedJobs: c.completedJobs,
              ratingAverage: c.ratingAverage,
              ratingCount: c.ratingCount,
              serviceNameHe: page.nameHe,
            })}
            presence="ONLINE"
            presenceLabelHe="זמינה עכשיו"
            ratingAverage={c.ratingAverage}
            ratingCount={c.ratingCount}
            completedJobs={c.completedJobs}
            credentialsHe={page.requiredCredentialsHe}
            eta={matchFixture.eta}
            arrivalClockHe={arrivalClockHe}
            price={page.price}
            /*
             * Only PERSON_FIT offers another. For a blocked drain the
             * second-fastest plumber is not a different product, and
             * offering him invites a comparison the customer has no basis
             * to make while water is on the floor.
             */
            hasAlternative={
              isPersonFit(route.serviceId) && route.index < personFitCandidates.length - 1
            }
            onAccept={() => {
              setTripStartedAt(Date.now());
              startOrderClock();
              setHasLiveJob(true);
              advanceTo({ name: "tracking", stage: "assigned" }, true);
            }}
            onAnother={() => {
              /* Back onto the street, into the next shop — the same move as the card's. */
              setPick((n) => n + 1);
              go({ name: "living", serviceId: route.serviceId, phase: "MATCH_REVEAL" });
            }}
            onBack={() => back({ name: "service", serviceId: route.serviceId })}
            width={width}
            height={bodyH}
          />
        );
      }
      /* ----------------------------------------------------------------
         STANDING INSIDE A SPONSOR'S SHOP.

         Reached from the street of shops on the tracking screen. The
         "site" link is deliberately NOT wired to window.open here: the
         gallery is a developer tool, and silently navigating a review
         session away to a commercial site is a surprise. It records the
         handoff instead, which is what the shipping app will hand to
         the platform's own browser.
         ---------------------------------------------------------------- */
      case "sponsor": {
        const shop = PREVIEW_SPONSORS.find((sp) => sp.id === route.shopId);
        if (!shop) return null;
        return (
          <View style={{ width, height: bodyH }}>
            <SponsorShopBody
              shop={shop}
              interiorUri={
                shop.interiorAssetId
                  ? (art?.[shop.interiorAssetId] as { uri?: string } | undefined)?.uri ?? null
                  : null
              }
              onOpenSite={(picked) => setSponsorHandoff(picked.siteUrl)}
              onBack={() => {
                setSponsorHandoff(null);
                back(route.from === "stroll" ? { name: "stroll" } : { name: "tracking", stage: route.from });
              }}
              width={width}
              height={bodyH}
            />
            {sponsorHandoff ? <PreviewNote textHe={`הועבר לדפדפן: ${sponsorHandoff}`} /> : null}
          </View>
        );
      }
      case "advertise":
        return (
          <View style={{ width, height: bodyH }}>
            <AdvertiseBody
              exampleVenueUri={
                (art?.["sponsor_lust_venue"] as { uri?: string } | undefined)?.uri ?? null
              }
              exampleBrandName={PREVIEW_SPONSORS[0]?.brandName ?? null}
              onSubmit={(lead) => setAdvertiseLead(lead.businessNameHe)}
              onBack={() => {
                setAdvertiseLead(null);
                if (route.fromWelcome && onBackToWelcome) onBackToWelcome();
                else back({ name: "home" });
              }}
              width={width}
              height={bodyH}
            />
            {advertiseLead ? (
              <PreviewNote textHe={`נרשם בגלריה בלבד: ${advertiseLead} — שום דבר לא נשלח לשרת`} />
            ) : null}
          </View>
        );
      case "tracking":
        return (
          <TrackingBody
            /* Our street behind the visit; the clock opens the real map. */
            backdrop={<CityHero />}
            /* The follow screen is the real map only — no toggle back to the city. */
            onOpenRealMap={undefined}
            /* The trade's own figure, in the work scene while he is in the home. */
            proFigureUri={`./world/character_${DEPT_SHOP[departmentCodeByServiceId[trackedService.id ?? ""] ?? ""] ?? "home"}_icon.webp`}
            geo={geo}
            status={
              route.stage === "assigned"
                ? "PRO_ASSIGNED"
                : route.stage === "enroute"
                  ? "PRO_EN_ROUTE"
                  : route.stage === "arrived"
                    ? "PRO_ARRIVED"
                    : route.stage === "diagnosis"
                      ? "DIAGNOSIS"
                      : route.stage === "done"
                        ? "COMPLETION_PENDING"
                        : "IN_PROGRESS"
            }
            serviceNameHe={trackedService.nameHe}
            professional={trackedProfessional}
            eta={matchFixture.eta}
            /*
             * The street of paid shops. `SponsorRow` shows itself only
             * while the customer is waiting — pass it at every stage
             * and watch it disappear at "arrived", which is the point.
             */
            sponsors={PREVIEW_SPONSORS}
            sponsorVenueUriFor={(shop) =>
              (art?.[shop.venueAssetId] as { uri?: string } | undefined)?.uri ?? null
            }
            onEnterSponsor={(shop) =>
              go({ name: "city", enterShopId: shop.id, from: route.stage === "assigned" ? "assigned" : "enroute" })
            }
            /*
             * The arrival clock is DERIVED from the ETA the server gave,
             * not stored beside it. Two fields carrying the same fact drift,
             * and the one that drifts is always the one the customer
             * remembers.
             */
            arrivalClockHe={(() => {
              // No ETA means NO arrival time. ArrivalPromise renders a
              // sentence about why rather than a guessed clock (§3).
              if (!matchFixture.eta) return null;
              const mins = Math.round(matchFixture.eta.etaSeconds / 60);
              const at = new Date(Date.now() + mins * 60_000);
              return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
            })()}
            onGetHelp={() => setSheet("safety")}
            onSiteNameHe={jobOnSiteHe}
            onSiteStatusHe={
              jobOnSiteHe
                ? route.stage === "assigned" || route.stage === "enroute"
                  ? `${jobOnSiteHe} קיבל/ה הודעה עם פרטי המקצוען וקוד לדלת`
                  : route.stage === "arrived"
                    ? `${trackedProfessional.displayName.split(" ")[0]} בדלת של ${jobOnSiteHe} — הקוד נבדק שם`
                    : route.stage === "done"
                      ? `העבודה אצל ${jobOnSiteHe} הסתיימה — נשאר רק האישור שלך`
                      : `${trackedProfessional.displayName.split(" ")[0]} אצל ${jobOnSiteHe}. המחיר והאישור אצלך.`
                : null
            }
            onOpenOnSiteView={() => go({ name: "onsite", stage: route.stage })}
            /*
             * THE TAP THAT ENDS THE JOB.
             *
             * It goes to the receipt, which is where the money is
             * accounted for. In the product this is
             * `POST /v1/jobs/:id/confirm-completion` — the server
             * settles, authorises, captures and writes the ledger, and
             * none of it is reported by the client.
             */
            /*
             * The most consequential tap in the product: the
             * professional's claim becomes the customer's agreement and
             * the money moves. It goes UP as well as forward now, so the
             * other side's screen can stop waiting.
             */
            onConfirmCompletion={() => {
              onConfirmCompletion?.();
              if (hasLiveJob) recordDone();
              setHasLiveJob(false);
              setRateCall(null);
              advanceTo({ name: "complete" });
            }}
            /*
             * The world, and who is coming through it. `departmentCode`
             * decides which street they come down and what they are
             * driving; the ETA the fixture carries is the one the trip
             * started with, so progress is a fraction of a real number
             * rather than a timer this screen invented.
             */
            worldSources={art}
            departmentCode={trackedService.id ? departmentCodeByServiceId[trackedService.id] : null}
            etaSecondsAtAssignment={matchFixture.eta?.etaSeconds ?? null}
            /*
             * WHAT COMES DOWN THE LANE IS THE TRADE'S, NOT A DEFAULT.
             *
             * This was pinned to the courier's scooter, so a customer whose
             * car would not start watched a delivery moped drive towards
             * their house. The trade decides — a tow truck for the garage, a
             * van for a move, the handler on foot for the dog — and the
             * scooter stays the honest fallback for everyone who really does
             * arrive on two wheels.
             */
            vehicleAssetId={(() => {
              const dep = (trackedService.id ? departmentCodeByServiceId[trackedService.id] : null) ?? "HOME_URGENT";
              /* Home repairs have no van of their own drawn yet; the home
                 services van is theirs rather than a figure on foot. */
              return dep === "HOME_URGENT" ? "pn_electric_side" : travelAssetFor(dep);
            })()}
            onCancelJob={() => go({ name: "home" })}
            /*
             * Leaving, not cancelling. `onCancelJob` above is the one that
             * ends the job; this only returns to the app while the
             * professional stays on the way — the distinction the customer
             * has to be able to feel before tapping.
             */
            onBack={() => back({ name: "home" })}
            /*
             * THE FACTS, NOT THE SENTENCE.
             *
             * This was one fixed string — "דמי ביקור ₪179 · הצעת מחיר
             * תישלח לאישורך" — repeated through the whole visit. Amit:
             * *"איך הצעת מחיר תשלח אם הוא כבר סיים את העבודה? זה אמור
             * להיות לפני."* The screen now derives the line from the
             * job's state (`visitMoneyLineHe`), and these are the only
             * numbers it is allowed to use.
             */
            professionalFemale={FEMALE_NAMES_HE.has(trackedProfessional.displayName.split(" ")[0] ?? "")}
            money={{
              forSomeoneElse: Boolean(jobOnSiteHe),
              terms: trackedService.id ? visitTermsHe({ id: trackedService.id }) : undefined,
              kind: trackedService.id && pilotServiceById[trackedService.id] ? pricingKindOf(pilotServiceById[trackedService.id]!) : undefined,
              hourlyRateHe:
                trackedService.price?.priceModel === "HOURLY" && trackedService.price.hourlyRateMinorUnits
                  ? formatMoney(money((trackedService.id ? proPrices.byService[trackedService.id] : null) ?? trackedService.price.hourlyRateMinorUnits, "ILS"))
                  : null,
              /* The demo professional's own fee when he set one — the same figure the receipt charges. */
              visitFeeHe: diagnosisFee !== null ? formatMoney(money(diagnosisFee, "ILS")) : null,
              fixedTotalHe:
                /* Quote-first: the price approved before he set off is the price. */
                trackedService.id && pilotServiceById[trackedService.id]?.quoteBeforeDispatch && approvedTotalMinor !== null
                  ? formatMoney(money(approvedTotalMinor, "ILS"))
                  : trackedService.price?.priceModel === "FIXED" && trackedService.price.fixedTotalMinorUnits
                  ? formatMoney(
                      money(
                        (trackedService.id
                          ? orderFor(trackedService.id, proPrices.byService[trackedService.id] ?? null)?.amountMinorUnits
                          : null) ??
                          trackedService.price.fixedTotalMinorUnits,
                        "ILS"
                      )
                    )
                  : null,
              pendingTotalHe: writtenQuote ? formatMoney(money(writtenQuote.totalMinorUnits, "ILS")) : null,
              approvedTotalHe:
                approvedTotalMinor !== null ? formatMoney(money(approvedTotalMinor, "ILS")) : null,
            }}
            onCall={() => setSheet("call")}
            onMessage={() => go({ name: "chat" })}
            onSafety={() => setSheet("safety")}
            width={width}
            height={bodyH}
          />
        );
      case "onsite": {
        const clock = (() => {
          if (!matchFixture.eta) return null;
          const at = new Date(Date.now() + Math.round(matchFixture.eta.etaSeconds / 60) * 60_000);
          return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
        })();
        const st = route.stage;
        return (
          <OnSiteBody
            ordererNameHe="עמית"
            onSiteNameHe={jobOnSiteHe ?? "סבא"}
            serviceNameHe={trackedService.nameHe}
            proNameHe={trackedProfessional.displayName}
            proPhotoUri={`./world/character_${DEPT_SHOP[departmentCodeByServiceId[trackedService.id ?? ""] ?? ""] ?? "home"}_icon.webp`}
            verifiedHe={[...new Set(["זהות מאומתת", ...((trackedService.id ? SERVICE_PAGES[trackedService.id]?.requiredCredentialsHe : null) ?? [])])].slice(0, 3)}
            stage={st === "assigned" || st === "enroute" ? "coming" : st === "arrived" ? "at_door" : st === "done" ? "done" : "inside"}
            arrivalClockHe={clock}
            minutesAway={matchFixture.eta ? Math.round(matchFixture.eta.etaSeconds / 60) : null}
            codeHe={DOOR_CODE}
            vehicleHe={ownPro && matchedName === ownPro.nameHe.trim() ? null : "יונדאי i20 לבנה"}
            /* Updates by itself the moment the quote is sent and approved — nobody has to call grandpa. */
            priceState={pendingQuote ? "sent" : quoteApprovedForOther ? "approved" : null}
            onCallOrderer={() => setSheet("call")}
            onCallPro={() => setSheet("call")}
            onHelp={() => setSheet("safety")}
            onBack={() => back({ name: "tracking", stage: st })}
            width={width}
            height={height}
          />
        );
      }
      case "arrival":
        return (
          <ArrivalVerifyBody
            displayNameHe={trackedProfessional.displayName}
            /* No invented face here either — the monogram holds the space. */
            photoUri={null}
            headlineHe={`${trackedService.nameHe} · ${matchFixture.professional.proNowCompletedJobs} עבודות דרך PRO NOW`}
            /*
             * In production this comes from the server with the assignment.
             * A code the client can derive is a code an impostor's client
             * can derive, so it is never computed here — the prototype
             * carries a fixed one and says nothing that implies otherwise.
             */
            codeHe={DOOR_CODE}
            onSiteNameHe={jobOnSiteHe}
            vehicleHe={ownPro && matchedName === ownPro.nameHe.trim() ? null : "יונדאי i20 לבנה"}
            plateTailHe="47"
            etaMinutes={2}
            onCall={() => setSheet("call")}
            onMessage={() => go({ name: "chat" })}
            onShare={() => setSheet("safety")}
            onReport={() => setSheet("safety")}
            onBack={() => back({ name: "tracking", stage: "arrived" })}
            width={width}
            height={bodyH}
          />
        );
      case "quote":
        /*
         * THE QUOTE IS NOT A PAGE. It rises out of the dark tracking screen
         * as a light sheet, with the live job still visible above it.
         *
         * ChatGPT: "אל תנווט ב־cut ממסך שחור למסך לבן… זה טקס, לא theme
         * switch." A cut to full ivory reads as a bug or as a different
         * app; a sheet that always arrives the same way teaches light a
         * meaning the product can rely on — stop and read before you agree
         * to money. It also keeps the professional on screen, which is the
         * truth: he is still in your kitchen while you read his price.
         */
        return (
          <View style={{ width, height: bodyH }}>
            <TrackingBody
              backdrop={<CityHero />}
              onOpenRealMap={onToggleRealMap}
              proFigureUri={`./world/character_${DEPT_SHOP[departmentCodeByServiceId[trackedService.id ?? ""] ?? ""] ?? "home"}_icon.webp`}
              geo={geo}
              // He is in the room and diagnosing; the price is what he
              // came out of the diagnosis with.
              status="WAITING_QUOTE_APPROVAL"
              money={{ forSomeoneElse: Boolean(jobOnSiteHe), terms: trackedService.id ? visitTermsHe({ id: trackedService.id }) : undefined }}
              serviceNameHe={trackedService.nameHe}
              professional={trackedProfessional}
              eta={matchFixture.eta}
              /*
               * THE SAME STREET AS THE SCREEN UNDERNEATH.
               *
               * This one was left without the art, so reading a price
               * cut from the lit city to the grey "the map will go here"
               * placeholder and back again — on the one screen where the
               * professional is supposed to still be visibly in your
               * kitchen while you read what he wants for the work.
               */
              worldSources={art}
              width={width}
              height={bodyH}
            />
            <FocusSheet
              visible
              /* Nearly the whole screen: the photos, his voice, the lines and the sum all fit (Amit). */
              heightFraction={0.94}
              titleHe={`${trackedProfessional.displayName} שלח הצעת מחיר`}
              onDismiss={() => advanceTo({ name: "tracking", stage: "diagnosis" })}
              width={width}
              height={bodyH}
            >
              <QuoteApprovalBody
                includesVisitFee={trackedService.price?.priceModel === "VISIT_QUOTE"}
                /*
                 * THE QUOTE THE PROFESSIONAL ACTUALLY WROTE.
                 *
                 * This rendered `quoteFixture` whatever had happened —
                 * lines written by nobody, for a job nobody had looked
                 * at — so the customer approved one thing while the
                 * professional had composed another, or nothing at all.
                 * Amit: *"שהכל יהיה שקוף מול הלקוח שיופיע לו גם."*
                 *
                 * The fixture stays as the fallback for a deep link
                 * that lands here without a visit behind it, which is
                 * how this screen is usually reviewed.
                 */
                quote={writtenQuote ?? quoteFixture}
                /*
                 * Demonstration data — see `priceContextFixture`. In the
                 * product the server decides this from approved quotes
                 * and stays silent until there are enough of them, which
                 * on a marketplace that has not opened means silent.
                 */
                priceContext={priceContextFixture}
                serviceNameHe={trackedService.nameHe}
                professionalDisplayName={trackedProfessional.displayName}
                onApprove={() => {
                  /*
                   * Remembered so the tracking panel can say it back
                   * while the work runs: "אישרתם ₪320 · זה הסכום
                   * לעבודה הזו". The pending quote is cleared by the
                   * shell on this same tap, so the number has to be
                   * kept here or the screen behind it loses it.
                   */
                  {
                    const approved = writtenQuote ?? quoteFixture;
                    setApprovedTotalMinor(approved.totalMinorUnits);
                    /*
                     * The lines as APPROVED, kept whole. The pending
                     * quote is cleared on this same tap, so this is the
                     * last moment the customer's side can see what it
                     * agreed to — and the closing screen's account of
                     * the work is built from exactly this and from
                     * nothing the app made up.
                     */
                    setApprovedLines(
                      approved.lineItems.map((li) => ({
                        id: li.id,
                        descriptionHe: li.description,
                        totalMinorUnits: Math.round(li.quantity * li.unitPriceMinorUnits),
                      }))
                    );
                  }
                  onQuoteDecision("APPROVED");
                  if (jobOnSiteHe) setQuoteApprovedForOther(true);
                  // An approved price is the professional's cue to start.
                  advanceTo({ name: "tracking", stage: "working" });
                }}
                onDecline={() => {
                  onQuoteDecision("DECLINED");
                  // Declined, he is still in the room and still diagnosing.
                  advanceTo({ name: "tracking", stage: "diagnosis" });
                }}
                onAskQuestion={() => go({ name: "chat" })}
                /* What he saw at the door, so it can be decided from far away (Amit, 2026-10-01). */
                photos={pendingQuote?.draft?.media?.photos ?? []}
                voiceNote={
                  pendingQuote?.draft?.media?.voice
                    ? { seconds: pendingQuote.draft.media.voice.seconds, playing: quoteVoicePlaying, onTogglePlay: () => toggleQuoteVoice(pendingQuote.draft!.media!.voice!.uri) }
                    : null
                }
                forOnSiteHe={jobOnSiteHe ? jobOnSiteHe.replace(/ \(תצוגה\)$/, "") : null}
                /*
                 * Back is not a decline. The sheet closes, the quote stays
                 * pending, and the professional is told nothing — because a
                 * navigation control must never carry a financial answer.
                 */
                onBack={() => advanceTo({ name: "tracking", stage: "diagnosis" })}
                width={width}
                height={Math.round(bodyH * 0.94) - 56}
              />
            </FocusSheet>
          </View>
        );
      case "complete":
        return (
          <JobCompleteBody
            titleHe={(() => {
              const def = trackedService.id ? pilotServiceById[trackedService.id] : undefined;
              const k = def ? pricingKindOf(def) : null;
              return k === "VISIT" ? "הביקור הסתיים" : k === "DISTANCE" ? "המשלוח נמסר" : "העבודה הושלמה";
            })()}
            serviceNameHe={rateCall?.nameHe ?? trackedService.nameHe}
            mark={trackedService.mark}
            professionalDisplayName={rateCall?.proNameHe ?? trackedProfessional.displayName}
            professionalPhotoUrl={rateCall ? null : trackedProfessional.profilePhotoUrl ?? null}
            whenHe={rateCall?.whenHe ?? visitWhenHe}
            /*
             * The receipt is the quote that was approved on this visit —
             * the same lines and the same total the customer agreed to a
             * minute ago. The fixture only speaks when no visit is behind
             * the screen (a deep link reviewing the layout).
             */
            receiptLines={
              rateCall
                ? rateCall.totalMinorUnits !== null
                  ? [{ id: "past", labelHe: rateCall.nameHe, amountMinorUnits: rateCall.totalMinorUnits }]
                  : []
                : approvedLines
                ? approvedLines.map((l) => ({ id: l.id, labelHe: l.descriptionHe, amountMinorUnits: l.totalMinorUnits }))
                : diagnosisFee !== null
                  ? [{ id: "visit", labelHe: `${visitTermsHe({ id: trackedService.id ?? "" }).feeHe} · את ${visitTermsHe({ id: trackedService.id ?? "" }).workHe} סוגרים ישירות מול המקצוען`, amountMinorUnits: diagnosisFee }]
                  : /* A real visit never falls back to the layout fixture's plumbing lines. */
                    trackedService.id
                    ? []
                    : receiptLines
            }
            totalChargedMinorUnits={rateCall ? rateCall.totalMinorUnits ?? 0 : approvedTotalMinor ?? diagnosisFee ?? (trackedService.id ? 0 : 44500)}
            paymentMethodLabelHe={null}
            // The rating travels with the navigation, so the closing
            // screen can speak about what they actually left rather than
            // thanking somebody for a review they may have skipped.
            onSubmitReview={(rating) => {
              setDoneJobs((cur) => {
                if (cur.length === 0) return cur;
                const target = rateCall ? cur.find((d) => d.nameHe === rateCall.nameHe && d.rating === null) : cur[0];
                return target ? cur.map((d) => (d === target ? { ...d, rating } : d)) : cur;
              });
              advanceTo({ name: "closed", ratingGiven: rating });
            }}
            onDownloadInvoice={() => setSheet("payment")}
            onBack={() => {
              setRateCall(null);
              back({ name: "home" });
            }}
            width={width}
            height={bodyH}
          />
        );
      case "closed":
        return (
          <JobClosedBody
            serviceNameHe={rateCall?.nameHe ?? trackedService.nameHe}
            mark={trackedService.mark}
            professionalDisplayName={rateCall?.proNameHe ?? trackedProfessional.displayName}
            whenHe={rateCall?.whenHe ?? visitWhenHe}
            /*
             * THE AMOUNT THAT WAS APPROVED, not a number on this screen.
             *
             * This was hard-coded to 44500 — so a customer who had just
             * agreed to ₪320 was thanked for ₪445. The fixture stays as
             * the fallback for a deep link that lands here with no visit
             * behind it, which is how this screen is usually reviewed.
             */
            totalChargedMinorUnits={rateCall ? rateCall.totalMinorUnits ?? 0 : approvedTotalMinor ?? diagnosisFee ?? 44500}
            /*
             * And what the money bought, in the professional's own
             * words — the lines of the quote that was approved. Null
             * when nothing was approved in this session, in which case
             * the screen says nothing rather than describing work it did
             * not see.
             */
            workLines={rateCall ? undefined : approvedLines ?? undefined}
            /*
             * False, and it is the default for a reason: no payment
             * provider has been chosen (/CLAUDE.md §4), so the money has
             * not moved. The amount is real — it is the quote that was
             * approved — and only the tense is in question. A caller who
             * forgets this understates, which is recoverable.
             */
            paymentCaptured={false}
            ratingGiven={route.ratingGiven}
            onDone={() => {
              setRateCall(null);
              advanceTo({ name: "home" }, true);
            }}
            onOpenReceipt={() => setSheet("payment")}
            onGetHelp={() => setSheet("safety")}
            /*
             * The street still needs somebody to walk it, so without an
             * avatar this door picks one first and the card says so. It
             * used to simply vanish — which meant the invitation Amit
             * asked for reached only the minority who did not skip the
             * picker.
             */
            onStroll={strollDoor}
            strollNeedsAvatar={avatar === null}
            width={width}
            height={bodyH}
          />
        );
      default:
        return (
          <CustomerHomeBody
            onOverlay={openOverlay}
            /* Our street behind the top of the page, not the old plate. */
            backdrop={<CityHero />}
            /* Same door, same rule — see the closing screen above. */
            onStroll={strollDoor}
            /* The other doorway on this page, for a business owner. */
            onAdvertise={() => go({ name: "advertise" })}
            strollNeedsAvatar={avatar === null}
            /*
             * FROM THE SAME CLOCK AS THE LIGHT OVER THE STREET.
             *
             * This said "ערב טוב" at every hour, which was survivable
             * while the world was painted at one hour too. It stops
             * being survivable now that the sky above the words is at
             * the viewer's own time: a bright midday street under "ערב
             * טוב" is the app contradicting itself on one screen.
             */
            greetingHe={greetingAt(new Date())}
            addressLabelHe={addressLabel}
            onChangeAddress={() => go({ name: "address" })}
            services={HOME_SERVICES}
            recent={doneJobs.filter((d) => d.serviceId).slice(0, 2).map((d) => ({ id: d.serviceId!, nameHe: d.nameHe, mark: d.mark, metaHe: "היום · הושלם" }))}
            availability={snapshot}
            nowMs={Date.now()}
            matchRules={catalogMatchRules}
            injectedText={dictated}
            photoMatch={photoMatch}
            recognising={recognising}
            understand={understandHome}
            /*
             * The microphone and the camera are REAL here — the same
             * `useCapture` the describe screen uses, so what the customer
             * records on the home screen is what travels with the request.
             * Wiring a second, fake set of buttons on this screen would have
             * been easier and would have been a lie.
             */
            height={bodyH}
            seedQueryHe={homeQuery}
            capture={{
              photos: capture.photos.length,
              voiceSeconds: capture.voice?.seconds ?? null,
              recording: capture.recording,
              recordSeconds: capture.recordSeconds,
              canRecord: capture.canRecord,
              recordBlockedHe: capture.recordBlockedHe,
              // Only when embedded: in a top-level tab there is nothing to open.
              onOpenInOwnTab: capture.framed ? capture.openInOwnTab : undefined,
              onStartRecord: capture.startRecord,
              onStopRecord: capture.stopRecord,
              onDeleteVoice: capture.deleteVoice,
              onAddPhoto: capture.addPhoto,
              // The gallery, which used to be wired to the camera.
              onAddFromLibrary: capture.addFromLibrary,
              onClearPhotos: () => capture.photos.forEach((p) => capture.removePhoto(p.id)),
            }}
            width={width}
            worldSources={art}
            onSelectService={(id) => { if (SERVICE_PAGES[id]) go({ name: "service", serviceId: id }); }}
            /*
             * A category does not open a category page. It takes the
             * customer into that part of the world, which is Amit's own
             * instruction: *"לחיצה לא פותחת דף קטגוריה משעמם — היא מכניסה
             * את המשתמש לתוך אותו עולם."* The prototype travels there and
             * then asks the short question that turns a trade into a
             * request.
             */
            onSelectCategory={(id) => go({ name: "category", categoryId: id })}
            /*
             * One true sentence, counted from the same snapshot every
             * other number on this screen reads. See `liveAreaLineHe` for
             * why it counts services rather than people.
             */
            liveLineHe={liveAreaLineHe({
              fresh: supply.fresh,
              areaLabel: supply.areaLabel,
              services: HOME_SERVICES.map((s2) => ({
                hasSupply: (supply.supplyFor(s2.id).count ?? 0) > 0,
              })),
            })}
          />
        );
    }
  }, [tab, route, elapsed, width, bodyH, go, goTab, snapshot, supply, addressId, live, askLocation, addressLabel, capture, faultText, intakeAnswers, answerIntake, trackedService, onSendRequest, pendingQuote, writtenQuote, quoteApprovedForOther, quoteVoicePlaying, toggleQuoteVoice, rateCall, myCalls, onSiteNameHe, jobOnSiteHe, proJobState, myAddresses, hasAddress, doneJobs]);

  /*
   * ONLY WHERE THERE IS A STREET TO WALK DOWN.
   *
   * This floated over every screen in the app, including a service page
   * about parts that were not supplied in advance — where a button
   * marked "הליכה" is nonsense. Amit, on the artifact: *"למה יש פה כפתור
   * הליכה מה קשור."*
   *
   * A demo control that appears where the thing it demonstrates does not
   * exist is worse than no demo control: it reads as a feature of the
   * screen it is standing on. So it lives here, where the route is
   * known, rather than above the whole app where it was not.
   */
  /*
   * THE BORROWED-FIGURE TOGGLE IS GONE.
   *
   * Amit: *"הדמות מוצגת — כפתור מיותר, גם ככה היא מוצגת."*
   *
   * It was written when the street had nobody on it and a stand-in
   * figure was something you might or might not switch on. His own
   * character has walked this street for a while now, so the control
   * offered a choice between the thing you can already see and
   * nothing — which is not a choice, it is a switch that looks broken
   * whichever way it is set.
   *
   * The figure itself is untouched and always drawn; only the toggle
   * over it is deleted.
   */
  const walkingDemo = null;

  /*
   * THE GROUND SWITCH.
   *
   * Under the walking control rather than beside it: they are both
   * gallery-only, they are both about the same screen, and two pills on
   * one row at 390 points wide would have collided with the header's own
   * trailing control the first time the label grew a word.
   */
  const groundSwitch =
    tab === "home" && GROUND_SCREENS.includes(route.name) &&
    /* "Follow the professional" means nothing before there is one. */
    !(route.name === "living" && route.phase !== "ASSIGNED_ROUTE") ? (
      /*
       * Once he is at the door there is nobody to follow — Amit: *"אין
       * סיבה לעקוב, הוא כבר מטפל בבעיה."* From then on the same place
       * offers a walk round our city while the work is done.
       */
      route.name === "tracking" && route.stage !== "assigned" && route.stage !== "enroute" ? (
        <Pressable
          onPress={() => {
            if (realMap) onToggleRealMap();
            strollDoor?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="סיור בעיר שלנו"
          style={styles.groundSwitch}
        >
          <Text style={styles.standInText}>✦ סיור בעיר שלנו</Text>
        </Pressable>
      ) : /* On the way, following him IS the screen — no switch (Amit, 2026-09-29). */ null
    ) : null;

  /*
   * THE CITY TAKES THE WHOLE SCREEN, HEADER AND ALL.
   *
   * Everything else in this app is a BODY under a header and over a
   * utility row. The city is not a body: it is a camera in a place, and
   * a chrome bar across the top of it is the single clearest way to say
   * "this is a widget in an app" about something whose entire purpose
   * is to stop feeling like one. It returns before the frame is built,
   * rather than being slotted into it.
   */
  /*
   * ---------------------------------------------------------------
   * WHAT EACH TRADE'S SHOP HAS TO SELL
   * ---------------------------------------------------------------
   * Amit: *"חייב שיפתחו אפשרויות."*
   *
   * A trade's shop in the city used to be a beautiful room with
   * nothing to do in it. This is the catalogue, grouped the way the
   * street is: every service whose department matches the shop, with
   * the live availability beside it.
   *
   * The count comes from the same snapshot every other number on
   * screen reads, and is NULL wherever the snapshot did not mention
   * that service. The city renders a null as silence rather than as a
   * zero, because a zero reads as "nobody is free" and that is a
   * statement about supply nobody made (/CLAUDE.md §3).
   *
   * Built here rather than in the renderer because the catalogue, the
   * snapshot and the route out all live on this side. The city knows
   * how to show a list; it must not decide what is in it.
   */
  const cityTrades = useMemo(() => {
    const byDept: Record<string, string[]> = {};
    for (const id of Object.keys(SERVICE_PAGES)) {
      const d = departmentCodeByServiceId[id];
      if (!d) continue;
      (byDept[d] ??= []).push(id);
    }
    const out: Record<
      string,
      { nameHe: string; services: Array<{ id: string; nameHe: string; descriptionHe?: string | null; availableNowCount: number | null }> }
    > = {};
    for (const [shopId, deptCode] of Object.entries(CITY_SHOP_DEPARTMENTS)) {
      const ids = byDept[deptCode] ?? [];
      if (ids.length === 0) continue;
      out[shopId] = {
        nameHe: WORLD_DISTRICTS[deptCode as DepartmentCode]?.labelHe ?? "",
        services: ids.map((id) => ({
          id,
          nameHe: SERVICE_PAGES[id]!.nameHe,
          descriptionHe: SERVICE_PAGES[id]!.descriptionHe ?? null,
          availableNowCount: supply.supplyFor(id).count,
        })),
      };
    }
    return out;
  }, [supply]);

  /*
   * ---------------------------------------------------------------
   * THE STREET *IS* THE CITY. THERE IS NO SWITCHING TO IT.
   * ---------------------------------------------------------------
   * Amit: *"וגם להשתמש במפה הווירטואלית מהרגע הראשון, ולא לעבור למפה
   * הווירטואלית אחר כך."*
   *
   * He is right and the reason is not convenience. A chip that says
   * "the 3D city" announces a FEATURE — something extra, off to one
   * side, that you might go and look at. Opening the street and being
   * in it says "this is the place". Those are different products.
   *
   * So the stroll route returns the city, full bleed, before the
   * app's own chrome is built. It is not a body under a header: it is
   * a camera in a place, and a bar across the top of it is the single
   * clearest way to say "widget in an app" about the one screen whose
   * whole purpose is to stop feeling like one.
   *
   * `StrollBody` — the painted world — is untouched and still shipped
   * from `packages/ui`, because react-native cannot host WebGL
   * without `expo-gl` and the two phone apps still render it. This
   * swap is the preview's alone, which is what Amit asked for when he
   * chose it: *"שלא יסכן חס וחלילה."*
   */
  /* Grandpa's phone, on its own: no header or menu of ours over it (Amit: "גם לא מובן"). */
  if (route.name === "onsite") return <View style={{ width, height }}>{body}</View>;

  /*
   * THE CITY STAYS WHERE YOU LEFT IT (Amit, 2026-10-01: a service opened from
   * inside the pet shop, then back — "זה עשה כאילו טוען את כל העיר מחדש").
   * The service and describe screens opened from the street are drawn over a
   * paused city instead of replacing it, so back lands inside the same shop.
   */
  const cityVisible = route.name === "city" || route.name === "stroll";
  const cityRoute: CustomerRoute | null = cityVisible ? route : keptCity && (route.name === "service" || route.name === "describe") ? keptCity : null;
  const cityLayer = cityRoute ? (
    <View
      key="cityLayer"
      pointerEvents={cityVisible ? "auto" : "none"}
      /* Hidden behind a service screen: not read out either (QA). */
      accessibilityElementsHidden={!cityVisible}
      importantForAccessibility={cityVisible ? "auto" : "no-hide-descendants"}
      aria-hidden={!cityVisible}
      style={{ position: "absolute", left: 0, top: 0, width, height, opacity: cityVisible ? 1 : 0, zIndex: cityVisible ? 1 : -1 }}
    >
      <City
        base="./world/"
        paused={!cityVisible}
        avatarNo={avatar ? Number(String(avatar).replace(/\D/g, "")) : null}
        trades={cityTrades}
        enterShopId={cityRoute.name === "city" ? cityRoute.enterShopId ?? null : null}
        ownShop={ownPro ? ownShopDesign(ownPro) : null}
        onRequestService={(id) => {
          setKeptCity(route);
          go({ name: "service", serviceId: id });
        }}
        onExit={() => {
          const from = route.name === "city" ? route.from : undefined;
          /* Back is back — to the screen the street was opened from (the wait for the
             pro, the visit), never a jump home that loses a live job (button audit #1). */
          back(from === "stroll" ? { name: "stroll" } : from ? { name: "tracking", stage: from } : { name: "home" });
        }}
      />
      {/* Walking the city with orders on the way: each one stays in sight, and tapping opens it (spec §2.1, finding B). */}
      {cityVisible && dockOrders.length > 0 && (hasLiveJob || parked.length > 0) ? (
        <View style={{ position: "absolute", top: 14, left: 14 }} pointerEvents="box-none">
          <OrdersDock variant="hud" orders={dockOrders} onOpen={openOrder} width={width} />
        </View>
      ) : null}
      {cityVisible && orderToast ? (
        <OrderToastView toast={orderToast} onPress={() => { const id = orderToast.orderId; setOrderToast(null); if (id) openOrder(id); }} top={70} />
      ) : null}
    </View>
  ) : null;
  if (cityVisible) return <View style={{ width, height }}>{cityLayer}</View>;

  return (
    <View style={{ width, height }}>
      {cityLayer}
      {walkingDemo}
      {groundSwitch}
      <AppHeader
        width={width}
        greetingHe={null}
        /*
         * THE FACE THE CUSTOMER CHOSE, IN THE ONE PLACE THEY LOOK FOR
         * THEMSELVES.
         *
         * Amit, on the gallery: *"האווטאר ככ קטן שאני לא מצליח לראות
         * אותו אפילו."* Two faults behind one sentence. The circle was
         * 34px, which is fixed in `AppHeader` — and NOTHING HAD EVER
         * PASSED IT A PICTURE. `avatarUri` has been a prop of that
         * header since it was written, and every screen in this
         * prototype rendered the grey stand-in glyph, including for
         * somebody who had just spent a minute choosing a character.
         *
         * So what he was squinting at was not a small avatar. It was
         * the placeholder that means "no avatar", drawn small.
         *
         * `avatarById` turns the stored id into the portrait's asset
         * id; `art` resolves it as far as the pack has arrived. Absent
         * — no choice made, or the file not delivered — the glyph comes
         * back, which is the honest picture of "nobody chosen".
         */
        avatarUri={(() => {
          const chosen = avatarById(avatar);
          if (!chosen) return null;
          const src = art?.[chosen.portraitAssetId] as { uri?: string } | undefined;
          return src?.uri ?? null;
        })()}
        /*
         * A TAB IS A MOVE TOO.
         *
         * These set the tab directly and pushed nothing, so back from the
         * calls list or the card left the prototype entirely instead of
         * returning to the home screen — the one place a reviewer on a
         * phone reaches for back first.
         */
        /*
         * THE MENU IS A MENU NOW.
         *
         * Amit: *"התפריט פה נראה כמו תפריט ראשי, לא יכול להיות שזה מביא
         * אותי ישר לקריאות שלי."* Three lines that go to one screen is a
         * small broken promise on the busiest chrome in the app.
         */
        /* The same button closes it again — the way every menu behaves. */
        onMenu={() => (tab === "menu" ? back({ name: "home" }) : goTab("menu"))}
        onAccount={() => goTab("card")}
        /* No side switch up here (Amit, 2026-09-29): the app is the customer's.
           The demonstration's way across lives in the menu and the demo bar. */
      />

      {/*
        * Every move animates, and the SHAPE of the animation is worked out
        * from the two screens rather than from the control that was
        * pressed — see `navigation-flow.ts`. Going deeper slides one way,
        * coming back slides the other, switching tabs barely moves at all.
        *
        * The key carries the screen's SUBJECT, not just its route name.
        * Tapping a second category is still `category`, so keying on the
        * name alone meant the busiest taps in the app swapped their
        * contents with no motion — the dead tiles Amit kept pointing at.
        */}
      <View style={{ height: bodyH, overflow: "hidden" }}>
        <ScreenTransition transitionKey={screenNow.key} screen={screenNow.screen}>
          {body}
        </ScreenTransition>
      </View>

      {showReturnToPro ? (
        <DemoBar
          label="חזרה לצד בעל המקצוע — לראות מה קורה אצלו"
          onPress={() => onReturnToPro?.()}
          width={width}
        />
      ) : null}

      {demo ? <DemoBar label={demo.label} onPress={demo.next} width={width} /> : null}

      <Sheet
        visible={sheet === "call"}
        onClose={() => setSheet(null)}
        colors={customerTheme.colors}
        titleHe="שיחה דרך PRO NOW"
        width={width}
        height={height}
      >
        <Text style={styles.sheetBody}>
          המספרים של שניכם מוסתרים.
        </Text>
        <Pressable style={styles.sheetPrimary} onPress={() => setSheet(null)}>
          <Text style={styles.sheetPrimaryText}>חיוג למקצוען</Text>
        </Pressable>
        <Text style={styles.sheetNote}>באב־טיפוס אין חיוג אמיתי.</Text>
      </Sheet>

      {/* ---------------------------------------------------------------
          THE SHOP, OPENED.
          ---------------------------------------------------------------
          A full profile rather than the small card that was there before:
          who they are, what they are actually verified for, what people
          have said. It rises over the world instead of replacing it, so
          closing it puts the customer back on the same street rather than
          somewhere new — which is the difference between looking in a
          window and being taken to a page.
          --------------------------------------------------------------- */}
      <FocusSheet
        visible={openVenue !== null}
        titleHe="הפרופיל של המקצוען"
        onDismiss={() => setOpenVenue(null)}
        width={width}
        height={bodyH}
        /*
         * NOT A QUOTE SHEET.
         *
         * ChatGPT's spec, and the reason is the whole journey: *"במצב
         * הסופי הכרטיס תופס כ-38–42% מגובה המסך, לא 78% כמו quote.
         * מאחוריו ממשיכים לראות את החלק העליון של העסק ואת הרחוב."*
         *
         * The camera spent two and a half seconds taking the customer
         * somewhere. A sheet that then covers the place erases what the
         * journey was for. So it sits low, the street stays visible, and
         * the world dims rather than disappearing — a light scrim and no
         * heavy blur.
         */
        heightFraction={CARD_REST.heightShare}
        scrimOpacity={CARD_REST.scrimOpacity}
      >
        <ProProfileBody
          /*
           * THE PERSON WHOSE SHOP WAS OPENED, NOT ALWAYS THE MATCHED ONE.
           *
           * This was `matchFixture.professional` regardless of which shop
           * the customer had just been driven into — so tapping "דוגמה ט׳"
           * opened a profile headed "דוגמה א׳". Caught in a screenshot of
           * the very journey Amit asked about: the camera takes you into
           * somebody's shop, the card rises, and it is a different person.
           *
           * The street's candidates carry their own names (`demo-cand-N`
           * above), so the sheet takes the one that was opened and falls
           * back to the match only when the id is not one of theirs.
           */
          professional={openVenueProfessional}
          services={profileServices}
          reviews={profileReviews}
          workPhotoSubjects={profileWorkPhotos}
          /*
           * INSIDE THE SHOP, IF THE TRADE HAS AN INSIDE DRAWN.
           *
           * Amit: *"איך עושים שבלחיצה על המקצוען נכנסים לתוך החנות שלו
           * ממש בפנים?"* The lookup is by trade, from
           * `venueInteriorAssetId` — so the day an interior lands in the
           * pack under its name, pressing that trade's shop opens into
           * it, with no change here. Today only the barber has one.
           */
          /*
           * NOT HERE ANY MORE — the frame behind this card IS the
           * interior now that the trades have one, so putting the same
           * picture inside the card shows it twice and pushes the
           * person's own name below the fold. The match screen still
           * carries it, because there the camera has not taken anybody
           * anywhere.
           */
          activeSinceYear={2014}
          areaLabelHe="גוש דן"
          fromPriceMinorUnits={17900}
          onBack={() => setOpenVenue(null)}
          /*
           * THE NEXT SHOP ON THE STREET, cycling through the ones the
           * search actually found. Absent when there is only one, in
           * which case the card simply closes — a "next" that comes
           * back to the same shop is worse than no next.
           */
          onNext={
            nextVenueId
              ? () => {
                  setOpenVenue(null);
                  setEnterVenue(nextVenueId);
                }
              : undefined
          }
          width={width}
          height={Math.round(bodyH * CARD_REST.heightShare) - 56}
        />
      </FocusSheet>

      <Sheet
        visible={sheet === "safety"}
        onClose={() => setSheet(null)}
        colors={customerTheme.colors}
        titleHe="בטיחות"
        width={width}
        height={height}
      >
        <Text style={styles.sheetBody}>
          אפשר לשתף את מצב הקריאה עם מישהו שסומכים עליו — הוא יראה מי הגיע, מתי, ומתי העבודה
          נסגרה. בלי הכתובת המלאה שלך.
        </Text>
        <Pressable style={styles.sheetPrimary} onPress={() => setSheet(null)}>
          <Text style={styles.sheetPrimaryText}>שיתוף מצב הקריאה</Text>
        </Pressable>
        <Pressable style={styles.sheetSecondary} onPress={() => setSheet(null)}>
          <Text style={styles.sheetSecondaryText}>דיווח על בעיה במהלך הביקור</Text>
        </Pressable>
      </Sheet>

      {/* ----------------------------------------------------------------
          THE PROFESSIONAL COULD NOT COME.

          Told plainly, and the search is already running behind it. The
          alternative — the one the product had — is a tracking screen
          counting down to an arrival that is not going to happen.
          ---------------------------------------------------------------- */}
      <Sheet
        visible={sheet === "released"}
        onClose={() => setSheet(null)}
        colors={customerTheme.colors}
        titleHe="מחפשים לכם מישהו אחר"
        width={width}
        height={height}
      >
        <Text style={styles.sheetBody}>
          המקצוען שהיה בדרך אליכם לא יכול להגיע, והקריאה חזרה לחיפוש. לא חויבתם על כלום.
        </Text>
        <Pressable style={styles.sheetPrimary} onPress={() => setSheet(null)}>
          <Text style={styles.sheetPrimaryText}>הבנתי</Text>
        </Pressable>
      </Sheet>

      <Sheet
        visible={sheet === "payment"}
        onClose={() => setSheet(null)}
        colors={customerTheme.colors}
        titleHe="חיוב וחשבונית"
        width={width}
        height={height}
      >
        <Text style={styles.sheetBody}>
          החשבונית נשלחת למייל עם סגירת העבודה, ונשמרת בקריאה עצמה. אמצעי התשלום מחויב רק אחרי
          שאישרת את הסכום.
        </Text>
        <Pressable style={styles.sheetPrimary} onPress={() => setSheet(null)}>
          <Text style={styles.sheetPrimaryText}>שליחת החשבונית למייל</Text>
        </Pressable>
        <Text style={styles.sheetNote}>
          ספק הסליקה עדיין לא נבחר — זו החלטה עסקית פתוחה, אז כאן אין חיוב אמיתי.
        </Text>
      </Sheet>

      {/*
        * NO TAB BAR HERE. The customer's home is a command surface — it asks
        * one question, and four permanent doors underneath it imply the
        * answer might be somewhere else. Navigation lives in a thin top row;
        * a live job gets its own capsule, which is not navigation and does
        * not pretend to be. (Visual System v1, and the reasoning is in
        * CommandChrome.tsx.)
        */}
      {showDock ? (
        <View style={{ height: CAPSULE_HEIGHT, justifyContent: "center" }}>
          <OrdersDock orders={dockOrders} onOpen={openOrder} width={width} />
        </View>
      ) : null}
      {/* On an order's own screens, with several orders: the switcher, beside the back arrow. */}
      {multiOrder && ["living", "tracking", "arrival", "quote"].includes(route.name) && tab === "home" ? (
        <View style={{ position: "absolute", top: 56 + 10, left: 16 }} pointerEvents="box-none">
          <OrdersDock variant="switcher" orders={dockOrders} onOpen={openOrder} width={width} />
        </View>
      ) : null}
      {orderToast ? (
        <OrderToastView toast={orderToast} onPress={() => { const id = orderToast.orderId; setOrderToast(null); if (id) openOrder(id); }} top={56 + 8} />
      ) : null}
      {capsule ? (
        /*
         * NO `progress` HERE, AND THAT IS THE POINT.
         *
         * The capsule can walk the professional to a known point on the
         * track when the server says how far through the trip they are —
         * `routeProgress` computes that from the ETA at assignment and
         * the ETA now. The preview's open-call record carries only the
         * minutes remaining, so it has the second number and not the
         * first, and one of two numbers is not a fraction.
         *
         * Left out, the figure walks and the road moves past it: alive,
         * and silent about distance, which is exactly what we know.
         * Filling it in from the minutes alone would be inventing the
         * denominator. /CLAUDE.md §3.
         */
        <ActiveJobCapsule
          textHe={capsule.textHe}
          etaMinutes={capsule.etaMinutes}
          progress={capsule.progress ?? null}
          figureUri={capsule.figureUri ?? null}
          onPress={capsule.onPress}
          width={width}
        />
      ) : null}

    </View>
  );
}

// ---------------------------------------------------------------------
// Professional
// ---------------------------------------------------------------------

/**
 * WHAT THE PROFESSIONAL'S SIDE MUST NOT FORGET WHEN IT IS NOT ON SCREEN.
 *
 * The two sides of this prototype are two apps: switching unmounts one
 * and mounts the other. Everything below lived only inside `ProApp`, so
 * a reviewer who crossed to the customer to answer a quote came back to
 * an empty shift — the job the customer had just approved did not exist
 * on the screen of the person doing it.
 *
 * The shift's own totals are here too. A crossing that resets somebody's
 * earnings to zero is the same fault wearing a different number.
 */
interface ProMemory {
  tab: ProTab;
  presence: ProPresenceState;
  job: JobState | null;
  proView: null | "chat" | "presence" | "pricing" | "quote";
  onlineSince: number | null;
  shiftNet: number;
  shiftJobs: number;
  settled: number | null;
  takenRequest: LiveRequest | null;
}

function ProApp({
  geo: proGeo,
  width,
  height,
  skipHowItWorks = false,
  onSwitch,
  onBackOut,
  preQuoteSent = null,
  preQuoteApprovedAt = null,
  onSendPreQuote,
  request,
  onTakeRequest,
  pendingQuote,
  quoteDecision,
  sentQuoteLines,
  approvedQuoteTotal = null,
  sentQuoteNotes,
  onSendQuote,
  onQuoteSeen,
  onSeeAsCustomer,
  onSampleCustomer,
  completionConfirmed,
  onJobChange,
  availableAtMs = null,
  onAvailableAtChange,
  selfNameHe = null,
  joined = null,
  onOnlineChange,
  onEditJoin,
  onFinishJoin,
  startShift = false,
  onShiftStarted,
  onPricesChange,
  onAgreedStart,
  onCompletionSeen,
  onReleaseJob,
  customerFaceUri,
  memory,
}: {
  /**
   * The professional's city is the customer's city.
   *
   * It was the last screen still on the painted plate, which is a
   * quieter version of the same drift the customer screens had: a
   * plumber and the person who called them looking at two different
   * streets with the same names.
   */
  geo: WorldGeo | null;
  width: number;
  height: number;
  /** Joined through onboarding: he has seen how it works. */
  skipHowItWorks?: boolean;
  onSwitch: () => void;
  /**
   * Called when this side has no screen left behind it. Returns true if
   * the gesture was used to leave for the other side, false to let the
   * browser close the page. See `backGesture.ts`.
   */
  onBackOut: () => boolean;
  /** A request the customer side actually made, waiting to be offered. */
  request: LiveRequest | null;
  /** Called once the offer has been taken off the queue. */
  onTakeRequest: () => void;
  /** A quote this professional sent that the customer has not answered. */
  pendingQuote: {
    sentAtMs: number;
    draft: { lines: { id: string; description: string; quantity: number; unitPriceMinorUnits: number; kind: string }[]; notesHe: string; media?: QuoteMedia } | null;
  } | null;
  /** The customer's answer, once it arrives. */
  quoteDecision: "APPROVED" | "DECLINED" | null;
  /** The lines already sent, so an update opens them rather than a blank form. */
  sentQuoteLines: { id: string; description: string; quantity: number; unitPriceMinorUnits: number; kind: string }[] | null;
  /** What the customer approved, in minor units — the payout. */
  approvedQuoteTotal?: number | null;
  sentQuoteNotes: string;
  onSendQuote: (draft: { lines: { id: string; description: string; quantity: number; unitPriceMinorUnits: number; kind: string }[]; notesHe: string; media?: QuoteMedia }) => void;
  onQuoteSeen: () => void;
  /**
   * Review-only: cross to the customer's side and open the quote that is
   * waiting there. A real professional has no button that answers as
   * their own customer, which is why this lives on the demo row and says
   * "הדגמה" before it says anything else.
   */
  onSeeAsCustomer?: (what: "quote" | "completion" | "prequote") => void;
  /** For a sample call: the customer's answer, simulated. */
  onSampleCustomer?: (what: "quote" | "completion" | "prequote") => void;
  /** Quote-first: the price this professional named, when the customer approved it, and naming one. */
  preQuoteSent?: { serviceId: string; amount: number; notesHe: string } | null;
  preQuoteApprovedAt?: number | null;
  onSendPreQuote?: (q: { serviceId: string; amount: number; notesHe: string }) => void;
  /**
   * The customer has agreed the work is finished.
   *
   * This is what ends a job. The professional's own "סיימתי את העבודה"
   * only moves them to COMPLETION_PENDING — see `JOB_FLOW` — because
   * /docs/09-PAYMENTS.md puts the charge behind the customer's
   * confirmation rather than the professional's claim.
   */
  completionConfirmed?: boolean;
  onCompletionSeen?: () => void;
  /** Tells the shell where the visit is, so the customer's side can follow. */
  onJobChange?: (job: JobState | null) => void;
  availableAtMs?: number | null;
  onAvailableAtChange?: (at: number | null) => void;
  /** Who this professional is, as the customer saw him. */
  selfNameHe?: string | null;
  /** The professional who joined on this device: his services, prices and trade. */
  joined?: OnboardingResult | null;
  /** Back to his details and shop, from inside the app. */
  onEditJoin?: () => void;
  onFinishJoin?: () => void;
  /** Tells the shell when he goes on or off shift. */
  onOnlineChange?: (online: boolean) => void;
  /** Arrived by "להתחיל משמרת": go on shift at once. */
  startShift?: boolean;
  onShiftStarted?: () => void;
  /** His prices, for the customer's side to show. */
  onPricesChange?: (p: { byService: Record<string, number | null>; afterHoursPct: number | null }) => void;
  /** Work starts at a price agreed in advance: tell the shell what it is. */
  onAgreedStart?: (amountMinorUnits: number, nameHe: string) => void;
  /** The professional gave the job back. The customer has to be told. */
  onReleaseJob?: (sample?: boolean) => void;
  /**
   * The avatar the customer picked for themselves, if they picked one.
   * Their own choice, carried across — not a likeness we invented.
   */
  customerFaceUri?: string | null;
  /**
   * What this side was doing the last time it was mounted. Held above
   * because a crossing unmounts all of it — see `ProMemory`.
   */
  memory?: React.MutableRefObject<ProMemory | null>;
}) {
  const kept = memory?.current ?? null;
  const [tab, setTab] = useState<ProTab>(kept?.tab ?? "shift");
  const [presence, setPresence] = useState<ProPresenceState>(kept?.presence ?? "OFFLINE");
  /*
   * The offer is NOT restored. An offer is a live thing with a clock on
   * it; bringing one back after a trip to another screen would be
   * showing a countdown that never ran.
   */
  const [offerAt, setOfferAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [job, setJob] = useState<JobState | null>(kept?.job ?? null);
  useEffect(() => {
    onJobChange?.(job);
  }, [job]);
  const [proChat, setProChat] = useState<ChatMessage[]>(chatSeed);
  const [proView, setProView] = useState<null | "chat" | "presence" | "pricing" | "quote">(
    kept?.proView ?? null
  );

  /*
   * The draft is NOT kept here. It goes straight up through
   * `onSendQuote` to the shell, which hands it to the customer's
   * approval screen — one copy, so the two sides cannot end up showing
   * different quotes for the same job.
   */

  /**
   * WHICH SERVICES ARE ARMED FOR THIS SHIFT.
   *
   * Amit: *"איך אני מוריד ומעלה אפשרויות?"* The sheet that answered that
   * question said "אפשר לכבות ולהדליק שירותים בכל רגע" and carried no
   * control at all.
   *
   * Held here rather than inside the sheet, because arming a service is
   * not a property of a sheet — it is what the shift screen's chips
   * report and what dispatch would read. A toggle that changed only the
   * sheet would be the same dead control with a nicer surface.
   *
   * Starts as everything the professional is ELIGIBLE for: somebody who
   * has gone to the trouble of being approved for a service wants it on.
   */
  const [armed, setArmed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_PRO_SERVICES.map((s) => [s.id, s.enabled && !s.blockedReasonHe]))
  );

  /*
   * ---------------------------------------------------------------------
   * THE PROFESSIONAL SIDE HAD NO HISTORY AT ALL
   * ---------------------------------------------------------------------
   * Amit: *"באנדרואיד רצוי שהכפתור הטבעי שלו למטרה זו גם יעבוד — כרגע
   * זורק החוצה מהאפליקציה."*
   *
   * The customer side records every move so the phone's back button can
   * undo one. This side navigates with `setProView` and `setTab`, neither
   * of which recorded anything, so the back button had nothing to pop on
   * any professional screen — and the one listener that might have
   * noticed was inside `CustomerApp`, which is not even mounted here.
   *
   * `goPro` is the same idea as the customer's `go`: it remembers where
   * you WERE, not where you are going. That distinction is the bug the
   * customer side already paid for once.
   */
  const proBack = useRef<{ view: null | "chat" | "presence" | "pricing" | "quote"; tab: ProTab }[]>([]);
  const proHere = useRef<{ view: null | "chat" | "presence" | "pricing" | "quote"; tab: ProTab }>({
    view: null,
    tab: "shift",
  });
  const goPro = useCallback((view: null | "chat" | "presence" | "pricing" | "quote") => {
    proBack.current = [...proBack.current, proHere.current].slice(-40);
    setProView(view);
    pushBackEntry();
  }, []);
  const goProTab = useCallback((next: ProTab) => {
    proBack.current = [...proBack.current, proHere.current].slice(-40);
    setTab(next);
    setProView(null);
    pushBackEntry();
  }, []);
  /**
   * The professional's own prices, one row per applied service.
   *
   * They start unset, which is the honest state of a marketplace that has
   * not opened — and is a different thing from free. `pricedForDispatch`
   * treats an unset price as not dispatchable, so the shift screen cannot
   * offer a service nobody has put a number on.
   */
  /* Night/Shabbat surcharge and the price list — his, set on "המחירים שלך". */
  const [afterHoursPct, setAfterHoursPct] = useState<number | null>(null);
  /* The demo account's own list, so a quote can be built from it out of the box. */
  /* A joined professional's own lines, or none — never the sample plumber's
     list (Amit: "למה זה מכניס לי דברים שלא קשורים אליי?"). */
  const [priceList, setPriceList] = useState<PriceListItem[]>(() => joined ? Object.values(joined.priceLines ?? {}).flat().map((l) => ({ ...l })) : [
    { id: "d1", nameHe: "החלפת אטם בברז", amountMinorUnits: 18000 },
    { id: "d2", nameHe: "החלפת סיפון", amountMinorUnits: 25000 },
    { id: "d3", nameHe: "פתיחת סתימה בכיור", amountMinorUnits: 30000 },
    { id: "d4", nameHe: "החלפת ברז מטבח", amountMinorUnits: 32000 },
  ]);
  /* A professional who joined is always himself — even with only a new
     service of his own and none of ours ticked. That case used to fall back to
     the sample plumber: Amit opened a carpentry shop and got plumbing. */
  const joinedIds = joined ? joined.serviceIds : null;
  /* Approved means approved for what he offers: those services' own credentials. */
  const joinedCreds = joinedIds
    ? ([...new Set([...DEMO_VERIFIED, ...joinedIds.flatMap((id) => pilotServiceById[id]?.requiredCredentials ?? [])])] as Parameters<typeof togglesFor>[0])
    : null;
  const [pricing, setPricing] = useState<ProPricingRow[]>(() => {
    if (joinedIds && joinedCreds)
      return pricingRowsFor(joinedCreds, joinedIds).map((r) => ({ ...r, amountMinorUnits: joined?.pricesMinorUnits?.[r.serviceId] ?? r.amountMinorUnits }));
    // The prices a professional typed are theirs and are tedious to retype;
    // the eligibility that sits beside them is the server's and is rebuilt
    // from the catalogue every time rather than restored from a browser.
    const stored = loadSession()?.prices ?? {};
    return pricingRowsFor([...DEMO_VERIFIED]).map((r) => ({
      ...r,
      amountMinorUnits: r.serviceId in stored ? (stored[r.serviceId] ?? null) : r.amountMinorUnits,
    }));
  });
  useEffect(() => {
    saveSession({
      prices: Object.fromEntries(pricing.map((r) => [r.serviceId, r.amountMinorUnits])),
    });
  }, [pricing]);
  const pricingRows = pricing;
  /**
   * When this shift actually went online. The shift clock counts from a real
   * timestamp rather than from a fixture, so "מחובר כבר" is true and the
   * rate stays withheld for the first 45 minutes exactly as production
   * would withhold it.
   */
  const [onlineSince, setOnlineSince] = useState<number | null>(kept?.onlineSince ?? null);
  /** The total of the quote that was sent — what the customer approves.
      Remembered past the approval, which clears the pending quote. */
  const approvedTotal = approvedQuoteTotal;
  /* The customer approved his price: now he has the job. */
  useEffect(() => {
    if (preQuoteApprovedAt && !job && takenRequest?.quoteFirst) setJob("PRO_ASSIGNED");
    // Only a new approval assigns.
  }, [preQuoteApprovedAt]);
  const [shiftNow, setShiftNow] = useState(() => Date.now());
  /**
   * The shift's running totals. They start at zero and only move when a job
   * actually settles — which is what makes the completion screen mean
   * something and what makes "לשעת חיבור" a real number rather than a
   * fixture. End the shift and they reset, because they describe THIS shift.
   */
  const [shiftNet, setShiftNet] = useState(kept?.shiftNet ?? 0);
  /* The jobs he closed in this demo, for "הרווחים" — header and list agree. */
  const [doneJobs, setDoneJobs] = useState<React.ComponentProps<typeof ProEarningsBody>["jobs"]>([]);
  const [shiftJobs, setShiftJobs] = useState(kept?.shiftJobs ?? 0);
  /** The payout just settled, while the completion screen is showing. */
  const [settled, setSettled] = useState<number | null>(kept?.settled ?? null);
  /**
   * The customer request this offer was built from, captured at the moment
   * the offer was raised. Held here rather than read live, so the card does
   * not change under the professional's hands while the ring counts down.
   */
  const [takenRequest, setTakenRequest] = useState<LiveRequest | null>(kept?.takenRequest ?? null);
  /*
   * HIS OWN TRADE'S SERVICES. The demo professional is whoever the call went
   * to — the hairdresser for a haircut, the tow driver for a tow — so his
   * shift lists that trade's services, not the plumbing list every trade
   * used to show (copy review, 2026-09-29). The call's own service is one he
   * is verified for; that is how he could be sent it.
   */
  const tradeServiceId = takenRequest?.serviceId ?? request?.serviceId ?? null;
  /* Whoever took the call is the figure in that trade's first shop — the same rule the customer's cards use. */
  const proIsFemale = (() => {
    if (!tradeServiceId) return false;
    const d = departmentCodeByServiceId[tradeServiceId] ?? "";
    return FEMALE_FIGURE.has((DEPT_SHOPS[d] ?? [DEPT_SHOP[d] ?? "home"])[0]!);
  })();
  const proServices = useMemo(() => {
    if (joinedIds && joinedCreds) return togglesFor(joinedCreds, joinedIds);
    if (!tradeServiceId) return DEFAULT_PRO_SERVICES;
    const category = categoryNameByServiceId[tradeServiceId];
    const ids = Object.keys(categoryNameByServiceId).filter((id) => categoryNameByServiceId[id] === category);
    const own = pilotServiceById[tradeServiceId]?.requiredCredentials ?? [];
    return togglesFor([...new Set([...DEMO_VERIFIED, ...own])], ids);
  }, [tradeServiceId]);
  /**
   * Which credential's own page is open, if any. An id rather than the
   * step itself, so the list stays the single source of what each step
   * says — a copy held here would go stale the first time a state
   * changed.
   */
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  /* His documents, from what he uploaded when he joined — never the demo plumber's electrician licence. */
  const joinedSteps = joinedIds
    ? onboardingDocsFor(joinedIds).map((d) => {
        const given = joined?.uploadedDocIds?.includes(d.id) ?? false;
        return {
          id: `v_${d.id}`,
          titleHe: d.nameHe,
          explainHe: d.checkHe,
          state: given ? ("VERIFIED" as const) : ("NOT_STARTED" as const),
          ...(given ? {} : { actionHe: "עוד לא הועלה." }),
        };
      })
    : null;
  const openStep = openStepId ? (joinedSteps ?? verificationSteps).find((v) => v.id === openStepId) ?? null : null;
  const [proSheet, setProSheet] = useState<
    null | "call" | "navigate" | "services" | "howitworks" | "quote" | "release"
  >(
    /*
     * OPEN ON ARRIVAL, ONCE.
     *
     * The professional side has four tabs, a map, a shift clock, a services
     * list and a countdown that can take over the screen — and until now it
     * explained none of it. "לא מבין כלום מזה הפעולות האלה" is the correct
     * reaction to that, not a failure to read carefully. Four sentences
     * before the first tap costs nothing and removes the confusion at its
     * source.
     *
     * ONCE means once. This side is unmounted every time the reviewer
     * crosses to the customer, so an unconditional "howitworks" reopened
     * the explanation on top of whatever was happening — including on
     * top of a job that was mid-visit, where it covered the whole screen
     * and the way back out. See `ProMemory`.
     */
    kept || skipHowItWorks ? null : "howitworks"
  );

  const BAR = 64;
  /**
   * The demo control only exists while online, with no offer and no job in
   * hand — and it takes its own row. It used to sit on top of "סיום משמרת".
   */
  const showDemo =
    tab === "shift" &&
    presence === "AVAILABLE" &&
    offerAt === null &&
    job === null &&
    settled === null &&
    !(preQuoteSent && !preQuoteApprovedAt) &&
    proView !== "quote" &&
    /* A sample call needs one of his services; never the sample plumber's. */
    (!joinedIds || joinedIds.some((id) => armed[id] !== false) || Boolean(request));

  /*
   * ---------------------------------------------------------------------
   * AND ONE FOR THE MOMENT THE BALL IS IN THE OTHER COURT
   * ---------------------------------------------------------------------
   * Amit, with a quote sent and the job waiting: *"איך אני מאשר כרגע את
   * הקריאה מצד הלקוח לראות שזה עובד?"*
   *
   * The mechanism was already there — the customer gets a capsule
   * reading "הצעת מחיר ממתינה לאישורך" that opens the quote — and
   * reaching it meant knowing to press "לקוח" in the tab bar and then
   * finding the capsule. For somebody testing both sides of a handover,
   * that is two guesses at a moment when the screen says "waiting" and
   * offers nothing.
   *
   * So the same demo row that hands the professional a sample call now
   * also hands them the other side of this one. It is a review control
   * and says so, like every other control in this row: a real
   * professional has no button that answers as their customer.
   */
  /*
   * The same crossing at the second wait: the customer's confirmation
   * that the work is done is what ends the job, and a reviewer looking
   * at "ממתין לאישור הלקוח" needs the same one tap to go and give it.
   */
  const showHandover =
    (job === "WAITING_QUOTE_APPROVAL" || job === "COMPLETION_PENDING") && settled === null;
  const bodyH = height - BAR - (showDemo || showHandover ? DEMO_H : 0);

  useEffect(() => {
    if (offerAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [offerAt]);

  /**
   * THE CUSTOMER ANSWERED.
   *
   * Approval moves the job forward; a decline sends it back to diagnosis,
   * because the professional is still standing there and the next thing
   * that has to happen is a revised quote — not a cancelled job. That
   * distinction is the difference between a marketplace and a vending
   * machine.
   */
  useEffect(() => {
    if (!quoteDecision || job !== "WAITING_QUOTE_APPROVAL") return;
    setJob(quoteDecision === "APPROVED" ? "IN_PROGRESS" : "DIAGNOSIS");
    onQuoteSeen();
  }, [quoteDecision, job, onQuoteSeen]);

  /**
   * AND THE CUSTOMER SAID THE WORK IS DONE.
   *
   * Amit: *"איפה המקצוען רואה את האישור עבודה?"* Here — this is the
   * only thing that ends a job. The professional's own "סיימתי את
   * העבודה" leaves them at COMPLETION_PENDING; what settles the money
   * and opens the closing screen is the other person agreeing, and it
   * arrives from the shell the way the quote's answer does.
   *
   * Guarded on the state, not just on the flag: a confirmation that
   * arrived for a job this side is no longer on would otherwise settle
   * whatever job it IS on.
   */
  useEffect(() => {
    if (!completionConfirmed || job !== "COMPLETION_PENDING") return;
    advanceJob();
    onCompletionSeen?.();
  });

  // The shift clock ticks once a second while online, and not at all when
  // offline — there is nothing to count.
  useEffect(() => {
    // Also while a quote is out: the waiting counter is the only thing on
    // that screen that changes, and a frozen counter reads as a frozen app.
    if (onlineSince === null && !pendingQuote) return;
    const id = setInterval(() => setShiftNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [onlineSince, pendingQuote]);

  // Going online is a transition the SERVER confirms, so the prototype makes
  // you wait through it rather than flipping instantly — that delay is the
  // honest part of the interaction.
  /* "התחלת משמרת להדגמה" was used: the shift is open for showing, until the app is reopened. */
  const [demoShift, setDemoShift] = useState(false);
  const toggle = useCallback(() => {
    if (presence === "OFFLINE") {
      setPresence("STARTING_SHIFT");
      setTimeout(() => {
        setPresence("AVAILABLE");
        setOnlineSince(Date.now());
      }, 1200);
    } else {
      setPresence("OFFLINE");
      setOnlineSince(null);
      setShiftNet(0);
      setShiftJobs(0);
      setOfferAt(null);
    }
  }, [presence]);

  useEffect(() => {
    if (!startShift) return;
    onShiftStarted?.();
    if (presence === "OFFLINE") toggle();
    // Once, on arrival.
  }, []);

  /* A call that ran out returns him to his shift by itself, a moment after
     saying so — the screen used to stay there with no way out. */
  useEffect(() => {
    if (offerAt === null) return;
    const t = setTimeout(() => setOfferAt((cur) => (cur === offerAt ? null : cur)), OFFER_SECONDS * 1000 + 4_000);
    return () => clearTimeout(t);
  }, [offerAt]);

  useEffect(() => {
    onOnlineChange?.(presence !== "OFFLINE" && presence !== "ENDING_SHIFT");
  }, [presence, onOnlineChange]);

  /* When the time he gave comes, he is on shift — nobody has to press it. */
  useEffect(() => {
    if (availableAtMs === null || presence !== "OFFLINE") return;
    const t = setTimeout(() => {
      onAvailableAtChange?.(null);
      toggle();
    }, Math.max(0, availableAtMs - Date.now()));
    return () => clearTimeout(t);
  }, [availableAtMs, presence, toggle, onAvailableAtChange]);

  /*
   * ARRIVING AT THE RIGHT STEP.
   *
   * Amit: *"שלא יעביר אותי לצד של המקצוען לשלב ההתחלתי — שיעביר אותי לשלב
   * הנכון."* Crossing over while the customer's request is waiting used to
   * land on an offline professional behind an explainer, with a demo bar
   * to press twice before the request appeared. Now the professional is
   * already on shift and the request is on his screen, waiting for accept —
   * the step the story is actually at.
   */
  useEffect(() => {
    if (!request || job !== null || offerAt !== null) return;
    setProSheet(null);
    if (presence !== "AVAILABLE") {
      setPresence("AVAILABLE");
      setOnlineSince(Date.now());
    }
    setTakenRequest(request);
    onTakeRequest();
    setOfferAt(Date.now());
  }, [request, job, offerAt, presence, onTakeRequest]);

  /**
   * The offer, built from the customer's actual request when there is one.
   *
   * `offerFixture` stays as the fallback so the professional side can be
   * reviewed on its own — but the moment a request exists, this card is that
   * request: the same service, the same answers, the same media counts.
   * Nothing is re-described in fixture prose, because a fixture that
   * paraphrases a real payload is a fixture that will eventually disagree
   * with it.
   */
  /*
   * WHAT THIS JOB PAYS, from what the customer chose and his own price
   * list — not the sample offer's figure carried across to every service.
   * PRO NOW's commission is undecided (/CLAUDE.md §4), so this is the
   * price the customer pays, with nothing invented taken off it.
   */
  /*
   * The order at THIS professional's prices: the lines the customer ticked,
   * scaled by his own base price when he set one.
   */
  const proOrder = (() => {
    if (!takenRequest || takenRequest.priceModel !== "FIXED" || !takenRequest.items?.length) return null;
    const id = takenRequest.serviceId;
    const own = pricing.find((r) => r.serviceId === id)?.amountMinorUnits ?? null;
    const mine = priceListFor(id, own);
    const rows = takenRequest.items.map((it) => mine.find((r) => r.id === it.id) ?? it);
    return {
      namesHe: rows.map((r) => r.nameHe).join(" + "),
      amountMinorUnits: withAfterHours(rows.reduce((sum, r) => sum + r.amountMinorUnits, 0), afterHoursPct, new Date()).amountMinorUnits,
    };
  })();
  const ownVisitFee = (() => {
    if (!takenRequest || takenRequest.priceModel !== "VISIT_QUOTE") return null;
    const own = pricing.find((r) => r.serviceId === takenRequest.serviceId)?.amountMinorUnits ?? null;
    const fee = own ?? SERVICE_PAGES[takenRequest.serviceId]?.price?.visitFeeMinorUnits ?? null;
    return fee === null ? null : withAfterHours(fee, afterHoursPct, new Date()).amountMinorUnits;
  })();

  /*
   * WHAT THIS JOB PAYS. A price-list job pays what was ordered; a visit for
   * work priced only once somebody looks pays the visit-and-diagnosis fee,
   * which is all that goes through the app (Amit, 2026-09-29). PRO NOW's
   * commission is undecided (/CLAUDE.md §4), so nothing is taken off.
   */
  const offerPayout = (() => {
    if (!takenRequest) return null;
    if (takenRequest.priceModel === "VISIT_QUOTE") return ownVisitFee;
    if (takenRequest.priceModel === "FIXED") return proOrder?.amountMinorUnits ?? null;
    const rate = pricing.find((r) => r.serviceId === takenRequest.serviceId)?.amountMinorUnits ?? SERVICE_PAGES[takenRequest.serviceId]?.price?.hourlyRateMinorUnits ?? null;
    return rate === null ? null : withAfterHours(rate, afterHoursPct, new Date()).amountMinorUnits;
  })();

  const offer: OfferCardView | null = offerAt
    ? takenRequest
      ? {
          ...offerFixture,
          offerId: `offer_${offerAt}`,
          jobId: `job_${offerAt}`,
          serviceNameHe: takenRequest.serviceNameHe,
          serviceCode: takenRequest.serviceCode,
          priceModel: takenRequest.priceModel,
          offeredAt: new Date(offerAt).toISOString(),
          expiresAt: new Date(offerAt + OFFER_SECONDS * 1000).toISOString(),
          customerAreaLabel: takenRequest.areaLabelHe,
          jobDescription: takenRequest.textHe.trim() || null,
          intakeBrief: takenRequest.intakeBrief,
          mediaSummary:
            takenRequest.photos > 0 || (takenRequest.voiceSeconds ?? 0) > 0
              ? { photos: takenRequest.photos, voiceSeconds: takenRequest.voiceSeconds }
              : undefined,
          // The customer was never asked about the floor or the lift, so the
          // card says nothing about them rather than inventing a building.
          arrival: undefined,
          typicalServiceMinutes: takenRequest.typicalMinutes ?? null,
          // VISIT_QUOTE means the payout genuinely is not knowable yet, and
          // the card must say so rather than carry the fixture's number
          // across to a different service.
          expectedPayoutMinorUnits: offerPayout,
          /* His own visit fee is a price, not an estimate; only hourly/quote work is open-ended. */
          payoutIsEstimate: takenRequest.priceModel !== "FIXED" && takenRequest.priceModel !== "VISIT_QUOTE",
        }
      : {
          ...offerFixture,
          offeredAt: new Date(offerAt).toISOString(),
          expiresAt: new Date(offerAt + OFFER_SECONDS * 1000).toISOString(),
        }
    : null;

  /*
   * ---------------------------------------------------------------------
   * AND IT STOPS ON THE CUSTOMER'S CONFIRMATION, WHICH IT DID NOT
   * ---------------------------------------------------------------------
   * Amit: *"איפה מסך אישור התשלום ע"י הלקוח? איפה המקצוען רואה את
   * האישור עבודה?"*
   *
   * COMPLETION_PENDING was missing from this list, so "סיימתי את
   * העבודה" went straight to COMPLETED: the professional declared the
   * work done and the app paid them out on their own say-so, on the
   * same tap. The state machine has two states there for a reason —
   * /docs/09-PAYMENTS.md puts the charge behind the CUSTOMER's
   * confirmation, not the professional's claim — and this side was
   * skipping the one that belongs to the other person.
   *
   * With it in the list the professional's last button leaves them
   * waiting, and what ends the job is the customer pressing "הכול תקין"
   * on their own screen. Which is also the answer to the second half of
   * his question: the approval he was looking for had nowhere to arrive,
   * because nothing was waiting for it.
   */
  /*
   * DERIVED, so this and the tracker cannot disagree about the order.
   *
   * Amit, twice: *"איך הצעת מחיר תשלח אם הוא כבר סיים את העבודה?"* and
   * *"זה אמור להיות לפני שהוא עובד בכלל."* The order he keeps restating
   * is now `VISIT_ORDER`, beside the state machine, with
   * `visitOrderViolations` asserting it — and this list, which is what
   * the professional's buttons actually walk, is that same order with
   * the end of the job on it. A second copy typed out here is a second
   * copy that drifts; the missing COMPLETION_PENDING was exactly that.
   */
  /**
   * THE PRICE THIS SERVICE ALREADY HAS, IF IT HAS ONE.
   *
   * FIXED services carry a figure the customer saw before they asked;
   * VISIT_QUOTE ones carry a visit fee and nothing about the work. So
   * the first is a line the builder should open with, and the second is
   * a form that must stay empty — inventing a starting number there is
   * the app putting a price in somebody's mouth.
   */
  const agreedPrice = useMemo(() => {
    const id = takenRequest?.serviceId ?? null;
    const price = id ? SERVICE_PAGES[id]?.price : undefined;
    if (!price || price.priceModel !== "FIXED" || !price.fixedTotalMinorUnits || !id) return null;
    /* What the customer ordered from the price list. */
    const amount = proOrder?.amountMinorUnits ?? price.fixedTotalMinorUnits;
    return {
      lines: [
        {
          id: "l1",
          description: takenRequest?.serviceNameHe ?? "",
          quantity: 1,
          unitPriceMinorUnits: amount,
          kind: "LABOR" as const,
        },
      ],
      noteHe: `לשירות הזה יש מחיר קבוע שסוכם מראש: ${formatMoney(
        money(amount, "ILS")
      )}. אפשר לשנות אם מצאת עבודה נוספת — הלקוח יראה את מה שתשלח.`,
    };
  }, [takenRequest, proOrder?.amountMinorUnits]);

  useEffect(() => {
    onPricesChange?.({ byService: Object.fromEntries(pricing.map((r) => [r.serviceId, r.amountMinorUnits])), afterHoursPct });
  }, [pricing, afterHoursPct, onPricesChange]);

  /*
   * A PRICE AGREED BEFORE HE CAME — fixed or hourly. His own price for the
   * service if he set one, the catalogue's example figure otherwise, with
   * his night/Shabbat surcharge when it applies. Then there is no quote to
   * wait for: the check leads straight to work (Amit, 2026-09-27).
   */
  const agreedStart = useMemo(() => {
    const id = takenRequest?.serviceId ?? null;
    const pm = takenRequest?.priceModel ?? null;
    if (takenRequest?.quoteFirst && preQuoteSent?.serviceId === id && preQuoteApprovedAt) {
      return {
        amount: preQuoteSent.amount,
        labelHe: `${formatMoney(money(preQuoteSent.amount, "ILS"))} כפי שאושר`,
        nameHe: "לפי ההצעה שאושרה",
      };
    }
    if (id && pm === "DISTANCE_TIME") {
      const fare = deliveryFare(SERVICE_PAGES[id]?.price ?? {});
      if (!fare) return null;
      return { amount: fare, labelHe: `${formatMoney(money(fare, "ILS"))} · לפי מרחק`, nameHe: `משלוח · כ־${PREVIEW_DELIVERY_KM} ק״מ` };
    }
    if (!id || (pm !== "FIXED" && pm !== "HOURLY")) return null;
    if (pm === "FIXED") {
      if (!proOrder) return null;
      return {
        amount: proOrder.amountMinorUnits,
        labelHe: `${proOrder.namesHe} ${formatMoney(money(proOrder.amountMinorUnits, "ILS"))}`,
        nameHe: proOrder.namesHe,
      };
    }
    const own = pricing.find((r) => r.serviceId === id)?.amountMinorUnits ?? null;
    const rate = own ?? SERVICE_PAGES[id]?.price?.hourlyRateMinorUnits ?? null;
    if (!rate) return null;
    const { amountMinorUnits } = withAfterHours(rate, afterHoursPct, new Date());
    return {
      amount: amountMinorUnits,
      labelHe: `${formatMoney(money(amountMinorUnits, "ILS"))} לשעה`,
      nameHe: takenRequest?.serviceNameHe ?? "",
    };
  }, [takenRequest, pricing, afterHoursPct, proOrder?.amountMinorUnits, preQuoteSent, preQuoteApprovedAt]);

  const JOB_FLOW: JobState[] = [...VISIT_ORDER, "COMPLETED"];
  const advanceJob = () => {
    if (!job) return;
    const i = JOB_FLOW.indexOf(job);
    const next = JOB_FLOW[i + 1];
    if (!next || next === "COMPLETED") {
      /*
       * CLOSING THE LOOP.
       *
       * This used to be `setJob(null)` — the work finished and the app said
       * nothing, dropping the professional back onto a map as though the
       * last fifty minutes had not happened. The payout now lands on the
       * shift, the completion screen states what was added and to what, and
       * it says out loud that they are available again so nobody has to
       * wonder whether to press something.
       */
      /*
       * The amount the customer approved — not a fixed demo figure that
       * disagreed with it. PRO NOW's commission is an open business
       * decision (/CLAUDE.md §4), so nothing is deducted here: the number
       * the professional sees is the approved total.
       */
      /* What this job actually was: the approved or agreed amount, or — for a visit — the visit fee. */
      const payout =
        approvedTotal ??
        ((takenRequest?.priceModel ?? "VISIT_QUOTE") === "VISIT_QUOTE" && !takenRequest?.quoteFirst
          ? ownVisitFee ?? SERVICE_PAGES[takenRequest?.serviceId ?? "svc-leak"]?.price?.visitFeeMinorUnits ?? null
          : proOrder?.amountMinorUnits ?? agreedStart?.amount ?? null) ??
        0;
      setShiftNet((n) => n + payout);
      setShiftJobs((n) => n + 1);
      setDoneJobs((l) => [
        {
          id: `done_${Date.now()}`,
          serviceNameHe: takenRequest?.serviceNameHe ?? "עבודה",
          mark: ((takenRequest?.markName as MarkName) ?? "plumbing"),
          whenHe: `היום, ${nowHHMM()}`,
          grossMinorUnits: payout,
          deductions: [],
          /* Nothing is taken off: the commission is undecided (/CLAUDE.md §4). */
          netMinorUnits: payout,
        },
        ...l,
      ]);
      setSettled(payout);
      setJob(null);
      return;
    }
    /*
     * ONE TAP FROM THE DOOR TO THE CHECK.
     *
     * Amit: *"עמוד מיותר אחד עד שלב הצעת המחיר."* "הגעתי" landed on a
     * screen whose only content was a button to start checking. The job
     * still passes through PRO_ARRIVED — the state machine is unchanged and
     * the customer is told he has arrived — but the professional's tap
     * carries straight on to the diagnosis.
     */
    setJob(next === "PRO_ARRIVED" ? "DIAGNOSIS" : next);
  };

  /**
   * WHERE THE PROFESSIONAL IS.
   *
   * The order here mirrors the order the body is chosen in, and it has to:
   * if the two disagree, the app animates a move to a screen it is not
   * showing. Kept adjacent for exactly that reason.
   */
  /*
   * Mirrors the state `goPro` records, for the same reason the customer
   * side keeps `hereRef`: `goPro` is memoised with no dependencies so
   * every screen can hold a handler built from it, which means it cannot
   * close over the current view.
   */
  useEffect(() => {
    proHere.current = { view: proView, tab };
  }, [proView, tab]);

  /*
   * And everything a crossing would otherwise throw away — see
   * `ProMemory`. Written on every change rather than on the way out,
   * because there is no "way out": the component is simply unmounted.
   */
  useEffect(() => {
    if (!memory) return;
    memory.current = { tab, presence, job, proView, onlineSince, shiftNet, shiftJobs, settled, takenRequest };
  }, [memory, tab, presence, job, proView, onlineSince, shiftNet, shiftJobs, settled, takenRequest]);

  /* A sample call's customer answers by himself, three seconds after he is asked.
     (A ref: the shell hands a fresh handler on every render, which would restart the wait.) */
  const sampleAnswer = useRef(onSampleCustomer);
  sampleAnswer.current = onSampleCustomer;
  useEffect(() => {
    if (!takenRequest?.sample) return;
    const what: "prequote" | "quote" | "completion" | null =
      preQuoteSent && !preQuoteApprovedAt && !job ? "prequote"
      : job === "WAITING_QUOTE_APPROVAL" ? "quote"
      : job === "COMPLETION_PENDING" && !completionConfirmed ? "completion"
      : null;
    if (!what) return;
    const t = setTimeout(() => sampleAnswer.current?.(what), 3000);
    return () => clearTimeout(t);
  }, [takenRequest?.sample, preQuoteSent, preQuoteApprovedAt, job, completionConfirmed]);

  /* An open sheet is the first thing the phone's back closes. */
  const proSheetRef = useRef(proSheet);
  proSheetRef.current = proSheet;
  useEffect(() => {
    if (proSheet) pushBackEntry();
  }, [proSheet]);
  useEffect(
    () =>
      setBackHandler(() => {
        if (proSheetRef.current) {
          setProSheet(null);
          return true;
        }
        const previous = proBack.current.pop();
        if (previous) {
          setProView(previous.view);
          setTab(previous.tab);
          return true;
        }
        return onBackOut();
      }),
    [onBackOut]
  );

  const proScreen = useMemo(() => {
    const name =
      settled !== null
        ? "settled"
        : proView === "chat"
          ? "chat"
          : proView === "quote"
            ? "quote"
          : tab === "earnings" || tab === "verify" || tab === "profile"
            ? tab
            : job
              ? "job"
              : proView === "presence"
                ? "presence"
                : proView === "pricing"
                ? "pricing"
                : "shift";
    /*
     * GOING ONLINE IS A CHANGE OF SCREEN, AND WAS NOT TREATED AS ONE.
     *
     * Amit: *"למה נראה כאילו זה נגלל והמסך לא זז?"*
     *
     * The shift screen shows completely different content online and
     * offline — a countdown and earnings against a readiness summary —
     * but both sat under one key. So pressing the biggest button on the
     * professional's app played no transition at all, and the scroll
     * position carried over into content of a different height. What he
     * saw was the page appearing to scroll under his thumb, which is
     * exactly what happens when the content changes and the offset does
     * not.
     *
     * The subject carries the shift state now, so the two states are two
     * screens: a transition plays and each opens at the top.
     */
    /*
     * AND SO IS EVERY STEP OF A JOB.
     *
     * Amit: *"לחצתי על הגעתי, נשארתי שוב באותו מסך. חייב תחלופה
     * ועניין."*
     *
     * The customer's side got this earlier today; this side still had
     * ONE key for the whole visit. So a professional pressed the only
     * button on the screen — "יוצא לדרך", then "הגעתי", then "מתחיל
     * אבחון" — and each time the app changed a word and a button while
     * the screen itself did not move at all, keeping the scroll position
     * from the step before.
     *
     * Each state is its own screen now: the slide plays, it opens at the
     * top, and the five-step tracker's mark advances. Pressing the
     * button visibly does something, which is the least a button owes.
     */
    const subject =
      name === "shift"
        ? presence === "OFFLINE"
          ? "offline"
          : "online"
        : name === "job"
          ? job
          : null;
    return {
      key: screenKey({ side: "pro", name, subject }),
      screen: { side: "pro" as const, name },
    };
  }, [settled, proView, tab, job, presence]);

  const body = settled !== null ? (
    <ProJobSettledBody
      addedNetMinorUnits={settled}
      shiftNetMinorUnits={shiftNet}
      shiftJobCount={shiftJobs}
      onlineMinutes={onlineSince === null ? 0 : Math.floor((shiftNow - onlineSince) / 60000)}
      returningToAvailable={presence === "AVAILABLE"}
      onDone={() => setSettled(null)}
      width={width}
      height={bodyH}
    />
  ) : proView === "chat" ? (
    <ChatBody
      side="pro"
      counterpartNameHe="עמית"
      counterpartSeed="cust_demo_1"
      jobTitleHe={takenRequest?.serviceNameHe ?? "העבודה"}
      jobOpen
      messages={proChat}
      quickRepliesHe={proQuickReplies}
      onSend={(t) => setProChat((c) => [...c, { id: `p${c.length}`, from: "pro", textHe: t, atHe: nowHHMM() }])}
      onCall={() => setProSheet("call")}
      onBack={() => { if (!goBack()) setProView(null); }}
      width={width}
      height={bodyH}
    />
  ) : tab === "earnings" ? (
    <ProEarningsBody
      /*
       * No "net", no fee lines and no payout date: PRO NOW's commission and
       * the payout schedule are undecided (/CLAUDE.md §4). And a professional
       * who joined today has earned only what this shift settled — nothing
       * from a sample week (Amit: "המלל לא קשור למקצוען שבניתי").
       */
      periodNetMinorUnits={null}
      periodGrossMinorUnits={joined ? shiftNet : 215300}
      periodJobCount={joined ? shiftJobs : 14}
      periodLabelHe={joined ? "היום" : "השבוע"}
      days={joined ? [] : earningDays}
      jobs={joined ? doneJobs : earningJobs}
      nextPayoutHe={null}
      nextPayoutMinorUnits={null}
      width={width}
      height={bodyH}
    />
  ) : tab === "verify" ? (
    /* ----------------------------------------------------------------
       ONE CREDENTIAL AT A TIME, WHEN ONE IS OPEN.

       Amit: *"כל מה שאני לוחץ פה פותח לי בכלל משהו אחר ולא מחובר"*, and
       he was right in the most literal way: `onOpenStep` ignored WHICH
       step had been pressed and opened the services sheet, so five
       different credentials in five different states all led to the same
       unrelated screen.
       ---------------------------------------------------------------- */
    openStep ? (
      <ProVerificationStepBody
        step={openStep}
        /*
         * No submit handler, deliberately. The identity provider is an
         * open decision (/CLAUDE.md §4), and a button that photographs
         * somebody's identity card and says "הוגש" would be presenting a
         * stub as production. The screen says so itself.
         */
        onBack={() => setOpenStepId(null)}
        width={width}
        height={bodyH}
      />
    ) : (
    <ProVerificationBody
      displayNameHe={selfNameHe ?? "יוסי"}
      steps={joinedSteps ?? verificationSteps}
      /* Not approved yet: no service is "מאושר לעבודה" while the identity check or documents are missing. */
      services={
        joinedIds && joinedCreds
          ? joined && missingForWork(joined).length > 0
            ? eligibilityFor(joinedCreds, joinedIds).map((x) => ({ ...x, live: false, blockedByHe: `חסר: ${missingForWork(joined).join(" ו")}` }))
            : eligibilityFor(joinedCreds, joinedIds)
          : proEligibility
      }
      onOpenStep={(id) => setOpenStepId(id)}
      width={width}
      height={bodyH}
    />
    )
  ) :
    tab === "profile" ? (
      /*
       * HIS PROFILE, AS A CUSTOMER SEES IT — AND SAID SO.
       *
       * From the UX review: the one light screen on the professional's side
       * read as a different app. It is the customer's view of him, so it is
       * shown framed, under a line that says whose eyes these are.
       */
      <View style={{ width, height: bodyH, backgroundColor: "#0F0B17" }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 }}>
          <Text accessibilityRole="header" style={{ color: "#F7F3FA", fontSize: scale.section, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }}>
            ככה הלקוחות רואים אותך
          </Text>
          {/* Amit: "איך אני חוזר לעריכה?" — from here, to the summary of his join. */}
          {onEditJoin ? (
            <Pressable onPress={onEditJoin} accessibilityRole="button" accessibilityLabel="עריכת החנות והפרטים" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#FF6B4A" }}>
              <Text style={{ color: "#17121F", fontSize: scale.meta, fontWeight: "800" }}>עריכה</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ marginHorizontal: 12, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(247,243,250,0.18)" }}>
          <ProProfileBody
            /*
             * Someone who joined a minute ago has no rating, no reviews, no job
             * count and no "since 2014" — the profile shows him as he is: new.
             */
            professional={
              joined
                ? { id: "joined", displayName: joined.nameHe, profilePhotoUrl: joined.photoUri, verifications: [...(joined.uploadedDocIds?.includes("ID") ? (["IDENTITY_VERIFIED"] as const) : []), ...(joined.uploadedDocIds?.includes("BUSINESS") ? (["BUSINESS_VERIFIED"] as const) : [])], proNowCompletedJobs: 0, proNowRatingAverage: null, proNowRatingCount: 0, externalReputation: null }
                : matchFixture.professional
            }
            services={
              joined && joinedIds
                ? joinedIds.map((id) => {
                    const v = joined.pricesMinorUnits?.[id];
                    return { id, nameHe: SERVICE_PAGES[id]?.nameHe ?? id, mark: (SERVICE_PAGES[id]?.mark ?? "plumbing") as MarkName, priceHintHe: v ? `מ־${formatMoney(money(v, "ILS"))}` : null };
                  })
                : profileServices
            }
            reviews={joined ? [] : profileReviews}
            workPhotoSubjects={joined ? [] : profileWorkPhotos}
            activeSinceYear={joined ? null : 2014}
            areaLabelHe={joined ? joined.city || null : "גוש דן"}
            fromPriceMinorUnits={joined ? Math.min(...Object.values(joined.pricesMinorUnits ?? {}).filter((n) => n > 0), Infinity) === Infinity ? null : Math.min(...Object.values(joined.pricesMinorUnits ?? {}).filter((n) => n > 0)) : 17900}
            width={width - 24}
            height={bodyH - 76}
          />
        </View>
      </View>
    /*
     * ABOVE THE JOB SCREEN, LIKE THE CHAT.
     *
     * The builder is opened FROM a job, so `job` is set the whole time
     * it is up — and with the job screen checked first, pressing "שליחת
     * הצעת מחיר" changed the route and rendered the same screen again.
     * Which is the very fault being fixed, one level down.
     */
    ) : proView === "quote" ? (
      <ProQuoteBuilderBody
        simple={Boolean(takenRequest?.quoteFirst)}
        /* Ordered for someone else: the quote goes to the person who ordered (Amit, 2026-10-01). */
        forOrderer={takenRequest?.onSiteNameHe ? { ordererHe: "עמית", onSiteHe: takenRequest.onSiteNameHe.replace(/ \(תצוגה\)$/, "") } : null}
        onPickPhoto={takenRequest?.quoteFirst ? undefined : async () => (await pickIdPhoto())?.uri ?? null}
        voiceRecorder={takenRequest?.quoteFirst ? null : voiceRecorder}
        /* This trade's rows, never the demo account's plumbing list on a tow. */
        priceList={
          takenRequest
            ? quoteLinesFor(takenRequest.serviceId, pricing.find((r) => r.serviceId === takenRequest.serviceId)?.amountMinorUnits ?? null)
            : priceList
        }
        includesVisitFee={!agreedPrice && !takenRequest?.quoteFirst && (!takenRequest || takenRequest.priceModel === "VISIT_QUOTE")}
        /*
         * The lines already sent, when there are any — so "עדכון ההצעה"
         * opens what was sent rather than an empty form.
         */
        /* "עדכון" only when a quote really was sent before (button audit). */
        updating={Boolean(sentQuoteLines?.length)}
        initialLines={
          /*
           * The bridge carries `kind` as a plain string — it crosses two
           * components and a shell — so it is narrowed here rather than
           * cast. An unknown kind falls to OTHER, which is the honest
           * bucket for "we do not know what this is".
           */
          sentQuoteLines?.map((l) => ({
            ...l,
            kind:
              l.kind === "LABOR" || l.kind === "MATERIALS" ? (l.kind as "LABOR" | "MATERIALS") : ("OTHER" as const),
          })) ??
          /*
           * A SERVICE WITH A SET PRICE OPENS WITH IT ALREADY IN.
           *
           * Amit: *"יש מקצועות שיש להם מחירים קבועים ויש מקצועות שזה
           * משתנה."* On a FIXED service the customer was shown a price
           * before anybody was dispatched, so a blank form asks the
           * professional to invent a number that was already agreed —
           * and every one they type that is not it is a deal being
           * changed by accident.
           *
           * The figure comes from the catalogue, which is where the
           * price lives, and it is editable: finding more work is real
           * and this is a quote, not a receipt. What it is not is
           * blank.
           */
          agreedPrice?.lines
        }
        agreedPriceNoteHe={agreedPrice?.noteHe ?? null}
        initialNotesHe={sentQuoteNotes}
        serviceNameHe={takenRequest?.serviceNameHe ?? "תיקון נזילה בברז"}
        symptomsHe={takenRequest ? takenRequest.intakeBrief.map((l) => l.answerHe) : jobSymptoms}
        customerTextHe={
          takenRequest
            ? [takenRequest.textHe.trim(), takenRequest.destinationHe ? `לאן: ${takenRequest.destinationHe}` : ""].filter(Boolean).join(" · ") || null
            : jobDescription
        }
        /*
         * The same range the customer will be shown on the approval
         * screen — told here, before the quote goes out, rather than
         * behind the professional's back.
         */
        usualUpToMinorUnits={null}
        usualSampleSize={0}
        onSend={(draft) => {
          /* Quote-first, before any job: the price goes to the match card. */
          if (!job && takenRequest?.quoteFirst) {
            onSendPreQuote?.({
              serviceId: takenRequest.serviceId,
              amount: draft ? draft.lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceMinorUnits), 0) : 0,
              notesHe: draft?.notesHe?.trim() ?? "",
            });
            setProView(null);
            return;
          }
          // The lines go to the customer, not only "a quote was sent".
          onSendQuote(draft);
          advanceJob();
          setProView(null);
        }}
        onBack={() => {
          /* Quote-first, nothing sent yet: back is to the call he was answering. */
          if (!job && takenRequest?.quoteFirst && !preQuoteSent) { setProView(null); setOfferAt(Date.now()); return; }
          if (!goBack()) setProView(null);
        }}
        width={width}
        height={bodyH}
      />
    ) : job ? (
      <ProJobBody
        status={job}
        /*
         * The job screen inherits the same request the offer was built
         * from. It used to be hard-coded to "תיקון נזילה בברז" — so a
         * professional could accept a call about a fridge and land on a
         * screen about a tap. The offer and the job are the same job.
         */
        serviceNameHe={takenRequest?.serviceNameHe ?? "תיקון נזילה בברז"}
        mark={(takenRequest?.markName as MarkName) ?? "plumbing"}
        addressHe={takenRequest?.addressHe ? takenRequest.addressHe.split(" · ")[0]! : "רחוב הברזל 12, רמת אביב, תל אביב"}
        accessNoteHe={takenRequest?.addressHe ? takenRequest.addressHe.split(" · ").slice(1).join(" · ") || null : "קומה 3, דירה 9 · קוד לבניין 1408"}
        routeEtaMinutes={9}
        distanceHe="2.4 ק״מ"
        customerNameHe="עמית"
        onSiteContactNameHe={takenRequest?.onSiteNameHe ?? null}
        doorCodeHe={DOOR_CODE}
        customerSeed="cust_demo_1"
        /*
         * THE FIGURE THE CUSTOMER ACTUALLY CHOSE.
         *
         * Amit: *"למה התמונה של הלקוח לא מהדמויות שבנינו?"* Because
         * nothing was passing it. The picker runs on the other side of
         * the app and the choice was never carried across — so a
         * professional saw a monogram about somebody who had picked one
         * of twelve characters we drew.
         *
         * Null when they skipped the picker, which is a real answer:
         * the monogram comes back, claiming no likeness.
         */
        customerPhotoUri={customerFaceUri}
        symptomsHe={
          takenRequest ? takenRequest.intakeBrief.map((l) => l.answerHe) : jobSymptoms
        }
        descriptionHe={
          takenRequest ? takenRequest.textHe.trim() || "הלקוח לא הוסיף תיאור." : jobDescription
        }
        media={takenRequest ? requestMedia(takenRequest) : jobMedia}
        /*
         * The same range the customer will be shown on the quote screen,
         * told to the professional first. Demonstration figures here, as
         * everywhere in this prototype; in the product both sides read
         * `price-context.ts`, which refuses to speak below eight real
         * jobs — so on a marketplace that has not opened, neither side
         * sees anything.
         */
        usualUpToMinorUnits={null}
        usualSampleSize={0}
        payoutMinorUnits={
          (takenRequest?.priceModel ?? "VISIT_QUOTE") === "VISIT_QUOTE" && approvedTotal === null && !takenRequest?.quoteFirst
            ? ownVisitFee ?? SERVICE_PAGES[takenRequest?.serviceId ?? "svc-leak"]?.price?.visitFeeMinorUnits ?? null
            : approvedTotal ?? proOrder?.amountMinorUnits ?? agreedStart?.amount ?? null
        }
        payoutIsEstimate={false}
        onAdvance={advanceJob}
        agreedPriceHe={agreedStart?.labelHe ?? null}
        /* Work priced only once somebody looks: the visit is the job in the app (Amit, 2026-09-29). */
        /* …except when ordered for someone else: then the repair is quoted in the app and approved by
           whoever ordered, so nobody at the door haggles or pays (Amit, 2026-10-01). */
        diagnosisOnly={(takenRequest?.priceModel ?? "VISIT_QUOTE") === "VISIT_QUOTE" && !takenRequest?.quoteFirst && !takenRequest?.onSiteNameHe}
        quoteGoesToHe={takenRequest?.onSiteNameHe ? "עמית" : null}
        visitTerms={visitTermsHe({ id: takenRequest?.serviceId ?? "svc-leak" })}
        kind={takenRequest && pilotServiceById[takenRequest.serviceId] ? pricingKindOf(pilotServiceById[takenRequest.serviceId]!) : "VISIT"}
        proFemale={proIsFemale}
        onFinishDiagnosis={() => setJob("COMPLETION_PENDING")}
        onStartAgreed={
          agreedStart
            ? () => {
                /* Hourly: the first hour is the minimum, as the catalogue says. */
                onAgreedStart?.(agreedStart.amount, agreedStart.nameHe);
                setJob("IN_PROGRESS");
              }
            : undefined
        }
        /*
         * OPENS THE FORM RATHER THAN SENDING A FIXTURE.
         *
         * This used to call `onSendQuote()` and advance the job in one
         * tap, so the quote the customer approved was lines written by
         * nobody for a job nobody had looked at. Amit: *"מתחיל אבחון לא
         * קורה כלום, לא עובר לטופס שהוא ממלא."* The send now happens
         * from the form, once there is something to send.
         */
        onSendQuote={() => goPro("quote")}
        waitingMinutes={
          pendingQuote ? Math.floor((shiftNow - pendingQuote.sentAtMs) / 60_000) : null
        }
        /*
         * "עדכון ההצעה" OPENS THE FORM, PRE-FILLED.
         *
         * It opened a sheet that described sending an updated quote,
         * offered "חזרה לאבחון", and admitted underneath that the
         * prototype had no amount editing. The same shape as the button
         * that sent a fixture: a described capability with no control
         * behind it. Amit: *"איפה החלק שאני מרכיב את הצעת המחיר
         * ללקוח?"*
         *
         * Pre-filled with what was sent, because updating a quote means
         * editing it — usually adding the one thing you found — and a
         * blank form means retyping the lines that did not change.
         */
        onWithdrawQuote={() => goPro("quote")}
        /*
         * A confirmation, because this is the rarest and most
         * consequential thing on the screen and the customer finds out
         * about it either way. See `onRelease` in ProJobBody.
         */
        onRelease={() => setProSheet("release")}
        onNavigate={() => setProSheet("navigate")}
        onCall={() => setProSheet("call")}
        onMessage={() => goPro("chat")}
        width={width}
        height={bodyH}
      />
    ) : proView === "presence" ? (
      /*
       * The map-forward presence screen, pushed from the shift screen. It
       * owns "where am I and which services are armed"; the shift screen
       * owns the numbers. Two questions, two screens — putting both on one
       * makes GO ONLINE compete with six figures, and the button loses.
       */
      <ProOnlineBody
        presenceState={presence}
        displayNameHe={selfNameHe ?? "יוסי"}
        todayNetMinorUnits={presence === "AVAILABLE" ? 48200 : 0}
        todayJobCount={presence === "AVAILABLE" ? 3 : 0}
        services={proServices}
        onToggleOnline={toggle}
        onManageServices={() => setProSheet("services")}
        onOpenPricing={() => goPro("pricing")}
        onBack={() => { if (!goBack()) setProView(null); }}
        width={width}
        height={bodyH}
      />
    ) : proView === "pricing" ? (
      /*
       * WHERE THE PRICE IS SET — דורון's question, answered as a screen.
       *
       * The amounts live in the app rather than in the screen because they
       * are the professional's, not this view's: they belong to the account
       * and will be the server's. Nothing here computes a net payout, since
       * the commission is an undecided business question (/CLAUDE.md §4).
       */
      <ProPricingBody
        rows={pricingRows}
        commissionPercent={null}
        afterHoursPercent={afterHoursPct}
        onAfterHoursChange={setAfterHoursPct}
        priceList={priceList}
        onPriceListChange={setPriceList}
        /* Visit-and-diagnosis only: just the diagnosis price, no price list (Amit). */
        showPriceList={!joined || (joinedIds ?? []).some((id) => pilotServiceById[id] && pricingKindOf(pilotServiceById[id]!) === "LIST")}
        onChange={(serviceId, amountMinorUnits) =>
          setPricing((prev) =>
            prev.map((r) => (r.serviceId === serviceId ? { ...r, amountMinorUnits } : r))
          )
        }
        onBack={() => { if (!goBack()) setProView(null); }}
        width={width}
        height={bodyH}
      />
    ) : (
      <ProShiftBody
        notApproved={
          joined && missingForWork(joined).length > 0 && onFinishJoin && !demoShift
            ? {
                missingHe: missingForWork(joined).join(" ו"),
                onFinish: onFinishJoin,
                /* Showing the app before the identity check (Amit): the shift opens, the lock stays for the real thing. */
                onDemoStart: () => {
                  setDemoShift(true);
                  onAvailableAtChange?.(null);
                  toggle();
                },
              }
            : null
        }
        pendingPriceHe={
          preQuoteSent && !preQuoteApprovedAt
            ? `${formatMoney(money(preQuoteSent.amount, "ILS"))} · ${takenRequest?.serviceNameHe ?? ""}`
            : null
        }
        /* The professional's city is ours, not the old plate — and for one
           who joined, his own shop in it, shutter down or up. */
        backdrop={joined ? <ShiftStorefront result={joined} online={presence !== "OFFLINE" && presence !== "ENDING_SHIFT"} /> : <CityHero />}
        bandHeight={joined ? 210 : undefined}
        geo={proGeo}
        displayNameHe={selfNameHe ?? "יוסי"}
        tradeHe={
          joined
            ? (() => {
                const names = [...(joinedIds ?? []).map((id) => SERVICE_PAGES[id]?.nameHe ?? ""), ...joined.customServicesHe].filter(Boolean);
                return names.length ? `${names[0]}${names.length > 1 ? ` ועוד ${names.length - 1}` : ""}` : null;
              })()
            : null
        }
        onOpenPricing={() => goPro("pricing")}
        presenceState={presence}
        shift={{
          onlineSinceMs: onlineSince,
          // Real running totals, moved only by a job that actually settled.
          // A shift that has just started therefore reads ₪0 / 0 jobs, which
          // is the honest starting state and the case "לשעת חיבור" has to
          // survive.
          settledNetMinorUnits: onlineSince === null ? null : shiftNet,
          completedJobs: shiftJobs,
        }}
        /*
         * A deliberately PARTIAL briefing. The server here knows how many
         * peers are online and what this professional earned last week; it
         * has no area demand reading. The screen must therefore render two
         * lines, not three, and must not fill the gap.
         */
        briefing={joined ? {} : { peersOnline: 2, lastWeekNetMinorUnits: 384000, lastWeekOnlineMinutes: 1215 }}
        services={proServices.map((s) => ({
          id: s.id,
          nameHe: s.nameHe,
          mark: s.mark,
          // Eligible AND armed. Either one alone is not "taking calls".
          live: s.enabled && !s.blockedReasonHe && (armed[s.id] ?? true),
          /* Switched off by him — not a missing document. */
          off: s.enabled && !s.blockedReasonHe && armed[s.id] === false,
        }))}
        nowMs={shiftNow}
        onToggleOnline={() => {
          onAvailableAtChange?.(null);
          toggle();
        }}
        availableAtMs={presence === "OFFLINE" ? availableAtMs : null}
        onAvailableIn={(m) => onAvailableAtChange?.(Date.now() + m * 60_000)}
        onCancelAvailableIn={() => onAvailableAtChange?.(null)}
        onOpenEarnings={() => goProTab("earnings")}
        /*
         * STRAIGHT TO THE SERVICES, NOT TO A SCREEN THAT HAS THEM.
         *
         * This opened the presence screen, which has its own "ניהול"
         * that opens the services sheet — so the link sitting beside
         * "שירותים במשמרת" took two hops to reach the services, and the
         * first hop landed somewhere about location and shift state.
         * Amit: *"איך אני מוריד ומעלה אפשרויות?"* He pressed the label
         * that promised it and did not arrive.
         */
        onManageServices={() => setProSheet("services")}
        onOpenPresence={() => goPro("presence")}
        /*
         * THE PLATE, AND NOTHING ELSE — because that is what the
         * professional's app ships.
         *
         * Handing this the gallery's whole pack draws eleven PRO NOW
         * shopfronts into the band, and the shipped app cannot: it
         * carries one file, for half a megabyte rather than eight. A
         * gallery that shows a richer screen than the product is the
         * two-worlds problem that cost a whole night once already, so it
         * is given exactly what the app has.
         */
        worldSources={proWorldSources}
        width={width}
        height={bodyH}
      />
    );

  return (
    <View style={{ width, height }}>
      {/*
        * The professional's side moves by the same rules as the customer's:
        * four tabs that are siblings of each other, and the work that sits
        * below them. See `navigation-flow.ts`.
        *
        * The job's STATE is not part of the key. A job going from assigned
        * to en route to diagnosis is one screen following a job, not three
        * pages — keying on it replayed a page transition over a
        * professional who was mid-drive.
        */}
      <View style={{ height: bodyH, overflow: "hidden" }}>
        <ScreenTransition transitionKey={proScreen.key} screen={proScreen.screen}>
          {body}
        </ScreenTransition>
      </View>

      {/*
        * An offer ARRIVES. It does not replace a tab — it rises over
        * whatever the professional was looking at, the way a call does,
        * because that is what makes it an event rather than a page.
        */}
      {offer ? (
        <RiseIn key={offerAt ?? 0} width={width} height={height}>
          <ProOfferBody
            totalSeconds={OFFER_SECONDS}
            backdrop={<CityHero />}
            proFemale={proIsFemale}
            offer={offer}
            nowMs={now}
            quoteFirst={takenRequest?.quoteFirst ? { destinationHe: takenRequest.destinationHe ?? null } : null}
            onAccept={() => {
              setOfferAt(null);
              /* Quote-first: he names a price; he is assigned when the customer approves it. */
              if (takenRequest?.quoteFirst) {
                setProView("quote");
                return;
              }
              setJob("PRO_ASSIGNED");
            }}
            onSkip={() => setOfferAt(null)}
            width={width}
            height={height}
          />
        </RiseIn>
      ) : null}

      {preQuoteSent && !preQuoteApprovedAt && !job && !offer && proView !== "quote" ? (
        <DemoBar
          dark
          label={takenRequest?.sample ? `ההצעה נשלחה · ${formatMoney(money(preQuoteSent.amount, "ILS"))} — מחכים לאישור הלקוח…` : `ההצעה נשלחה · ${formatMoney(money(preQuoteSent.amount, "ILS"))} — מעבר לצד הלקוח כדי לאשר`}
          onPress={() => (takenRequest?.sample ? onSampleCustomer?.("prequote") : onSeeAsCustomer?.("prequote"))}
          width={width}
        />
      ) : null}

      {showHandover ? (
        <DemoBar
          dark
          label={
            takenRequest?.sample
              ? "מחכים לאישור הלקוח…"
              : job === "COMPLETION_PENDING"
                ? "מעבר לצד הלקוח כדי לאשר שהעבודה הושלמה"
                : "מעבר לצד הלקוח כדי לאשר את ההצעה"
          }
          onPress={() => {
            const what = job === "COMPLETION_PENDING" ? "completion" : "quote";
            if (takenRequest?.sample) onSampleCustomer?.(what);
            else onSeeAsCustomer?.(what);
          }}
          width={width}
        />
      ) : null}

      {showDemo ? (
        <DemoBar
          dark
          /*
           * The label tells the truth about which of the two things is
           * about to happen: replay the sample offer, or deliver the
           * request the customer side actually just made.
           */
          label={request ? "הקריאה ששלחת בצד הלקוח ממתינה" : "קריאה לדוגמה"}
          onPress={() => {
            setTakenRequest(request ?? (joinedIds ? sampleRequestFor(joinedIds.find((id) => armed[id] !== false) ?? joinedIds[0]!, joined?.city) : null));
            if (request) onTakeRequest();
            setOfferAt(Date.now());
          }}
          width={width}
        />
      ) : null}

      <Sheet
        visible={proSheet === "howitworks"}
        onClose={() => setProSheet(null)}
        colors={proTheme.colors}
        dark
        titleHe="איך זה עובד — בקצרה"
        width={width}
        height={height}
      >
        {[
          {
            n: "1",
            t: "עובדים מתי שרוצים",
            d: "קריאות מגיעות רק במשמרת.",
          },
          {
            n: "2",
            t: "הקריאה מגיעה אליך",
            d: "כל קריאה נשלחת למקצוען אחד בכל פעם.",
          },
          {
            n: "3",
            t: "הכול לפני שמחליטים",
            d: "מה צריך, איפה, זמן נסיעה והתמורה. דקה לענות.",
          },
          {
            n: "4",
            t: "לא עכשיו? אפשר לדלג",
            d: "הקריאה עוברת הלאה.",
          },
          {
            n: "5",
            t: "המחירים שלך",
            d: "קובעים ב״המחירים שלי״ — לכל שירות לפי סוג התשלום שלו.",
          },
        ].map((x) => (
          <View key={x.n} style={styles.howRow}>
            <View style={styles.howNum}>
              <Text style={styles.howNumText}>{x.n}</Text>
            </View>
            <View style={styles.howText}>
              <Text style={styles.howTitle}>{x.t}</Text>
              <Text style={styles.howBody}>{x.d}</Text>
            </View>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          style={[styles.sheetPrimary, { marginBottom: 8 }]}
          onPress={() => {
            setProSheet(null);
            goPro("pricing");
          }}
        >
          <Text style={styles.sheetPrimaryText}>למחירים שלי</Text>
        </Pressable>
        <Pressable onPress={() => setProSheet(null)} accessibilityRole="button" style={{ alignSelf: "center", padding: 8 }}>
          <Text style={styles.howBody}>אחר כך</Text>
        </Pressable>
      </Sheet>

      <Sheet
        visible={proSheet === "quote"}
        onClose={() => setProSheet(null)}
        colors={proTheme.colors}
        dark
        titleHe="עדכון ההצעה"
        width={width}
        height={height}
      >
        {/*
          * Kept only as an explanation now: the ACTION lives on the job
          * screen and opens the form pre-filled. The note under it used
          * to say the prototype had no amount editing, which stopped
          * being true the moment P19 existed — a stale caveat is its own
          * kind of lie.
          */}
        <Text style={styles.sheetBodyDark}>
          כל עוד הלקוח לא אישר, אפשר לשלוח הצעה מעודכנת — למשל אחרי שגילית משהו נוסף באבחון.
          ההצעה הקודמת מתבטלת והלקוח מקבל את החדשה לאישור.
        </Text>
        <Pressable style={styles.sheetPrimary} onPress={() => setProSheet(null)}>
          <Text style={styles.sheetPrimaryText}>הבנתי</Text>
        </Pressable>
      </Sheet>

      <Sheet
        visible={proSheet === "call"}
        onClose={() => setProSheet(null)}
        colors={proTheme.colors}
        dark
        titleHe="שיחה עם הלקוח"
        width={width}
        height={height}
      >
        <Text style={styles.sheetBodyDark}>
          המספרים של שניכם מוסתרים.
        </Text>
        <Pressable style={styles.sheetPrimary} onPress={() => setProSheet(null)}>
          <Text style={styles.sheetPrimaryText}>חיוג ללקוח</Text>
        </Pressable>
        <Text style={styles.sheetNoteDark}>באב־טיפוס אין חיוג אמיתי.</Text>
      </Sheet>

      {/* ----------------------------------------------------------------
          GIVING THE JOB BACK.

          Amit: *"אחרי שהוא רשם כן אני לוקח, הוא לא יכול להתחרט? אין פה
          כפתור ביטול או חזור."*

          What this sheet says is only what is certain. The customer is
          told and re-matched — that is mechanical. What it does NOT say
          is whether this costs the professional anything or what
          repeated releases do to their dispatch: both are business rules
          and both are open (/CLAUDE.md §4 lists cancellation fees by
          name), and a screen that guessed at them would be inventing the
          most consequential sentence on it.
          ---------------------------------------------------------------- */}
      <Sheet
        visible={proSheet === "release"}
        onClose={() => setProSheet(null)}
        colors={proTheme.colors}
        dark
        titleHe="שחרור הקריאה"
        width={width}
        height={height}
      >
        <Text style={styles.sheetBodyDark}>
          הלקוח מקבל הודעה מיד ואנחנו מתחילים לחפש לו מישהו אחר. הקריאה הזו כבר לא שלך.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="אישור שחרור הקריאה"
          style={styles.sheetPrimary}
          onPress={() => {
            setProSheet(null);
            setJob(null);
            setTakenRequest(null);
            onReleaseJob?.(Boolean(takenRequest?.sample));
          }}
        >
          <Text style={styles.sheetPrimaryText}>שחרור הקריאה</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ביטול — חזרה לעבודה"
          style={styles.sheetSecondary}
          onPress={() => setProSheet(null)}
        >
          <Text style={styles.sheetSecondaryText}>חזרה לעבודה</Text>
        </Pressable>
      </Sheet>

      <Sheet
        visible={proSheet === "navigate"}
        onClose={() => setProSheet(null)}
        colors={proTheme.colors}
        dark
        titleHe="ניווט"
        width={width}
        height={height}
      >
        <Text style={styles.sheetBodyDark}>
          {/* The job's own address — the customer's, not a sample one. */}
          {takenRequest?.addressHe ?? "רחוב הברזל 12, רמת אביב · קומה 3, דירה 9 · קוד לבניין 1408"}
        </Text>
        {/*
          * IT OPENS MAPS NOW.
          *
          * Amit: *"איפה הכתובת נפתחת במפות עם זמן מוערך לנסיעה?"* This
          * button said "פתיחה באפליקציית הניווט" and closed the sheet,
          * under a note explaining that the maps VENDOR is an open
          * decision. The note is true and it was excusing the wrong
          * thing: computing routes needs a vendor, handing an address to
          * the app somebody already has needs a link. A professional
          * standing beside their van looking at an address they cannot
          * open was being told the app cannot do what every app does.
          *
          * The drive time they then see is their maps app's, computed by
          * it and presented by it — which is also why this is allowed to
          * exist while `MapsRoutingProvider` is still undecided. We are
          * not claiming a number; we are handing over an address.
          */}
        <Pressable
          style={styles.sheetPrimary}
          onPress={() => {
            const address = takenRequest?.addressHe?.split(" · ")[0] ?? "רחוב הברזל 12, רמת אביב, תל אביב";
            if (!canHandOffToMaps(address)) return;
            const platform: MapsPlatform =
              Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";
            void Linking.openURL(mapsHandoffUrl(address, platform));
            setProSheet(null);
          }}
        >
          <Text style={styles.sheetPrimaryText}>פתיחה באפליקציית הניווט</Text>
        </Pressable>
        <Text style={styles.sheetNoteDark}>
          זמן הנסיעה שיוצג שם הוא של אפליקציית הניווט שלך. PRO NOW לא מחשב מסלולים — ספק המפות עוד
          לא נבחר — אז המספר הזה שלה, לא שלנו.
        </Text>
      </Sheet>

      <Sheet
        visible={proSheet === "services"}
        onClose={() => setProSheet(null)}
        colors={proTheme.colors}
        dark
        titleHe="שירותים פעילים"
        width={width}
        height={height}
      >
        {/*
          * This said "אפשר לכבות ולהדליק שירותים בכל רגע" and gave no way
          * to do either. Amit went looking for the control and concluded
          * the screen was broken, which is the right conclusion: an app
          * that describes a capability it does not offer is worse than
          * one that stays quiet about it.
          */}
        <ProServicesBody
          rows={proServices.map((s) => ({
            id: s.id,
            nameHe: s.nameHe,
            mark: s.mark,
            eligible: s.enabled && !s.blockedReasonHe,
            live: armed[s.id] ?? true,
            blockedReasonHe: s.blockedReasonHe,
          }))}
          onToggle={(id, next) => setArmed((a) => ({ ...a, [id]: next }))}
          width={width - spacing.xl * 2}
          height={Math.round(height * 0.5)}
        />
      </Sheet>

      {/* Hidden while a call is on screen: it was drawn over the offer and
          covered "לא עכשיו", so a call could not be declined. */}
      {offer ? null : (
      <TabBar
        dark
        width={width}
        height={BAR}
        items={[
          /*
           * Plain Hebrew, and a different mark per tab.
           *
           * These read "התמורה שלך" and "מאומת" — product vocabulary that
           * means nothing to someone opening the app for the first time —
           * and two of the four shared the same clock icon, so even the
           * shapes gave no help. A tab label's only job is to say where it
           * goes.
           */
          { key: "shift", label: "המשמרת", mark: "clock" as const },
          { key: "earnings", label: "הרווחים", mark: "wallet" as const },
          { key: "verify", label: "המסמכים שלי", mark: "shield" as const },
          { key: "profile", label: "הפרופיל", mark: "person" as const },
        ]}
        active={tab}
        /* A tab opens its own list, not a document left open on it last time. */
        onPress={(k) => { setOpenStepId(null); goProTab(k as ProTab); }}
        onSwitch={onSwitch}
        switchLabel="לקוח"
      />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------

/**
 * The control that drives the prototype forward.
 *
 * It used to be a small pill floating over the content, and the first person
 * to use it could not hit it. That is a real finding about tap targets, not
 * a prototype quirk: a control that advances the whole demo has no business
 * being the smallest thing on screen. It is now a full-width bar with a
 * 56px target, sitting in its own space above the tab bar rather than
 * hovering over someone else's text.
 */
/**
 * THE DEMO STRIP.
 *
 * It used to float at `bottom: 64`, directly over whatever the screen had
 * put there — which on the professional's screen was "סיום משמרת". Two
 * different actions, stacked on the same pixels: the most important control
 * on the screen sat underneath a demo affordance, and Amit could neither
 * read it nor press it.
 *
 * It is now a strip in the layout, above the tab bar, in a colour that
 * belongs to neither app surface, and it says what it is before it says what
 * it does. A demo control that can be mistaken for the product is worse than
 * no demo control.
 */
/**
 * The screens where walking is a thing that exists.
 *
 * Home, because the street's door is there; the street itself; and the
 * living map, which is where the wait's game runs. Everywhere else the
 * control would be describing something that is not on the screen.
 */
/*
 * WHERE A WALKING DEMO MAKES ANY SENSE AT ALL.
 *
 * "home" was on this list and should not have been. The home screen has
 * a city behind it, which is why it looked like a street — but nobody
 * walks on it: there is no figure, no pad and nothing to steer. So the
 * button was permanently parked over the top-left of the first screen
 * anyone sees, offering a demonstration of something that screen does
 * not do. Amit, on the artifact: *"למה הכפתור הזה תמיד פה."*
 *
 * It belongs on the two screens where somebody actually walks. It also
 * disappears on its own the moment the twelve walking figures arrive —
 * see `walkingDemo` — which is the real answer to "why is it here": it
 * is standing in for art that has not landed yet.
 */

/*
 * THE GROUND SWITCH REACHES FURTHER THAN THE WALKING ONE.
 *
 * Walking only makes sense where there is somebody to walk. A real street
 * plan matters most on the screen Amit watches for twenty minutes — the
 * one where the question is "where are they" — so tracking is in the list
 * even though nobody strolls on it.
 */
/*
 * NOT ON THE STREET.
 *
 * Amit, looking at the stroll screen: *"הכפתורים המיותרים פה והמפה הלא
 * רלוונטית פה מציקים לי."*
 *
 * The real-street-plan switch is a developer control for checking that
 * the world renders over a surveyed extract. On the two screens that
 * TRACK somebody it earns its place — there, a real map is a real
 * question. On the street, which exists to be walked and looked at, it
 * is a third pill in a corner that already had two, over a screen whose
 * whole point is that nothing is in front of it.
 */
const GROUND_SCREENS = ["living", "tracking"];

const DEMO_H = 60;

function DemoBar({
  label,
  onPress,
  width,
  dark: _dark = false,
}: {
  label: string;
  onPress: () => void;
  width: number;
  dark?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`הדגמה: ${label}`}
      style={({ pressed }) => [
        styles.demoBar,
        { width, backgroundColor: "#1B1426" },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.demoBarHint, { color: "#9C92AE" }]}>
        הדגמה — לא חלק מהאפליקציה
      </Text>
      <Text style={[styles.demoBarText, { color: "#F7F3FA" }]} numberOfLines={2}>
        ▸ {label}
      </Text>
    </Pressable>
  );
}

/**
 * The media the customer actually attached, as placeholder rows.
 *
 * `uri: null` throughout, and the job screen already says so rather than
 * miming playback — the prototype holds the real blobs only on the customer
 * side of this browser tab, and copying them across would be inventing a
 * transfer that has no server behind it. The COUNTS are real, which is the
 * part the professional decides on.
 */
function requestMedia(r: LiveRequest): JobMediaItem[] {
  const out: JobMediaItem[] = [];
  if ((r.voiceSeconds ?? 0) > 0) {
    out.push({
      id: "req-voice",
      kind: "VOICE",
      subjectHe: "הקלטה מהלקוח",
      seconds: Math.round(r.voiceSeconds ?? 0),
      uri: null,
    });
  }
  for (let i = 0; i < r.photos; i += 1) {
    out.push({
      id: `req-photo-${i}`,
      kind: "PHOTO",
      subjectHe: `תמונה ${i + 1} מהלקוח`,
      uri: null,
    });
  }
  return out;
}

/** Slides and fades a full-screen layer in from below. */
function RiseIn({
  children,
  width,
  height,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [height * 0.45, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function TabBar({
  items,
  active,
  onPress,
  onSwitch,
  switchLabel,
  width,
  height,
  dark = false,
}: {
  items: { key: string; label: string; mark: NavGlyphName }[];
  active: string;
  onPress: (key: string) => void;
  onSwitch: () => void;
  switchLabel: string;
  width: number;
  height: number;
  dark?: boolean;
}) {
  const colors = dark ? proTheme.colors : customerTheme.colors;
  return (
    <View
      style={[
        styles.bar,
        {
          width,
          height,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
    >
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable key={it.key} onPress={() => onPress(it.key)} style={styles.barItem} accessibilityRole="tab">
            <TabGlyph name={it.mark} color={on ? colors.actionText : colors.textSecondary} />
            <Text style={[styles.barLabel, { color: on ? colors.actionText : colors.textSecondary }]} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}

      <Pressable onPress={onSwitch} style={styles.barItem} accessibilityRole="button">
        <View style={[styles.switchPill, { backgroundColor: tint.trust(dark ? 0.18 : 0.12) }]}>
          <Text style={[styles.switchText, { color: colors.trust }]} numberOfLines={1}>
            {switchLabel}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The profile tab shows the person's own illustrated face rather than a
 * generic outline — it is the one tab that is about them.
 */
function TabGlyph({ name, color }: { name: NavGlyphName; color: string }) {
  if (name === "person") return <Persona seed="tabbar-person" size={22} />;
  return <NavGlyph name={name} size={22} color={color} />;
}

const styles = StyleSheet.create({
  /*
   * SMALL, AND ON THE LEFT.
   *
   * It began as a full-width strip and covered the greeting and the
   * headline of whatever screen it was on — the app's own words, hidden
   * by a control that is not part of the app. In a right-to-left layout
   * the text runs to the right, so the left edge is the one corner that
   * is reliably free.
   */
  standIn: {
    position: "absolute",
    zIndex: 5,
    /*
     * TOP LEFT, AND ONLY ON THE TWO SCREENS THAT WALK.
     *
     * The complaint was that it was *always* there — it was listed for
     * the home screen, which has a city behind it and nobody walking on
     * it, so it was parked over the first screen anyone sees. That is
     * fixed by the list, not by the position.
     *
     * Moving it to the bottom instead was my own mistake and lasted one
     * screenshot: the wait screen's drawer owns the bottom, and the
     * button landed on top of "לעקוב אחרי". The steer pad and the safety
     * control both sit ABOVE that drawer for exactly this reason, and a
     * gallery-only control has no business taking space they need.
     */
    top: spacing.xl * 2,
    left: spacing.md,
    /*
     * 44 POINTS, BECAUSE THE SWEEP SAID SO.
     *
     * `paddingVertical: 6` made this 36 points tall, and the screen sweep
     * reported it as too small to hit on five different screens. It is a
     * gallery-only control, which is exactly why it was easy to leave —
     * but Amit taps it on a phone, and a control that misses is a control
     * that looks broken. 44 is the floor the sweep enforces for every
     * other target in the product.
     */
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "rgba(46,38,64,0.92)",
    alignItems: "center",
  },
  groundSwitch: {
    position: "absolute",
    zIndex: 5,
    top: spacing.xl * 2 + 52,
    left: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "rgba(46,38,64,0.92)",
    alignItems: "center",
  },
  standInText: { ...t.bodyStrong, color: "#F7F3FA" },
  standInHint: { ...t.caption, color: "#A79FB3" },
  root: { flex: 1, alignItems: "center", justifyContent: "flex-start" },

  notice: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: "rgba(23,18,31,0.92)",
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  noticeText: { ...t.caption, color: "#FFFFFF", textAlign: "center", writingDirection: "rtl" },
  noticeSub: {
    ...t.caption,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: 2,
  },

  howRow: { flexDirection: "row-reverse", gap: 12, marginBottom: 18, alignItems: "flex-start" },
  howNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,92,56,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  howNumText: { ...t.captionStrong, color: proTheme.colors.actionText },
  howText: { flex: 1 },
  howTitle: { ...t.bodyStrong, color: proTheme.colors.textPrimary, textAlign: "right" },
  howBody: {
    ...t.caption,
    fontSize: scale.meta,
    lineHeight: 20,
    color: proTheme.colors.textSecondary,
    textAlign: "right",
    marginTop: 2,
  },
  demoBar: {
    height: DEMO_H,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: "rgba(185,160,230,0.45)",
  },
  sheetBody: {
    ...t.body,
    fontSize: scale.meta,
    color: customerTheme.colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 22,
  },
  sheetPrimary: {
    minHeight: 54,
    borderRadius: radii.md,
    backgroundColor: customerTheme.colors.action,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  /*
   * White on coral is 3.07:1 — below WCAG for body text, and the same
   * defect the palette split was written to remove. Ink on coral is 5.99:1.
   */
  sheetPrimaryText: { ...t.bodyStrong, fontSize: scale.body, color: customerTheme.colors.onAction },
  /*
   * The side switch is a prototype affordance, not product navigation —
   * a real customer has no professional side to jump to. It sits quietly
   * at the bottom-left rather than occupying a slot in a navigation bar.
   */
  sideSwitch: {
    minHeight: 44,
    minWidth: 68,
    alignItems: "center",
    marginLeft: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: tint.trust(0.2),
  },
  /*
   * The teal that is legible on ivory is 3.76:1 on the dark header — the
   * audit caught it on eight screens the moment the customer app went dark.
   * The dark side already has a token for this exact problem.
   */
  sideSwitchText: { ...t.caption, fontSize: scale.micro, fontWeight: "700", color: proTheme.colors.trust },
  sheetSecondary: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  sheetSecondaryText: { ...t.captionStrong, color: customerTheme.colors.statusDanger },
  sheetNote: {
    ...t.caption,
    color: customerTheme.colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },

  sheetBodyDark: {
    ...t.body,
    fontSize: scale.meta,
    color: proTheme.colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 22,
  },
  sheetNoteDark: {
    ...t.caption,
    color: proTheme.colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },

  demoBarText: { ...t.bodyStrong, fontSize: scale.meta, color: "#FFFFFF", writingDirection: "rtl", textAlign: "center" },
  demoBarHint: { ...t.caption, fontSize: scale.micro, color: "rgba(255,255,255,0.65)", writingDirection: "rtl" },

  bar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingBottom: 6,
  },
  barItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 6 },
  barLabel: { ...t.caption, fontSize: scale.micro, fontWeight: "600", writingDirection: "rtl" },

  switchPill: {
    minHeight: 44,
    minWidth: 78,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  switchText: { ...t.caption, fontSize: scale.micro, fontWeight: "700", writingDirection: "rtl" },
});

/**
 * WHAT THE GALLERY DID INSTEAD OF THE REAL THING.
 *
 * Two places in this preview stop short of an action the shipping app
 * performs: handing a URL to the platform's browser, and sending a
 * business owner's details somewhere. Both stop for the same reason —
 * a developer gallery must not navigate a reviewer away mid-walk, and
 * must never appear to have submitted something it swallowed.
 *
 * So the gallery says so, on screen, in the place the action would have
 * happened. A silent no-op would look exactly like a working button,
 * which is the failure this note exists to prevent.
 */
/*
 * EVERYONE, NOT ONE TRADE.
 *
 * Amit: *"אל תתמקד במקצוע אחד של מספרה — הסבר כללי לכולם."* So the
 * explaining slides show the whole of it: the city from above and down
 * its street past every shop, the twelve figures you can walk as, and
 * the professionals of every trade standing together.
 */
/*
 * THE WHOLE CITY, IN ITS OWN LIGHT.
 *
 * Amit, on the phone: *"אני סתם רואה ציור של רחוב מפעם"* — and before
 * it, *"רוצה של העיר כולה"* and *"לא מסך כהה מדי"*. The picture the 3D
 * city opens on is exactly that: the whole of it at dusk, sea, towers and
 * the lit street, in our palette. It drifts slowly so it reads as a place.
 */
const CITY_HERO_CSS = "@keyframes pnCity{0%{transform:scale(1.02) translateX(0)}100%{transform:scale(1.12) translateX(-3%)}}";
/*
 * MORNING OR EVENING, BY THE PHONE'S CLOCK (see `daylight.ts`).
 *
 * The painted skyline and the painted street are evenings; by day the
 * same places are shown as our own city photographs them in daylight.
 */
const DAY = isDaytime();
const CITY_BG = DAY
  ? { src: "./world/splash_city.webp", pos: "64% 50%" } /* the evening city in both modes — the daytime render was the foggy one (UX audit) */
  : { src: "./world/splash_city.webp", pos: "64% 50%" };

function CityHero({ lift = 0 }: { lift?: number }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#2a1838" }}>
      <style>{CITY_HERO_CSS}</style>
      <img
        src={CITY_BG.src}
        alt=""
        style={{
          position: "absolute", left: 0, right: 0, top: `${-lift}%`, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: CITY_BG.pos, filter: "brightness(1.1) saturate(1.12)",
          animation: "pnCity 22s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
}

const PRO_LINEUP = ["home", "hair", "auto", "care", "tech", "pets", "appliance", "well", "move"] as const;
/*
 * PICTURES ARRIVE TOGETHER, NOT ONE BY ONE.
 *
 * Amit: *"הדמויות נטענות לא טוב"* — each figure popped in as its file came,
 * so a row of people assembled itself in front of him. A group is held until
 * every file has arrived (or 2.5 seconds have passed), then it rises in as one.
 */
function useAllLoaded(urls: readonly string[]): boolean {
  const [ready, setReady] = useState(false);
  const key = urls.join("|");
  useEffect(() => {
    let left = urls.length;
    let live = true;
    const done = () => { if (live && --left <= 0) setReady(true); };
    urls.forEach((u) => { const im = new window.Image(); im.onload = done; im.onerror = done; im.src = u; });
    const t = setTimeout(() => live && setReady(true), 2500);
    return () => { live = false; clearTimeout(t); };
  }, [key]);
  return ready;
}
const ARRIVE_CSS = "@keyframes pnArrive{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}";

function ProsLineup() {
  const ready = useAllLoaded(PRO_LINEUP.map((id) => `./world/character_${id}_world.webp`));
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <style>{ARRIVE_CSS}</style>
      <img src="./clips/show_salon_side.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, filter: "blur(2px)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "9%", height: "50%", display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", gap: "0 2px", padding: "0 6px", opacity: ready ? 1 : 0, animation: ready ? "pnArrive .6s cubic-bezier(.2,.7,.2,1) both" : undefined }}>
        {PRO_LINEUP.map((id, i) => (
          <img
            key={id}
            src={`./world/character_${id}_world.webp`}
            alt=""
            style={{ height: i < 4 ? "46%" : "50%", marginTop: i < 4 ? 0 : -18, filter: "drop-shadow(0 10px 14px rgba(0,0,0,.55))" }}
          />
        ))}
      </div>
    </div>
  );
}
/*
 * "YOU KNOW WHO IS COMING" — AS THE CARD YOU WOULD ACTUALLY SEE.
 *
 * Amit: *"עדיף שיהיה שם איך נראה עסק של מקצוען עם כל פרטי האימות, שייתן
 * הרגשה של ביטחון."* The professional in our drawn style on the card the
 * match screen shows, and on it only what PRO NOW checks: identity, the
 * credentials for this kind of work, approval for this service, the arrival
 * and the price shown before you confirm. Marked as an example, because it
 * is one — no real person, no invented rating.
 */
function TrustCard() {
  const row = (t: string) => (
    <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 8, color: "#F7F3FA", fontSize: scale.meta, lineHeight: "20px" }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: "#2FBF8A", color: "#0d0a16", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: scale.meta, fontWeight: 800, flex: "0 0 auto" }}>✓</span>
      <span style={{ textAlign: "right" }}>{t}</span>
    </div>
  );
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src={CITY_BG.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: CITY_BG.pos, opacity: 0.25, filter: "blur(3px)" }} />
      <div style={{ position: "absolute", left: "7%", right: "7%", top: "7%", borderRadius: 22, padding: "16px 16px 18px", background: "rgba(23,18,31,.82)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 20px 50px rgba(0,0,0,.5)", direction: "rtl" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <img src="./world/character_home_world.webp" alt="" style={{ height: 150, filter: "drop-shadow(0 8px 12px rgba(0,0,0,.5))" }} />
          <div style={{ flex: 1, paddingBottom: 8 }}>
            <div style={{ color: "#F7F3FA", fontSize: scale.body, fontWeight: 800 }}>יוסי · אינסטלציה</div>
            <div style={{ color: "rgba(247,243,250,.62)", fontSize: scale.micro, marginTop: 2 }}>דוגמה לכרטיס מקצוען</div>
            <div style={{ display: "inline-block", marginTop: 8, padding: "4px 10px", borderRadius: 999, background: "rgba(47,191,138,.16)", color: "#7FE3BC", fontSize: scale.micro, fontWeight: 700 }}>מאומת ב-PRO NOW</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
          {row("זהות אומתה")}
          {row("תעודות נבדקו לסוג העבודה הזאת")}
          {row("מאושר לשירות שביקשתם")}
          {row("רואים מתי יגיע — לפני שמאשרים")}
          {row("המחיר מוצג לפני שמתחילים לעבוד")}
        </div>
      </div>
    </div>
  );
}

/*
 * "FOR THE PEOPLE YOU LOVE" — AND YOU STAY IN CONTROL FROM AFAR.
 *
 * Amit: *"סבא וסבתא, ורואים את המקצוען שלנו מתקן להם נזילה במטבח — ושולטים
 * בהצעות המחיר ובתשלום גם מרחוק; להראות בקטן איך נראה אישור הצעת מחיר
 * ותשלום."* The scene in our drawn style, and over it the card the person
 * who sent the request sees on their own phone. An example, and marked as
 * one: no amount is printed, because an invented price is the one number
 * a demo must never show.
 */
function FamilyScene() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src="./clips/kitchen.jpg" alt="" style={{ position: "absolute", left: 0, right: 0, top: "6%", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%", filter: "saturate(1.08)" }} />
      <div style={{ position: "absolute", left: "22%", right: "5%", top: "5%", borderRadius: 18, padding: "12px 14px", background: "rgba(23,18,31,.9)", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 16px 40px rgba(0,0,0,.55)", direction: "rtl" }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#F7F3FA", fontSize: scale.meta, fontWeight: 800 }}>הצעת מחיר התקבלה</span>
          <span style={{ color: "rgba(247,243,250,.55)", fontSize: scale.micro }}>דוגמה</span>
        </div>
        <div style={{ color: "rgba(247,243,250,.8)", fontSize: scale.meta, marginTop: 4 }}>אצל סבא וסבתא · יוסי, אינסטלציה</div>
        {/* The same amount the demo quote carries elsewhere (₪250), marked
            as an example — a line the way a real quote lists it. */}
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,.06)", display: "grid", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#F7F3FA", fontSize: scale.meta }}>
            <span>החלפת אטם בברז המטבח</span><span>₪250</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#F7F3FA", fontSize: scale.meta, fontWeight: 800, borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 4 }}>
            <span>סה״כ לאישור</span><span>₪250</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <span style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 12, background: "#FF6B4A", color: "#1a0f0c", fontWeight: 800, fontSize: scale.meta }}>אישור · ₪250</span>
          <span style={{ flex: "0 0 34%", textAlign: "center", padding: "8px 0", borderRadius: 12, background: "rgba(255,255,255,.1)", color: "#F7F3FA", fontSize: scale.meta }}>שאלה</span>
        </div>
      </div>
    </div>
  );
}

/*
 * THE SEARCH, WALKING OUR STREET.
 *
 * Amit: *"מסך האיתור צריך להיות חי ומונפש, כאילו הוא מטייל ברחוב ומאתר
 * עסקים רלוונטיים — לא סטטי."* So while we look, the street of our own
 * shopfronts slides past, vans drive both ways, people walk, a scanning
 * light sweeps — and every shop of the trade that was asked for lights up
 * as it passes, "checking". When somebody is found the street stops on
 * that shop and the camera goes in to its door, where the professional is
 * standing — and the card opens over it.
 *
 * Drawn with the delivered art and CSS only: no video, no WebGL, so it is
 * instant on a phone.
 */
/* The next shops to try in the same line of work, when one is turned down. */
const DEPT_SHOPS: Readonly<Record<string, readonly string[]>> = {
  HOME_URGENT: ["home", "help", "build"], BEAUTY: ["hair", "nails"], PETS: ["pets", "vet"],
};
const DEPT_SHOP: Readonly<Record<string, string>> = {
  HOME_URGENT: "home", APPLIANCES: "appliance", HOME_CARE: "care", BEAUTY: "hair", WELLNESS: "well",
  PETS: "pets", VEHICLE: "auto", LOGISTICS: "move", TECH: "tech", ODD_JOBS: "help", IMPROVEMENT: "build",
};
/*
 * A TRADE'S PAGE, IN FRONT OF ITS OWN SHOP.
 *
 * Amit: *"אחרי שאני בוחר קטגוריה, הדף הבא עדיין ברקע של העולם הישן."* The
 * trade's shop from our street — drawn open with its professional in the
 * doorway where that drawing exists, its street front otherwise — over our
 * city at dusk, drifting slowly so the page is alive.
 */
function TradeBackdrop({ dept }: { dept: string | null }) {
  const id = (dept && DEPT_SHOP[dept]) || "home";
  const art = ["hair", "home", "nails"].includes(id) ? `./world/venue_${id}.webp` : `./world/m/shop_${id}.webp`;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#2a1838" }}>
      <style>{CITY_HERO_CSS}</style>
      <img src={CITY_BG.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "60%", objectFit: "cover", objectPosition: DAY ? "50% 40%" : "64% 40%", opacity: 0.7, animation: "pnCity 24s ease-in-out infinite alternate" }} />
      <img src={art} alt="" style={{ position: "absolute", left: "-2%", top: "7%", width: "46%", height: "25%", objectFit: "contain", objectPosition: "left bottom", filter: "drop-shadow(0 18px 30px rgba(0,0,0,.55))" }} />
    </div>
  );
}

/*
 * "HE'S ON HIS WAY" — THE MOMENT AFTER YES.
 *
 * Amit: *"אחרי שמצאנו מקצוען — משהו שיקפוץ שהמקצוען בדרך אלינו, עם פיצ'ר
 * חדשני מגניב, ורק אחרי זה שיחזור לרחוב החי."* A full-screen beat: his
 * shop on one side, your home on the other, and his van pulling out and
 * driving the road between them while the minutes (the server's ETA) count
 * on a ring. It leaves by itself after a few seconds, or on a tap.
 */
const OTW_CSS = `
@keyframes pnOtwIn{from{opacity:0}to{opacity:1}}
@keyframes pnOtwCard{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:none}}
@keyframes pnOtwVan{0%{left:66%}100%{left:16%}}
@keyframes pnOtwDash{to{background-position:-40px 0}}
@keyframes pnOtwRing{from{stroke-dashoffset:0}to{stroke-dashoffset:251}}
@keyframes pnOtwPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
`;
/* The trades whose van is drawn from the side; the rest drive the PRO NOW van. */
const SIDE_DRAWN = new Set(["appliance", "beauty", "clean", "courier", "electric", "tech", "tow", "vet", "well"]);
/* A short note about an order that is not on screen (multi-order spec §4): tap to open it. */
function OrderToastView({ toast, onPress, top }: { toast: { titleHe: string; metaHe: string; orderId: string | null }; onPress: () => void; top: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.bezier(0.16, 0.84, 0.34, 1), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{ position: "absolute", top, left: 16, right: 16, zIndex: 60, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${toast.titleHe}. ${toast.metaHe}`}
        style={{ minHeight: 64, borderRadius: 18, backgroundColor: "rgba(23,18,31,0.96)", borderRightWidth: 3, borderRightColor: "#FF5C38", paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#F7F3FA", fontSize: scale.body, fontWeight: "800", textAlign: "right" }}>{toast.titleHe}</Text>
          <Text style={{ color: "rgba(247,243,250,0.68)", fontSize: scale.meta, textAlign: "right", marginTop: 2 }}>{toast.metaHe}</Text>
        </View>
        {toast.orderId ? (
          <View style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#FF5C38", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: scale.meta, fontWeight: "800" }}>לצפייה</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function OnTheWay({ shop, proName, etaMinutes, onSiteNameHe = null, vehicle = null, homeUri = null, own = null, onDone }: { shop: string; proName: string; etaMinutes: number; onSiteNameHe?: string | null; vehicle?: string | null; homeUri?: string | null; /* The professional who joined: his own designed shop, sign and all. */ own?: OnboardingResult | null; onDone: () => void }) {
  const shopId = shop;
  const she = FEMALE_NAMES_HE.has(proName);
  const g = (m: string, f: string) => (she ? f : m);
  /* Once, on arrival: the host re-renders every second (the ETA clock),
     and a timer keyed on a fresh callback would never get to fire. */
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 5200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div onClick={onDone} role="button" aria-label="המקצוען בדרך — המשך" style={{ position: "absolute", inset: 0, zIndex: 50, background: "radial-gradient(120% 80% at 50% 30%, #50285a, #0c0812 72%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "pnOtwIn .35s ease both", direction: "rtl", cursor: "pointer" }}>
      <style>{OTW_CSS}</style>
      <div style={{ position: "relative", width: 150, height: 150, animation: "pnOtwPulse 1.6s ease-in-out infinite" }}>
        <svg width="150" height="150" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#FF6B4A" strokeWidth="6" strokeLinecap="round" strokeDasharray="251" style={{ animation: "pnOtwRing 5.2s linear both" }} />
        </svg>
        <img src={`./world/character_${shopId}_icon.webp`} alt="" style={{ position: "absolute", left: 25, top: 18, width: 100, height: 112, objectFit: "contain" }} />
      </div>
      <div style={{ marginTop: 18, color: "#fff", fontSize: scale.title, fontWeight: 900, animation: "pnOtwCard .6s .1s both" }}>{onSiteNameHe ? `${proName} ${g("קיבל", "קיבלה")} את הקריאה אל ${onSiteNameHe.replace(/ \(תצוגה\)$/, "")}!` : `${proName} ${g("קיבל", "קיבלה")} את הקריאה!`}</div>
      <div style={{ marginTop: 6, color: "#FF9A6B", fontSize: scale.body, fontWeight: 800, animation: "pnOtwCard .6s .2s both" }}>{g("מגיע", "מגיעה")} בעוד {etaMinutes} דק׳</div>
      <div style={{ position: "relative", width: "86%", height: 120, marginTop: 26, animation: "pnOtwCard .6s .3s both" }}>
        <div style={{ position: "absolute", left: "8%", right: "8%", top: 76, height: 6, borderRadius: 3, backgroundImage: "linear-gradient(90deg, rgba(255,154,107,.9) 50%, transparent 50%)", backgroundSize: "20px 6px", animation: "pnOtwDash .6s linear infinite" }} />
        {own ? (
          <div style={{ position: "absolute", right: 0, top: 0, width: 88, height: 88 }}>
            <FacadeWithSign facadeUri={onboardShopFor(own.serviceIds[0] ?? null).facadeUri} result={own} px={88} />
          </div>
        ) : (
          <img src={`./world/m/shop_${shopId}.webp`} alt="" style={{ position: "absolute", right: 0, top: 0, width: 88, height: 88, objectFit: "contain" }} />
        )}
        <div style={{ position: "absolute", left: 0, top: 22, width: 64, height: 64, borderRadius: 32, overflow: "hidden", background: "rgba(255,255,255,.1)", border: "2px solid #FF9A6B", boxShadow: "0 0 18px rgba(255,107,74,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: scale.title }}>
          {homeUri ? <img src={homeUri} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "⌂"}
        </div>
        {/* From his shop (right) to your home (left), nose first. */}
        <img src={vehicle && SIDE_DRAWN.has(vehicle) ? `./world/pn_${vehicle}_side.webp` : "./world/m/van_side.webp"} onError={(e) => { e.currentTarget.src = "./world/m/van_side.webp"; }} alt="" style={{ position: "absolute", top: 42, height: 44, animation: "pnOtwVan 5s cubic-bezier(.4,0,.2,1) both" }} />
        <div style={{ position: "absolute", right: 4, top: 96, color: "rgba(247,243,250,.7)", fontSize: scale.micro }}>{g("החנות שלו", "החנות שלה")}</div>
        <div style={{ position: "absolute", left: 8, top: 96, color: "rgba(247,243,250,.7)", fontSize: scale.micro }}>{onSiteNameHe ? `אצל ${onSiteNameHe.split(" ")[0]}` : "הבית שלך"}</div>
      </div>
      <div style={{ marginTop: 22, color: "rgba(247,243,250,.75)", fontSize: scale.meta, animation: "pnOtwCard .6s .5s both" }}>{onSiteNameHe ? `ל${onSiteNameHe.split(" ")[0]} נשלחה הודעה עם הפרטים וקוד לדלת` : g("אפשר לעקוב אחריו בכל רגע", "אפשר לעקוב אחריה בכל רגע")}</div>
      {/* The whole screen is the button (button audit #24 found taps "swallowed"): say so. */}
      <div style={{ position: "absolute", bottom: 28, color: "rgba(247,243,250,.55)", fontSize: scale.micro, animation: "pnOtwCard .6s 1.2s both" }}>נגיעה במסך להמשך</div>
    </div>
  );
}

/*
 * THE CITY, FETCHED BEFORE IT IS NEEDED.
 *
 * The search flies over the 3D city, and on a phone its files take a few
 * seconds — which was a dark first second of searching. While the customer
 * is still choosing what they need, the same files are fetched quietly, a
 * few at a time, so the browser already holds them when the search opens.
 */
let cityWarmed = false;
function warmCity() {
  if (cityWarmed || typeof window === "undefined") return;
  cityWarmed = true;
  const phone = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 768;
  const files = (CITY_PHONE_FILES as string[]).map((f) => (phone ? f : f.replace("world/s/", "world/m/")));
  let i = 0;
  const next = () => {
    const f = files[i++];
    if (!f) return;
    const img = new Image();
    img.onload = img.onerror = next;
    img.src = "./" + f;
  };
  for (let k = 0; k < 4; k++) next();
}

/*
 * THE SEARCH, OVER OUR LIVING CITY.
 *
 * The 3D city itself, flown from above (see `search` on City), with the
 * search drawn over it as radar waves spreading from the middle of the
 * screen. When somebody is found the waves stop, the camera goes down into
 * their shop, and the professional steps into the frame at the window.
 */
const RADAR_CSS = "@keyframes pnRadar{0%{transform:translate(-50%,-50%) scale(.15);opacity:.9}100%{transform:translate(-50%,-50%) scale(2.6);opacity:0}}@keyframes pnProIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}";
function SearchCity({ dept, found, proName, pick = 0, own = null }: { dept: string | null; found: boolean; proName?: string; pick?: number; own?: { id: string; nameHe: string; colorHex: string; logoUri: string | null; figureUri: string } | null }) {
  const list = (dept && DEPT_SHOPS[dept]) || [(dept && DEPT_SHOP[dept]) || "home"];
  /* When the one found is the professional who joined, the camera finds HIS shop — the one he designed. */
  const shopId = own ? own.id : list[pick % list.length]!;
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    setArrived(false);
    if (!found) return;
    /* A second look at the same trade flies a loop down the street first. */
    const t = setTimeout(() => setArrived(true), pick > 0 && list.length === 1 ? 6300 : 4300);
    return () => clearTimeout(t);
  }, [found, pick]);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#1a1222" }}>
      <style>{RADAR_CSS}</style>
      {/* Brighter while searching: the night street is moody at eye level
          and simply dark from this high up. */}
      <div style={{ position: "absolute", inset: 0, filter: found ? "none" : "brightness(1.45) saturate(1.15)", transition: "filter 1.2s ease" }}>
        <City hud={false} search={{ shopId, phase: found ? "found" : "searching", visit: pick }} ownShop={own ? { id: own.id, nameHe: own.nameHe, colorHex: own.colorHex, logoUri: own.logoUri } : null} />
      </div>
      {!found ? [0, 1, 2].map((i) => (
        <div key={i} style={{ position: "absolute", left: "50%", top: "46%", width: 320, height: 320, borderRadius: "50%", border: "2px solid rgba(255,154,107,.85)", boxShadow: "0 0 30px rgba(255,107,74,.45) inset", animation: `pnRadar 2.4s ease-out ${i * 0.8}s infinite`, pointerEvents: "none" }} />
      )) : null}
      {!found ? <div style={{ position: "absolute", left: "50%", top: "46%", width: 14, height: 14, borderRadius: "50%", background: "#FF6B4A", transform: "translate(-50%,-50%)", boxShadow: "0 0 20px #FF6B4A" }} /> : null}
      {arrived ? (
        own && own.figureUri.startsWith("blob:") ? (
          <img src={own.figureUri} alt="" style={{ position: "absolute", right: "8%", bottom: "34%", width: 96, height: 96, borderRadius: 48, objectFit: "cover", border: `3px solid ${own.colorHex}`, boxShadow: `0 0 22px ${own.colorHex}`, animation: "pnProIn .8s cubic-bezier(.2,.8,.2,1) both" }} />
        ) : (
          <img src={own ? own.figureUri : `./world/character_${shopId}_world.webp`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", right: "6%", bottom: "30%", height: "38%", filter: "drop-shadow(0 16px 24px rgba(0,0,0,.55))", animation: "pnProIn .8s cubic-bezier(.2,.8,.2,1) both" }} />
        )
      ) : null}
      {arrived && proName ? (
        <div style={{ position: "absolute", right: "6%", bottom: "calc(30% + 38% + 8px)", padding: "6px 12px", borderRadius: 999, background: own ? own.colorHex : "#2FBF8A", color: own ? "#fff" : "#0d0a16", fontWeight: 800, fontSize: scale.meta, direction: "rtl", animation: "pnProIn .8s .2s both" }}>
          ✓ {proName} · פנוי עכשיו
        </div>
      ) : null}
    </div>
  );
}

/*
 * WHICH VAN DRIVES TO YOU: the trade's own livery from the fleet in our street.
 */
const FLEET_BY_DEPT: Readonly<Record<string, string>> = {
  HOME_URGENT: "plumber", APPLIANCES: "appliance", HOME_CARE: "clean", BEAUTY: "beauty", WELLNESS: "well",
  PETS: "vet", VEHICLE: "tow", LOGISTICS: "courier", TECH: "tech", ODD_JOBS: "pod", IMPROVEMENT: "pod",
};
const FLEET_BY_SERVICE: Readonly<Record<string, string>> = {
  "svc-electric": "electric", "svc-socket": "electric", "svc-alarm": "electric", "svc-solar": "plumber", "svc-sealing": "plumber",
  "svc-lock": "pod", "svc-cylinder": "pod", "svc-gas": "plumber", "svc-dog-walk": "pod", "svc-pet-sit": "pod", "svc-pet-groom": "beauty",
};
export function fleetTradeFor(serviceId: string): string {
  return FLEET_BY_SERVICE[serviceId] ?? FLEET_BY_DEPT[departmentCodeByServiceId[serviceId] ?? ""] ?? "pod";
}

/**
 * THE DRIVE, LIVE (Amit, 2026-09-29: "מסך מת שגם השעון לא זז"). Our street
 * in 3D, the professional's van leaving his trade's shop for the light
 * where you live, a camera behind it. Progress is the share of the ETA
 * that has passed — derived from the clock every second, so it moves.
 */
function RouteCity({ serviceId, etaSeconds, startedAtMs, moving, proFirstNameHe = null }: { serviceId: string; etaSeconds: number; startedAtMs: number | null; moving: boolean; proFirstNameHe?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const dept = departmentCodeByServiceId[serviceId] ?? "";
  const shopId = (DEPT_SHOPS[dept] ?? [DEPT_SHOP[dept] ?? "home"])[0]!;
  const progress = moving && startedAtMs ? Math.min(0.97, (now - startedAtMs) / 1000 / Math.max(60, etaSeconds)) : 0;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#120d1a" }}>
      {/* The street as a still until the first frame is drawn — never an empty sky. */}
      <img src="./world/splash_city.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(.8)" }} />
      <City
        hud={false}
        route={{
          shopId,
          trade: fleetTradeFor(serviceId),
          progress,
          moving,
          labelHe: proFirstNameHe ? `${proFirstNameHe} · ${Math.max(1, Math.ceil(((startedAtMs ?? now) + etaSeconds * 1000 - now) / 60000))} דק׳` : undefined,
          photoUri: `./world/character_${shopId}_icon.webp`,
        }}
      />
    </div>
  );
}

/* The city closer in — Amit: *"יותר זום אין, עם מכוניות של בעלי מקצוע
   נוסעות בכביש ליד החנויות."* The welcome keeps the whole city; the first
   slide comes down into one of its streets. */
/*
 * THE STREET WHILE YOU WAIT, ALIVE.
 *
 * Amit: *"אנשים יכולים להיתקע עליה כמה שניות — שיהיה שם תנועה."* The
 * picture of our street (shops, vans, people) with light that moves on
 * it: each shop's neon breathing in its own colour, the lamps flickering
 * the way sodium lamps do, the vans' headlights flaring, specks of light
 * drifting up — and the whole view easing in slowly. The glows are placed
 * on the drawing's own signs and lamps, and move with it.
 */
/*
 * THE FIRST PICTURE: OUR SHOPS.
 *
 * The painted street of neon shops. A row of the trades' professionals
 * stood on its pavement for a while, gently bobbing — Amit, 2026-09-28:
 * *"תוריד את הדמויות המרחפות בהתחלה, זה מוזר — שיישארו בחנויות."* Each
 * professional now stands in the doorway of their own shop in the city,
 * which is where they belong.
 */
/*
 * …AND NOW IT IS ALIVE.
 *
 * Amit, 2026-10-01, on this picture: *"איפה כל השמחת חיים והחיות? למה אין
 * רחוב חי ורואים חנויות ובעלי מקצוע — כל מה שעשינו?"* A still painting was
 * not it. Our twelve shops, each with its professional standing in the
 * doorway (the `venue_*` drawings, joined into one strip so the published
 * file count barely moves), pass slowly along the pavement, as if you were
 * walking down our street, over the evening city. Nobody bobs or floats —
 * the street moves, the people stay at their doors.
 */
const WELCOME_CSS = "@keyframes pnParade{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes pnCity{0%{transform:scale(1.04)}100%{transform:scale(1.12) translateX(-3%)}}";
function WelcomeScene() {
  const ready = useAllLoaded(["./clips/welcome_street.webp"]);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#2a1838" }}>
      <style>{WELCOME_CSS}</style>
      {/* Behind the shops: the evening city by the sea, not the old painted
          street (Amit, twice: "עדיין התמונה הלא טובה פה"). Slowly drifting. */}
      <img src="./world/splash_city.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 40%", opacity: 0.85, animation: "pnCity 30s ease-in-out infinite alternate" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(23,14,36,.15) 0%, rgba(23,14,36,.35) 40%, rgba(15,10,22,.92) 62%, #0f0a16 100%)" }} />
      {/* the pavement the shops stand on */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "38%", height: "8%", background: "linear-gradient(180deg, rgba(255,170,110,.22), rgba(42,24,56,0))" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "9%", height: "31%", overflow: "hidden" }}>
        {/* Shown only once the strip has arrived, then faded in — it used to
            appear in pieces as it loaded (Amit: "הכניסה קופצת"). */}
        <div style={{ display: "flex", height: "100%", width: "max-content", animation: "pnParade 90s linear infinite", willChange: "transform", opacity: ready ? 1 : 0, transition: "opacity .9s ease-out" }}>
          <img src="./clips/welcome_street.webp" alt="" style={{ height: "100%", display: "block", filter: "drop-shadow(0 14px 18px rgba(0,0,0,.45))" }} />
          <img src="./clips/welcome_street.webp" alt="" style={{ height: "100%", display: "block", filter: "drop-shadow(0 14px 18px rgba(0,0,0,.45))" }} />
        </div>
      </div>
    </div>
  );
}


function AvatarsLineup() {
  const ids = ["01", "06", "02", "09", "03", "07", "04", "11", "05", "08", "12", "10"];
  const ready = useAllLoaded(ids.map((id) => `./world/avatar_${id}_portrait.webp`));
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <style>{ARRIVE_CSS}</style>
      <img src="./clips/show_salon_in.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, filter: "blur(2px)" }} />
      <div style={{ position: "absolute", left: "6%", right: "6%", top: "8%", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, opacity: ready ? 1 : 0, animation: ready ? "pnArrive .6s cubic-bezier(.2,.7,.2,1) both" : undefined }}>
        {ids.map((id) => (
          <img key={id} src={`./world/avatar_${id}_portrait.webp`} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 18, background: "rgba(255,255,255,.06)", boxShadow: "0 8px 20px rgba(0,0,0,.45)" }} />
        ))}
      </div>
    </div>
  );
}
function IntroBackdrop({ side, slide }: { side: "customer" | "pro"; slide: number }) {
  if (side === "customer") {
    if (slide === 1) return <AvatarsLineup />;
    if (slide === 2) return <ProsLineup />;
    if (slide === 3) return <TrustCard />;
    if (slide === 4) return <FamilyScene />;
    /* "A whole city": our street of shops with their professionals, alive. */
    return <WelcomeScene />;
  }
  if (slide === 1) return <ProsLineup />;
  /* Amit, 2026-09-30: *"גם התמונות במסכי הסבר היו לא נכונות."* "See the
     job before you accept" showed the hair salon's front, and "the prices
     are yours" showed the street. Each now shows what it says. */
  if (slide === 2) return <ProOfferScene />;
  if (slide === 3) return <ProPricesScene />;
  /* "הרחוב הזה הוא גם שלך": the same living street of shops (Amit: the
     foggy daytime render "עדיין מופיעה" — it is gone everywhere). */
  return <WelcomeScene />;
}

/*
 * THE PROFESSIONAL'S TWO EXAMPLES — a job arriving and his own price list.
 *
 * The same example numbers the demo already uses (the leak job from
 * `offerFixture`, 2.4 km and 9 minutes away; the ₪250 tap washer from the
 * family scene; the ₪179 visit from the leak's catalogue page), marked
 * "דוגמה". No commission and no payout split: that is a business decision
 * still to be made (docs/18-ROADMAP.md), so the job shows the price from
 * HIS list and nothing about what is taken from it.
 */
function ProExampleStage({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src={CITY_BG.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: CITY_BG.pos, opacity: 0.25, filter: "blur(3px)" }} />
      <style>{ARRIVE_CSS}</style>
      {/* The card comes in (Amit: "שיכנס המחירון שלי באפקט"). */}
      <div style={{ position: "absolute", left: "7%", right: "7%", top: "6%", borderRadius: 22, padding: "16px 16px 18px", background: "rgba(23,18,31,.86)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 20px 50px rgba(0,0,0,.5)", direction: "rtl", animation: "pnArrive .7s .15s cubic-bezier(.2,.7,.2,1) both" }}>
        {children}
      </div>
    </div>
  );
}
const exRow = (a: string, b: string, strong = false) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#F7F3FA", fontSize: scale.meta, lineHeight: "20px", fontWeight: strong ? 800 : 400 }}>
    <span>{a}</span><span style={{ flex: "0 0 auto" }}>{b}</span>
  </div>
);
function ProOfferScene() {
  return (
    <ProExampleStage>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(255,107,74,.18)", color: "#FF9A80", fontSize: scale.micro, fontWeight: 800 }}>קריאה חדשה</span>
        <span style={{ color: "rgba(247,243,250,.55)", fontSize: scale.micro }}>דוגמה</span>
      </div>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 8 }}>
        <div style={{ flex: 1, paddingBottom: 6 }}>
          <div style={{ color: "#F7F3FA", fontSize: scale.body, fontWeight: 800 }}>החלפת אטם בברז</div>
          <div style={{ color: "rgba(247,243,250,.7)", fontSize: scale.meta, marginTop: 4 }}>רמת אביב · 2.4 ק״מ ממך · 9 דק׳ נסיעה</div>
          <div style={{ color: "rgba(247,243,250,.7)", fontSize: scale.meta, marginTop: 2 }}>קומה 4, יש מעלית · 2 תמונות מהלקוח</div>
        </div>
        <img src="./world/character_home_world.webp" alt="" style={{ height: 120, filter: "drop-shadow(0 8px 12px rgba(0,0,0,.5))" }} />
      </div>
      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.06)", display: "grid", gap: 4 }}>
        {exRow("לפי המחירון שלך", "₪250", true)}
        <div style={{ color: "rgba(247,243,250,.6)", fontSize: scale.micro }}>הסכום ידוע לפני שאתה מקבל</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <span style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 12, background: "#FF6B4A", color: "#1a0f0c", fontWeight: 800, fontSize: scale.meta }}>קבלת העבודה</span>
        <span style={{ flex: "0 0 30%", textAlign: "center", padding: "9px 0", borderRadius: 12, background: "rgba(255,255,255,.1)", color: "#F7F3FA", fontSize: scale.meta }}>דילוג</span>
      </div>
    </ProExampleStage>
  );
}
function ProPricesScene() {
  const chip = (t: string, on: boolean) => (
    <span style={{ padding: "5px 10px", borderRadius: 999, fontSize: scale.micro, fontWeight: 700, background: on ? "rgba(47,191,138,.18)" : "rgba(255,255,255,.08)", color: on ? "#7FE3BC" : "rgba(247,243,250,.7)" }}>{t}</span>
  );
  return (
    <ProExampleStage>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#F7F3FA", fontSize: scale.body, fontWeight: 800 }}>המחירון שלי</span>
        <span style={{ color: "rgba(247,243,250,.55)", fontSize: scale.micro }}>דוגמה</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {chip("ביקור ואבחון", true)}{chip("מחיר קבוע", true)}{chip("לשעה", false)}
      </div>
      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.06)", display: "grid", gap: 7 }}>
        {exRow("ביקור ואבחון · נזילה", "₪179")}
        {exRow("החלפת אטם בברז", "₪250")}
        <div style={{ color: "#FF9A80", fontSize: scale.meta, fontWeight: 700 }}>+ עבודה שלא ברשימה</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", color: "#F7F3FA", fontSize: scale.meta }}>
        <span>תוספת לילה ושבת</span>
        <span style={{ width: 40, height: 24, borderRadius: 12, background: "#2FBF8A", position: "relative", display: "inline-block" }}>
          <span style={{ position: "absolute", top: 3, left: 3, width: 18, height: 18, borderRadius: 9, background: "#fff" }} />
        </span>
      </div>
      <div style={{ color: "rgba(247,243,250,.6)", fontSize: scale.micro, marginTop: 10 }}>הלקוח רואה את המחיר שלך לפני שהוא מזמין</div>
    </ProExampleStage>
  );
}

function PreviewNote({ textHe }: { textHe: string }) {
  return (
    <View
      style={{
        position: "absolute",
        left: spacing.lg,
        right: spacing.lg,
        bottom: spacing.xl,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.md,
        backgroundColor: "rgba(23,18,31,0.92)",
        borderWidth: 1,
        borderColor: "rgba(247,243,250,0.24)",
      }}
    >
      <Text
        style={{
          ...t.micro,
          color: "#F7F3FA",
          textAlign: "right",
          writingDirection: "rtl",
        }}
      >
        {textHe}
      </Text>
    </View>
  );
}
