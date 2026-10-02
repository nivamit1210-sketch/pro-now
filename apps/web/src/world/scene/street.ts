import type { DepartmentCode } from "@pro-now/types";
import { assignmentRoute } from "@pro-now/types";

import type { WorldTrade } from "../types";

export interface WorldShopPosition {
  shopId: string;
  departmentCode: DepartmentCode;
  labelHe: string;
  assetId: string;
  neonColour: string;
  x: number;
  z: number;
  side: -1 | 1;
}

export const ROAD_HALF = 3.3;
export const KERB_X = ROAD_HALF;
export const PAVEMENT = 6.4;
export const FRONT_X = KERB_X + PAVEMENT;
export const WALK_LIMIT = FRONT_X - 0.9;
export const STREET_LENGTH = 300;
const BAY = 8.8;

/**
 * How far to turn a building face (or a window on it) so that it lines the
 * street. A plane is built facing +z, down the street; standing at
 * x = side × FRONT_X it has to face across the road instead: the left side
 * (-1) turns a quarter to face +x, the right side (+1) to face -x.
 *
 * Turning it 0 or π (as #62 did) stood every filler wall ACROSS the pavement,
 * 8.8 m wide and reaching to within a metre of the kerb, so at spawn the
 * camera looked straight into one: the left two thirds of the phone were a
 * black slab (Dvir's iPhone, 2026-10-02).
 */
export function frontageYaw(side: -1 | 1): number {
  return side === -1 ? Math.PI / 2 : -Math.PI / 2;
}
/**
 * Spawn on the left pavement, a few metres ahead of the home shop.
 * ArrowUp (negative z) reaches `home` first. Kept close (3.2 m gap)
 * so that even a slow CI renderer (SwiftShader at 2-3 fps) covers the
 * distance within the e2e test's 10-second timeout.
 */
export const SPAWN = { x: -6.3, z: 56 } as const;

/**
 * The first view: from the camera (behind and above the player, pulled back
 * towards the road when the home shop frames itself) to just past the player.
 * Nothing that stands still may stand in it, or the arrival is a close-up of
 * a prop. The demo keeps its scatter 13 m clear of spawn for the same reason.
 */
export const SPAWN_VIEW = { minZ: SPAWN.z - 2, maxZ: SPAWN.z + 9, halfWidth: 3.5 } as const;

/** Whether something centred at (x, z), `radius` wide either way, stands in the first view. */
export function inSpawnView(x: number, z: number, radius = 0): boolean {
  return (
    z + radius >= SPAWN_VIEW.minZ &&
    z - radius <= SPAWN_VIEW.maxZ &&
    Math.abs(x - SPAWN.x) - radius <= SPAWN_VIEW.halfWidth
  );
}

/**
 * The full shop roster matching the demo's 14-shop high street.
 * Alternating sides, 17.6 m apart (every other bay). Each shop sits
 * at FRONT_X on its side of the street.
 *
 * `home` is listed first and positioned closest to SPAWN so that:
 *  - walking up+left reaches it first (the e2e test expectation),
 *  - the fallback's "first trade" is HOME_URGENT (plumbing services),
 *  - it matches the demo's intent that the first shop you meet is the
 *    one with real services in the catalogue seed.
 */
export const WORLD_SHOPS: readonly WorldShopPosition[] = [
  { shopId: "home",      departmentCode: "HOME_URGENT",  labelHe: "תיקונים דחופים",    assetId: "district_home",      neonColour: "#ffb45e", z:   52.8,  side: -1, x: -FRONT_X },
  { shopId: "hair",      departmentCode: "BEAUTY",       labelHe: "טיפוח ויופי",       assetId: "district_hair",      neonColour: "#ff7ac2", z:   88,    side: -1, x: -FRONT_X },
  { shopId: "pets",      departmentCode: "PETS",         labelHe: "בעלי חיים",         assetId: "district_pets",      neonColour: "#8ce06a", z:   70.4,  side:  1, x:  FRONT_X },
  { shopId: "tech",      departmentCode: "TECH",         labelHe: "מחשבים וסלולר",     assetId: "district_tech",      neonColour: "#7ad7ff", z:   17.6,  side: -1, x: -FRONT_X },
  { shopId: "auto",      departmentCode: "VEHICLE",      labelHe: "רכב ודרך",          assetId: "district_auto",      neonColour: "#ff9b3d", z:    0,    side:  1, x:  FRONT_X },
  { shopId: "well",      departmentCode: "WELLNESS",     labelHe: "בריאות וכושר",      assetId: "district_well",      neonColour: "#6affc6", z:  -17.6,  side: -1, x: -FRONT_X },
  { shopId: "appliance", departmentCode: "APPLIANCES",   labelHe: "מוצרי חשמל",        assetId: "district_appliance", neonColour: "#ffd166", z:  -35.2,  side:  1, x:  FRONT_X },
  { shopId: "care",      departmentCode: "HOME_CARE",    labelHe: "ניקיון ותחזוקה",    assetId: "district_care",      neonColour: "#9db8ff", z:  -52.8,  side: -1, x: -FRONT_X },
  { shopId: "nails",     departmentCode: "BEAUTY",       labelHe: "ציפורניים",          assetId: "district_nails",     neonColour: "#ff6fa8", z:  -70.4,  side:  1, x:  FRONT_X },
  { shopId: "move",      departmentCode: "LOGISTICS",    labelHe: "הובלות ומשלוחים",   assetId: "district_move",      neonColour: "#c39bff", z:  -88,    side: -1, x: -FRONT_X },
  { shopId: "vet",       departmentCode: "PETS",         labelHe: "וטרינריה",           assetId: "district_pets",      neonColour: "#7ad7ff", z: -105.6,  side:  1, x:  FRONT_X },
  { shopId: "build",     departmentCode: "IMPROVEMENT",  labelHe: "שיפוץ והתקנות",     assetId: "district_home",      neonColour: "#ffa552", z: -123.2,  side: -1, x: -FRONT_X },
  { shopId: "help",      departmentCode: "ODD_JOBS",     labelHe: "עזרה ועבודות קטנות", assetId: "district_care",     neonColour: "#a8e06a", z: -140.8,  side:  1, x:  FRONT_X },
];

export interface PlacePosition {
  id: string;
  labelHe: string;
  departmentCode: DepartmentCode | null;
  x: number;
  z: number;
}

export const WORLD_PLACES: readonly PlacePosition[] = [
  { id: "roadside", labelHe: "מפרץ עצירה",     departmentCode: "VEHICLE",   x:  KERB_X, z:  BAY },
  // Up the street from spawn, not beside it: at 58.4 its picture stood between
  // the camera and the player and hid them both on arrival.
  { id: "dogpark",  labelHe: "גינת הכלבים",     departmentCode: "PETS",      x: -FRONT_X + 2, z: 35.2 },
  { id: "garden",   labelHe: "פינת המשתלה",     departmentCode: "HOME_CARE", x: -FRONT_X + 2, z: -26.4 },
  { id: "pickup",   labelHe: "נקודת שליחויות",  departmentCode: "LOGISTICS", x:  FRONT_X - 2, z: -79.2 },
  { id: "bench",    labelHe: "פינת ישיבה",       departmentCode: null,        x:  FRONT_X - 2, z: -114.4 },
];

export function canEnterTrade(trade: Pick<WorldTrade, "interiorAssetId">): boolean {
  return Boolean(trade.interiorAssetId);
}

export function routeSampleIsNormalized(departmentCode: DepartmentCode): boolean {
  return assignmentRoute(departmentCode).every(({ at }) => at.u >= 0 && at.u <= 1 && at.v >= 0 && at.v <= 1);
}

export function nearestShop(x: number, z: number, maxDistance = 5.0): WorldShopPosition | null {
  let best: WorldShopPosition | null = null;
  let bestDistance = maxDistance;
  for (const shop of WORLD_SHOPS) {
    const distance = Math.hypot(shop.x - x, shop.z - z);
    if (distance < bestDistance) {
      best = shop;
      bestDistance = distance;
    }
  }
  return best;
}

export function nearestPlace(x: number, z: number, maxDistance = 8.0): PlacePosition | null {
  let best: PlacePosition | null = null;
  let bestDistance = maxDistance;
  for (const place of WORLD_PLACES) {
    const distance = Math.hypot(place.x - x, place.z - z);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}
