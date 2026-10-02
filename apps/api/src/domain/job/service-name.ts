import { PILOT_TO_DATABASE_SERVICE_CODE, pilotServiceById } from "@pro-now/types";

/**
 * ONE NAME FOR THE SERVICE, FROM ORDER TO REVIEW (audit v2 #1).
 *
 * The customer orders from the app's catalogue ("ניקיון דחוף", pilot-catalog
 * `svc-clean`); the server dispatches its own service row ("מנקה פנוי/ה
 * להיום עכשיו", CLEAN_URGENT), bridged by catalog-bridge.ts. The demo shows
 * the picked name on every later screen, the customer's and the
 * professional's, so the job keeps it: the server looks it up in the
 * catalogue itself (never from client text) and every view reads it
 * through `jobServiceNameHe`. Older jobs carry none and show the
 * service's own name, as before.
 */
export type CatalogPick =
  | { ok: true; catalogServiceId: string; catalogServiceNameHe: string }
  | { ok: false };

/** The picked catalogue service, if it exists and is the one `serviceCode` dispatches. */
export function catalogPick(catalogServiceId: string, serviceCode: string): CatalogPick {
  const picked = Object.prototype.hasOwnProperty.call(pilotServiceById, catalogServiceId) ? pilotServiceById[catalogServiceId] : undefined;
  if (!picked || PILOT_TO_DATABASE_SERVICE_CODE[catalogServiceId] !== serviceCode) return { ok: false };
  return { ok: true, catalogServiceId, catalogServiceNameHe: picked.nameHe };
}

/** The name every screen shows for this job. */
export function jobServiceNameHe(job: { catalogServiceNameHe: string | null; service: { nameHe: string } }): string {
  return job.catalogServiceNameHe ?? job.service.nameHe;
}
