/**
 * THE IDENTITY CHECK'S RULES (docs/10 §Identity check in the app).
 *
 * Pure functions over plain rows, so what customers are told and who may be
 * approved are proven by tests, not by reading routes.
 */
export const IDENTITY_STATUSES = ["MANUAL_REVIEW", "VERIFIED", "REJECTED", "RETAKE_REQUESTED", "SUPERSEDED", "PENDING"] as const;
export const MINIMUM_AGE = 18; // Dvir, 2026-10-02 (docs/18 §Minimum age).

export interface IdentityAttempt {
  id: string;
  status: string;
  isSandbox: boolean;
  method: string | null;
  createdAt: Date;
}

/** The latest attempt that a retake did not replace. */
export function currentCheck<T extends IdentityAttempt>(attempts: readonly T[]): T | null {
  return [...attempts].filter((a) => a.status !== "SUPERSEDED").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

/** Full years between a date of birth and a day, in UTC (a date of birth has no time zone). */
export function ageOn(dateOfBirth: Date, on: Date): number {
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (on.getUTCMonth() === dateOfBirth.getUTCMonth() && on.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function accountApprovalBlocker(
  p: { dateOfBirth: Date | null; current: IdentityAttempt | null },
  on: Date
): "IDENTITY_NOT_VERIFIED" | "DATE_OF_BIRTH_MISSING" | "UNDER_MINIMUM_AGE" | null {
  if (p.current?.status !== "VERIFIED") return "IDENTITY_NOT_VERIFIED";
  if (!p.dateOfBirth) return "DATE_OF_BIRTH_MISSING";
  if (ageOn(p.dateOfBirth, on) < MINIMUM_AGE) return "UNDER_MINIMUM_AGE";
  return null;
}

/**
 * What a customer is told. A real vendor's verified check is "זהות אומתה";
 * a PRO NOW reviewer's is "הזהות נבדקה על ידי PRO NOW", a real but weaker
 * check, never shown as the stronger one (CLAUDE.md §3; Dvir, 2026-10-02).
 */
export function identityBadge(current: IdentityAttempt | null): "IDENTITY_VERIFIED" | "IDENTITY_CHECKED" | null {
  if (current?.status !== "VERIFIED") return null;
  if (current.method === "MANUAL") return "IDENTITY_CHECKED";
  if (current.method === "VENDOR" && !current.isSandbox) return "IDENTITY_VERIFIED";
  return null;
}
