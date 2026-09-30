/**
 * WHAT THE PROTOTYPE REMEMBERS BETWEEN VISITS.
 *
 * ---------------------------------------------------------------------
 * THE QUESTION
 * ---------------------------------------------------------------------
 * Amit: *"מתי ההדמיה תתחיל לאפשר שמירה של נתונים נבחרים לצורך בדיקה
 * אמיתית של התהליך?"*
 *
 * Until now the answer was "never": every reload put the reviewer back on
 * the welcome screen with an empty address, no prices and nothing typed, so
 * testing a flow meant re-walking six screens to reach the one under
 * review. That is not a small friction — it is why a reviewer tests the
 * first three screens ten times and the last three once.
 *
 * ---------------------------------------------------------------------
 * WHAT IS SAVED, AND THE LINE THAT DECIDES
 * ---------------------------------------------------------------------
 * The rule is: **what the person chose is saved; what a server would own
 * is not.**
 *
 * Saved — the address, the prices a professional set, the fault text, the
 * intake answers, which side of the app you were on. These are inputs.
 * They belong to the person sitting there, they are exactly what is
 * tedious to retype, and remembering them claims nothing.
 *
 * NOT saved — whether a job is live, who was assigned, an ETA, how many
 * professionals are online. Those are the server's truth (/CLAUDE.md §3),
 * and a prototype that restored "מקצוען בדרך אליך · 9 דקות" after a night
 * would be fabricating a live job. The ETA would be wrong by twelve hours
 * and the professional would not exist. Restoring a request as if it were
 * still open is the same class of mistake as inventing availability, and it
 * is more convincing because the reviewer put it there themselves.
 *
 * So a reload lands you where you were, with everything you typed, and with
 * no job in flight. That is the honest halfway point available without a
 * server — and the real answer to the rest of the question is the API and
 * the database, which are blocked on one round of Prisma commands being
 * run on a machine that can reach Prisma's engine host.
 *
 * ---------------------------------------------------------------------
 * WHY EVERY ACCESS IS WRAPPED
 * ---------------------------------------------------------------------
 * `localStorage` is not reliably present. A private window, blocked site
 * data, a browser that treats a framed page as third-party — any of these
 * makes the getter throw rather than return null. The prototype must render
 * identically when nothing can be stored, so every read and write is
 * guarded and a failure is silent by design: a reviewer does not need to be
 * told that a convenience is unavailable.
 */

/** Bumped when the shape changes. An older blob is discarded, not migrated. */
const VERSION = 1;
const KEY = "pro-now.review-session.v1";

export interface SavedSession {
  version: number;
  /** When it was written. Shown to the reviewer so it is never a mystery. */
  savedAtMs: number;
  side?: "customer" | "pro";
  addressId?: string | null;
  /** What the customer typed about the fault, in their words. */
  faultText?: string;
  /** The service that text was written for; text without one is not restored. */
  faultServiceId?: string | null;
  /** Keyed by question id — the shape `IntakeAnswer[]` already travels in. */
  intakeAnswers?: unknown[];
  /** The professional's own prices: service id to agorot, or null. */
  prices?: Record<string, number | null>;
  /** The last service the customer asked about, so a reload lands there. */
  lastServiceId?: string | null;
  /**
   * Which sides have already been signed in on this device.
   *
   * The welcome screen is kept — it is reviewed often and skipping it would
   * make it unreachable without a reset — but the phone number and the code
   * are not asked again. Four taps of typing a number that is not checked
   * is the single most tedious thing in a review session, and the code
   * screen is a demonstration of a flow rather than a security boundary:
   * any six digits are accepted, because there is no server to check them
   * against. Remembering it claims nothing that was not already true.
   */
  authedSides?: ("customer" | "pro")[];
  /** Which figure walks the street for this customer. Null is a real answer. */
  avatar?: string | null;
  /**
   * Whether the avatar question has been ANSWERED, which is not the same
   * as whether an avatar was chosen. Skipping is an answer; without this
   * flag a customer who skipped would be asked again every single time,
   * which is what makes an optional step feel compulsory.
   */
  avatarAnswered?: boolean;
  /** Whether the three-slide explanation has been through once. */
  introSeen?: boolean;
  /** The rewritten explainer (2026-09-25) has been seen. */
  introSeenV2?: boolean;
  /** Which sides have seen their own explanation. */
  introSeenSides?: Array<"customer" | "pro">;
  /** The professional finished joining (ProOnboardingBody) on this device. */
  proOnboarded?: boolean;
  /** The professional who joined on this device, as he described himself. */
  joinedPro?: import("@pro-now/demo-ui").OnboardingResult | null;
  /** Phone numbers that finished signing up, per side — they skip the explanations next time. */
  registered?: Record<string, { customer?: boolean; pro?: boolean }>;
}

function storage(): Storage | null {
  try {
    // Touching the property is itself what throws in a blocked context, so
    // the access has to be inside the try rather than tested before it.
    const s = window.localStorage;
    const probe = "__pro_now_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadSession(): SavedSession | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    // A blob from an older shape is thrown away rather than migrated. There
    // is no user data here worth a migration, and a half-understood blob is
    // how a prototype starts rendering a field that no longer exists.
    if (parsed?.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(patch: Omit<SavedSession, "version" | "savedAtMs">): void {
  const s = storage();
  if (!s) return;
  try {
    const current = loadSession() ?? { version: VERSION, savedAtMs: 0 };
    const next: SavedSession = { ...current, ...patch, version: VERSION, savedAtMs: Date.now() };
    s.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota, private mode, or a blocked frame. The prototype works without
    // it; saying so would be noise on a screen about plumbing.
  }
}

export function clearSession(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch {
    /* nothing to do, and nothing worth saying */
  }
}

/** Is saving available at all here? Used to say so rather than to guess. */
export function canSaveSession(): boolean {
  return storage() !== null;
}

/** "נשמר לפני 4 דקות" — or null when nothing has been saved. */
export function savedAgoHe(session: SavedSession | null, nowMs: number): string | null {
  if (!session?.savedAtMs) return null;
  const mins = Math.floor((nowMs - session.savedAtMs) / 60_000);
  if (mins < 1) return "נשמר עכשיו";
  if (mins < 60) return `נשמר לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `נשמר לפני ${hours} שע׳`;
  return `נשמר לפני ${Math.floor(hours / 24)} ימים`;
}
