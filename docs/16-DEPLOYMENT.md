# 16 — Deployment, CI and observability

## Environments
`local` (docker compose: PostGIS on :54320, Mailpit :8025, SeaweedFS S3
:8333, mock Google OIDC :8089) → `test` (CI, ephemeral) → `production`.
Each has its own keys, database, bucket and webhooks. The server refuses
to boot with `NODE_ENV=production` while a local stand-in is configured
(`ALLOW_LOCAL_STANDINS=1` relaxes that for the production-build e2e run
only).

## Production
**https://pro-now.onrender.com** — live since 2026-09-30.

| | |
|---|---|
| Host | Render Free, Frankfurt, one web service (`render.yaml` Blueprint). The API serves the built web app on the same origin. |
| Database | Neon Postgres + PostGIS (runbook below). |
| Deploys | `master` only, after its CI passes (`autoDeployTrigger: checksPass`). The start command runs `npm run db:migrate:deploy` first: the migrations, then the street list sync (`db:streets`, its own process). |
| Health | `/health` (Render's check; returns the deployed `commit`), `/api/ready` (for an uptime monitor). |
| Sign-in | The gated tester sign-in (`DEMO_AUTH_ENABLED=1`, one shared `demo@pronow.test` customer). Must be `0` in a real production. |
| Free-plan caveat | Sleeps after 15 min idle and takes about a minute to wake. Not acceptable for live dispatch (`21 §4`). |

**Check it:** `npm run smoke:prod` — read-only, GET only. Liveness,
readiness, security headers, a non-empty catalogue, the client address,
and each epic recognised by a route it added. Run it after every deploy.

**Open, as of 2026-10-01:**
- **Memory: nothing heavy at boot.** The free instance's Node heap is
  256 MB. On 2026-10-01 loading the street list inside the server (330 MB
  peak) put it in an out-of-memory restart loop from 21:34 to the fix
  (`/health` 502). Data loads belong in a step before `npm run start`, as
  `db:streets` does now: one query when the list is unchanged, about 80 MB
  for a reload. Render's events (`server_failed`, `nonZeroExit: 134`) and
  logs ("JavaScript heap out of memory") show it.
- **Auto-deploy works** (confirmed 2026-10-01: merging #51 deployed by
  itself). Use Manual Deploy only to redeploy a commit or after changing
  the environment. Amit: "Sync" the Blueprint once so the variables
  `render.yaml` declares (`DIRECT_DATABASE_URL`, `VAPID_*`, alert keys,
  Google keys) appear on the service.
- **Email sign-in fails with a 500.** Resend sends only from a verified
  domain you own, so `EMAIL_FROM` needs a domain (a purchase, Amit's call).
- **Google sign-in:** `render.yaml` declares `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` (`sync: false`); the values go in Render's
  Environment. The OAuth client is a "Web application" with origin
  `https://pro-now.onrender.com` and redirect URI
  `https://pro-now.onrender.com/api/auth/callback/google`. Leave
  `GOOGLE_ISSUER_URL` unset in production (it points at the local mock).
- Until email or Google works, the professional side and admin are not
  reachable in production.

## CI (every PR — `.github/workflows/ci.yml`)
| Job | What |
|---|---|
| Lint, typecheck, unit tests | the product's workspaces: `lint:product` (with the type-scale, demo-isolation and navigation checks), `typecheck:product`, `test:product`, `audit:shipped` (fails on a high/critical advisory in what the API or web app ships), the web build |
| Demo | `check:demo` — the demo's lint, typecheck, tests and build. Only when `tools/**`, the lockfile or root config changed, and always on master |
| Migrations and integration tests | migrations on fresh PostGIS, `db:drift` (migrations = schema), `test:int` (every route against a real database with Mailpit, the mock OIDC server and S3, including the accept race) |
| End-to-end | Playwright on Chromium at iPhone 16 Pro size, on the production build (WebKit returns before real users) |
| **CI passed** | the one required check |

## Health and readiness
`GET /health` and `/api/health` are liveness only (Render's check stays on
`/health`, so a storage or database blip never restarts the instance in a
loop). `GET /api/ready` runs `SELECT postgis_lib_version()` and a `HEAD` on
storage, 3 s timeout each, and answers 200 or 503 with the failing check
marked `false` — never the error text. Point the uptime monitor at it.

## Client address
Per-person limits (Better Auth's sign-in limiter: 3 per 10 s per address;
the client-error report limit) key on the client IP. Fastify trusts exactly
`TRUST_PROXY_HOPS` proxies — **3 on Render** (measured: `<client>,
<Cloudflare edge>, <Render 10.x>` from a further internal proxy) — and the
auth bridge hands the result to Better Auth in `x-pronow-client-ip`,
overwriting any client copy. Too low and every visitor shares one bucket;
too high and a forged `X-Forwarded-For` is believed.
`GET /api/v1/client-address` (run by `smoke:prod`) must answer your own
public IP.

## Neon runbook
| Variable | Neon string | Used by |
|---|---|---|
| `DATABASE_URL` | **pooled** (`-pooler`), `?sslmode=require` | the running API |
| `DIRECT_DATABASE_URL` | **direct**, `?sslmode=require` | `prisma migrate deploy` only (migrate needs a session-level advisory lock, which PgBouncer's transaction mode drops) |

- New project: Postgres 16; PostGIS is created by migration `0_init`.
  Set both variables, deploy, then check `/api/ready` reports
  `postgis: true`.
- Seed the catalogue **once**: `DATABASE_URL=<direct> npm run db:seed -w apps/api`.
  A full seed resets every service's market switches. When only the
  documents a service requires changed, run
  `npm run db:seed:requirements -w apps/api` (one transaction, prints before
  and after). A professional approved for a service that gains a mandatory
  document stops getting its offers until the document is verified.
- Migrations are forward-only. A failed one leaves the previous deploy
  serving. Forward-fix; never edit an applied migration (`db:drift`
  catches drift). Before a risky one, branch production in Neon and
  migrate the branch first. Point-in-time restore depth depends on the
  Neon plan (an open decision).

## Backup and restore
`npm run drill:backup` dumps `DATABASE_URL`, restores into a scratch
database on the same server, compares row counts, migrations and the
PostGIS version, prints `RESTORED AND IDENTICAL` (or the differences, exit
1), and drops the copy. `pg_dump` must be ≥ the server's major version;
locally use `PG_CONTAINER=pro-now-postgres`. Last run 2026-09-30 (local):
58 tables, 9,093 rows, 11 migrations, identical in 1.2 s. Repeat it against
Neon before launch and record the result here.

## Observability (decided and built 2026-09-29)
```
apps/web ──Sentry SDK───────────┐
   │ POST /api/v1/client-errors ├──► Sentry (stack, breadcrumbs, release)
apps/api ──Sentry SDK───────────┘
   │ 5xx · unhandledRejection · uncaughtException · web reports
   ▼
Monitor → scrub → fingerprint → throttle → Telegram bot → phone
UptimeRobot (5 min) → GET /health → phone (server down)
```

| Piece | Where |
|---|---|
| Scrub and fingerprint | `packages/types/src/observability.ts` |
| `ErrorReporter` (Sentry/none), throttle, monitor | `apps/api/src/observability/` |
| `AlertNotifier` (Telegram/none) | `apps/api/src/infra/alerts/` |
| Browser reporting, crash screen | `apps/web/src/observability.ts`, `crash.tsx` |
| Test routes (admin only) | `POST /api/v1/admin/debug/boom`, `/debug/rejection` |

- **What alerts:** API 5xx, unhandled rejections, uncaught exceptions
  (reported, flushed, exit; Render restarts), browser crashes and errors.
  Not 4xx, browser-extension noise or offline fetch failures.
- **Hygiene:** first occurrence alerts at once; repeats within
  `ALERT_THROTTLE_MINUTES` (10) become one summary; at most
  `ALERT_MAX_PER_HOUR` (30). The throttle is in memory, which is right for
  one instance.
- **Privacy:** `scrubText` removes emails, phone numbers, tokens and
  signed-URL queries from alerts, Sentry events and browser reports.
  Sentry collects no cookies, bodies, query strings or local variables; a
  person appears by user id only.
- **Config (Render):** `SENTRY_DSN`, `SENTRY_ORG_URL`,
  `ALERT_TELEGRAM_BOT_TOKEN` + `ALERT_TELEGRAM_CHAT_ID` (both or neither),
  and at build time `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
  `SENTRY_WEB_PROJECT` (source maps are uploaded, then deleted from
  `dist`). With none set, errors are only logged.
- **Verify** as an admin, from the browser console:
  `fetch("/api/v1/admin/debug/boom", {method: "POST"})` → an API alert.
- **Investigate:** every alert carries the route, `req` (requestId, also in
  the 500 body), user id, commit and top frames. Paste it or the Sentry
  link into a session.
- `POST /api/v1/client-errors` is unauthenticated by design (crashes
  happen before sign-in): 16 KB body, strict schema, rate-limited, writes
  nothing to the database.

## Before a real launch
Domain and TLS · Render paid plan · point-in-time recovery confirmed ·
storage lifecycle rules · production keys separated · webhooks per
environment · maps key restrictions · admin access reviewed · alerts live ·
restore drill on Neon · feature flags default to safe · only the pilot
market activated · `DEMO_AUTH_ENABLED=0`.
