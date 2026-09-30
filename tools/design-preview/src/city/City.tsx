import { isDaytime } from "../daylight";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import { buildPlayer } from "./player";
import { measureCycle } from "./sheet";
import { SPONSOR_BADGE_HE, sponsorCtaHe, sponsorLeaveHe } from "@pro-now/demo-types";
/*
 * The type scale, which this file had been quietly outside of.
 *
 * `check-type-scale.mjs` counted 23 literal `fontSize:` values here —
 * 11.5, 12.5, 14.5, 15, 16, 19, 20, 22, 26 — every one of them typed by
 * somebody making one panel look right, which is exactly the failure
 * that check was written for: "the ETA rendered at 44 on the match
 * screen and at 30 on the tracking screen, so its size told the reader
 * nothing". The city's panels are the same product as the screens and
 * they read the same scale now.
 */
import { scale } from "@pro-now/demo-ui";

import { PREVIEW_SPONSORS } from "../sponsors";
import { buildPanoRoom, PANO_STAND_RADIUS, type PanoRoom } from "./panoRoom";
import { buildBoxRoom } from "./boxRoom";
import {
  buildStreet,
  FRONT_X,
  OPTIONAL_ART,
  SPAWN,
  STREET_LENGTH,
  WALK_LIMIT,
  type ShopSpec,
} from "./street";

/**
 * THE CITY, AND THE CAMERA THAT LIVES IN IT.
 *
 * ---------------------------------------------------------------------
 * THE CAMERA IS THE POINT
 * ---------------------------------------------------------------------
 * Amit, of the painted world: *"זווית המצלמה ככ ישנה."* He was right in
 * the most literal way available — there was no camera. A painting has
 * one viewpoint, the one it was painted from, and every "camera move"
 * was a crop of it.
 *
 * Here the camera is an object in the world. It sits behind and above
 * the figure, it is dragged around them, it leans into a turn, and it
 * eases rather than snapping — which is the whole difference between a
 * character you are following and a sprite you are pushing.
 */

/*
 * THE HIGH STREET.
 *
 * Eleven bays, alternating sides, twenty-three metres apart — which is
 * every other building, so the street between them is ordinary city
 * and the shops are what you notice in it.
 *
 * The first build used seven of the ten districts that have been
 * drawn. There was no reason for the other three except that the
 * array had been typed out once and never revisited, and a trade with
 * finished artwork and nowhere to stand is the same fault this
 * project has caught a dozen times: work delivered and never
 * connected. `art-delivery.test.ts` exists to catch it on the map;
 * nothing was watching here.
 *
 * `interior` is only set where a room has actually been painted. A
 * shop without one is a door you cannot go through yet, which is the
 * truth, and better than sending everybody into the same borrowed room.
 */
const SHOPS: ShopSpec[] = [
  { id: "hair",      he: "טיפוח ויופי",    facade: "district_hair.webp",      z:   88, side: -1, interior: "hair_barbershop_hero.webp", neonColour: "#ff7ac2" , department: "BEAUTY", services: ["svc-haircut", "svc-makeup"] },
  { id: "pets",      he: "בעלי חיים",      facade: "district_pets.webp",      z:   70.4, side:  1, interior: "shop_pets_inside.webp",     neonColour: "#8ce06a" , department: "PETS", services: ["svc-pet-sit", "svc-pet-groom", "svc-dog-walk"] },
  { id: "home",      he: "תיקונים דחופים", facade: "district_home.webp",      z:   52.8, side: -1, interior: "home_workshop_hero.webp",   neonColour: "#ffb45e" , department: "HOME_URGENT" },
  /*
   * The sponsor's own room, at the fourth time of asking — the facade
   * came back in its place twice. `sponsor_lust_hero` stays the
   * picture the product sheet uses; this is the place you stand in.
   */
  { id: "lust",      he: "Lust",           facade: "shop_lust.webp", z:   35.2, side:  1, interior: "sponsor_lust_inside.webp",  sponsor: true, neonColour: "#ff3d63" },
  { id: "tech",      he: "מחשבים וסלולר",  facade: "district_tech.webp",      z:   17.6, side: -1, neonColour: "#7ad7ff" , department: "TECH" },
  { id: "auto",      he: "רכב ודרך",       facade: "district_auto.webp",      z:    0, side:  1, interior: "auto_garage_hero.webp",     neonColour: "#ff9b3d" , department: "VEHICLE" },
  { id: "well",      he: "בריאות וכושר",   facade: "district_well.webp",      z:  -17.6, side: -1, neonColour: "#6affc6" , department: "WELLNESS" },
  { id: "appliance", he: "מוצרי חשמל",     facade: "district_appliance.webp", z:  -35.2, side:  1, interior: "appliance_workshop_hero.webp", neonColour: "#ffd166" , department: "APPLIANCES" },
  { id: "care",      he: "ניקיון ותחזוקה", facade: "district_care.webp",      z:  -52.8, side: -1, interior: "care_studio_hero.webp",     neonColour: "#9db8ff" , department: "HOME_CARE" },
  { id: "nails",     he: "ציפורניים",      facade: "district_nails.webp",     z:  -70.4, side:  1, neonColour: "#ff6fa8" , department: "BEAUTY", services: ["svc-nails"] },
  { id: "move",      he: "הובלות ומשלוחים", facade: "district_move.webp",     z:  -88, side: -1, neonColour: "#c39bff" , department: "LOGISTICS" },
  /*
   * The vet is a category inside PETS — "וטרינר עד הבית" — and it had
   * no house in the world. Amit spotted it: *"חנות חיות וטרינר?"* It
   * is the only trade in the catalogue that was missing one.
   */
  { id: "vet",       he: "וטרינריה",       facade: "shop_vet.webp",           z: -105.6, side:  1, interior: "shop_vet_inside.webp", neonColour: "#7ad7ff", department: "PETS", services: ["svc-vet"] },
  /*
   * Two trades had drawn shopfronts and no house to put them on —
   * `shop_build` and `shop_help` were installed and stood nowhere.
   * With these the roster covers all eleven departments.
   */
  { id: "build",     he: "שיפוץ והתקנות",  facade: "shop_build.webp",         z: -123.2, side: -1, interior: "shop_build_inside.webp", neonColour: "#ffa552", department: "IMPROVEMENT" },
  { id: "help",      he: "עזרה ועבודות קטנות", facade: "shop_help.webp",      z: -140.8, side:  1, interior: "shop_help_inside.webp",  neonColour: "#a8e06a", department: "ODD_JOBS" },
];

/**
 * Which department each shop stands for, taken from the roster itself.
 *
 * The host builds the service list for every shop and needs the same
 * mapping the street uses. Derived rather than typed out again, so a
 * shop that changes trade changes it in one place.
 */
export const CITY_SHOP_DEPARTMENTS: Record<string, string> = Object.fromEntries(
  SHOPS.filter((s) => s.department).map((s) => [s.id, s.department!])
);

const WALK = Array.from({ length: 8 }, (_, i) => `avatar_amit_walk_0${i + 1}.webp`);
const RUN = Array.from({ length: 8 }, (_, i) => `avatar_amit_run_0${i + 1}.webp`);

export interface CityProps {
  /** Where the art lives, so the same component works in the app. */
  base?: string;
  /** Where to stand at the start. Only the gallery passes this. */
  spawn?: { x?: number; z?: number };
  /**
   * Open at this shop's door and walk straight in — used when a page about
   * a shop (a sponsor's, say) is tapped: the tap means "take me inside".
   */
  enterShopId?: string | null;
  /**
   * Which of the twelve characters the customer chose, 1–12.
   *
   * Without it the street falls back to Amit's cycle, which is what
   * it did for everybody until now.
   */
  avatarNo?: number | null;
  /**
   * WHAT EACH TRADE ACTUALLY DOES, SO A SHOP CAN SELL IT.
   *
   * Amit: *"חייב שיפתחו אפשרויות"*, and later, of the world as a
   * whole: *"בלעדיו העולם יפה אבל לא מוכר כלום."*
   *
   * Walking into a trade's shop used to show a beautiful room and
   * nothing to do in it. The services are what the shop is FOR — you
   * go in, you see what this trade does, you call somebody.
   *
   * Passed in rather than imported, because the catalogue, the live
   * availability snapshot and the route out all live in the host. The
   * city knows how to show a list; it must not decide what is in it.
   *
   * `availableNowCount` is null wherever the snapshot did not say, and
   * is rendered as silence rather than as a zero — /CLAUDE.md §3.
   */
  trades?: Record<
    string,
    {
      nameHe: string;
      services: Array<{
        id: string;
        nameHe: string;
        descriptionHe?: string | null;
        availableNowCount: number | null;
      }>;
    }
  > | null;
  /** Called when somebody picks a service inside a shop. */
  onRequestService?: (serviceId: string) => void;
  /**
   * A NAMED CAMERA SHOT, FOR SCREENS THAT ARE NOT PLAYED.
   *
   * Amit, about the onboarding: *"שהמצלמה תזוז ותתמקד בעולם שלנו ובמה
   * שרשום — אם רשום עיר שיראו את העיר, אם רשום אווטאר שיראו אווטאר."*
   *
   * The three intro slides used to travel over the PAINTED plate,
   * which was the right idea against the only world that existed then.
   * The world is a place with a camera in it now, so the slides can
   * look at the real thing — and a slide about the city should be
   * standing in the city, not next to a picture of it.
   *
   * Changing this eases the camera to the new shot rather than
   * cutting, because the claim the three slides make is that they are
   * ONE place.
   */
  shot?: CityShot | null;
  /**
   * The joystick, the entry button and the hints.
   *
   * Off for a screen that is looked at rather than played: a control
   * you cannot use is worse than no control, and on the intro it would
   * also be a promise that the slide is interactive.
   */
  hud?: boolean;
  /**
   * THE SEARCH, FLOWN OVER OUR CITY.
   *
   * Amit: *"מסך זז של העיר בחיפוש אחר המקצוען, עם גלי איתור — וברגע שהוא
   * מוצא, הוא נכנס לאט עם זווית מצלמה לתוך החנות."* While `phase` is
   * "searching" the camera flies slowly high over the street with nobody
   * walking; on "found" it comes down, at an angle, into the see-into
   * window of the trade's shop (`shopId`).
   */
  search?: { shopId: string; phase: "searching" | "found"; visit?: number } | null;
  /**
   * THE PROFESSIONAL ON HIS WAY, IN OUR STREET (Amit, 2026-09-29: the map
   * "לא מספיק מרשימה", the waiting screen "מסך מת"). His trade's van leaves
   * his shop and drives down the street towards a light where you live, a
   * camera following it. `progress` is the share of the trip covered, from
   * the server's own ETA — how far along, never a claimed position.
   */
  route?: { shopId: string; trade: string; progress: number; moving: boolean; labelHe?: string; photoUri?: string | null } | null;
  onExit?: () => void;
}

/**
 * Where the camera stands for a screen that is not being played.
 *
 * `wide` is the arrival shot over the whole street; `character` is the
 * third-person rig, close, on the figure; `shopfront` frames a
 * business the way you see one from the pavement.
 */
export type CityShot = "wide" | "character" | "shopfront";

/** What one trade offers, as the host hands it over. */
interface Trade {
  nameHe: string;
  services: Array<{
    id: string;
    nameHe: string;
    descriptionHe?: string | null;
    availableNowCount: number | null;
  }>;
}

/** Avatar walk sheets whose frames have been checked by eye. See the
    player's loader for why this starts empty. */
/*
 * -----------------------------------------------------------------------
 * THE SHOP BEFORE YOU ENTER IT
 * -----------------------------------------------------------------------
 * Amit, of the pink salon building: *"זה הכיוון שאני רוצה שתראה חנות לפני
 * שנכנסים — שמחה, חיה, נושמת, צעירה, עתידנית, זווית פרופורציונלית."*
 *
 * These are the trades' own illustrated buildings, drawn at a
 * three-quarter angle. In the street that baked angle argues with the
 * camera, which is why the street uses flat elevations — but as the
 * moment of arrival, full-screen, it is exactly the picture he means: you
 * press "היכנס", the building you are walking into fills the screen, its
 * neon breathes, the view pushes in towards the door, and you are inside.
 */
const DOORSTEP_HERO: Readonly<Record<string, string>> = {
  hair: "hair_barbershop_hero.webp",
  home: "home_workshop_hero.webp",
  auto: "auto_garage_hero.webp",
  appliance: "appliance_workshop_hero.webp",
  care: "care_studio_hero.webp",
  pets: "pets_salon_hero.webp",
};
const DOORSTEP_MS = 2100;
/* Shops whose own redrawn building (`hero_<id>`, from the 2026-09-25
   brief) has arrived; they use it at the door instead of the old one. */
const HERO_READY = new Set<string>();
const DOORSTEP_DIR =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 768)
    ? "s/"
    : "m/";

const VERIFIED_AVATAR_SHEETS = new Set<string>([
  /* 2026-09-25: yesterday's twelve, from PRO_NOW_AVATAR_NN_3_DIRECTIONS,
     each sliced to exactly eight poses and looked at frame by frame. */
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
]);

export function City({
  base = "./world/",
  spawn,
  enterShopId = null,
  avatarNo = null,
  shot = null,
  hud = true,
  search = null,
  route = null,
  trades = null,
  onRequestService,
  onExit,
}: CityProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [nearName, setNearName] = useState<string | null>(null);
  const [nearId, setNearId] = useState<string | null>(null);
  const [room, setRoom] = useState<ShopSpec | null>(null);
  const [doorstep, setDoorstep] = useState<{ src: string; he: string; neon: string } | null>(null);
  /*
   * The shop you are STANDING IN, as opposed to the one whose picture
   * is filling the screen. Amit: *"שיהיה אפשר לעשות צעד פנימה לתוך
   * החנות, להרגיש חוויה אמיתית."* A room is a place you are in; the
   * catalogue is something you then ask for.
   */
  const [insideShop, setInside] = useState<ShopSpec | null>(null);
  /*
   * The same fact, where the render loop can see it. The loop runs on
   * requestAnimationFrame and never re-reads React state; the camera
   * and the movement clamp both have to behave differently indoors, so
   * they read this.
   */
  const insideRef = useRef<{
    id: string;
    side: -1 | 1;
    x: number;
    z: number;
  } | null>(null);
  /* 0 while you are on the street, 1 at the moment the door opens. */
  const [veil, setVeil] = useState(0);
  /* True while a scripted camera move owns the screen. */
  const [walking, setWalking] = useState(false);
  const [hint, setHint] = useState(true);
  /* True while the street is still being looked at from above. */
  const [arriving, setArriving] = useState(true);
  /*
   * A place you have walked up to that is not a shop — the dog park,
   * the layby, the pickup point. Amit: *"אין לו חנות, צריך לחשוב על
   * דרך אחרת לפגוש אותו, כי משהו כן צריך להיפתח."*
   */
  const [nearPlace, setNearPlace] = useState<{
    id: string;
    he: string;
    department: string | null;
    services?: readonly string[];
  } | null>(null);
  const [openPlace, setOpenPlace] = useState<{
    he: string;
    department: string;
    services?: readonly string[];
    /**
     * The one line above the list. A place and a shop with no painted
     * room open the same sheet and mean different things by it.
     */
    noteHe: string;
  } | null>(null);
  /* Read every frame, so changing the prop moves the camera without
     rebuilding the city. */
  /*
   * The services for a DEPARTMENT rather than for a shop, because a
   * place belongs to a trade and not to a building. Derived from the
   * same map the shops use, so there is one source for what a trade
   * offers and a place can never advertise something a shop would not.
   */
  const placeTrades = useMemo(() => {
    const out: Record<string, Trade["services"]> = {};
    for (const [shopId, t] of Object.entries(trades ?? {})) {
      const dept = SHOPS.find((x) => x.id === shopId)?.department;
      if (dept && !out[dept]) out[dept] = t.services;
    }
    return out;
  }, [trades]);

  const shotRef = useRef<CityShot | null>(shot);
  shotRef.current = shot;
  const searchRef = useRef(search);
  searchRef.current = search;
  const routeRef = useRef(route);
  routeRef.current = route;
  const homeLabel = useRef<HTMLDivElement | null>(null);
  const vanLabel = useRef<HTMLDivElement | null>(null);
  const nearTint =
    (nearId ? SHOPS.find((x) => x.id === nearId)?.neonColour : null) ?? "#FF6B4A";
  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 5200);
    return () => window.clearTimeout(t);
  }, []);

  /*
   * THE HANDOVER.
   *
   * The walk-in ends with the brand's colour over the whole screen and
   * the room opening underneath it. If the veil simply stayed, the
   * room arrived behind a flat wall of magenta; if the room painted
   * its own black background first, there was a black beat between the
   * colour and the picture — which is the cut this whole sequence
   * exists to avoid, reintroduced one layer further in.
   *
   * So the colour is cleared the moment the room mounts and both
   * cross-fade: the veil out, the picture in, over the same half
   * second. What you see is the colour becoming the shop.
   */
  useEffect(() => {
    if (!room) return;
    const t = window.setTimeout(() => setVeil(0), 40);
    return () => window.clearTimeout(t);
  }, [room]);
  const enterRef = useRef<(() => void) | null>(null);
  const leaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let disposed = false;
    /*
     * -----------------------------------------------------------------
     * A PHONE IS NOT A SMALL DESKTOP
     * -----------------------------------------------------------------
     * Amit: *"בטלפון המפה לא נטענת, זה זורק אותי החוצה."* Safari gives
     * a tab a fixed slice of GPU memory and kills the tab when it runs
     * out — no error, the page just goes. Measured on a 390px screen
     * at the old settings: 161MB of it went on multisampled render
     * targets alone, before a single drawing had been uploaded.
     *
     * So on a phone: a pixel ratio of 1.5 rather than 2 (the eye cannot
     * tell on a screen this size at arm's length, and it is 44% fewer
     * pixels to shade every frame), two samples rather than four, and
     * no multisampled default framebuffer at all, because nothing is
     * ever drawn to it — the composer renders into its own target and
     * `antialias: true` was reserving a second copy for nothing.
     */
    const phone =
      window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 768;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    /* On again, over a small box that rides with the player — see the
       moon in street.ts for why that is affordable and why it was a
       mistake to turn it off. */
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    /*
     * EXPOSURE IS HALF OF THE LIGHTING, AND IT IS THE HALF THAT LIES.
     *
     * It was at 1.45 to rescue a scene whose lights were a hundred
     * times too weak (see street.ts on physical units). With the
     * lights corrected, the same 1.45 turned the pavement into a
     * beach. At 1.0 the tone map does what it is for — rolling the
     * bright pools off instead of clipping them white — and leaves
     * the stone between the lamps dark, which is where the night is.
     */
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    /*
     * -----------------------------------------------------------------
     * BLOOM, WHICH IS MOST OF WHAT "MODERN" MEANS
     * -----------------------------------------------------------------
     * Amit: *"למה הכל בפיקסלים... רק מציאותי וקסום שמתאים ל-2030 ולא
     * ל-2004."*
     *
     * Part of his answer is art and is being drawn. But a real part of
     * it is this pass, and it is worth being precise about why.
     *
     * A renderer without bloom draws a lamp as a bright circle that
     * stops at its own edge. No camera and no eye does that: bright
     * light BLEEDS — into the lens, into the air, into the wet road —
     * and every game that reads as modern is doing this to its lights.
     * The street was already full of neon, festoon bulbs, headlights
     * and lit windows, all of them stopping dead at their outlines.
     *
     * Threshold 0.85 so only genuinely bright things bleed — a lit
     * window does, a plastered wall does not, and lifting the whole
     * image into a haze is the failure mode here.
     */
    /*
     * -----------------------------------------------------------------
     * `antialias: true` WAS DOING NOTHING, AND IT IS WHY EVERY EDGE
     * IN THE CITY WAS JAGGED
     * -----------------------------------------------------------------
     * Amit: *"זה עדיין נראה מאוד זול וישן."* This is the first reason,
     * and it is the cheapest one to have got wrong.
     *
     * The flag on `WebGLRenderer` asks for a multisampled DEFAULT
     * framebuffer — the canvas. Nothing is drawn to the canvas here:
     * every frame goes through the composer, into an off-screen target,
     * and only the bloom's output reaches the screen. `EffectComposer`
     * builds that target itself, with `{ type: HalfFloatType }` and
     * nothing else — `samples` defaults to 0.
     *
     * So the whole city was rendered with NO antialiasing at all: every
     * roofline, every lamp post, every cut-out edge stair-stepped, and
     * the character shimmered as she walked because an `alphaTest` edge
     * with no samples flickers on and off between pixels. Amit named
     * that one too: *"הדמות מרצדת."*
     *
     * Four samples is the usual place to stand: it is where the jaggies
     * stop being the thing you notice, and eight costs more than it
     * returns on a phone.
     */
    const aa = new THREE.WebGLRenderTarget(
      el.clientWidth * renderer.getPixelRatio(),
      el.clientHeight * renderer.getPixelRatio(),
      { type: THREE.HalfFloatType, samples: phone ? 2 : 4 }
    );
    const composer = new EffectComposer(renderer, aa);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(el.clientWidth, el.clientHeight);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(el.clientWidth, el.clientHeight),
      /* strength */ isDaytime() ? 0.12 : 0.3,
      /* radius   */ 0.5,
      /* threshold*/ 0.96
    );

    const loader = new THREE.TextureLoader();
    /*
     * THE LIGHT EDITION FIRST.
     *
     * `public/world/m/` holds every drawing capped at 1024px on its long
     * edge (walk sheets by their short edge) — see `make-light.mjs`.
     * The full 2048px files cost four times the download, decode and GPU
     * memory, and a shopfront on a phone is a few hundred pixels wide:
     * the extra resolution was paid for on every visit and seen on none.
     * Measured: 70MB of art became 25MB, and the wait before the first
     * step was 26 seconds on localhost, where the network is free.
     *
     * `?hd=1` asks for the originals, for reviewing the art itself. A
     * drawing with no light copy yet falls back to the original rather
     * than to nothing, so a new file works before anybody runs the tool.
     */
    const hd = new URLSearchParams(window.location.search).has("hd");
    const fetchTex = (url: string) =>
      new Promise<THREE.Texture>((res, rej) => loader.load(url, res, undefined, rej));
    /*
     * And a phone takes `s/`, the 640px edition, first. At 1024 the
     * street was still 455MB of GPU textures on a 390px screen —
     * around 160 different drawings, none of them duplicates — which
     * is past what Safari allows a tab. See `make-light.mjs`.
     */
    /* The desktop falls back to the phone edition too. A published
       artifact holds at most 512 files, so the rooms added on
       2026-09-28 are published in `s/` only (see make-light.mjs). */
    const editions = hd ? [""] : phone ? ["s/", "m/", ""] : ["m/", "s/", ""];
    const load = (f: string) =>
      editions.reduce<Promise<THREE.Texture>>(
        (p, dir) => p.catch(() => fetchTex(base + dir + f)),
        Promise.reject(new Error("start"))
      );

    let stop = () => {};

    (async () => {
      const facades: Record<string, THREE.Texture | undefined> = {};
      /*
       * ONE WAVE, NOT FOUR.
       *
       * These were four `await Promise.all`s in a row — every facade,
       * THEN every interior, THEN every room, THEN everything else — so
       * the slowest facade held up the first interior, and the loading
       * screen waited for the sum of four slowest files instead of the
       * slowest one. None of them needs another's result except a room,
       * which needs to know its interior's name, and that is now worked
       * out inside the same shop's own chain.
       */
      const facadeWave = Promise.all(
        SHOPS.map(async (s) => {
          /*
           * `shop_<id>` FIRST, `district_<id>` AFTER.
           *
           * The district drawings are three-quarter views with their
           * own baked perspective, which is why Amit said the shops
           * read as a photo glued to a wall: the painted vanishing
           * point argues with the camera's every time it moves. The
           * `shop_*` set is the same trades redrawn as flat
           * elevations, the way the residential buildings are, and
           * where one exists it wins.
           */
          try {
            facades[s.facade] = await load(`shop_${s.id}.webp`);
            return;
          } catch {
            /* not redrawn yet */
          }
          try {
            facades[s.facade] = await load(s.facade);
          } catch {
            /* A shop with no drawing is a volume with no face, which is
               honest — see `DistrictLayer` for why nothing stands in. */
          }
        })
      );
      /*
       * THE DELIVERED ART, WHERE IT HAS ARRIVED.
       *
       * Every id is optional and a miss is not an error: the street has
       * a procedural stand-in for each one and falls back to it
       * silently. That is what lets the art land in `public/world` and
       * change the city with no code change at all — which is the whole
       * arrangement, because the art is drawn in another room on
       * another clock.
       */
      /* The redrawn interiors, one per trade, where they exist. */

      /*
       * AND THE ROOMS THEMSELVES, AS TEXTURES.
       *
       * Amit: *"רוצה שיכנסו לתוך החנויות, שלא ייתקעו בקרטון — שיהיה
       * אפשר לעשות צעד פנימה."*
       *
       * The interiors used to be loaded only by the `<img>` in the
       * flat room overlay, and disposed here the moment their
       * existence had been confirmed. They are the back wall of a real
       * room now, so the street needs them as textures.
       */
      const roomWave = Promise.all(
        SHOPS.map(async (sh) => {
          /*
           * A BUILT ROOM NEEDS NO POSTER. Every shop now has its own
           * walls, floor and furniture (`BUILT_ROOMS`), and the single
           * drawn interior was only the back wall of the fallback box —
           * which now takes `room_<id>_back` instead. Not asking for it
           * saves a large texture per shop, and a phone's memory is
           * exactly what the rooms cost.
           */
          if (BUILT_ROOMS[sh.id] !== undefined) {
            /* `interior` is also what says "this door walks you in". */
            (sh as { interior?: string }).interior ??= `room_${sh.id}_back.webp`;
            return;
          }
          try {
            /* Only the trades whose single interior was drawn — see
               `DRAWN_INTERIORS`; the rest are asked for nothing. */
            if (!DRAWN_INTERIORS.has(sh.id)) throw new Error("not drawn");
            const t = await load(`shop_${sh.id}_inside.webp`);
            (sh as { interior?: string }).interior = `shop_${sh.id}_inside.webp`;
            facades[`shop_${sh.id}_inside.webp`] = t;
            return;
          } catch {
            /* keep whatever interior the roster already names */
          }
          if (!sh.interior || facades[sh.interior]) return;
          try {
            facades[sh.interior] = await load(sh.interior);
          } catch {
            /* a shop with no room is a door that opens a list */
          }
        })
      );

      /* The 360 rooms: a panorama of the whole room and, drawn apart
         from it, the counter in front of you. See panoRoom.ts. */
      /*
       * ONLY WHAT EXISTS.
       *
       * This wave used to ask for every room part, a three-quarter
       * building, an order-sheet picture and a panorama for all fourteen
       * shops — about two hundred requests, most of them for files never
       * drawn, each one a round trip the phone waits on (the artifact host
       * answers a missing file with a page, not a quick 404). Amit's rule
       * for tonight: *"חשוב שהכל יעבוד בטלפון מהיר."* So the shops that
       * have been built are listed, with how many pieces of furniture each
       * has, and nothing else is asked for.
       */
      const panoWave = Promise.all(
        SHOPS.filter((sh) => BUILT_ROOMS[sh.id] !== undefined).map(async (sh) => {
          const props = BUILT_ROOMS[sh.id]!;
          const box = ["back", "left", "right", "floor", ...Array.from({ length: props }, (_, n) => `prop${n + 1}`)];
          await Promise.all(
            box.map(async (part) => {
              const f = `room_${sh.id}_${part}.webp`;
              try { facades[f] = await load(f); } catch { /* not drawn */ }
            })
          );
          if (VENUE_READY.has(sh.id)) VENUES.set(sh.id, `${base}venue_${sh.id}.webp`);
        })
      );

      const artWave = Promise.all(
        OPTIONAL_ART.map(async (id) => {
          try {
            facades[id] = await load(`${id}.webp`);
          } catch {
            /* not delivered yet */
          }
        })
      );

      await Promise.all([facadeWave, roomWave, artWave, panoWave]);

      /*
       * ---------------------------------------------------------------
       * YOU WALK AS THE CHARACTER YOU CHOSE
       * ---------------------------------------------------------------
       * The city has been hard-coded to Amit's cycle since it was
       * built, so whoever you picked at sign-up — including the dog
       * and the cat — walked this street as somebody else.
       *
       * The delivered sheets are ONE image with eight poses in a row,
       * and that is better than eight files: a texture clone shares
       * the decoded image and carries its own offset, so eight frames
       * cost one download and one upload to the GPU. No slicing tool,
       * no eight requests.
       */
      /*
       * -----------------------------------------------------------------
       * AND THE SHEET IS MEASURED, NOT DIVIDED
       * -----------------------------------------------------------------
       * Amit, twice, with a screenshot each time: *"לא מבין לאן הדמות
       * הלכה ומה הכתם הזה שנשאר פה"*, and then *"עדיין לא רואים את
       * הדמות."* He was looking at his own character cut into ribbons
       * and laid along the pavement.
       *
       * This divided the sheet into eight equal slices, which is right
       * only if the poses were placed at equal intervals — and they
       * were not. Measured: `avatar_01_back` is 1302 wide and
       * `avatar_02_back` is 1287, not even the same canvas, and
       * `avatar_02`'s one visible gap sits at 391 where an eighth would
       * put a boundary at 161. So some slices held most of a figure,
       * some held two halves, and one or two held almost nothing — and
       * that empty one is the frame where the character vanishes and
       * leaves the pale edge of the cut-out behind. That pale edge is
       * the stain in his screenshot.
       *
       * The crowd in the street has been sliced by measurement for a
       * day; the player was still being divided. One rule, one place,
       * both callers — `measureCycle`.
       */
      const sheetFrames = async (id: string) => {
        const sheet = await load(id);
        sheet.colorSpace = THREE.SRGBColorSpace;
        return measureCycle(sheet);
      };

      let walk: THREE.Texture[];
      let run: THREE.Texture[];
      /* A frame's own shape, which is not the sheet's. See buildPlayer. */
      let frameAspect: number | undefined;
      const chosen = avatarNo ? String(avatarNo).padStart(2, "0") : null;
      try {
        if (!chosen) throw new Error("no avatar chosen");
        /*
         * ONLY SHEETS THAT HAVE BEEN LOOKED AT.
         *
         * Amit: *"האווטאר כפול 4 ולא מציאותי."* Measured on 2026-09-25:
         * the twelve `avatar_NN_back` files were cut out of one big
         * sheet one cell out of step. `avatar_02` holds half of 01 and
         * another woman, `avatar_09` is a dog with a stranger's arm,
         * and `avatar_11` is a delivery scooter — so a customer who
         * picked a character walked the street as four people, or as a
         * scooter. No slicing rule can fix a file that holds the wrong
         * drawing.
         *
         * So a sheet is used only once it is on this list, which means
         * somebody has seen its frames. Until the redrawn sheets arrive
         * and pass, the player walks with the street's own cycle, which
         * is whole and walks properly — the wrong person is better than
         * a scooter, and it is honest about being a stand-in.
         */
        if (!VERIFIED_AVATAR_SHEETS.has(chosen)) throw new Error("sheet not verified");
        const cycle = await sheetFrames(`avatar_${chosen}_back.webp`);
        if (!cycle) throw new Error("sheet could not be measured");
        walk = cycle.frames;
        run = walk;
        frameAspect = cycle.aspect;
      } catch {
        walk = await Promise.all(WALK.map(load));
        run = await Promise.all(RUN.map(load)).catch(() => walk);
      }
      if (disposed) return;

      const street = buildStreet(SHOPS, facades, { day: isDaytime() });
      const vrRooms = new Map<string, PanoRoom>();
      for (const sh of SHOPS) {
        const back = facades[`room_${sh.id}_back.webp`];
        if (back) {
          const props = [1, 2, 3, 4, 5, 6]
            .map((n) => facades[`room_${sh.id}_prop${n}.webp`])
            .filter((t): t is THREE.Texture => Boolean(t));
          const r = buildBoxRoom({
            back,
            left: facades[`room_${sh.id}_left.webp`],
            right: facades[`room_${sh.id}_right.webp`],
            floor: facades[`room_${sh.id}_floor.webp`],
            props,
          });
          r.setAspect(el.clientWidth / el.clientHeight);
          vrRooms.set(sh.id, r);
          continue;
        }
        const pano = facades[`room_${sh.id}_pano.webp`];
        if (!pano) continue;
        const r = buildPanoRoom(pano, facades[`room_${sh.id}_fore.webp`]);
        r.setAspect(el.clientWidth / el.clientHeight);
        vrRooms.set(sh.id, r);
      }
      const player = buildPlayer(walk, run, 1.78, frameAspect);
      street.scene.add(player.group);
      /* The same walker, in whichever room you are in — see `follow`. */
      const roomPlayer = buildPlayer(walk, run, 1.78, frameAspect);
      let roomWalked = 0;
      /* The order sheet's picture: each room as a still, with its
         professional in it, rendered once now that its art is on the GPU. */
      for (const [id, r] of vrRooms) {
        const shot = r.snapshot?.(renderer, 900, 780);
        if (shot) ROOM_SHOTS.set(id, shot);
      }
      /* Facing down the street, on the right-hand pavement, with the
         first shopfront a short walk ahead rather than underfoot.
         `spawn` exists so a screenshot can be taken standing in front
         of one particular shop without walking there for two minutes;
         it is a developer-gallery affordance and nothing reads it in
         the app. */
      /*
       * `SPAWN` lives in street.ts because the crowd has to know it too
       * — see the note there. Twenty-six metres in was the empty top of
       * the street: you landed between two lamps with dark pavement
       * ahead and the first sign forty metres off. This opens on a lit
       * shopfront with its blade sign over the pavement.
       */
      player.group.position.set(spawn?.x ?? SPAWN.x, 0, spawn?.z ?? SPAWN.z);
      /* QA hook: stand somewhere without walking there (qa/sequence.mjs). */
      (window as unknown as { __pnTeleport?: (x: number, z: number) => void }).__pnTeleport = (x, z) => player.group.position.set(x, 0, z);
      let autoEnter: string | null = null;
      /* `?enter=<shopId>` walks in on load — how QA checks every door (2026-09-30). */
      const enterWanted = enterShopId ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("enter") : null);
      const doorOf = enterWanted ? street.shops.find((x) => x.id === enterWanted) : null;
      if (doorOf) {
        player.group.position.set(doorOf.doorway.x, 0, doorOf.doorway.z);
        autoEnter = doorOf.id;
      }

      /* The street collected these as it built them. Traversing for
         point lights used to miss the ones inside groups that had not
         had their world matrices updated yet, and returned the origin
         for them — every figure tinted as if a lamp stood at 0,0. */
      const lamps = street.lamps;

      const camera = new THREE.PerspectiveCamera(
        /*
         * SEVENTY-TWO DEGREES, BECAUSE THE STREET IS NARROWER THAN THE
         * LENS NEEDED.
         *
         * Amit, of the shopfronts: *"החנות עדיין מטושטשת ולא נראית
         * חיה, לא מבינים מה יש בה... אני רוצה מבט יותר רחב חד משמעית."*
         *
         * Measured, and the answer was not a matter of taste. At 52°
         * the horizontal field is 25.4°, so from where he stands —
         * 2.4 metres off the wall — the screen holds 1.1 metres of an
         * 8.6-metre shopfront. THIRTEEN PER CENT. The drawing is 3400
         * pixels wide and about 440 of them were being stretched
         * across the whole screen, which is the blur he is describing:
         * the file is excellent and the magnification destroys it.
         *
         * And it could not be solved by backing away. Framing a whole
         * shopfront at 52° needs 19.1 metres, and the street is 19.4
         * metres from wall to wall. There is nowhere to stand.
         *
         * At 72° the horizontal field is 36.5° and a whole shopfront
         * fits from 12.8 metres — a distance that exists here, out
         * over the road. The cost is a little barrel-feel at the
         * edges; the gain is that the shop he paid for is legible.
         */
        72,
        el.clientWidth / el.clientHeight,
        0.1,
        400
      );
      const streetPass = new RenderPass(street.scene, camera);
      composer.addPass(streetPass);
      composer.addPass(bloom);
      /*
       * -----------------------------------------------------------------
       * THE GRADE, WHICH IS MOST OF WHAT "EXPENSIVE" MEANS
       * -----------------------------------------------------------------
       * Amit: *"זה עדיין נראה מאוד זול וישן."*
       *
       * Everything up to here draws the world correctly. What was
       * missing is what every film and every modern game does AFTER
       * drawing it, and it is the reason a raw render looks like a
       * render:
       *
       *   a lens is darker at its edges than at its centre,
       *   a sensor has grain in its shadows,
       *   and a lens bends red and blue by slightly different amounts
       *   the further you get from the middle.
       *
       * None of those is a beauty filter. They are the fingerprints of
       * a camera, and a picture without any of them reads as a
       * diagram — clean in a way nothing photographed is ever clean.
       *
       * All three are deliberately small. A vignette you can see is a
       * vignette that is too strong; grain you can count is noise. The
       * test for each of these is that removing it looks wrong and
       * adding it looks like nothing happened.
       */
      const grade = new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          uTime: { value: 0 },
          uAspect: { value: 1 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uTime;
          uniform float uAspect;
          varying vec2 vUv;

          void main() {
            vec2 c = vUv - 0.5;
            /* Distance from the centre of the LENS, not of the image:
               on a tall phone an un-corrected radius makes the top and
               bottom far darker than the sides. */
            float r = length(vec2(c.x * uAspect, c.y)) / length(vec2(uAspect, 1.0) * 0.5);

            /* Chromatic aberration: zero in the middle, a fraction of a
               pixel at the corners. */
            /* A twelfth of a pixel at the corner. At three times this the
               stars grew coloured fringes and the whole sky glittered
               in three colours, which is a lens fault and not a lens. */
            vec2 off = c * (r * r) * 0.0012;
            vec3 col;
            col.r = texture2D(tDiffuse, vUv + off).r;
            col.g = texture2D(tDiffuse, vUv).g;
            col.b = texture2D(tDiffuse, vUv - off).b;

            /* Vignette. Flat across the middle two thirds, then falling
               away — a smooth radial gradient darkens faces standing in
               the centre of the frame, which is the opposite of what a
               vignette is for. */
            float vig = 1.0 - 0.34 * smoothstep(0.55, 1.25, r);
            col *= vig;

            /* Grain, in the shadows only. Film has more of it where
               there is less light, and a bright neon sign with visible
               noise on it looks like a bad video call. */
            float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
            float n = fract(sin(dot(vUv * vec2(1024.0, 768.0) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
            /* Measured at 0.030 the night sky boiled. Grain belongs in
               the mid-shadows, not in the black: a black that is noisy
               reads as a bad video call, and a black that is clean
               reads as night. */
            col += (n - 0.5) * 0.011 * smoothstep(0.02, 0.16, luma) * (1.0 - smoothstep(0.16, 0.6, luma));

            /* A whisper of cool into the darks and warm into the
               lights, which is the oldest grade there is and the reason
               a night street reads as blue-and-amber rather than as
               grey-and-grey. */
            col = mix(col * vec3(0.94, 0.97, 1.06), col * vec3(1.04, 1.0, 0.96), smoothstep(0.08, 0.6, luma));

            gl_FragColor = vec4(col, 1.0);
            /*
             * AND THE CONVERSION BACK TO SCREEN COLOUR, WHICH IS NOT
             * OPTIONAL AND IS NOT AUTOMATIC HERE.
             *
             * The composer works in LINEAR light — that is what makes
             * the bloom correct — and something has to convert to sRGB
             * on the way to the screen. Three does that in the pass
             * that renders to the screen, through this chunk. The
             * bloom used to be that pass and included it; the moment a
             * grade went after it, the bloom stopped rendering to the
             * screen and this one started, without it.
             *
             * What that looked like: every midtone crushed and every
             * colour over-saturated — the whole street went orange and
             * the night sky went black. It reads exactly like a heavy
             * grade, which is why it is worth naming: it was not a
             * grade at all, it was a missing conversion.
             */
            #include <colorspace_fragment>
          }
        `,
      });
      composer.addPass(grade);
      const gradeAspect = () => {
        grade.uniforms.uAspect!.value = el.clientWidth / Math.max(1, el.clientHeight);
      };
      gradeAspect();

      /* ----- controls ----- */
      let yaw = Math.PI;
      /* The camera's tilt; a drag used to change it, the finger walks now. */
      const pitch = 0.26;
      /* The camera's head, turned toward whatever shop you are beside. */
      let look = 0;
      /* And the head YOU turn, by dragging. It decays when you walk. */
      let turn = 0;
      /* Inside a 360 room the drag turns YOU, across the whole room,
         not the street's sixty-degree glance. */
      let vrActive = false;
      let vrLook = 0;
      /*
       * TURNING ROUND.
       *
       * Amit: *"אי אפשר להסתובב עם הדמות לצד השני כשמגיעים לסוף הרחוב."*
       * The stick walked forward, back and sideways and there was no way
       * to change the direction you face at all — the drag turns only the
       * head. So pulling the stick down now turns the figure round, over
       * about two thirds of a second, and so does walking into either end
       * of the street and keeping on pushing. `spin` is what is left of
       * the half-turn; `spinArmed` waits for the stick to come back to
       * centre, so one pull is one turn and not a spinning top.
       */
      let spin = 0;
      let spinArmed = true;
      let atEndFor = 0;

      /*
       * -----------------------------------------------------------
       * THE ARRIVAL SHOT
       * -----------------------------------------------------------
       * Amit: *"בא לי שכבר פה יראו את העולם החדש התלת־מימדי שלנו, רק
       * בזווית זום אאוט, ואז יהיה אפשר להתקרב פנימה — לא שיצטרכו
       * לעבור למסך אחר של מציאות מדומה. ושמתחילים ללכת, המצלמה זזה
       * לכיוון המבט שהיה עכשיו."*
       *
       * He is right and the reason is not photography. A separate
       * screen for the 3D world says "here is another feature". The
       * world opening as the screen itself says "this is the place".
       *
       * So the street arrives from above — high enough to see the
       * lights strung across the road, the traffic, the neon down
       * both sides — and the first touch of the stick flies the
       * camera down into the third-person view behind the walker.
       * One continuous move; nothing loads, nothing cuts.
       *
       * `descend` is 0 up there and 1 down here, and it only ever
       * travels once.
       */
      const WIDE = { dist: 38, hgt: 26 };
      let descend = 0;
      let leaving = false;
      /* 0 walking, 1 standing back looking at a shopfront. */
      let frame = 0;

      /*
       * A scripted shot overrides the stick entirely. `shotRef` is read
       * every frame rather than captured, so changing the prop moves
       * the camera without rebuilding the city — the whole point is
       * that the slides are demonstrably one place.
       */
      /* The drive's own pieces, made once and shown only while `route` is set. */
      const ribbonTex = (() => {
        const c = document.createElement("canvas");
        c.width = 64; c.height = 128;
        const g = c.getContext("2d")!;
        g.clearRect(0, 0, 64, 128);
        const grad = g.createLinearGradient(0, 0, 64, 0);
        grad.addColorStop(0, "rgba(255,107,74,0)"); grad.addColorStop(0.5, "rgba(255,140,100,.55)"); grad.addColorStop(1, "rgba(255,107,74,0)");
        g.fillStyle = grad; g.fillRect(0, 0, 64, 128);
        g.fillStyle = "rgba(255,120,80,.35)"; g.fillRect(26, 0, 12, 128);
        g.strokeStyle = "rgba(255,236,220,1)"; g.lineWidth = 9; g.lineCap = "round";
        g.beginPath(); g.moveTo(14, 78); g.lineTo(32, 50); g.lineTo(50, 78); g.stroke();
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
      })();
      const ribbon = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1),
        new THREE.MeshBasicMaterial({ map: ribbonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ribbon.rotation.x = -Math.PI / 2;
      ribbon.visible = false;
      street.scene.add(ribbon);
      const beacon = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 1.1, 26, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff7a55, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      shaft.position.y = 13;
      beacon.add(shaft);
      const homeRing = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.25, 48),
        new THREE.MeshBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      homeRing.rotation.x = -Math.PI / 2;
      homeRing.position.y = 0.05;
      beacon.add(homeRing);
      beacon.visible = false;
      street.scene.add(beacon);
      const drive = { van: null as THREE.Group | null, trade: "", startZ: 0, endZ: -110, ribbon, ribbonTex, beacon, ring: homeRing };
      const flight = { started: false, target: "", visit: 0, found: null as number | null, from: new THREE.Vector3(), aimFrom: new THREE.Vector3() };
      const flightPos = new THREE.Vector3(0, 26, 60);
      const flightAim = new THREE.Vector3(0, 0, 40);
      const SHOTS: Record<string, { dist: number; hgt: number; ahead: number; yaw: number }> = {
        wide:      { dist: 34, hgt: 23, ahead: 0.5, yaw: Math.PI },
        character: { dist: 4.6, hgt: 2.2, ahead: 1.1, yaw: Math.PI },
        shopfront: { dist: 9.5, hgt: 4.2, ahead: 0.7, yaw: Math.PI - 0.95 },
      };
      const stick = { x: 0, y: 0 };
      let walked = 0;

      const onStick = (x: number, y: number) => {
        stick.x = x;
        stick.y = y;
      };
      (el as unknown as { __stick?: typeof onStick }).__stick = onStick;

      /*
       * ------------------------------------------------------------
       * THE WHOLE SCREEN IS THE STICK
       * ------------------------------------------------------------
       * Amit, after watching people play: *"כולם אינטואיטיבית ניסו לגלול
       * עם האצבעות כמו בטלפון מגע, ולא דווקא על הג׳ויסטיק."* So a finger
       * anywhere on the city walks: put it down, and pushing up walks
       * forward, down walks back, sideways steps across the street — the
       * further from where it landed, the faster. A soft ring appears
       * under the finger so it is clear what is being held. Inside a shop
       * sideways turns the view instead, because there you look around.
       */
      let dragging = false, startX = 0, startY = 0, lastX = 0;
      const R = 64;
      const ring = document.createElement("div");
      const knob = document.createElement("div");
      Object.assign(ring.style, {
        position: "absolute", width: `${R * 2}px`, height: `${R * 2}px`, borderRadius: "50%",
        border: "2px solid rgba(255,255,255,.35)", background: "rgba(20,14,28,.18)",
        pointerEvents: "none", display: "none", transform: "translate(-50%,-50%)", zIndex: "5",
      });
      Object.assign(knob.style, {
        position: "absolute", width: "46px", height: "46px", borderRadius: "50%",
        background: "rgba(255,255,255,.85)", boxShadow: "0 4px 14px rgba(0,0,0,.35)",
        pointerEvents: "none", display: "none", transform: "translate(-50%,-50%)", zIndex: "6",
      });
      el.appendChild(ring);
      el.appendChild(knob);
      const hostRect = () => el.getBoundingClientRect();
      const down = (e: PointerEvent) => {
        dragging = true;
        startX = lastX = e.clientX;
        startY = e.clientY;
        const r = hostRect();
        ring.style.left = knob.style.left = `${startX - r.left}px`;
        ring.style.top = knob.style.top = `${startY - r.top}px`;
        ring.style.display = knob.style.display = "block";
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* not all pointers */ }
      };
      const move = (e: PointerEvent) => {
        if (!dragging) return;
        let dx = e.clientX - startX, dy = e.clientY - startY;
        const len = Math.hypot(dx, dy) || 1;
        if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
        const r = hostRect();
        knob.style.left = `${startX - r.left + dx}px`;
        knob.style.top = `${startY - r.top + dy}px`;
        if (vrActive) {
          vrLook -= (e.clientX - lastX) * 0.006;
          onStick(0, dy / R);
        } else {
          onStick(dx / R, dy / R);
        }
        lastX = e.clientX;
      };
      const up = () => {
        if (!dragging) return;
        dragging = false;
        ring.style.display = knob.style.display = "none";
        onStick(0, 0);
      };
      renderer.domElement.style.touchAction = "none";
      renderer.domElement.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);

      /* -----------------------------------------------------------
         GOING IN

         Amit: *"שגם הכניסה לחנות תהיה מרשימה."* It was a state change
         — press a button, the street is replaced by a photograph. A
         cut is the one camera move that tells you nothing, and the
         painted world could only ever cut, because it had no camera.

         This one walks you in. For a second and a half the stick is
         ignored, the figure walks the last few metres to the door on
         its own, and the camera comes down off the follow rig, swings
         round to face the shopfront and pushes in until the door
         fills the frame. The brand's own colour rises over the last
         third of it, and the room opens out of that colour rather
         than out of a black cut.

         Coming back out plays the same move backwards, which is why
         `dir` exists rather than two scripted sequences.
         ----------------------------------------------------------- */
      const ENTRY_MS = 1500;
      let entry: {
        shop: (typeof street.shops)[number];
        /*
         * THE WALL CLOCK, NOT THE FRAME COUNTER.
         *
         * This was accumulating the loop's own `dt`, which is clamped
         * at 50ms so that one slow frame cannot teleport the player
         * through a wall. That clamp is right for movement and wrong
         * for a cinematic: on a heavy frame the scene loses 16ms of
         * real time and the sequence does not know it. Measured in the
         * browser, a second-and-a-half walk-in was taking six seconds,
         * because the street renders at roughly a quarter of the rate
         * the number assumed.
         *
         * A scripted move belongs to the viewer's clock, so it reads
         * the clock.
         */
        startedAt: number;
        dir: 1 | -1;
        from: THREE.Vector3;
        aimFrom: THREE.Vector3;
      } | null = null;

      /* ----- loop ----- */
      let raf = 0;
      let last = performance.now();
      const camPos = new THREE.Vector3();
      const aim = new THREE.Vector3();
      const doorAim = new THREE.Vector3();
      const doorCam = new THREE.Vector3();
      const walkTo = new THREE.Vector3();
      let lastNear: string | null = null;
      let lastPlace: string | null = null;
      /* Inside a 360 room: where you stand and how the view eases in. */
      const stand = { x: 0, z: 0 };
      let vrFor: string | null = null;
      let vrFade = 0;

      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (entry) {
          if (vrFor) {
            vrFor = null;
            vrActive = false;
            streetPass.scene = street.scene;
            streetPass.camera = camera;
          }
          const raw = Math.min(1, (now - entry.startedAt) / ENTRY_MS);
          /* smoothstep: a linear push-in reads as a slide, not a step. */
          const k0 = raw * raw * (3 - 2 * raw);
          const k = entry.dir > 0 ? k0 : 1 - k0;
          const shop = entry.shop;

          /*
           * -----------------------------------------------------------
           * THE WALK-IN GOES THROUGH THE DOOR NOW
           * -----------------------------------------------------------
           * Amit: *"רוצה שיכנסו לתוך החנויות ככה שלא ייתקעו בקרטון —
           * שיהיה אפשר לעשות צעד פנימה."*
           *
           * It used to stop 1.9 metres SHORT of the wall and cut to a
           * full-screen picture of the inside. That is the cardboard
           * he means: you never go anywhere, a poster arrives.
           *
           * Where a shop has a room, the figure keeps walking and ends
           * up standing in it, the camera follows him through, and the
           * shopfront fades out of the way as he passes it. Where it
           * has no room, nothing changes: the old approach still ends
           * at the door and opens a list, which is the honest thing a
           * shop with no painted interior can do.
           */
          const wall = FRONT_X * shop.side;
          const inside = shop.roomSpot ?? null;
          doorAim.set(
            inside ? inside.x + shop.side * 3.0 : wall,
            inside ? 2.0 : 3.4,
            shop.doorway.z
          );
          doorCam.set(
            inside ? inside.x - shop.side * 3.6 : wall - shop.side * 6.4,
            inside ? 1.95 : 2.5,
            shop.doorway.z + (inside ? 0.6 : 3.6)
          );
          walkTo.copy(inside ?? new THREE.Vector3(wall - shop.side * 1.9, 0, shop.doorway.z));
          /* The glass gets out of the way over the middle of the move,
             so the figure is never seen walking into a painted wall. */
          shop.fadeFace?.(
            entry.dir > 0
              ? Math.min(1, Math.max(0, (k - 0.25) / 0.3))
              : Math.min(1, Math.max(0, (k - 0.25) / 0.3))
          );

          player.group.position.lerpVectors(entry.from, walkTo, k);
          /* Ground covered drives the cycle, so the legs match the
             walk-in for free — the same rule as the stick. */
          walked += entry.from.distanceTo(walkTo) * (dt * 1000 / ENTRY_MS);

          player.setDistance(walked, false);
          player.light(lamps);
          /* Turned to face the shop, so you see him go in. */
          player.group.rotation.y = Math.atan2(-shop.side, 0) + Math.PI / 2;

          camera.position.lerpVectors(entry.aimFrom, doorCam, k);
          aim.lerpVectors(
            new THREE.Vector3(
              player.group.position.x,
              2.5,
              player.group.position.z
            ),
            doorAim,
            k
          );
          camera.lookAt(aim);

          /* The brand's colour, last third only — and only when the
             screen is about to be replaced by a picture. Walking into
             a room needs no curtain: you can see where you are going. */
          setVeil(
            shop.roomSpot && !(entry.dir > 0 && vrRooms.has(shop.id))
              ? 0
              : Math.min(1, Math.max(0, (k - 0.6) / 0.34))
          );

          street.update(dt, now / 1000, camera);
          composer.render();

          if (raw >= 1) {
            if (entry.dir < 0) insideRef.current = null;
            if (entry.dir > 0) {
              if (shop.roomSpot) {
                /* You are in the shop. The catalogue is a button, not
                   an ambush — see `insideShop`. */
                setInside(shop as ShopSpec);
                /*
                 * AND HAND THE CONTROLS BACK.
                 *
                 * Pressing "היכנס" sets `walking`, which hides the
                 * whole HUD while the camera does the moving — and it
                 * was cleared only by the flat room overlay's
                 * `onStreet`. With the overlay gone, walking into a
                 * shop left the screen with no joystick, no pill and
                 * no way out, permanently.
                 */
                setWalking(false);
                insideRef.current = {
                  id: shop.id,
                  side: shop.side,
                  x: shop.roomSpot.x,
                  z: shop.doorway.z,
                };
                /*
                 * FACING THE BACK OF THE SHOP, NOT ALONG THE STREET.
                 *
                 * Forward is `(sin yaw, cos yaw)` here, so facing into
                 * a shop on the -x side means forward (-1, 0), which
                 * is yaw = -PI/2; the +x side is +PI/2. The expression
                 * borrowed from the exit handler pointed the camera
                 * down the street instead, and the first walk-in ended
                 * with a side wall filling the screen and the pavement
                 * visible out of the corner of the eye.
                 */
                yaw = (shop.side * Math.PI) / 2;
              } else {
                setRoom(shop as ShopSpec);
              }
            } else {
              setVeil(0);
              /* Put the follow rig where the scripted camera left it,
                 so control resumes without a jump. */
              yaw = Math.atan2(-shop.side, 0) + Math.PI / 2;
            }
            entry = null;
          }
          raf = requestAnimationFrame(tick);
          return;
        }

        /*
         * -----------------------------------------------------------
         * INSIDE A 360 ROOM THE STREET IS NOT DRAWN AT ALL
         * -----------------------------------------------------------
         * The same drag that turns your head on the street turns it in
         * the room, and the same stick moves you — a step or so, which
         * is enough for the counter to slide across the shelves behind
         * it. See panoRoom.ts for why that step is the whole point.
         */
        const vrShop = insideRef.current ? vrRooms.get(insideRef.current.id) : undefined;
        if (vrShop && insideRef.current) {
          if (vrFor !== insideRef.current.id) {
            if (vrFor) vrRooms.get(vrFor)?.follow?.(null);
            vrFor = insideRef.current.id;
            vrShop.follow?.(roomPlayer.group);
            roomWalked = 0;
            stand.x = 0; stand.z = 0;
            vrFade = 0;
            vrLook = 0;
          }
          vrActive = true;
          /* Clamp the drag itself, so turning back starts at once. */
          vrLook = Math.max(-vrShop.maxYaw, Math.min(vrShop.maxYaw, vrLook));
          const look = vrLook;
          const lookPitch = -(pitch - 0.26) * 0.7;
          if (Math.hypot(stick.x, stick.y) > 0.08) {
            const fx = -Math.sin(look), fz = -Math.cos(look);
            const rx = -fz, rz = fx;
            stand.x += (-stick.y * fx + stick.x * rx) * 1.1 * dt;
            stand.z += (-stick.y * fz + stick.x * rz) * 1.1 * dt;
            roomWalked += Math.hypot(stick.x, stick.y) * 1.1 * 2.2 * dt;
            const d = Math.hypot(stand.x, stand.z);
            if (d > PANO_STAND_RADIUS) {
              stand.x *= PANO_STAND_RADIUS / d;
              stand.z *= PANO_STAND_RADIUS / d;
            }
          }
          roomPlayer.setDistance(roomWalked, false);
          vrShop.update(dt, now / 1000, { yaw: look, pitch: lookPitch }, stand);
          /* The door's colour lifts off you as you arrive. */
          if (vrFade < 1) {
            vrFade = Math.min(1, vrFade + dt / 0.7);
            setVeil(1 - vrFade);
          }
          streetPass.scene = vrShop.scene;
          streetPass.camera = vrShop.camera;
          composer.render();
          raf = requestAnimationFrame(tick);
          return;
        }
        if (vrFor) {
          vrRooms.get(vrFor)?.follow?.(null);
          vrFor = null;
          vrActive = false;
          streetPass.scene = street.scene;
          streetPass.camera = camera;
        }

        /* ---------- the professional's drive: see `route` ---------- */
        const rt = routeRef.current;
        if (rt) {
          const tSec = now / 1000;
          if (!drive.van || drive.trade !== rt.trade) {
            if (drive.van) street.scene.remove(drive.van);
            drive.van = street.heroVan(rt.trade);
            drive.trade = rt.trade;
            const from = street.shops.find((x) => x.id === rt.shopId);
            drive.startZ = Math.max(from ? from.z : 0, -30);
            drive.endZ = Math.max(-142, drive.startZ - 112);
            if (drive.van) drive.van.position.z = drive.startZ;
            drive.ribbon.visible = true;
            drive.beacon.position.set(-(FRONT_X - 2.2), 0, drive.endZ);
            drive.beacon.visible = true;
            camera.position.set(4, 9, drive.startZ + 16);
          }
          const van = drive.van;
          const target = drive.startZ + (drive.endZ - drive.startZ) * Math.min(1, Math.max(0, rt.progress));
          if (van) {
            const was = van.position.z;
            van.position.z += (target - van.position.z) * (1 - Math.pow(0.25, dt));
            (van.userData as { speed: number }).speed = rt.moving ? Math.max(1.5, Math.abs(van.position.z - was) / Math.max(dt, 1e-3)) : 0;
          }
          const vz = van ? van.position.z : drive.startZ;
          const vx = van ? van.position.x : 0;
          /* The glowing way home: from the van's nose to your door, chevrons flowing towards you. */
          const len = Math.max(0.5, vz - drive.endZ);
          drive.ribbon.scale.set(1, len, 1);
          drive.ribbon.position.set(vx, 0.04, vz - len / 2);
          drive.ribbonTex.offset.y = -tSec * 0.9;
          drive.ribbonTex.repeat.set(1, len / 3);
          const pulse = 0.5 + 0.5 * Math.sin(tSec * 2.4);
          drive.ring.scale.setScalar(1 + pulse * 0.6);
          (drive.ring.material as THREE.MeshBasicMaterial).opacity = 0.75 - pulse * 0.5;
          /* A drone behind and above, swaying a little — alive, never still. */
          const sway = Math.sin(tSec * 0.35) * 2.4;
          flightPos.set(vx + 2.6 + sway, rt.moving ? 8.6 : 10, vz + (rt.moving ? 15 : 16));
          flightAim.set(vx - sway * 0.3, 0.6, vz - (rt.moving ? 4 : 2));
          camera.position.lerp(flightPos, 1 - Math.pow(0.05, dt));
          camera.lookAt(flightAim);
          player.group.visible = false;
          street.update(dt, tSec, camera);
          /* The label over your home, pinned where the light stands. */
          const lab = homeLabel.current;
          if (lab) {
            const p3 = new THREE.Vector3(drive.beacon.position.x, 5.5, drive.endZ).project(camera);
            const onScreen = p3.z < 1 && Math.abs(p3.x) < 1.1 && Math.abs(p3.y) < 1.1;
            lab.style.opacity = onScreen ? "1" : "0";
            lab.style.left = `${((p3.x + 1) / 2) * 100}%`;
            lab.style.top = `${((1 - p3.y) / 2) * 100}%`;
          }
          /* His name over his van — the street has other vans in it. */
          const vl = vanLabel.current;
          if (vl && van) {
            const p4 = new THREE.Vector3(vx, 3.6, vz).project(camera);
            vl.style.opacity = p4.z < 1 ? "1" : "0";
            vl.style.left = `${((p4.x + 1) / 2) * 100}%`;
            vl.style.top = `${((1 - p4.y) / 2) * 100}%`;
          }
          composer.render();
          raf = requestAnimationFrame(tick);
          return;
        }

        /* ---------- the search flight: see `search` ---------- */
        const sr = searchRef.current;
        if (sr) {
          const tSec = now / 1000;
          const target = street.shops.find((x) => x.id === sr.shopId) ?? street.shops[0]!;
          const face = FRONT_X * target.side;
          if (sr.phase === "searching") {
            flight.found = null;
            /* High and slow over the lit street, looking steeply down on
               the roofs and the road — never from under it. */
            const z = Math.sin(tSec * 0.06) * 100;
            flightPos.set(Math.sin(tSec * 0.11) * 3, 30, z + 16);
            flightAim.set(0, 0, z - 4);
            if (!flight.started) {
              flight.started = true;
              camera.position.copy(flightPos);
            }
          } else {
            /* A new shop while already found (the customer turned the
               first one down): lift and go again, from wherever we are. */
            const visit = sr.visit ?? 0;
            if (flight.found !== null && (flight.target !== target.id || flight.visit !== visit)) flight.found = null;
            if (flight.found === null) {
              flight.found = tSec;
              flight.target = target.id;
              flight.visit = visit;
              flight.from.copy(camera.position);
              flight.aimFrom.copy(flightAim);
            }
            /*
             * Down and in at an angle, ending in front of the window at eye
             * height, looking into the shop. ANOTHER MATCH at the same
             * trade is a trip too (Amit: *"חייב שהמצלמה תיקח אותך טיול
             * ברחוב"*): up over the roofs, along the street and back, and in
             * from the other side — a new person in the doorway at the end.
             */
            const again = visit > 0 && flight.from.distanceTo(new THREE.Vector3(face - target.side * 5.2, 2.3, target.z)) < 12;
            const dur = again ? 6.2 : 4.2;
            const k0 = Math.min(1, (tSec - flight.found) / dur);
            const k = k0 * k0 * (3 - 2 * k0);
            const fromSide = visit % 2 === 0 ? 1 : -1;
            const end = new THREE.Vector3(face - target.side * 5.2, 2.3, target.z + 3.2 * fromSide);
            const aimEnd = new THREE.Vector3(face + target.side * 2.5, 2.1, target.z);
            if (again) {
              /* A loop: rise, travel 40m down the street, swing back. */
              const away = new THREE.Vector3(0, 14, target.z - 40 * fromSide);
              const a = Math.sin(Math.PI * k);
              const along = flight.from.clone().lerp(end, k);
              flightPos.copy(along).lerp(away, a * 0.85);
              const aimAway = new THREE.Vector3(0, 0, target.z - 60 * fromSide);
              flightAim.copy(flight.aimFrom).lerp(aimEnd, k).lerp(aimAway, a * 0.7);
            } else {
              const mid = flight.from.clone().lerp(end, 0.55).add(new THREE.Vector3(0, 9 * (1 - k), 0));
              flightPos.copy(flight.from).lerp(mid, Math.min(1, k * 1.6)).lerp(end, k);
              flightAim.copy(flight.aimFrom).lerp(aimEnd, Math.min(1, k * 1.3));
            }
          }
          camera.position.lerp(flightPos, 1 - Math.pow(0.03, dt));
          camera.lookAt(flightAim);
          player.group.visible = false;
          street.update(dt, tSec, camera);
          composer.render();
          raf = requestAnimationFrame(tick);
          return;
        }
        player.group.visible = true;

        const scripted = shotRef.current ? SHOTS[shotRef.current] ?? null : null;
        const push = scripted ? 0 : Math.hypot(stick.x, stick.y);
        const running = push > 0.75;
        if (push > 0.08) {
          leaving = true;
          /* Walking straightens you up, the way it does in life: nobody
             strides down a street looking sideways for ever. */
          turn *= Math.pow(0.12, dt);
        }
        if (scripted) { descend = 1; leaving = true; }
        if (leaving && descend < 1) {
          descend = Math.min(1, descend + dt / 1.9);
          if (descend >= 1) setArriving(false);
        }
        /* Smoothstepped, so the drop eases out rather than arriving
           at speed and stopping dead. */
        const k = descend * descend * (3 - 2 * descend);

        if (!insideRef.current && descend > 0.35) {
          if (stick.y < 0.2 && push < 0.3) spinArmed = true;
          if (spin <= 0 && spinArmed && stick.y > 0.55 && Math.abs(stick.x) < 0.6) {
            spin = Math.PI;
            spinArmed = false;
            turn = 0;
          }
        }
        if (spin > 0) {
          const step = Math.min(spin, (dt * Math.PI) / 0.65);
          yaw += step;
          spin -= step;
          /* the legs keep stepping through the turn */
          walked += step * 0.35;
        } else if (push > 0.08 && descend > 0.35 && !(stick.y > 0.55 && !insideRef.current)) {
          const speed = running ? 5.6 : 2.6;
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          /*
           * SIDEWAYS WAS MIRRORED, AND HERE IS THE ARITHMETIC.
           *
           * Amit: *"הגויסטיק הפוך, ימינה זה שמאל ושמאלה זה ימינה."*
           *
           * Forward is f = (sin yaw, cos yaw), and the camera looks
           * along +f. Screen-right is therefore cross(f, up), which
           * for f = (fx, 0, fz) and up = (0,1,0) comes out
           * r = (-fz, 0, fx) — note the MINUS on the x term.
           *
           * The old line had `+stick.x * fz` and `-stick.x * fx`, i.e.
           * exactly -r. At the starting heading (yaw = PI, walking down
           * -Z) that sends a rightward push to -X, which is the left of
           * the screen. Every step sideways went the wrong way.
           *
           * It survived because nothing in the scene is symmetrical
           * enough to make it obvious from a screenshot, and because
           * you mostly walk forwards. It took somebody actually
           * holding the stick.
           */
          const dx = (-stick.y * fx - stick.x * fz) * speed * dt;
          const dz = (-stick.y * fz + stick.x * fx) * speed * dt;
          const p = player.group.position;
          const room = insideRef.current;
          if (room) {
            /*
             * INDOORS THE WALLS ARE THE WALLS.
             *
             * The street's clamp is the two building lines, and inside
             * a shop that is the whole world away. These are the room's
             * own four walls, kept half a metre clear so the camera
             * never ends up inside the plaster.
             */
            const deep = room.x + room.side * 3.0;
            const shallow = room.x - room.side * 3.2;
            p.x = Math.max(
              Math.min(deep, shallow),
              Math.min(Math.max(deep, shallow), p.x + dx)
            );
            p.z = Math.max(room.z - 3.4, Math.min(room.z + 3.4, p.z + dz));
          } else {
            /* Wall to wall. Crossing the road is a thing you may do —
               the previous clamp kept you on one pavement, which made
               half the shops in the world literally unreachable. */
            p.x = Math.max(-WALK_LIMIT, Math.min(WALK_LIMIT, p.x + dx));
            const zWant = p.z + dz;
            p.z = Math.max(-STREET_LENGTH / 2 + 6, Math.min(STREET_LENGTH / 2 - 6, zWant));
            /* At either end, still pushing forward: turn round for them. */
            if (p.z !== zWant && stick.y < -0.4) {
              atEndFor += dt;
              if (atEndFor > 0.35 && spin <= 0) { spin = Math.PI; turn = 0; atEndFor = 0; }
            } else atEndFor = 0;
          }
          walked += Math.hypot(dx, dz);
        }
        player.setDistance(walked, running);
        player.light(lamps);

        /* Which shop you are beside, before the camera, because the
           camera now needs to know. */
        let best: (typeof street.shops)[number] | null = null;
        /* Nine metres: at seven, standing directly under Lust's own
           sign with its doorway in frame was still "not near a shop". */
        let bd = 9;
        /*
         * …AND ONLY A SHOP YOU CAN SEE.
         *
         * Amit, after a live demo on a friend's phone: *"חנות לחיות פתחה
         * לי ביוטי, חנות של לאסט פתחה לי ספר."* The pill kept naming the
         * shop you had just walked past for another nine metres. On a
         * portrait phone the camera looks down the street, so by then
         * that shop was behind you and off the screen, and the shop in
         * front of you was a different one. Pressing "היכנס" at what you
         * were looking at took you into what you had left behind.
         *
         * So a door more than a step behind the way you face does not
         * count, however close it is.
         */
        const hx = Math.sin(yaw), hz = Math.cos(yaw);
        for (const s of street.shops) {
          const d = s.doorway.distanceTo(player.group.position);
          const along = (s.doorway.z - player.group.position.z) * hz + (s.doorway.x - player.group.position.x) * hx;
          if (along < -1.5) continue;
          if (d < bd) { bd = d; best = s; }
        }

        /*
         * -----------------------------------------------------------
         * LOOKING AT THE SHOP YOU ARE WALKING PAST
         * -----------------------------------------------------------
         * Amit, on the street itself: *"פה צריך שיהיה אפשר להסתכל
         * לחנות."*
         *
         * He is describing something the camera could not do. It
         * pointed exactly where you walk, and the shops are at right
         * angles to that — so a shopfront was only ever in the corner
         * of the frame, and the one way to face it was to turn, which
         * also turns your feet into the wall.
         *
         * A real person walking a high street does not turn their body
         * to look in a window; they turn their head. So the camera
         * gets a head: `look`, an angle added to the camera's yaw and
         * to nothing else. Your heading, your stick and your feet are
         * untouched by it.
         *
         * It aims at the middle of the facade, not at the doorway, so
         * what you get is the SHOP rather than the pavement in front
         * of it. It comes on with proximity, so it is a drift and not
         * a snap, and it holds back to less than half while you are
         * moving — at a walk you glance, and only when you stop does
         * the camera settle on the window.
         *
         * Clamped to 0.85 radians, about fifty degrees, for a reason
         * that is about the artwork and not about taste: the figure is
         * a BACK-VIEW drawing on a plane that turns to face the
         * camera. Past roughly fifty degrees you are looking at
         * somebody's back while they walk sideways, and the illusion
         * that held the whole scene together comes apart.
         */
        let lookWant = 0;
        if (best) {
          const wallX = FRONT_X * best.side;
          let d =
            Math.atan2(
              wallX - player.group.position.x,
              best.doorway.z - player.group.position.z
            ) - yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const near = Math.max(0, Math.min(1, (9 - bd) / 4.5));
          /* A shop whose building has been redrawn is looked at nearly
             head-on once you stop — Amit: *"ככה צריכים לראות, זה
             הזווית"* — the way you would stop and face a shopfront. */
          const cap = (HERO_READY.has(best.id) || street.windowShops.has(best.id)) && push <= 0.08 ? 1.4 : 0.85;
          lookWant =
            Math.max(-cap, Math.min(cap, d)) * near * (push > 0.08 ? 0.42 : 1);
        }
        /* Frame-rate independent easing, and slow: the drift is the
           point. Snapping to a shop as you pass reads as a bug. */
        look += (lookWant - look) * (1 - Math.pow(0.02, dt));

        /*
         * -----------------------------------------------------------
         * STANDING BACK TO SEE A SHOP
         * -----------------------------------------------------------
         * Amit: *"לא מצליח להסתכל לחנות, לא רואים את כל מה שבנינו."*
         *
         * Measured: from the middle of the pavement, 2.4 metres off
         * the wall, the screen holds thirteen per cent of a shopfront.
         * You cannot see a shop from underneath it, and no amount of
         * turning fixes that. Only distance does.
         *
         * So stopping beside a shop walks the CAMERA backwards, out
         * over the road, while the figure stays on the pavement. At
         * about eleven metres, with the wider lens, most of the facade
         * is in frame and the drawing is shown near its own resolution
         * rather than magnified past it.
         *
         * `frame` rises only while you are stationary next to
         * something; walk on and the camera comes back in behind you.
         */
        const wantFrame = best && push < 0.08 ? Math.max(0, Math.min(1, (9 - bd) / 4)) : 0;
        /* A shop you can see into is framed CLOSE, at about head height,
           the way Amit's favourite shot has it: the window fills the
           screen and the room behind it is the thing you are looking at,
           not a facade seen from across the road. */
        const closeUp = Boolean(best && (HERO_READY.has(best.id) || street.windowShops.has(best.id)));
        frame += (wantFrame - frame) * (1 - Math.pow(0.08, dt));

        let camYaw = yaw + look + turn;

        /*
         * ---------------------------------------------------------
         * WHICH SIDE OF THE WALKER THE CAMERA STANDS ON
         * ---------------------------------------------------------
         * Forward is f = (sin yaw, cos yaw) — that is the vector the
         * stick moves you along, so it is the definition of forward
         * and everything else has to agree with it.
         *
         * A third-person camera stands BEHIND you, at p - f·dist, and
         * looks AHEAD, at p + f·ahead. The first version had both
         * signs the other way: the camera stood in front of the
         * walker looking back down the street at him.
         *
         * On screen that is almost convincing, which is why it
         * survived three rounds of screenshots. The figure is a
         * back-view drawing on a plane that turns to face the camera,
         * so he still appeared to walk away — but he was walking away
         * from the shops, and every screenshot framed the empty end of
         * the street. There was nothing wrong with the lighting of the
         * shopfronts. They were behind the lens.
         *
         * The plane's normal is +Z, so to face a camera that is now at
         * -f it must be turned by yaw + PI. It follows the CAMERA's
         * yaw, not the walking heading — a billboard has to face where
         * the lens actually is, and since `look` moved the lens those
         * are no longer the same angle. DoubleSide costs nothing on
         * one quad and makes the figure immune to getting this wrong
         * again — a culled back face is an invisible character, which
         * is a very expensive way to find a sign error.
         */
        player.group.rotation.y = camYaw + Math.PI;

        const follow = 6.2 + pitch * 3.0 + frame * (closeUp ? 1.6 : 5.2);
        const wide = scripted
          ? scripted.dist
          : WIDE.dist + (follow - WIDE.dist) * k;
        if (scripted) camYaw = camYaw + (scripted.yaw - camYaw) * (1 - Math.pow(0.02, dt));
        const fx = Math.sin(camYaw), fz = Math.cos(camYaw);

        /*
         * -----------------------------------------------------------
         * THE CAMERA MUST NOT GO THROUGH THE WALL
         * -----------------------------------------------------------
         * Found on an emulated phone, by swiping: turn far enough and
         * the camera — which sits six metres BEHIND you — ends up
         * inside the terrace, and the screen fills with the black
         * inside face of a building.
         *
         * This street is a corridor with walls at x = ±FRONT_X, which
         * makes the fix arithmetic rather than physics. The camera is
         * at p.x - fx·d, so the largest d that keeps it inside is
         * solvable directly, and the camera slides in towards you
         * instead of through the brickwork.
         *
         * A floor of 2.4m, because a camera that collapses onto the
         * back of the character's head is its own kind of broken.
         */
        const WALL = FRONT_X - 0.5;
        let dist = wide;
        /*
         * INDOORS THE STREET'S WALL CLAMP IS THE WRONG WALL.
         *
         * It exists to stop the third-person camera reversing into a
         * shopfront, and it is derived from the building LINE — so
         * with the player standing three metres inside a shop it
         * shoved the camera out through the front of the building and
         * left the screen looking at the outside of the plaster.
         * Measured: that is exactly what the first walk-in did.
         *
         * A room has its own walls and they are close, so the camera
         * comes in tight instead: near enough to stand behind a
         * shoulder, far enough to see the shelves.
         */
        if (insideRef.current) {
          dist = Math.min(dist, 2.9);
        } else if (descend > 0.7 && Math.abs(fx) > 0.001) {
          const room =
            fx > 0
              ? (player.group.position.x + WALL) / fx
              : (WALL - player.group.position.x) / -fx;
          dist = Math.max(2.4, Math.min(dist, room));
        }

        /*
         * -----------------------------------------------------------
         * HEIGHT AND AIM FOLLOW THE DISTANCE, OR THE WALL LOSES YOU
         * -----------------------------------------------------------
         * Height was a constant 3.6m and the aim a constant 11m ahead,
         * which frames correctly at the resting distance and nowhere
         * else. The moment the wall clamp above pulled the camera in
         * to 3.1m, the camera was still three and a half metres up and
         * still looking eleven metres down the street — so the figure,
         * who is 1.78m and right underneath it, went off the BOTTOM of
         * the screen. Measured by projecting him: ndc.y = -1.52, where
         * anything past -1 is off the edge.
         *
         * Turning to look at a shop made the character disappear, and
         * no screenshot of a stationary camera would ever have shown
         * it.
         *
         * So both are proportional to the distance: come closer and
         * the camera comes DOWN towards eye level and looks less far
         * ahead, which is what a person does. The angles then stay
         * roughly constant — measured, the figure sits between -0.53
         * and -0.61 of the frame at every distance instead of
         * wandering off it.
         */
        const hgt = scripted
          ? scripted.hgt
          : WIDE.hgt + (1.2 + dist * 0.33 + frame * (closeUp ? -0.6 : 1.1) - WIDE.hgt) * k;
        const ahead = scripted ? dist * scripted.ahead : dist * 1.55 * (0.45 + 0.55 * k);
        camPos.set(
          player.group.position.x - fx * dist,
          hgt,
          player.group.position.z - fz * dist
        );
        camera.position.lerp(camPos, 1 - Math.pow(0.002, dt));
        aim.set(
          player.group.position.x + fx * ahead,
          (1.1 + dist * 0.16 + (closeUp ? frame * 1.3 : 0)) * k + 2.6 * (1 - k),
          player.group.position.z + fz * ahead
        );
        camera.lookAt(aim);

        street.update(dt, now / 1000, camera);
        /*
         * The places are checked the same way and at the same radius,
         * but separately: a shop you go INTO, a place you are MET at,
         * and the two must never be confused on screen.
         */
        let bestPlace: (typeof street.places)[number] | null = null;
        let pd = 8;
        for (const pl of street.places) {
          if (!pl.department) continue;
          const d = pl.spot.distanceTo(player.group.position);
          if (d < pd) { pd = d; bestPlace = pl; }
        }
        /*
         * WHICHEVER IS ACTUALLY NEARER.
         *
         * The place pill was drawn only when no shop was in range, and
         * the shop range is nine metres against the place's eight — so
         * standing IN the dog park, half a metre from its gate, the
         * screen named the pet shop eight metres up the road and never
         * the park. Measured at z 62: "בעלי חיים · כדאי להיכנס", with
         * `place_dogpark` right under the camera.
         *
         * The two are still different things and never share the
         * screen — a shop you go INTO, a place you are MET at — but
         * which one you are at is a distance, not a precedence.
         */
        /*
         * …BUT A SHOP YOU ARE STANDING AT IS THE SHOP. The places sit
         * 8.8m from shop doors (the pull-in bay by the garage, the
         * courier point by the nail bar, the bench by the vet), and on
         * the frontage between them the nearer one used to win — so in
         * front of a shop's own window Amit got the place's "מה אפשר
         * להזמין כאן" and no way in: *"פה אין לי אפשרות להיכנס לחנות."*
         * Within a shop's frontage (a bay is 8.8m) the door wins;
         * beyond it, distance.
         */
        const atFrontage =
          best !== null &&
          Math.abs(player.group.position.z - best.doorway.z) < 4.2 &&
          Math.sign(player.group.position.x) === best.side;
        if (bestPlace && best && pd < bd && !atFrontage) best = null;
        const placeId = bestPlace ? bestPlace.id : null;
        if (placeId !== lastPlace) {
          lastPlace = placeId;
          setNearPlace(
            bestPlace
              ? {
                  id: bestPlace.id,
                  he: bestPlace.he,
                  department: bestPlace.department,
                  services: bestPlace.services,
                }
              : null
          );
        }

        const id = best ? best.id : null;
        if (id !== lastNear) {
          lastNear = id;
          setNearId(id);
          setNearName(best ? (best.sponsor ? `${best.he} · בחסות` : best.he) : null);
          /*
           * -----------------------------------------------------------
           * A DOOR WITH NO PAINTED ROOM STILL OPENS
           * -----------------------------------------------------------
           * The vet's house has a sign, a neon, a doorway and a pill
           * that names it — and pressing nothing happened, because
           * `shop_vet_inside.webp` has not been drawn. Measured: at
           * z -105.6 the pill read "וטרינריה" with no "כדאי להיכנס"
           * under it and no button on screen. Amit: *"הרבה דברים
           * שבורים במפה."* This is one of them, and from the pavement
           * it is indistinguishable from a bug.
           *
           * The painting was never the point. A house in this street
           * exists so you can see what the trade does and call
           * somebody — and that is a list, which we have. So a shop
           * with a room walks you into the room, and a shop without
           * one opens the same sheet a place opens, with a sentence
           * that fits a shop rather than a park.
           */
          const target = best;
          enterRef.current = target?.interior
            ? () => {
                if (entry) return;
                /*
                 * PRESSED BEFORE THE FIRST STEP. The city opens seen
                 * from above, with the nearest shop's "היכנס" already
                 * showing — and pressing it there left the camera in
                 * the air: every room without a 360 picture was shown
                 * from over the rooftops. Going in is coming down.
                 */
                descend = 1;
                leaving = true;
                setArriving(false);
                entry = {
                  shop: target,
                  startedAt: performance.now(),
                  dir: 1,
                  from: player.group.position.clone(),
                  aimFrom: camera.position.clone(),
                };
              }
            : target?.department
              ? () =>
                  setOpenPlace({
                    he: target.he,
                    department: target.department!,
                    services: target.services,
                    noteHe: "אלה השירותים שאפשר להזמין מכאן. המקצוען מגיע אליכם.",
                  })
              : null;
          if (autoEnter && target?.id === autoEnter && enterRef.current) {
            autoEnter = null;
            const go = enterRef.current;
            window.setTimeout(() => go(), 700);
          }
        }

        /* Grain has to move, or it is a dirty lens rather than film. */
        grade.uniforms.uTime!.value = (now % 10000) / 1000;
        composer.render();
        raf = requestAnimationFrame(tick);
      };
      /* Coming back out is the same move with the sign flipped. */
      leaveRef.current = () => {
        /*
         * THE SHOP YOU ARE IN, NOT THE LAST ONE THE PAVEMENT NAMED.
         *
         * A tester: *"כשאני בתוך חנות ולוחץ על חזרה לרחוב הוא מסתובב אבל
         * נשאר בתוך החנות."* This looked the shop up by `lastNear`, which
         * the proximity check keeps rewriting — so the way out could
         * belong to a neighbour, or to nothing, and the room stayed.
         */
        const inId = insideRef.current?.id ?? lastNear;
        const shop = street.shops.find((x) => x.id === inId);
        if (!shop) {
          insideRef.current = null;
          setVeil(0);
          return;
        }
        const wall = FRONT_X * shop.side;
        if (shop.roomSpot) {
          /*
           * The way out ENDS on the pavement. The exit plays the walk-in
           * backwards, so `from` is where it finishes — and it was the
           * room itself, which left the figure standing behind the glass
           * with the street's buttons back on: "he turns round but stays
           * in the shop."
           */
          entry = {
            shop,
            startedAt: performance.now(),
            dir: -1,
            from: new THREE.Vector3(wall - shop.side * 2.4, 0, shop.doorway.z + 1.2),
            aimFrom: new THREE.Vector3(wall - shop.side * 6.6, 2.6, shop.doorway.z + 4.6),
          };
          return;
        }
        entry = {
          shop,
          startedAt: performance.now(),
          dir: -1,
          from: new THREE.Vector3(wall - shop.side * 5.2, 0, shop.doorway.z + 1.4),
          aimFrom: new THREE.Vector3(wall - shop.side * 7.4, 3.0, shop.doorway.z + 5.4),
        };
      };

      raf = requestAnimationFrame(tick);
      setReady(true);

      const resize = () => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
        composer.setSize(el.clientWidth, el.clientHeight);
        bloom.setSize(el.clientWidth, el.clientHeight);
        for (const r of vrRooms.values()) r.setAspect(el.clientWidth / el.clientHeight);
        gradeAspect();
      };
      window.addEventListener("resize", resize);

      stop = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        renderer.domElement.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        ring.remove();
        knob.remove();
        player.dispose();
        composer.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      stop();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
    };
  }, [base, spawn?.x, spawn?.z, avatarNo, enterShopId]);

  /* ----- the pad, in the DOM because that is where fingers are ----- */
  const padRef = useRef<HTMLDivElement | null>(null);
  const nubRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const pad = padRef.current, nub = nubRef.current, el = host.current;
    if (!pad || !nub || !el) return;
    let on = false;
    const send = (x: number, y: number) =>
      (el as unknown as { __stick?: (a: number, b: number) => void }).__stick?.(x, y);
    const at = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const max = r.width / 2 - 14;
      const len = Math.hypot(dx, dy) || 1;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      send(dx / max, dy / max);
    };
    const down = (e: PointerEvent) => { on = true; pad.setPointerCapture(e.pointerId); at(e); e.stopPropagation(); };
    const move = (e: PointerEvent) => { if (on) { at(e); e.stopPropagation(); } };
    const up = () => { on = false; nub.style.transform = "translate(-50%, -50%)"; send(0, 0); };
    pad.addEventListener("pointerdown", down);
    pad.addEventListener("pointermove", move);
    pad.addEventListener("pointerup", up);
    pad.addEventListener("pointercancel", up);
    return () => {
      pad.removeEventListener("pointerdown", down);
      pad.removeEventListener("pointermove", move);
      pad.removeEventListener("pointerup", up);
      pad.removeEventListener("pointercancel", up);
    };
  }, [ready]);

  return (
    <div style={S.wrap}>
      <div ref={host} style={S.canvas} />
      {route ? (
        <div
          ref={homeLabel}
          style={{ position: "absolute", transform: "translate(-50%,-120%)", opacity: 0, transition: "opacity .4s", pointerEvents: "none", padding: "5px 12px", borderRadius: 999, background: "rgba(255,107,74,.92)", color: "#fff", fontWeight: 800, fontSize: scale.meta, direction: "rtl", whiteSpace: "nowrap", boxShadow: "0 0 24px rgba(255,107,74,.7)" }}
        >
          הבית שלך
        </div>
      ) : null}
      {route?.photoUri ? (
        /* HIS FACE OVER HIS VAN — no number: the minutes are in the card at
           the top, once (design review, 2026-09-29). */
        <div
          ref={vanLabel}
          role="img"
          aria-label={route.labelHe ? `המקצוען בדרך · ${route.labelHe}` : "המקצוען בדרך"}
          style={{ position: "absolute", transform: "translate(-50%,-100%)", opacity: 0, transition: "opacity .4s", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <style>{"@keyframes pnFacePulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.9);opacity:0}}"}</style>
          <div style={{ position: "relative", width: 38, height: 38 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: 19, border: "2px solid #FF5A3C", animation: "pnFacePulse 2.4s ease-out infinite" }} />
            <img src={route.photoUri} alt="" style={{ position: "absolute", inset: 0, width: 38, height: 38, borderRadius: 19, objectFit: "cover", background: "#2a2238", border: "2px solid #FF5A3C", boxShadow: "0 0 14px rgba(255,90,60,.6)" }} />
          </div>
          <span style={{ width: 2, height: 14, background: "linear-gradient(#FF5A3C, rgba(255,90,60,0))" }} />
        </div>
      ) : null}

      {/*
        * -----------------------------------------------------------------
        * THE FIRST SECOND OF THE PRODUCT, AND IT WAS A BLACK SCREEN
        * -----------------------------------------------------------------
        * Amit: *"שלוחצים להיכנס למפה שלנו ואז רשום 'העיר בבנייה' עם מסך
        * שחור — זה גרוע ומעפן."*
        *
        * He is right, and it is worse than ugly: the city is 38MB of
        * art, so this screen is the FIRST thing anybody sees and it
        * lasts for seconds. A black rectangle with grey type on it is
        * the app admitting it is a web page that has not finished
        * loading.
        *
        * So the wait is a view of the city you are about to walk into,
        * with the brand over it and a bar that fills. Same seconds,
        * and they now say "somewhere is being opened for you" instead
        * of "please hold".
        */}
      {!ready ? (
        <div style={S.load}>
          <div
            style={{
              ...S.loadArt,
              backgroundImage: `url(${base}${isDaytime() ? "splash_city_day" : "splash_city"}.webp)`,
            }}
          />
          <div style={S.loadVeil} />
          <div style={S.loadMid}>
            <div style={S.loadMark}>
              PRO <span style={{ color: "#FF6B4A" }}>NOW</span>
            </div>
            <div style={S.loadWordHe}>נכנסים לעיר</div>
            <div style={S.loadBar}>
              <div style={S.loadFill} />
            </div>
          </div>
        </div>
      ) : null}

      {/* The controls stand down while the camera is doing the walking:
          a joystick on screen during a camera move says the move is
          something you are doing, and it is not. */}
      {/*
        * THE INVITATION.
        *
        * Amit: *"כשמגיעים לחנות של ספונסר יקפוץ איזה לוגו קטן שלהם או
        * משהו שיסמן שכדאי להיכנס."*
        *
        * It was a line of white type that said the shop's name, which
        * tells you where you are and not that there is anything to do
        * about it. Now it is a card in the shop's own colour, and for
        * a sponsor it carries בחסות on the same card — inseparable
        * from the name, which is the rule.
        *
        * NOT a Lust character inviting you in, which he also
        * suggested. A figure speaking for a brand is a promise made in
        * that brand's name, and a brand's own voice is theirs to
        * supply, not ours to invent. The day they send one it goes
        * here with no change to this code.
        */}
      {hud && nearName && !walking && !insideShop ? (
        <div style={{ ...S.name, borderColor: nearTint }}>
          <span style={{ ...S.nameDot, background: nearTint }} />
          <span style={S.nameText}>{nearName}</span>
          {enterRef.current ? <span style={S.nameGo}>כדאי להיכנס</span> : null}
        </div>
      ) : null}

      {/*
        * STANDING INSIDE.
        *
        * The name of the room you are in, and the two things there are
        * to do in it: ask what can be ordered from here, and walk back
        * out. Nothing else — a room full of buttons is a menu with
        * wallpaper.
        */}
      {hud && insideShop && !walking && !room ? (
        <div
          style={{
            ...S.name,
            borderColor: insideShop.neonColour ?? "#FF6B4A",
          }}
        >
          <span style={{ ...S.nameDot, background: insideShop.neonColour ?? "#FF6B4A" }} />
          <span style={S.nameText}>{insideShop.he}</span>
          <span style={S.nameGo}>אתם בפנים</span>
        </div>
      ) : null}

      {hud && insideShop && !walking && !room ? (
        <button
          type="button"
          style={{ ...S.enter, background: insideShop.neonColour ?? "#FF6B4A" }}
          onClick={() => setRoom(insideShop)}
        >
          מה אפשר להזמין כאן ›
        </button>
      ) : null}

      {hud && insideShop && !walking && !room ? (
        <button
          type="button"
          style={S.leaveRoom}
          onClick={() => {
            setInside(null);
            leaveRef.current?.();
          }}
        >
          ‹ חזרה לרחוב
        </button>
      ) : null}

      {/* Said once, for four seconds. A control nobody knows about is
          the same as a control that is not there — and this one was
          both, for a week. */}
      {hud && ready && !walking && !room && arriving ? (
        <div style={S.hint}>גררו באצבע על המסך כדי ללכת</div>
      ) : hud && ready && !walking && !room && hint ? (
        <div style={S.hint}>גררו באצבע למעלה כדי ללכת, לצדדים כדי לעבור צד</div>
      ) : null}

      {/*
        * A PLACE, NOT A SHOP.
        *
        * Same pill, different sentence and a different verb: you do
        * not go INTO a dog park, you are met at one. The distinction
        * matters because the whole street is built on the difference
        * between premises and presence.
        */}
      {hud && nearPlace && !nearId && !walking ? (
        <div style={{ ...S.name, borderColor: "#8ce06a" }}>
          <span style={{ ...S.nameDot, background: "#8ce06a" }} />
          <span style={S.nameText}>{nearPlace.he}</span>
          <span style={S.nameGo}>נפגשים כאן</span>
        </div>
      ) : null}

      {hud && nearPlace && !nearId && !walking && nearPlace.department ? (
        <button
          style={S.enter}
          onClick={() =>
            setOpenPlace({
              he: nearPlace.he,
              department: nearPlace.department!,
              services: nearPlace.services,
              noteHe: "אין כאן חנות — המקצוען מגיע אליכם. זה המקום שנפגשים בו.",
            })
          }
        >
          מה אפשר להזמין כאן ›
        </button>
      ) : null}

      {hud && nearId && !walking && !insideShop && enterRef.current ? (
        <button
          style={S.enter}
          onClick={() => {
            setWalking(true);
            const shop = SHOPS.find((x) => x.id === nearId);
            const hero = nearId
              ? HERO_READY.has(nearId) ? `hero_${nearId}.webp` : DOORSTEP_HERO[nearId]
              : undefined;
            /* No doorstep picture any more. Amit: *"זה המבנה שצריכים לראות
               כשמטיילים ברחוב — שנכנסים לחנות צריך ישר להיכנס לחנות התלת
               מימד."* The building now stands in the street itself (see
               `heroFaces` in street.ts); the door goes straight in. */
            void hero; void shop; void setDoorstep; void DOORSTEP_DIR; void DOORSTEP_MS;
            enterRef.current?.();
          }}
        >
          {/* The door says whose it is — see "ONLY A SHOP YOU CAN SEE". */}
          {`היכנס ל${SHOPS.find((x) => x.id === nearId)?.he ?? "חנות"} ›`}
        </button>
      ) : null}

      <div
        ref={padRef}
        style={{
          ...S.pad,
          /* Nothing from the street shows through the loading screen —
             a joystick under a splash is the seam showing. */
          /* Invisible now — the whole screen is the stick — but kept
             where a thumb rests, and it behaves the same. */
          opacity: 0,
          pointerEvents: hud && ready ? "auto" : "none",
        }}
      >
        <div ref={nubRef} style={S.nub} />
      </div>

      {onBackButton(onExit)}

      {/* The brand's colour, rising as the door opens. */}
      {doorstep ? (
        <div style={S.door} aria-hidden>
          <div style={{ ...S.doorGlow, background: `radial-gradient(60% 45% at 50% 55%, ${doorstep.neon}55 0%, rgba(11,8,16,0) 70%)` }} />
          <img src={doorstep.src} alt="" style={S.doorArt} />
          <div style={S.doorName}>
            <span style={{ color: doorstep.neon }}>●</span> {doorstep.he}
          </div>
        </div>
      ) : null}

      <div
        style={{
          ...S.veil,
          background: nearId
            ? (SHOPS.find((x) => x.id === nearId)?.neonColour ?? "#FF6B4A")
            : "#FF6B4A",
          opacity: veil,
        }}
      />

      {openPlace ? (
        <div style={S.sheetWrap} onClick={() => setOpenPlace(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.sheetName}>{openPlace.he}</h3>
            <p style={S.sheetBody}>{openPlace.noteHe}</p>
            <div style={S.services}>
              {(placeTrades[openPlace.department] ?? [])
                .filter((sv) => !openPlace.services || openPlace.services.includes(sv.id))
                .map((sv) => (
                <button
                  key={sv.id}
                  style={S.service}
                  onClick={() => onRequestService?.(sv.id)}
                >
                  <span style={S.serviceName}>{sv.nameHe}</span>
                  {typeof sv.availableNowCount === "number" ? (
                    <span style={S.serviceCount}>{sv.availableNowCount} פנויים עכשיו</span>
                  ) : null}
                  <span style={S.serviceGo}>›</span>
                </button>
              ))}
            </div>
            <button style={S.sheetClose} onClick={() => setOpenPlace(null)}>
              סגירה
            </button>
          </div>
        </div>
      ) : null}

      {room ? (
        <ShopRoom
          base={base}
          shop={room}
          /*
           * The house's OWN services, not its department's. See
           * `ShopSpec.services`: two BEAUTY houses stand in this
           * street and both were offering all three beauty trades, so
           * "ציפורניים" opened with a haircut at the top of the list.
           */
          trade={
            (room.department &&
              (() => {
                const t = trades?.[room.id];
                if (!t) return null;
                if (!room.services) return t;
                return {
                  ...t,
                  services: t.services.filter((sv) => room.services!.includes(sv.id)),
                };
              })()) ||
            null
          }
          onRequestService={onRequestService}
          onLeave={() => {
            setRoom(null);
            leaveRef.current?.();
          }}
          onStreet={() => setWalking(false)}
        />
      ) : null}
    </div>
  );
}


/**
 * INSIDE.
 *
 * ---------------------------------------------------------------------
 * WHY THE SHELVES ARE PRESSABLE AND THE DOOR IS NOT THE POINT
 * ---------------------------------------------------------------------
 * Amit, when an earlier build sent him straight to the brand's site:
 * *"לא רוצה לאתר ישר. רוצה שיהיו מוצרים בחנות פה שיפתחו כמו מקודם עם
 * הנצנצים."*
 *
 * He is right about the business as well as the feeling. A door that
 * opens a browser is an ad; a room you can look around, where the
 * things on the shelves open and tell you what they are, is a visit —
 * and the link at the end of a visit is worth more than the link
 * instead of one.
 *
 * ---------------------------------------------------------------------
 * WHAT IS AND IS NOT ALLOWED TO BE WRITTEN HERE
 * ---------------------------------------------------------------------
 * Every name, line and price comes from `PREVIEW_SPONSORS`, which took
 * them off the brand's own page. Nothing on this screen is computed,
 * inferred or filled in, and a product with no price simply has none —
 * see `sponsorShopViolations`, which rejects a was-price without a
 * price for exactly this reason. A price in a shop window is a claim
 * made on somebody else's behalf.
 *
 * And the exit is announced: `sponsorLeaveHe` is the one sentence that
 * says the next tap leaves PRO NOW, in the same spirit as the maps
 * handoff. We hand over a link and claim nothing about the other side.
 */
/** Stills of the built rooms, by shop id, for the order sheet. */
const ROOM_SHOTS = new Map<string, string>();
/*
 * THE SHOP, OPEN, WITH ITS PROFESSIONAL IN THE DOORWAY.
 *
 * Amit, of the Lust boutique with its saleswoman standing inside: that
 * is the picture he wants on every order sheet — *"בעמוד של האפשרויות
 * שים את איש המקצוע שבנינו … ותגדיל על כל העמוד."* Where a shop's
 * `venue_<id>` drawing has arrived it fills the sheet, and the options
 * sit over its foot.
 */
const VENUES = new Map<string, string>();
/** The trades with a single drawn interior (`shop_<id>_inside`). */
const DRAWN_INTERIORS: ReadonlySet<string> = new Set(["build", "help", "move", "nails", "pets", "tech", "vet", "well"]);
/** The shops whose room has been built, and how many pieces of furniture each. */
/* `tech` has no furniture cut out yet: its room is the drawn interior
   taken apart into walls (the back wall straight from the drawing, the
   side walls from its own shelving units), with nothing standing in it. */
const BUILT_ROOMS: Readonly<Record<string, number>> = { hair: 5, lust: 3, home: 3, nails: 3, tech: 0, pets: 2, auto: 3, appliance: 3, care: 3, move: 3, well: 3, build: 2, help: 3, vet: 3 };
/** The shops drawn open with their professional in the doorway (`venue_<id>`). */
const VENUE_READY: ReadonlySet<string> = new Set(["hair", "home", "nails", "pets", "auto", "appliance", "care", "move", "well", "build", "help", "vet"]);
/*
 * A SPONSOR'S PRODUCTS PAGE: THE BOUTIQUE WITH ITS SALESWOMAN.
 *
 * Amit: *"שעוברים למוצרים — תמונה יותר רחבה של החנות עם הדמות המצויירת
 * שעשינו להם."* The page shows the boutique drawn open with its figure
 * inside, and each product's sparkle sits on that product in THIS
 * picture — [x, y] as fractions of it, in the order of `things`.
 */
const SPONSOR_VENUE: Readonly<Record<string, { file: string; spots: ReadonlyArray<readonly [number, number]> }>> = {
  lust: {
    file: "sponsor_lust_venue.webp",
    spots: [[0.87, 0.62], [0.13, 0.62], [0.46, 0.73], [0.25, 0.6]],
  },
};

function ShopRoom({
  base,
  shop,
  trade,
  onRequestService,
  onLeave,
  onStreet,
}: {
  base: string;
  shop: ShopSpec;
  /** What this trade does, when the host knows. */
  trade: Trade | null;
  onRequestService?: (serviceId: string) => void;
  onLeave: () => void;
  /* Called once the walk back out has finished, so the stick returns. */
  onStreet: () => void;
}) {
  /* A sponsor's picture carries its tappable products at fixed places,
     so it keeps its drawing; every other shop shows its built room. */
  const venue = shop.sponsor ? undefined : VENUES.get(shop.id);
  const sponsorVenue = shop.sponsor ? SPONSOR_VENUE[shop.id] : undefined;
  const picture = venue || (sponsorVenue && base + sponsorVenue.file) || (!shop.sponsor && ROOM_SHOTS.get(shop.id)) || base + shop.interior;
  const sponsor = shop.sponsor
    ? PREVIEW_SPONSORS.find((x) => x.id === shop.id) ?? null
    : null;
  const things = sponsor?.things ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(t);
  }, []);

  /*
   * ---------------------------------------------------------------
   * THE WHOLE SHOP, FROM ACROSS THE ROOM
   * ---------------------------------------------------------------
   * Amit: *"כשנכנסים לחנות אני רוצה שזה יהיה כמו בחנות שעשינו
   * בהתחלה — מבט מרחוק ונצנצים על מוצרים, לא ככה בקלוז־אפ."*
   *
   * The previous version covered the screen with the picture, which
   * on a 4:3 room and a 9:19.5 phone throws away a third of the width
   * on each side. Two of Lust's four shelves were in the thrown-away
   * part, and the answer at the time — drag to look around — was
   * solving a problem that did not need to exist.
   *
   * The picture is shown WHOLE now. That is not a compromise, it is
   * the brief: you are meant to be standing across the room looking
   * at the shelves, not pressed against one of them.
   *
   * A whole 4:3 picture on this screen is 298 points tall and the
   * remaining 500 are the thing to solve. Black bars read as a
   * letterbox — a video someone paused. So the same image, blown up,
   * blurred and dimmed, fills behind it: the screen is full, the
   * colour of the shop is everywhere, and the sharp picture reads as
   * a window into the room rather than a photograph of it.
   *
   * And the shelves get a ROW of their own under the picture. The
   * sparkles stay — they are what says "this is not a photograph" —
   * but a 44-point target on a 298-point picture is fiddly, and
   * nothing that a brand paid for should depend on a precise tap.
   */
  const stage = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const fit = (img: HTMLImageElement) => {
    const host = stage.current;
    if (!host || !img.naturalWidth) return;
    /*
     * WIDTH-LIMITED, AND THEN THE FRAME FOLLOWS THE PICTURE.
     *
     * A 4:3 room on a 390-point phone is 298 points tall when it is
     * shown whole. That is arithmetic, not a choice: the only way to
     * make it bigger is to crop it, and cropping is what hid two of
     * Lust's four shelves in the first place.
     *
     * What CAN go is the dead space. The stage was a fixed share of
     * the screen, so raising it from 44% to 60% did not enlarge the
     * picture by a pixel — it just put two hundred points of blurred
     * nothing between the shop and its card. The frame is sized from
     * the fitted picture now, and the card sits directly under it.
     */
    const k = Math.min(
      host.clientWidth / img.naturalWidth,
      (window.innerHeight * 0.58) / img.naturalHeight
    );
    setBox({ w: img.naturalWidth * k, h: img.naturalHeight * k });
  };

  /*
   * ---------------------------------------------------------------
   * LOOKING CLOSER AT A SHELF
   * ---------------------------------------------------------------
   * Amit: *"שפה תהיה לי אפשרות לעשות זום אין לחנות להסתכל מקרוב
   * יותר."*
   *
   * Pinch to zoom, drag to move, and tapping a sparkle takes you to
   * it — which is the one that matters, because hunting for a shelf
   * by pinching is work and pressing the thing you already want is
   * not.
   *
   * Capped at 2.5. The interiors are 3400 pixels wide and the picture
   * is shown at about 390, so 2.5 is still inside the file's own
   * resolution; past that the engine would be inventing detail and he
   * would be looking at mush. It is the file that sets this ceiling,
   * not the code, and the day a larger one arrives the number moves.
   *
   * The sparkles live INSIDE the same transformed box as the picture,
   * so they zoom and pan with it and a mark never drifts off the
   * shelf it points at.
   */
  const MAX_ZOOM = 2.5;
  const [zoom, setZoom] = useState(1);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const atRef = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const drag2 = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);

  const clampAt = (z: number, x: number, y: number) => {
    if (!box) return { x: 0, y: 0 };
    const mx = Math.max(0, (box.w * z - box.w) / 2);
    const my = Math.max(0, (box.h * z - box.h) / 2);
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };
  const apply = (z: number, x: number, y: number) => {
    const zz = Math.max(1, Math.min(MAX_ZOOM, z));
    const p2 = clampAt(zz, x, y);
    zoomRef.current = zz;
    atRef.current = p2;
    setZoom(zz);
    setAt(p2);
  };

  const down2 = (e: React.PointerEvent) => {
    /*
     * -----------------------------------------------------------------
     * A SPARKLE HAS TO BE ABLE TO SWALLOW ITS OWN PRESS
     * -----------------------------------------------------------------
     * Amit: *"הכפתורים הזוהרים בלאסט לא לחיצים בכלל ולא קורה כלום."*
     *
     * He was pressing them and they were doing nothing, and the reason
     * is one line below this: the stage calls `setPointerCapture` on
     * every pointerdown so a drag can continue outside its own bounds.
     * Capture RETARGETS every later event to the capturing element —
     * so the pointerup never reached the button, and a button that
     * never gets its pointerup never fires a click. The sparkle was a
     * button in name only.
     *
     * A press that starts on a sparkle is not a drag. It is left alone.
     */
    if ((e.target as HTMLElement).closest?.("[data-spark]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b2] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b2!.x, a!.y - b2!.y), zoom: zoomRef.current };
      drag2.current = null;
    } else if (pointers.current.size === 1) {
      drag2.current = { x: e.clientX, y: e.clientY, from: { ...atRef.current } };
    }
  };
  const move2 = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b2] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b2!.x, a!.y - b2!.y);
      apply((pinch.current.zoom * d) / pinch.current.dist, atRef.current.x, atRef.current.y);
      return;
    }
    const d2 = drag2.current;
    if (d2 && zoomRef.current > 1.01) {
      apply(zoomRef.current, d2.from.x + (e.clientX - d2.x), d2.from.y + (e.clientY - d2.y));
    }
  };
  const up2 = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag2.current = null;
  };

  /** Press a sparkle: come in close on it, then open the card. */
  const goTo = (i: number, t: { x: number; y: number }) => {
    if (!box) { setOpen(i); return; }
    const z = 2;
    apply(z, (0.5 - t.x) * box.w * z, (0.5 - t.y) * box.h * z);
    window.setTimeout(() => setOpen(i), 260);
  };

  const thing = open === null ? null : things[open] ?? null;
  const tint = shop.neonColour ?? "#FF6B4A";

  return (
    <div style={venue ? { ...S.room, ...S.roomVenue } : S.room}>
      {/* The shop's own colour and light, behind everything — or, where
          the shop has been drawn open, the shop itself, page-high. */}
      <img
        src={picture}
        alt=""
        aria-hidden={!venue}
        style={{
          ...S.roomWash,
          ...(venue ? S.venueArt : null),
          /* A short list leaves room for a bigger shop; a long one keeps
             the options clear of the professional. */
          ...(venue && (trade?.services.length ?? 0) <= 3 ? { height: "68%" } : null),
          opacity: shown ? 1 : 0,
        }}
      />
      <div style={{ ...S.roomWashVeil, ...(venue ? S.venueVeil : null), opacity: shown ? 1 : 0 }} />

      <div
        ref={stage}
        style={{ ...S.roomStage, height: box ? box.h : "40%", ...(venue ? { display: "none" } : null) }}
        onPointerDown={down2}
        onPointerMove={move2}
        onPointerUp={up2}
        onPointerCancel={up2}
      >
        <div
          style={{
            ...S.roomInner,
            width: box ? box.w : "92%",
            height: box ? box.h : undefined,
            transform: shown
              ? `translate(${at.x}px, ${at.y}px) scale(${zoom})`
              : "scale(1.1)",
            transition: pinch.current || drag2.current
              ? "none"
              : "transform 300ms cubic-bezier(.16,.84,.34,1), opacity 420ms ease",
            opacity: shown ? 1 : 0,
            boxShadow: `0 26px 70px rgba(0,0,0,.6), 0 0 0 1px ${tint}44`,
          }}
        >
          <img
            src={picture}
            alt=""
            style={S.roomImg}
            onLoad={(e) => fit(e.currentTarget)}
          />
          {things.map((t, i) => (
            <button
              key={t.titleHe}
              style={{
                ...S.spot,
                left: `${(sponsorVenue?.spots[i]?.[0] ?? t.x) * 100}%`,
                top: `${(sponsorVenue?.spots[i]?.[1] ?? t.y) * 100}%`,
                animationDelay: `${i * 0.45}s`,
              }}
              data-spark=""
              onClick={() => goTo(i, t)}
              aria-label={t.titleHe}
            >
              <span style={S.spotCore} />
            </button>
          ))}
        </div>
      </div>

      <div style={venue ? { ...S.roomBar, ...S.venueBar } : S.roomBar}>
        <h2 style={S.roomName}>
          {shop.sponsor ? shop.he : `PRO NOW · ${shop.he}`}
        </h2>
        <p style={S.roomTag}>
          {sponsor
            ? `${sponsor.categoryHe} · ${SPONSOR_BADGE_HE}`
            : "זה התחום, לא מקצוען מסוים"}
        </p>
        {sponsor ? <p style={S.roomLine}>{sponsor.taglineHe}</p> : null}

        {/*
          * WHAT THIS TRADE DOES.
          *
          * Amit: *"חייב שיפתחו אפשרויות."* A trade's shop used to be a
          * beautiful room with nothing to do in it. These are the real
          * services of the department the shop stands for, read from
          * the catalogue, and pressing one asks for a professional.
          *
          * The count is shown only where the live snapshot gave one.
          * A trade with no number simply has none — never a zero,
          * which would read as "nobody is free" (/CLAUDE.md §3).
          */}
        {trade && trade.services.length > 0 ? (
          <>
            <p style={S.shelfHint}>מה שאפשר להזמין מכאן</p>
            <div style={S.services}>
              {trade.services.map((sv) => (
                <button
                  key={sv.id}
                  style={S.service}
                  onClick={() => onRequestService?.(sv.id)}
                >
                  <span style={S.serviceName}>{sv.nameHe}</span>
                  {typeof sv.availableNowCount === "number" ? (
                    <span style={S.serviceCount}>{sv.availableNowCount} פנויים עכשיו</span>
                  ) : null}
                  <span style={S.serviceGo}>›</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {/*
          * THE SHELF ROW IS GONE, AND THAT IS THE POINT.
          *
          * Amit: *"חייב שיופיעו הדברים האלה רק כשלוחצים על הזוהרים."*
          *
          * It was here as a fallback for the day the sparkles did not
          * work — and they did not work, so the fallback became the
          * whole interaction: every product was listed at the bottom
          * of the screen and the room above it was decoration. Now
          * that a sparkle actually opens its product, a list of the
          * same products underneath takes the discovery away.
          *
          * What stays is the sentence that tells you the room is the
          * control.
          */}
        {things.length > 0 ? (
          <p style={S.shelfHint}>לחצו על הנצנצים במדפים כדי לראות מה יש בחנות</p>
        ) : null}

        {/*
          * THE BRAND'S OWN DOOR, ON THE BRAND'S OWN PAGE.
          *
          * Amit: *"אין קישור לאתר בעמוד הראשי של החנות."* It existed
          * only inside a product card, so you could stand in Lust's
          * shop, read her name and her line, and have no way to reach
          * her — unless you happened to press a sparkle first.
          *
          * A sponsor paid for a shop, and a shop has a door out to the
          * business. The sentence above it is `sponsorLeaveHe`, which
          * says plainly that this leaves PRO NOW — the rule is that an
          * exit to somebody else's site is always announced.
          */}
        {sponsor ? (
          <>
            <p style={S.leaving}>{sponsorLeaveHe(sponsor)}</p>
            <a
              style={S.site}
              href={sponsor.siteUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {sponsorCtaHe(sponsor)}
            </a>
          </>
        ) : null}

        <button
          style={S.out}
          onClick={() => {
            onLeave();
            window.setTimeout(onStreet, 1500);
          }}
        >
          חזרה לרחוב
        </button>
      </div>

      {thing ? (
        <div style={S.sheetWrap} onClick={() => setOpen(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.sheetName}>{thing.titleHe}</h3>
            <p style={S.sheetBody}>{thing.bodyHe}</p>
            {thing.priceHe ? (
              <p style={S.price}>
                <strong style={S.priceNow}>{thing.priceHe}</strong>
                {thing.wasPriceHe ? (
                  <span style={S.priceWas}>{thing.wasPriceHe}</span>
                ) : null}
              </p>
            ) : null}
            {sponsor ? (
              <>
                <p style={S.leaving}>{sponsorLeaveHe(sponsor)}</p>
                <a
                  style={S.site}
                  href={sponsor.siteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {sponsorCtaHe(sponsor)}
                </a>
              </>
            ) : null}
            <button style={S.sheetClose} onClick={() => setOpen(null)}>
              סגירה
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function onBackButton(onExit?: () => void) {
  if (!onExit) return null;
  return (
    <button style={S.back} onClick={onExit} aria-label="חזרה">
      ›
    </button>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { position: "absolute", inset: 0, background: "#05040c", overflow: "hidden", direction: "rtl", touchAction: "none" },
  /*
   * `touchAction: "none"` is the whole of "you cannot look sideways".
   *
   * Amit: *"אני צריך שהמבט של הדמות תוכל לזוז ימינה שמאלה, שיראו את
   * החנויות בצדדים, אחרת לא רואים אותם."*
   *
   * Drag-to-turn has been wired to the canvas since the first build
   * and it works with a mouse, which is why every screenshot of it
   * looked fine. On a touch screen the browser claims a drag for its
   * own scrolling before the page sees it, cancels the pointer
   * stream, and the camera never moves. The joystick had this line
   * from the start; the canvas never did, so the one control that
   * needs a drag was the one that did not declare it.
   */
  canvas: { position: "absolute", inset: 0, touchAction: "none" },
  load: {
    position: "absolute", inset: 0, overflow: "hidden", background: "#17121F",
  },
  loadArt: {
    /*
     * A background rather than an <img>. The picture is 2:1 and the
     * phone is 1:2, so it has to be cropped hard — and `object-fit`
     * on an absolutely-positioned image left a band of empty screen
     * under it. `background-size: cover` crops without asking.
     */
    position: "absolute", inset: 0,
    backgroundSize: "cover", backgroundPosition: "center",
    /* A slow drift, so the wait is alive rather than frozen. */
    animation: "pnDrift 18s ease-in-out infinite alternate",
  },
  loadVeil: {
    position: "absolute", inset: 0,
    background:
      "linear-gradient(180deg, rgba(23,18,31,.35) 0%, rgba(23,18,31,.15) 42%, rgba(23,18,31,.92) 100%)",
  },
  loadMid: {
    position: "absolute", left: 0, right: 0, bottom: "16%",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
  },
  loadMark: {
    color: "#F7F3FA", fontSize: scale.title, fontWeight: 800, letterSpacing: 3,
  },
  loadWordHe: {
    color: "rgba(247,243,250,.72)", fontSize: scale.meta, letterSpacing: 1,
  },
  loadBar: {
    width: 168, height: 3, borderRadius: 999,
    background: "rgba(247,243,250,.16)", overflow: "hidden",
  },
  loadFill: {
    width: "40%", height: "100%", borderRadius: 999, background: "#FF6B4A",
    animation: "pnFill 1.6s ease-in-out infinite",
  },
  name: {
    position: "absolute", top: 46, left: "50%", transform: "translateX(-50%)",
    display: "flex", alignItems: "center", gap: 9,
    padding: "9px 16px", borderRadius: 999,
    background: "rgba(12,9,18,.82)", border: "1px solid",
    boxShadow: "0 10px 30px rgba(0,0,0,.55)",
    pointerEvents: "none", whiteSpace: "nowrap",
    animation: "pnRise 320ms cubic-bezier(.16,.84,.34,1)",
  },
  nameDot: { width: 9, height: 9, borderRadius: 999, flex: "0 0 auto" },
  nameText: { color: "#F7F3FA", fontSize: scale.body, fontWeight: 700 },
  nameGo: { color: "rgba(247,243,250,.6)", fontSize: scale.micro },
  /* Bottom RIGHT, opposite the stick. Centred at bottom:172 it sat on
     the character's head — the one thing on screen the eye is on. */
  enter: {
    position: "absolute", right: 20, bottom: 52,
    /* Clear of the joystick, now that the button carries a shop's name. */
    maxWidth: "calc(100% - 170px)", textAlign: "center", lineHeight: 1.25,
    border: 0, borderRadius: 999, padding: "13px 22px", background: "#FF6B4A",
    color: "#17121F", fontSize: scale.meta, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
    boxShadow: "0 8px 26px rgba(255,107,74,.45)",
  },
  leaveRoom: {
    /* Top left, clear of the joystick. At the bottom it sat on the
       pad and you could not tell which you were pressing. */
    position: "absolute", left: 16, top: 84,
    border: "1px solid rgba(247,243,250,.22)", borderRadius: 999,
    padding: "11px 20px", background: "rgba(16,12,22,.72)",
    color: "rgba(247,243,250,.86)", fontSize: scale.meta, fontFamily: "inherit",
    cursor: "pointer", backdropFilter: "blur(8px)",
  },
  pad: {
    position: "absolute", left: 18, bottom: 26, width: 118, height: 118, borderRadius: 999,
    transition: "opacity 320ms ease",
    background: "rgba(16,11,22,.34)", border: "1px solid rgba(247,243,250,.2)",
    touchAction: "none",
  },
  nub: {
    position: "absolute", left: "50%", top: "50%", width: 50, height: 50, borderRadius: 999,
    transform: "translate(-50%, -50%)", background: "rgba(247,243,250,.86)",
    boxShadow: "0 4px 14px rgba(0,0,0,.6)", pointerEvents: "none",
  },
  back: {
    position: "absolute", top: 14, right: 14, width: 40, height: 40, borderRadius: 999,
    background: "rgba(16,11,22,.9)", border: "1px solid rgba(247,243,250,.55)",
    color: "#F7F3FA", fontSize: scale.body, cursor: "pointer", lineHeight: 1,
  },
  door: {
    position: "absolute", inset: 0, zIndex: 30, pointerEvents: "none",
    background: "radial-gradient(120% 90% at 50% 40%, #2a1a33 0%, #0b0810 70%)",
    display: "grid", placeItems: "center", overflow: "hidden",
    animation: `pnDoor ${DOORSTEP_MS}ms ease-in-out forwards`,
  },
  doorGlow: {
    position: "absolute", inset: 0,
    animation: "pnBreathe 1.4s ease-in-out infinite alternate",
  },
  doorArt: {
    position: "relative", width: "92%", maxWidth: 560, height: "auto",
    filter: "drop-shadow(0 18px 40px rgba(0,0,0,.55))",
    animation: `pnPush ${DOORSTEP_MS}ms cubic-bezier(.5,0,.75,1) forwards`,
  },
  doorName: {
    position: "absolute", bottom: "14%", left: 0, right: 0, textAlign: "center",
    color: "#F7F3FA", fontSize: scale.title, fontWeight: 800, letterSpacing: 0.5,
    textShadow: "0 4px 18px rgba(0,0,0,.6)",
  },
  veil: {
    position: "absolute", inset: 0, pointerEvents: "none",
    transition: "opacity 460ms ease",
  },
  /* Transparent, so the colour and the street behind it are what the
     room fades up out of. `roomBack` is the black, and it arrives with
     the picture rather than before it. */
  /*
   * Centred as a GROUP — picture and card together. Laid out top to
   * bottom, the whole picture is 298 points on a 390-wide phone and
   * the card is about 250, which left three hundred points of blurred
   * nothing between them. Nothing is a legitimate design element and
   * that much of it, in the middle, is not.
   */
  room: {
    position: "absolute", inset: 0, overflow: "hidden",
    display: "flex", flexDirection: "column", justifyContent: "center",
  },
  /* A drawn-open shop fills the sheet; the options sit over its foot. */
  roomVenue: {
    justifyContent: "flex-end",
    background: "radial-gradient(120% 80% at 50% 30%, #3a2130 0%, #120c16 70%)",
  },
  /* The shop takes the top of the sheet and the options the bottom, so a
     trade with eight services never lists them across the professional's
     face — which is what the plumbing sheet did. */
  venueArt: {
    inset: "2% 0 auto 0", width: "100%", height: "54%", objectFit: "contain",
    objectPosition: "center top", filter: "drop-shadow(0 24px 50px rgba(0,0,0,.55))",
  },
  venueVeil: {
    background: "linear-gradient(to bottom, rgba(5,4,12,0) 40%, rgba(5,4,12,.85) 56%, rgba(5,4,12,.96) 100%)",
  },
  venueBar: { maxHeight: "46%", overflowY: "auto" },
  /* The picture sits in whatever room the bar leaves it, centred. */
  roomStage: {
    position: "relative", flex: "0 0 auto", width: "100%", minHeight: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  roomInner: {
    position: "relative", borderRadius: 14, overflow: "hidden",
    transition: "transform 680ms cubic-bezier(.16,.84,.34,1), opacity 420ms ease",
  },
  roomImg: { width: "100%", height: "100%", display: "block" },
  /*
   * THE SPARKLE.
   *
   * Two rings on one button: a soft halo that breathes outward and a
   * small bright core that does not. A single pulsing dot reads as a
   * loading indicator; the halo is what makes it read as "there is
   * something here" — which is the whole job, because nothing else on
   * the picture tells you the shelves can be pressed.
   *
   * 44px, because it is a touch target before it is an ornament.
   */
  /*
   * A SPARKLE HAS TO SURVIVE A BRIGHT PICTURE — AND STAY A SPARKLE.
   *
   * Two mistakes in a row, in opposite directions.
   *
   * First it was a soft warm dot, which was unmissable on the dark
   * room he first saw and invisible once the room was shown whole and
   * bright: a warm dot on warm cream is the shop's own lighting.
   *
   * Then I fixed the contrast with a 52-point ring — and Amit, at
   * once: *"אני כבר רואה שזה גדול מדי ולא מה שאהבתי."* He is right.
   * A ring that size is a UI control parked on the merchandise. What
   * he liked was a TWINKLE: small, precious, something catching the
   * light on a bottle.
   *
   * So the contrast comes from a hairline dark edge rather than from
   * size — the same trick as an outlined subtitle — and the visible
   * mark is 14 points across. The BUTTON stays 44, because that is
   * the touch floor the sweep enforces, and it is invisible: a big
   * target under a small ornament, which is what a fingertip needs
   * and what the eye should not have to see.
   */
  hint: {
    position: "absolute", left: 20, right: 20, bottom: 158, textAlign: "center",
    color: "rgba(247,243,250,.8)", fontSize: scale.meta, letterSpacing: .2,
    textShadow: "0 2px 14px rgba(0,0,0,.9)", pointerEvents: "none",
    animation: "pnFade 5.2s ease forwards",
  },
  /* ----- inside a shop ----- */
  roomWash: {
    position: "absolute", inset: "-8%", width: "116%", height: "116%",
    objectFit: "cover", filter: "blur(34px) saturate(1.25)",
    transition: "opacity 520ms ease",
  },
  roomWashVeil: {
    position: "absolute", inset: 0, background: "rgba(5,4,12,.62)",
    transition: "opacity 520ms ease",
  },
  /*
   * The row is a SAFETY NET, not the offer. It was competing with the
   * sparkles and winning, and a list of buttons is a catalogue —
   * pressing a bottle on a shelf is a shop.
   */
  services: { display: "flex", flexDirection: "column", gap: 7, padding: "0 0 12px" },
  service: {
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    minHeight: 48, padding: "10px 14px", borderRadius: 14, cursor: "pointer",
    fontFamily: "inherit", textAlign: "right",
    background: "rgba(247,243,250,.1)", border: "1px solid rgba(247,243,250,.18)",
  },
  serviceName: { flex: 1, fontSize: scale.meta, fontWeight: 600, color: "#F7F3FA" },
  serviceCount: { fontSize: scale.micro, color: "rgba(247,243,250,.6)" },
  serviceGo: { fontSize: scale.body, color: "rgba(247,243,250,.5)" },
  shelfHint: {
    margin: "0 0 6px", fontSize: scale.micro, color: "rgba(247,243,250,.45)",
  },
  /*
   * IT WRAPS. IT DOES NOT SCROLL.
   *
   * Amit, on the row of products: *"החץ פה לא פותח משהו אחר ולא גולל."*
   *
   * Two faults in one line. The row was a horizontal scroller, so the
   * fourth product sat half off the edge looking like a control — and
   * it could not be scrolled to, because the city's wrapper carries
   * `touchAction: "none"` so that a drag turns the camera instead of
   * panning the page. That declaration is inherited, and it had
   * silently switched off scrolling for everything inside it.
   *
   * Setting `touch-action` back on this one row would have worked and
   * would have been the wrong fix: a row of four things on a phone
   * should not need scrolling at all. It wraps. Everything is on
   * screen, nothing is half-cut, and there is no gesture to discover.
   */
  shelf: {
    display: "flex", flexWrap: "wrap", gap: 6, padding: "0 0 10px",
  },
  shelfItem: {
    flex: "0 0 auto", display: "flex", alignItems: "center", gap: 7,
    minHeight: 40, padding: "6px 11px",
    borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
    background: "rgba(247,243,250,.07)", border: "1px solid rgba(247,243,250,.13)",
  },
  shelfName: { fontSize: scale.micro, fontWeight: 600, color: "rgba(247,243,250,.86)", whiteSpace: "nowrap" },
  shelfPrice: { fontSize: scale.micro, color: "rgba(247,243,250,.5)" },
  spot: {
    position: "absolute", width: 44, height: 44, marginLeft: -22, marginTop: -22,
    borderRadius: 999, border: 0, padding: 0, cursor: "pointer",
    background: "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    animation: "pnSpot 2.1s ease-in-out infinite",
  },
  spotCore: {
    width: 14, height: 14, borderRadius: 999,
    background:
      "radial-gradient(circle, #FFFDF6 0%, #FFF0CF 42%, rgba(255,214,150,.55) 62%, rgba(255,214,150,0) 100%)",
    boxShadow:
      "0 0 0 1px rgba(40,24,12,.55), 0 0 10px 3px rgba(255,226,170,.95), 0 0 22px 8px rgba(255,190,110,.4)",
  },
  roomBar: { position: "relative", flex: "0 0 auto", padding: "14px 20px 24px" },
  roomName: { margin: "0 0 4px", fontSize: scale.section, color: "#F7F3FA" },
  roomTag: { margin: "0 0 8px", fontSize: scale.meta, color: "rgba(247,243,250,.62)" },
  roomLine: { margin: "0 0 14px", fontSize: scale.meta, color: "rgba(247,243,250,.8)" },
  out: {
    width: "100%", border: "1px solid rgba(247,243,250,.24)", borderRadius: 999, padding: 14,
    background: "rgba(247,243,250,.14)", color: "#F7F3FA", fontSize: scale.meta, fontWeight: 700,
    fontFamily: "inherit", cursor: "pointer",
  },
  sheetWrap: {
    position: "absolute", inset: 0, background: "rgba(5,4,12,.66)",
    display: "flex", flexDirection: "column", justifyContent: "flex-end",
  },
  sheet: {
    background: "#17121F", borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: "20px 20px 26px", borderTop: "1px solid rgba(247,243,250,.14)",
  },
  sheetName: { margin: "0 0 8px", fontSize: scale.body, color: "#F7F3FA" },
  sheetBody: { margin: "0 0 12px", fontSize: scale.meta, lineHeight: 1.55, color: "rgba(247,243,250,.78)" },
  price: { margin: "0 0 14px", display: "flex", gap: 10, alignItems: "baseline" },
  priceNow: { fontSize: scale.section, color: "#F7F3FA" },
  priceWas: { fontSize: scale.meta, color: "rgba(247,243,250,.5)", textDecoration: "line-through" },
  leaving: { margin: "0 0 10px", fontSize: scale.micro, color: "rgba(247,243,250,.58)", lineHeight: 1.5 },
  site: {
    display: "block", textAlign: "center", borderRadius: 999, padding: 14,
    background: "#FF6B4A", color: "#17121F", fontSize: scale.meta, fontWeight: 700,
    textDecoration: "none",
  },
  sheetClose: {
    width: "100%", marginTop: 10, border: 0, borderRadius: 999, padding: 12,
    background: "transparent", color: "rgba(247,243,250,.6)", fontSize: scale.meta,
    fontFamily: "inherit", cursor: "pointer",
  },
};

/* The keyframes the sparkle needs, injected once. Inline styles cannot
   carry an @keyframes, and this component owns its own look. */
if (typeof document !== "undefined" && !document.getElementById("pn-city-css")) {
  const tag = document.createElement("style");
  tag.id = "pn-city-css";
  tag.textContent =
    "@keyframes pnSpot{0%,100%{transform:scale(.78);opacity:.82}50%{transform:scale(1.26);opacity:1}}" +
    "@keyframes pnFade{0%{opacity:0}12%{opacity:1}72%{opacity:1}100%{opacity:0}}" +
    "@keyframes pnRise{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}" +
    /* The loading screen: a slow push into the skyline, and a bar that
       sweeps rather than pretending to measure progress it does not
       have. A fake percentage is a lie told in the first second. */
    "@keyframes pnDrift{from{transform:scale(1.06) translateX(-1.5%)}to{transform:scale(1.14) translateX(1.5%)}}" +
    "@keyframes pnFill{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}" +
    /* The doorstep: in, a breath, a push towards the door, and through. */
    "@keyframes pnDoor{0%{opacity:0}14%{opacity:1}82%{opacity:1}100%{opacity:0}}" +
    "@keyframes pnPush{0%{transform:scale(.9) translateY(3%)}22%{transform:scale(1) translateY(0)}100%{transform:scale(1.9) translateY(-9%)}}" +
    "@keyframes pnBreathe{from{opacity:.55}to{opacity:1}}";
  document.head.appendChild(tag);
}
