import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

// The tests reach the database and Mailpit directly (e2e/pro-helpers.ts), so
// they need apps/api/.env as much as the server does. Variables already set
// (CI's) win; the file is absent in CI.
const apiEnv = path.resolve(import.meta.dirname, "../api/.env");
if (existsSync(apiEnv)) process.loadEnvFile(apiEnv);

/**
 * End-to-end tests of the real app (docs/21 W2), in its production shape:
 * the built web app served by the API process on one origin, against real
 * Postgres, Mailpit (sign-in emails) and the mock Google issuer
 * (`docker compose up -d` locally; service containers in CI).
 *
 * Port 4100, so it never collides with `npm run dev:app` on 4000/5180.
 * The API reads apps/api/.env for the rest (DATABASE_URL, SMTP, the mock
 * issuer), as in development; the values set here win. The database is the
 * one DATABASE_URL names; every test signs up its own
 * unique people, so runs do not interfere.
 */
const PORT = 4100;
/**
 * E2E_PRODUCTION=1 runs the same suite against the production build (docs/21
 * W10): the API bundled by esbuild and started with `node dist/server.js`,
 * NODE_ENV=production — HSTS, the production CSP, Better Auth's rate limiter,
 * the stand-in guard. The guard is relaxed only by ALLOW_LOCAL_STANDINS=1,
 * because the database, mail and storage here are the compose stand-ins.
 * One proxy hop is trusted, as on Render; each test is a person at its own
 * address (e2e/fixtures.ts).
 */
const PRODUCTION = process.env.E2E_PRODUCTION === "1";
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: ORIGIN,
    locale: "he-IL",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // One browser while the product is early: Chromium at iPhone 16 Pro size
    // (402×874 screen, 402×681 viewport), touch and mobile on. WebKit and a
    // desktop pass come back when the app nears real users.
    { name: "chromium-iphone16pro", use: { ...devices["iPhone 16 Pro"], browserName: "chromium" } },
  ],
  webServer: {
    command: PRODUCTION
      ? "npm run build && npm run build --prefix ../api && npm run start --prefix ../api"
      : "npm run build && npm run start:ts --prefix ../api",
    cwd: import.meta.dirname,
    url: `${ORIGIN}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      PUBLIC_URL: ORIGIN,
      WEB_DIST_DIR: path.resolve(import.meta.dirname, "dist"),
      ...(PRODUCTION ? { NODE_ENV: "production", ALLOW_LOCAL_STANDINS: "1", TRUST_PROXY_HOPS: "1" } : { NODE_ENV: "test" }),
      // The admin the W7 test approves with (the admin's screens are W8).
      ADMIN_EMAILS: "e2e-admin@pronow.test",
      // Web Push for the W9 test only: a key pair made for this file, never used anywhere else.
      VAPID_PUBLIC_KEY: "BAqz2EZE5FL4HRqSSqzt2_xvyvquv6WQPBxZmB2NUCU_PItrnPKoPQ64S7RZzdDc8rRQr5710njEukvkEVD3sHU",
      VAPID_PRIVATE_KEY: "7cg3iFdutlM6s6FiP2XEPgfKiL4SWAThjw001Y0UWGM",
      VAPID_SUBJECT: "mailto:e2e@pronow.test",
      GEOCODING_PROVIDER: "fixture",
      // The sign-in screen's quick tryout (its own test in w2.spec.ts).
      DEMO_AUTH_ENABLED: "1",
    },
    stdout: "ignore",
    stderr: "pipe",
  },
});
