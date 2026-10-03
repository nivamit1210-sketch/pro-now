import type { JobState, ProVehicleView } from "@pro-now/types";

/**
 * WHEN A CUSTOMER SEES THE PROFESSIONAL'S CAR (audit v2 #8a).
 *
 * The demo's arrival screen says what to look for at the door: "מגיע ב…
 * · ••• 47". It tells a stranger something about the professional, so it
 * is told only to the customer this professional was assigned to, and only
 * while that visit is on: from assignment ("on the way") until the work is
 * done. Before anyone is assigned there is nobody's car to show; after the
 * visit, nobody needs to recognise it.
 */
export const VEHICLE_VISIBLE: ReadonlySet<JobState> = new Set<JobState>([
  "PRO_ASSIGNED",
  "PRO_EN_ROUTE",
  "PRO_ARRIVED",
  "DIAGNOSIS",
  "WAITING_QUOTE_APPROVAL",
  "IN_PROGRESS",
  "COMPLETION_PENDING",
]);

/** What the customer is told about the car for a job in `status`; null when nothing (or not now). */
export function vehicleForCustomer(
  status: JobState,
  pro: { vehicleHe: string | null; vehiclePlateTail: string | null }
): ProVehicleView | null {
  if (!VEHICLE_VISIBLE.has(status)) return null;
  const vehicleHe = pro.vehicleHe?.trim() || null;
  // The database refuses anything else; this keeps a bad row off a screen all the same.
  const plateTailHe = pro.vehiclePlateTail && /^\d{2,3}$/.test(pro.vehiclePlateTail) ? pro.vehiclePlateTail : null;
  return vehicleHe || plateTailHe ? { vehicleHe, plateTailHe } : null;
}
