import type { ProAddressAs } from "@pro-now/types";

/**
 * HOW THE CUSTOMER'S SCREENS SPEAK ABOUT THE PROFESSIONAL.
 *
 * The professional chose "M" or "F" while joining (`ProfessionalProfile.addressAs`),
 * and the customer's app says הגיע / הגיעה, מגיע / מגיעה from it, the same
 * choice the notifications already honour (notifications/policy.ts). Anything
 * other than the two values is "not chosen" (null), and the screens fall back
 * to the masculine.
 */
export function addressAsView(value: string | null | undefined): ProAddressAs | null {
  return value === "M" || value === "F" ? value : null;
}
