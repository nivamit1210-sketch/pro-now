import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

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
    // Primary: Safari's engine at iPhone 15 size (393×852).
    { name: "webkit-iphone15", use: { ...devices["iPhone 15"] } },
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run start:ts --prefix ../api",
    cwd: import.meta.dirname,
    url: `${ORIGIN}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      PUBLIC_URL: ORIGIN,
      WEB_DIST_DIR: path.resolve(import.meta.dirname, "dist"),
      NODE_ENV: "test",
      // The admin the W7 test approves with (the admin's screens are W8).
      ADMIN_EMAILS: "e2e-admin@pronow.test",
      GEOCODING_PROVIDER: "fixture",
    },
    stdout: "ignore",
    stderr: "pipe",
  },
});
