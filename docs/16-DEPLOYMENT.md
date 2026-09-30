# 16 — Deployment

## Environments
`local` (Postgres+PostGIS; Redis optional) → `test` (CI, ephemeral) →
`staging` → `production`. Each has fully separate vendor keys, databases,
buckets, push credentials and webhook endpoints. **Staging can never send a
production payout or push notification.**

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
