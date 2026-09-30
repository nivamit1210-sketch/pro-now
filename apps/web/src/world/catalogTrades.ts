import type { CatalogResponse, DepartmentCode } from "@pro-now/types";
import { pilotServiceIdForDatabaseCode } from "@pro-now/types";
import { departmentCodeByServiceId } from "@pro-now/ui";

import { WORLD_SHOPS } from "./scene/street";
import type { WorldTrade } from "./types";

const INTERIOR_BY_DEPARTMENT: Partial<Record<DepartmentCode, string>> = {
  HOME_URGENT: "home_workshop_hero",
  APPLIANCES: "appliance_workshop_hero",
  HOME_CARE: "care_studio_hero",
  BEAUTY: "hair_barbershop_hero",
  VEHICLE: "auto_garage_hero",
  PETS: "pets_salon_hero",
};

/**
 * Adapts the server's market catalogue into the shops the world can render.
 * The API's database code remains authoritative; the pilot id is only used
 * to reuse the customer app's existing request composer contract.
 */
export function worldTradesFromCatalog(catalog: CatalogResponse): Readonly<Record<string, WorldTrade>> {
  const shopsByDepartment = new Map(WORLD_SHOPS.map((shop) => [shop.departmentCode, shop]));
  const trades: Record<string, WorldTrade> = {};

  for (const department of catalog.departments) {
    const departmentCode = department.code as DepartmentCode;
    const shop = shopsByDepartment.get(departmentCode);
    if (!shop) continue;

    const services = department.categories.flatMap((category) =>
      category.services.flatMap((service) => {
        const pilotId = pilotServiceIdForDatabaseCode(service.code);
        if (!pilotId || departmentCodeByServiceId[pilotId] !== departmentCode) return [];
        return [{ id: pilotId, nameHe: service.nameHe, descriptionHe: null }];
      })
    );
    if (services.length === 0) continue;

    trades[shop.shopId] = {
      shopId: shop.shopId,
      departmentCode,
      nameHe: shop.labelHe,
      services,
      interiorAssetId: INTERIOR_BY_DEPARTMENT[departmentCode] ?? null,
    };
  }

  return trades;
}
