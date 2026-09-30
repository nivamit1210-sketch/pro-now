# 16 — Deployment

## Environments
`local` (Postgres+PostGIS; Redis optional) → `test` (CI, ephemeral) →
`staging` → `production`. Each has fully separate vendor keys, databases,
buckets, push credentials and webhook endpoints. **Staging can never send a
production payout or push notification.**

## Production
**https://pro-now.onrender.com** — live since 2026-09-30.

| | |
|---|---|
| Host | Render, Free plan, Frankfurt — one web service (`render.yaml`, Blueprint). The API serves the built web app on the same origin. |
| Deploys | `master` only, and only after the commit's CI checks pass (`autoDeployTrigger: checksPass`). The start command runs `prisma migrate deploy` first. |
| Health check | `/health` (Render's); `/api/ready` for an uptime monitor (from W10). |
| Sign-in | Email link, Google, and the gated tester sign-in (`DEMO_AUTH_ENABLED=1`, one shared `demo@pronow.test` customer) while friends test. |
| Free-plan caveat | The service sleeps after 15 min idle; the first request wakes it in about a minute. Not acceptable for live dispatch (docs/21 §4). |

**What is live right now:** `npm run smoke:prod` answers it read-only — no
sign-in, GET only. It checks liveness, readiness, the security headers,
that the catalogue has services, and recognises each epic by a route it
added (401 to a stranger = deployed, 404 = not). Run it after every deploy.

### Smoke test 2026-09-30 (Dvir, with Claude Code)
- **Reachable and healthy:** `/health` 200 in under 200 ms (awake); the
  welcome screen loads in 1.4 s in WebKit at iPhone 15 size; the tester
  sign-in reaches home; typing a request brings suggestions; no page
  errors, console errors or failed requests.
- **The deployed build was W6, not master** — found, explained and fixed
  the same day (below).
- **The catalogue is empty.** `/api/v1/catalog` returns market
  `IL-PILOT-DEV` with no departments: the seed never ran against the
  production database, so no service is activated and nothing can be
  requested. Fix, once: `DATABASE_URL=<production direct URL> npm run db:seed -w apps/api`
  (idempotent upserts).
- **A matcher miss, also on master:** "יש לי נזילה מתחת לכיור" offers
  unclogging first and the leak second — "כיור" is an unclogging word and
  ties with "נזילה".

### Why master was not deploying (2026-09-30, fixed by hand)
Every deploy in the service's Events was "Manually triggered via
Dashboard"; not one came from a push, although Auto-Deploy is "On Commit"
on `master`. Render pulls the code through **Dvir's** GitHub credential
(`dvir-baumel`), and its GitHub App is installed on Dvir's accounts —
but the repository belongs to **Amit's** account (`nivamit1210-sketch`).
GitHub sends push events only to apps installed on the account that owns
the repository, so Render never hears about a merge; it can still clone
when someone presses Deploy.

- **Done:** `TRUST_PROXY_HOPS` added in Render's Environment (the
  Blueprint declared it, but Blueprint changes are not applied until
  synced) — first 1, then the measured 3 — and master deployed manually. Migrations ran at
  boot; smoke 9/10, with only the empty catalogue failing.
- **The lasting fix is Amit's (repository owner):** install the Render
  GitHub App on `nivamit1210-sketch` with access to `pro-now`
  (github.com/apps/render → Configure). Until then, every merge needs
  Manual Deploy → "Deploy latest commit".
- **Also Amit's, in the Blueprint page:** "Sync" once, so the settings
  `render.yaml` declares (`DIRECT_DATABASE_URL`, `VAPID_*`, the alert
  keys) appear on the service.

### Sign-in in production (2026-09-30)
- **Email links fail with a 500:** Resend rejects the send — "The
  gmail.com domain is not verified". Resend sends only from a domain you
  own and have verified, so `EMAIL_FROM` must be an address at such a
  domain. That needs a domain (docs/21 §4, "optional domain", ≈$10/yr) —
  a purchase, so Amit's call.
- **Google sign-in is not configured:** no `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` on the service.
- **So today the tester sign-in is the only way in.** It signs everyone
  into one shared customer; the professional's side and admin are not
  reachable in production until email or Google works.

## CI (on every PR)
Built 2026-09-29: `.github/workflows/ci.yml` — lint, typecheck, unit
tests and `verify:domain`; plus migrations, `verify:rowlock` and
`db:verify` against a PostGIS service container. Since W10 the checks job
also runs `npm run audit:shipped` — `npm audit`, narrowed to the packages
the API and the web app actually ship (the Expo apps, the demo and
dev-only tools are not deployed), failing on high or critical. The rest
below is the target.
Install locked deps → lint → typecheck → unit tests → integration tests
where feasible → migration validation → security/dependency scan → build
affected apps only (workspace-aware).

## Health and readiness (W10, 2026-09-30)
- `GET /health` and `GET /api/health` — liveness. The process is up and
  serving; they touch nothing else. Render's `healthCheckPath` stays on
  `/health`, so a storage or database blip never gets the instance killed
  and restarted in a loop.
- `GET /api/ready` — readiness. Runs `SELECT postgis_lib_version()` and a
  `HEAD` on object storage, each with a 3 s timeout, and answers
  `200 {ready:true, checks:{database, postgis, storage}}` or `503` with the
  failing check marked `false`. It never returns the error text (no
  hostnames, no driver messages); the reason goes to the log and Sentry.
  Point an uptime monitor at this one.

## Client address
Per-person limits key on the client's IP — Better Auth's sign-in limiter
(on in production: 3 sign-in attempts per 10 s per address) and the
client-error report limit. Fastify resolves the address once, trusting
exactly `TRUST_PROXY_HOPS` proxies (Render: `3`, measured; `render.yaml`),
and the auth bridge hands it to Better Auth in `x-pronow-client-ip`,
overwriting any copy a client sends.

Why it matters: left to itself, Better Auth in production believes
`X-Forwarded-For` only when it holds exactly one address, and otherwise
puts **every visitor in one shared bucket** — three sign-ins per ten
seconds for the whole site. The W10 production-build e2e run found it.

Verify after each change of hosting — `npm run smoke:prod` does it:
`GET /api/v1/client-address` answers the caller's own address as the
server resolved it, and the `X-Forwarded-For` chain the caller's request
arrived with. It must equal the machine's public IP. If it is a proxy's
address, the hop count is too low (limits become site-wide); if a forged
`X-Forwarded-For` shows up, it is too high. (The request log does not
record client addresses, by design.)

**Measured on Render, 2026-09-30:** a request arrives as
`X-Forwarded-For: <client>, <Cloudflare edge>, <Render 10.x>` from a
further internal proxy, so the value is **3**. With the first guess of 1,
the server saw Render's internal address as everyone's — one sign-in
bucket for the whole site — until it was changed the same day. With 3,
entries a client adds itself sit to the left of its real address and are
ignored (checked with a forged header).

## Neon runbook (production database)
Neon gives two connection strings per branch. Use both:

| Variable | Neon string | Used by |
|---|---|---|
| `DATABASE_URL` | the **pooled** one (`-pooler` in the host), with `?sslmode=require` | the running API |
| `DIRECT_DATABASE_URL` | the **direct** one (no `-pooler`), with `?sslmode=require` | `prisma migrate deploy` only (`apps/api/prisma.config.ts`) |

Why: the pooled endpoint is PgBouncer in transaction mode; migrate takes a
session-level advisory lock, which transaction pooling does not keep.
If `DIRECT_DATABASE_URL` is unset, migrations fall back to `DATABASE_URL`,
which is right locally and in CI and wrong on Neon.

First deploy on a new Neon project:
1. Create the project in the region nearest the pilot market and the
   API's host (both are human decisions — `docs/18 §Open Decisions`).
   Postgres 16 to match local and CI.
2. Nothing to enable by hand: migration `0_init` runs
   `CREATE EXTENSION IF NOT EXISTS postgis`, and Neon allows it.
3. Set both variables in Render (`render.yaml` declares them `sync: false`).
4. Deploy. The start command runs `migrate deploy` before the server boots;
   `GET /api/ready` should then report `postgis: true`.
5. Seed the catalogue once: `DATABASE_URL=<direct url> npm run db:seed -w apps/api`.

**Once only.** The full seed also resets every service's market switches
(customer-visible, open to professionals, dispatch) to the catalogue's
defaults, which silently undoes anything an admin changed since. When only
the documents each service requires have changed (`service-documents.ts`),
run the part that touches nothing else:

```bash
DATABASE_URL=<direct url> npm run db:seed:requirements -w apps/api
```

It runs as one transaction and prints, per service, the requirements
before and after (`?` = not mandatory). A professional already approved
for a service that gains a mandatory document stops receiving that
service's offers until the document is uploaded and verified.

Every later deploy: migrations run at boot, forward only. A migration
that fails leaves the previous one applied and the server does not start,
so the previous Render deploy keeps serving. Forward-fix with a new
migration; never edit an applied one (`npm run db:drift` in CI catches a
schema that disagrees with the migrations).

Before a risky migration, create a Neon branch from production (instant,
copy-on-write), run `migrate deploy` against the branch's direct URL, and
point a preview at it. Neon's point-in-time restore (its history window
depends on the plan — a human decision, `docs/18 §Open Decisions`) is the
recovery path for a bad migration that already ran.

## Backup and restore — the drill
`npm run drill:backup` (`scripts/backup-drill.mjs`) proves a backup can be
restored instead of assuming it:
1. `pg_dump --format=custom --no-owner --no-privileges` of `DATABASE_URL`.
2. `CREATE DATABASE pronow_restore_drill_<timestamp>` on the same server,
   `pg_restore` into it.
3. Compares every table's row count, the finished `_prisma_migrations`
   and `postgis_lib_version()` between source and copy; prints
   `RESTORED AND IDENTICAL` or the differences and exits 1.
4. Drops the copy.

`pg_dump` must be the server's major version or newer, and `pg_restore`
must understand what it wrote — a pg_dump 18 dump sets
`transaction_timeout`, which a PostgreSQL 16 server rejects. The script
checks the versions first and stops with a clear message. Locally, run the
tools inside the database container: `PG_CONTAINER=pro-now-postgres npm run drill:backup`.

**Drill run 2026-09-30** (local compose, PostgreSQL 16 + PostGIS 3.4.3,
the database the W10 e2e suite had just used): 58 tables, 9,093 rows,
11 migrations — restored identical in 1.2 s.

Against Neon: run it with `DATABASE_URL=<direct url>` from a machine with
`pg_dump` 16+ (the dump is read-only; the restore copy is created and dropped
on the same Neon branch — or point it at a scratch branch). Repeat the
drill before launch and after any change to the backup set-up; record the
date and the numbers here.

## CD
Production deploy is protected (manual gate or required reviews).
Migrations follow an explicit rollback/forward-fix plan. Release metadata
is tied to the commit SHA. Mobile OTA updates are only pushed within safe
version-compatibility rules (never an OTA that silently breaks an older
build's API contract).

## Production checklist
DNS/domain/backend · TLS · DB backups with point-in-time recovery · Redis
durability expectations documented · object-storage lifecycle rules ·
secret manager wired · production vendor keys separated from staging ·
webhook endpoints registered per environment · push certs/keys per
environment · maps API key restrictions/quotas · admin access reviewed ·
monitoring alerts live · backup-restore actually tested (not assumed) ·
migration dry run · rollback/forward-fix plan documented · feature flags
default to the safe state · only the pilot market is activated at launch.
