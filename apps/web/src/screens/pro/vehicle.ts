import { proVehicleSchema } from "@pro-now/validation";

/**
 * The professional's car (audit v2 #8a), as their screens ask for it: free
 * text and only the plate's last two or three digits. The same schema the
 * server enforces, said in their words before they press anything.
 */
export interface VehicleDraft {
  vehicleHe: string;
  plateTail: string;
}

export const VEHICLE_TEXT_MAX = 40;

export function vehicleProblemsHe(draft: VehicleDraft): { vehicleHe: string | null; plateTail: string | null } {
  const parsed = proVehicleSchema.safeParse(draft);
  if (parsed.success) return { vehicleHe: null, plateTail: null };
  const on = (field: "vehicleHe" | "plateTail") => parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null;
  const text = on("vehicleHe");
  const tail = on("plateTail");
  return {
    vehicleHe:
      text === "VEHICLE_TEXT_HAS_PLATE"
        ? "בלי מספר הרכב כאן — רק הדגם והצבע. את הספרות האחרונות כתבו בשדה שמתחת."
        : text
          ? `עד ${VEHICLE_TEXT_MAX} תווים.`
          : null,
    plateTail: tail ? "רק 2 או 3 הספרות האחרונות של מספר הרכב, לא המספר המלא." : null,
  };
}

/** What is sent: trimmed, empty as null. Call only when `vehicleProblemsHe` found nothing. */
export function vehicleInput(draft: VehicleDraft): { vehicleHe: string | null; plateTail: string | null } {
  return { vehicleHe: draft.vehicleHe.trim() || null, plateTail: draft.plateTail.trim() || null };
}

/** The profile tab's line: "יונדאי i20 לבנה · ••• 47", as the customer will read it. */
export function vehicleLineHe(v: { vehicleHe: string | null; plateTail: string | null }): string | null {
  if (!v.vehicleHe && !v.plateTail) return null;
  return [v.vehicleHe ?? "רכב פרטי", v.plateTail ? `••• ${v.plateTail}` : null].filter(Boolean).join(" · ");
}
