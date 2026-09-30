import { assignmentRoute, type DepartmentCode } from "@pro-now/types";

import type { WorldTrade } from "../types";

export interface WorldShopPosition {
  shopId: string;
  departmentCode: DepartmentCode;
  labelHe: string;
  assetId: string;
  x: number;
  z: number;
}

export const WORLD_SHOPS: readonly WorldShopPosition[] = [
  { shopId: "home", departmentCode: "HOME_URGENT", labelHe: "הבית", assetId: "district_home", x: -3.8, z: -1.8 },
  { shopId: "appliance", departmentCode: "APPLIANCES", labelHe: "מכשירי חשמל", assetId: "district_appliance", x: 3.8, z: -8.2 },
  { shopId: "care", departmentCode: "HOME_CARE", labelHe: "טיפול", assetId: "district_care", x: -3.8, z: -14.6 },
  { shopId: "hair", departmentCode: "BEAUTY", labelHe: "טיפוח ויופי", assetId: "district_hair", x: 3.8, z: -21 },
  { shopId: "move", departmentCode: "LOGISTICS", labelHe: "מעבר ומשלוחים", assetId: "district_move", x: -3.8, z: -27.4 },
  { shopId: "pets", departmentCode: "PETS", labelHe: "חיות", assetId: "district_pets", x: 3.8, z: -33.8 },
  { shopId: "tech", departmentCode: "TECH", labelHe: "טכנולוגיה", assetId: "district_tech", x: -3.8, z: -40.2 },
  { shopId: "well", departmentCode: "WELLNESS", labelHe: "בריאות", assetId: "district_well", x: 3.8, z: -46.6 },
  { shopId: "auto", departmentCode: "VEHICLE", labelHe: "רכב", assetId: "district_auto", x: -3.8, z: -53 },
  { shopId: "nails", departmentCode: "BEAUTY", labelHe: "יופי", assetId: "district_nails", x: 3.8, z: -59.4 },
];

export function canEnterTrade(trade: Pick<WorldTrade, "interiorAssetId">): boolean {
  return Boolean(trade.interiorAssetId);
}

export function routeSampleIsNormalized(departmentCode: DepartmentCode): boolean {
  return assignmentRoute(departmentCode).every(({ at }) => at.u >= 0 && at.u <= 1 && at.v >= 0 && at.v <= 1);
}

export function nearestShop(x: number, z: number, maxDistance = 2.8): WorldShopPosition | null {
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
