import { z } from "zod";

/**
 * Shared environment schema. Every app validates its own process.env
 * through this at startup and fails fast on a missing/invalid var —
 * never falls back to a silently wrong default in a real environment.
 * Secrets are only ever read from process.env (populated by the
 * environment/secret manager) — never hard-coded, never committed.
 * See /docs/04-TECH-ARCHITECTURE.md §Environments.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /**
   * Optional. Only a latency shortcut in front of the accept's row lock
   * (apps/api/src/domain/dispatch/job-lock.ts); the MVP runs without it.
   */
  REDIS_URL: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),

  /**
   * Signs and encrypts Better Auth's cookies and tokens. Generate with
   * `openssl rand -base64 32`; rotating it signs everybody out.
   */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  /**
   * Comma-separated emails whose first verified sign-in is granted ADMIN
   * (docs/21 W1). Written to audit_logs when it happens.
   */
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),

  // Vendor flags — 'sandbox' is the only supported value until a business
  // decision is made per /docs/18-ROADMAP.md §Open Decisions.
  PAYMENT_PROVIDER: z.enum(["sandbox"]).default("sandbox"),
  /**
   * Whether money moves through the app (docs/21 §5 D1, DECIDED
   * 2026-09-29: not in the MVP). `off`: a quote is approved when it is
   * sent, and a completed job goes to review with a receipt of what is
   * owed to the professional directly. `sandbox`: the full ledger path
   * against the sandbox provider, for developing payments.
   */
  IN_APP_PAYMENTS: z.enum(["off", "sandbox"]).default("off"),
  IDENTITY_PROVIDER: z.enum(["sandbox"]).default("sandbox"),
  MAPS_PROVIDER: z.enum(["sandbox", "google"]).default("sandbox"),
  GEOCODING_PROVIDER: z.enum(["nominatim", "fixture"]).default("nominatim"),
  EXTERNAL_REPUTATION_PROVIDER: z.enum(["sandbox", "google"]).default("sandbox"),

  /**
   * Which classifiers read a typed request, in order (docs/21 W5). Only the
   * keyword matcher exists; a model-backed one waits for decision D2.
   */
  REQUEST_CLASSIFIERS: z.enum(["keyword"]).default("keyword"),

  GOOGLE_MAPS_API_KEY: z.string().optional(),
  NOMINATIM_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  NOMINATIM_USER_AGENT: z.string().min(1).default("PRO-NOW/0.1"),
  NOMINATIM_CONTACT_EMAIL: z.string().email().default("dev@pronow.test"),

  /*
   * External services (/docs/21-PRODUCTION-PLAN.md §0). Locally each one
   * points at a stand-in that speaks the same protocol — MinIO for S3,
   * Mailpit for SMTP, a mock OpenID issuer for Google — and going live is
   * changing these values, not code. `assertNoLocalStandIns` refuses to
   * boot staging/production while any of them still points at this machine.
   */
  /** Where this server is reached from a browser: sign-in links and cookies are built from it. */
  PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Only set for the local mock issuer; real Google needs no override. */
  GOOGLE_ISSUER_URL: z.string().url().optional(),
  /**
   * The one escape hatch: a production BUILD run against local stand-ins,
   * for the W10 end-to-end suite. Never set on a deployed service.
   */
  ALLOW_LOCAL_STANDINS: z.enum(["0", "1"]).default("0"),

  /*
   * Monitoring and alerting (docs/23-OBSERVABILITY.md). All optional: with
   * none set, errors are only logged. SENTRY_DSN keeps the details of every
   * error (stack, request, breadcrumbs); the Telegram pair sends the alert
   * to a phone. The DSN is the API project's; the web app's is a build-time
   * VITE_SENTRY_DSN.
   */
  SENTRY_DSN: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  /** e.g. https://pro-now.sentry.io — alerts link to the event through it. */
  SENTRY_ORG_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  ALERT_TELEGRAM_BOT_TOKEN: z.string().optional().transform((v) => (v ? v : undefined)),
  ALERT_TELEGRAM_CHAT_ID: z.string().optional().transform((v) => (v ? v : undefined)),
  /** After the first alert for an error, repeats within this window become one summary. */
  ALERT_THROTTLE_MINUTES: z.coerce.number().int().positive().default(10),
  /** A storm stops here; what was dropped is counted on the next alert. */
  ALERT_MAX_PER_HOUR: z.coerce.number().int().positive().default(30),
  /** Set by Render at build and run time; tags every report with the deployed commit. */
  RENDER_GIT_COMMIT: z.string().optional(),

  DISPATCH_OFFER_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
  /**
   * How long the server keeps looking before telling the customer that
   * nobody is available. Unlike the offer timeout, this one is a promise
   * to a person rather than a property of the engine, and it is recorded
   * as unconfirmed in /docs/18-ROADMAP.md §Open decisions. The default is
   * a starting point.
   */
  DISPATCH_SEARCH_DEADLINE_SECONDS: z.coerce.number().int().positive().default(300),
  DISPATCH_GEO_PREFILTER_KM: z.coerce.number().positive().default(8),
  LOCATION_FRESHNESS_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(90),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertNoLocalStandIns(parsed.data);
  assertSignInPossible(parsed.data);
  assertAlertsConfigured(parsed.data);
  return parsed.data;
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1|0\.0\.0\.0|[^.]+\.localhost|[^.]+\.test)$/i;

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * A deployed environment must never talk to something on its own machine
 * that stands in for a real vendor. A stand-in behind a production flag is
 * exactly the "mock presented as production" CLAUDE.md §3 forbids, and
 * the likeliest way to ship one is a forgotten env var.
 */
export function assertNoLocalStandIns(env: Env): void {
  if (env.NODE_ENV !== "production" && env.NODE_ENV !== "staging") return;
  if (env.ALLOW_LOCAL_STANDINS === "1") return;

  if (env.GEOCODING_PROVIDER === "fixture") {
    throw new Error(`Refusing to start ${env.NODE_ENV} with GEOCODING_PROVIDER=fixture.`);
  }

  const checked: Array<[string, string | undefined]> = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["REDIS_URL", env.REDIS_URL],
    ["S3_ENDPOINT", env.S3_ENDPOINT],
    ["SMTP_URL", env.SMTP_URL],
    ["GOOGLE_ISSUER_URL", env.GOOGLE_ISSUER_URL],
    ["PUBLIC_URL", env.PUBLIC_URL],
  ];
  const local = checked
    .filter(([, v]) => v)
    .filter(([, v]) => {
      const host = hostOf(v!);
      return host !== null && LOCAL_HOST.test(host);
    })
    .map(([k]) => k);
  if (local.length > 0) {
    throw new Error(
      `Refusing to start ${env.NODE_ENV} with local stand-ins: ${local.join(", ")} point at this machine.`
    );
  }
}

/**
 * Sign-in is email-first (docs/21 W1): a deployed server that cannot send
 * email cannot let anybody in, so it refuses to start rather than fail at
 * the first sign-in.
 */
export function assertSignInPossible(env: Env): void {
  if (env.NODE_ENV !== "production" && env.NODE_ENV !== "staging") return;
  const missing = [
    ...(!env.EMAIL_FROM ? (["EMAIL_FROM"] as const) : []),
    ...(!env.RESEND_API_KEY && !env.SMTP_URL ? (["RESEND_API_KEY or SMTP_URL"] as const) : []),
  ];
  if (missing.length > 0) {
    throw new Error(`Refusing to start ${env.NODE_ENV} without ${missing.join(", ")}: nobody could sign in.`);
  }
}

/**
 * Half a Telegram configuration is a silent one: every alert would fail to
 * send and nobody would learn that errors are going unannounced.
 */
export function assertAlertsConfigured(env: Env): void {
  if (Boolean(env.ALERT_TELEGRAM_BOT_TOKEN) !== Boolean(env.ALERT_TELEGRAM_CHAT_ID)) {
    throw new Error("ALERT_TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID must be set together.");
  }
}
