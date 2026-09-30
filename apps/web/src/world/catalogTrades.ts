import type { CatalogResponse, DepartmentCode } from "@pro-now/types";
import { pilotServiceById, pilotServiceIdForDatabaseCode } from "@pro-now/types";
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
 * The server decides which services exist; each one is placed by its
 * customer-facing department (the pilot catalogue's), not by the database's
 * department, whose codes (`HOME_REPAIRS`, `AUTO`, …) are a different set.
 * The pilot id is also what the customer app's request composer expects.
 */
export function worldTradesFromCatalog(catalog: CatalogResponse): Readonly<Record<string, WorldTrade>> {
  const shopsByDepartment = new Map(WORLD_SHOPS.map((shop) => [shop.departmentCode, shop]));
  const servicesByDepartment = new Map<DepartmentCode, WorldTrade["services"][number][]>();

  for (const department of catalog.departments) {
    for (const category of department.categories) {
      for (const service of category.services) {
        const pilotId = pilotServiceIdForDatabaseCode(service.code);
        const departmentCode = pilotId ? departmentCodeByServiceId[pilotId] : undefined;
        if (!pilotId || !departmentCode) continue;
        // The customer-facing name, as on every other screen; the server's
        // row name only when the pilot catalogue has none.
        const pilot = pilotServiceById[pilotId];
        const services = servicesByDepartment.get(departmentCode) ?? [];
        services.push({ id: pilotId, nameHe: pilot?.nameHe ?? service.nameHe, descriptionHe: pilot?.descriptionHe ?? null });
        servicesByDepartment.set(departmentCode, services);
      }
    }
  }

  // In the street's own order, so the first shop is the first one you pass.
  const trades: Record<string, WorldTrade> = {};
  for (const [departmentCode, shop] of shopsByDepartment) {
    const services = servicesByDepartment.get(departmentCode);
    if (!services) continue;
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
