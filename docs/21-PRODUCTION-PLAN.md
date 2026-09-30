# 21 — Production Plan: from demo to a live web app

Status: **APPROVED 2026-09-29** (decisions in §5). W0–W10 done (W5 with voice-to-text deferred); Phase 2 (go live) next. Written after reading the
code as it stands at `53ed69f`.

## 0. Framing

**Decision (2026-09-29):** creating the vendor accounts (Neon, Render,
Cloudflare, Resend), the Google OAuth client and the domain moves to
**Phase 2**.

Consequence: the MVP is **production-ready code that runs locally on a
production-shaped stack**. Every external service has a local stand-in that
speaks the same protocol as the real one, so going live is configuration,
not code:

| Real service (Phase 2) | Local stand-in (MVP) | Protocol | Switch |
|---|---|---|---|
| Neon Postgres + PostGIS | `postgis/postgis:16-3.4` (already in compose) | Postgres | `DATABASE_URL` |
| Cloudflare R2 | SeaweedFS (MinIO has no public images any more) | S3 API | `S3_ENDPOINT`, keys, bucket |
| Resend | Mailpit (catches every email, has a web UI and an API) | HTTPS API / SMTP | `RESEND_API_KEY` / `SMTP_URL` |
| Google sign-in | `navikt/mock-oauth2-server` (a local OIDC issuer) | OpenID Connect | `GOOGLE_CLIENT_ID/SECRET`, issuer |
| Render | `node dist/server.js` serving API + web app | HTTP/WS | `render.yaml` |
| Web Push | VAPID keys we generate ourselves (no account needed) | Web Push | `VAPID_*` |
| OpenStreetMap Nominatim (geocoding) | **real** (free, no account), plus a fixture adapter for tests | HTTP | none |
| OpenFreeMap tiles (map) | **real** (free, no key) | HTTP | none |

Nothing here is a mock presented as production (CLAUDE.md §3). Each
stand-in is a real implementation of the same protocol, and each adapter
is picked by env var, with a startup check that refuses to boot in
`NODE_ENV=production` while a stand-in is configured.

## 1. What exists and what it is missing

| Part | Today | Gap for production |
|---|---|---|
| `tools/design-preview` | The full demo. `App.tsx` (~6,600 lines) holds all state client-side on fixtures. | Not a product: no server, no auth. **Stays the investor demo.** |
| `packages/ui` | 38 screens, props-driven, react-native + react-native-web. | Reused by the new web app as-is. |
| `apps/api` | Fastify + Prisma, 50+ table schema, baseline migration, routes for catalog/jobs/offers/quotes/pro/reviews, dispatch engine with a proven row lock. | Auth is a JWT plus an OTP stub whose code is always `123456`. No uploads, no geocoding, WS is an echo scaffold, and Redis is required. |
| `packages/api-client` | 41 lines. | A typed client for every route. |
| `apps/admin` | ~320-line Next.js scaffold, no auth. | Verification queue, job inspector, roles. |
| `apps/*-mobile` | Expo, never built for a device. | Phase 3. |

## 2. Architecture for the MVP

```
 iPhone Safari / desktop browser
        │  same origin: https://<host>/          (web app, PWA)
        │                https://<host>/api/*    (REST)
        │                wss://<host>/api/ws/*   (realtime)
        ▼
 ┌──────────────────── one Node process (Render web service) ───────────────┐
 │ Fastify                                                                  │
 │  ├─ @fastify/static  → apps/web/dist (SPA + service worker + manifest)   │
 │  ├─ Better Auth      → /api/auth/*  (Google OIDC + email link, cookies)  │
 │  ├─ domain routes    → /api/v1/*    (existing, plus the new ones below)  │
 │  ├─ websocket        → /api/ws/jobs/:id  (in-process event bus)          │
 │  └─ workers (in-process, Postgres-backed): dispatch sweeper, email       │
 │     outbox, upload cleanup                                               │
 └────────┬───────────────────┬──────────────────┬──────────────────────────┘
          │                   │                  │
     Postgres+PostGIS     S3 (R2/SeaweedFS) HTTPS email (Resend) / SMTP (Mailpit)
```

The decisions behind this shape:

1. **One origin for the app and the API.** Safari blocks third-party
   cookies. With the app on `*.pages.dev` and the API on `*.onrender.com`,
   the session cookie would be third-party, and sign-in would fail on
   exactly the phone we prioritise. Serving the SPA from the API process
   makes the cookie first-party with no CORS and one deploy. Cloudflare
   Pages becomes an option later, once a custom domain puts `app.` and
   `api.` on the same site.
2. **No Redis in the MVP.** It is only a latency shortcut in
   `atomic-accept.ts`. Correctness comes from `SELECT … FOR UPDATE`
   (proven by `verify:rowlock`). The Redis lock becomes an optional
   adapter behind a `JobLock` interface, used when `REDIS_URL` is set.
   One fewer free-tier service to run.
3. **Background work runs in-process, with Postgres as the queue**
   (`SELECT … FOR UPDATE SKIP LOCKED`). The existing dispatch sweeper
   already lives in-process. The Phase 3 exit is a separate worker
   process reading the same tables.
4. **The realtime bus is in-process.** It is correct with one instance
   (the free plan). The interface allows swapping in Postgres
   `LISTEN/NOTIFY` when we run more than one instance. Clients always
   re-sync from REST on reconnect (already the rule in `job-socket.ts`).
5. **New `apps/web`**, built the way `design-preview` is built (Vite with
   `react-native` aliased to `react-native-web`) and rendering the shared
   `packages/ui` screens. The design-preview `App.tsx` is **not**
   promoted: it is a fixture orchestrator. The web app gets a thin,
   per-route orchestrator driven by server data (TanStack Query). This
   also answers the reviewer's "split App.tsx" point for the code that
   ships.
6. **Admin moves into `apps/web` under `/admin`** (role-guarded), replacing
   the 320-line Next.js scaffold. The reasons: one auth system, one
   origin, one deploy. This is an architecture change: it needs approval,
   and `04-TECH-ARCHITECTURE.md` must be updated with it.

`04-TECH-ARCHITECTURE.md` and `16-DEPLOYMENT.md` get updated as part of
W0/W10 to record decisions 1–6.

## 3. Epics (in build order)

Each epic follows CLAUDE.md §5: plan → build → tests → **manual UI pass in
the browser at iPhone 15 size (393×852) with a written findings list** →
docs → commit → report. Sizes are relative (S/M/L), not dates.

### W0 — Foundation (M)
**Status 2026-09-29 (evening, Dvir's machine): DONE.**
- Redis is optional (`JobLock`). The env schema and the stand-in guard are
  in place, the sandbox OTP runs only in local and test, and the CI
  workflow is written.
- The compose stand-ins are up and probed:
  - Mailpit: SMTP delivery arrives.
  - S3: signed put/get/delete work, and anonymous access is refused.
  - Mock OIDC issuer: its discovery document is served.
- **MinIO was replaced by SeaweedFS** (Apache-2.0, same S3 API). MinIO
  no longer publishes public Docker images.
- PostGIS listens on host port **54320**, so it never collides with a
  Postgres already installed on the host.
- Acceptance, measured:
  - `docker compose up -d`, then migrate, seed and `npm run dev:api`, serves
    the catalogue.
  - `verify:rowlock` passes 7/7.
  - `verify:journey` passes every step.
  - A new `db:drift` check (in CI) shows the migrations produce exactly
    the Prisma schema.
- Getting drift to zero took four DB defaults that the hand-written
  migrations had and the schema never declared. They are now declared in
  the schema; the database is unchanged.
- CI is green on GitHub (run 36584478584, `8dbf267`): lint, typecheck and
  unit tests; migrations, `db:drift`, row lock and `db:verify` on PostGIS.
- The Playwright harness moves to W2.

- `docker-compose.yml`: add MinIO (built: SeaweedFS), Mailpit and oauth2-mock-server (built: navikt mock-oauth2-server). Redis
  becomes an optional profile.
- `packages/config/env.ts`: a zod schema for every new variable, and a
  startup refusal to boot when production is combined with a stand-in
  (`S3_ENDPOINT` on localhost, `SMTP_URL` pointing at Mailpit, the mock
  OIDC issuer, the OTP sandbox).
- `JobLock` interface with a `NoopJobLock` (default) and a `RedisJobLock`.
  `atomic-accept` tests run against both.
- **Delete the fixed-code OTP path from production builds.** It becomes a
  dev-only plugin, registered only when `NODE_ENV !== "production"`.
- GitHub Actions CI (free minutes): install, lint, typecheck, unit tests,
  `prisma migrate diff` check, then Playwright against the compose stack.
- Playwright projects: **WebKit + `devices["iPhone 15"]`** (primary), and
  Chromium desktop.
- **Acceptance:** `docker compose up && npm run dev` gives a working stack,
  and CI is green on a PR.

### W1 — Accounts and authorization (L) — **DONE 2026-09-29** (report: `docs/reports/W1.md`)
**Decided 2026-09-29 (Dvir):**
- **A. The bearer JWT and the phone OTP are removed completely**, along with
  `jsonwebtoken`. Cookie sessions from Better Auth are the only way to
  sign in, and `verify:journey` signs in by magic link. The Expo apps
  (Phase 3) get sign-in back through Better Auth's Expo plugin.
- **B. PROFESSIONAL is self-service.** Creating a professional profile
  grants the role. Dispatch eligibility is still decided per service by
  verification (CLAUDE.md §3).

**Progress:**
- **Step 1, done:** the integration harness. `npm run test:int` runs
  `app.inject` against a throwaway migrated and seeded database per run,
  and CI runs it too.
- **Steps 2–3, done:** Better Auth 1.7.6 at `/api/auth/*` and migration
  `20260929_auth`.
  - **Sign-in:** a magic link (hashed, 15 minutes, single use), or Google
    through generic OIDC with a discovery URL, so there is one code path
    for the mock issuer and for Google.
  - **Accounts and sessions:** accounts link only on verified emails
    (Google is not a "trusted provider"). The session is a cookie:
    httpOnly, SameSite=Lax, and `__Secure-`/Secure on https.
  - **Roles:** CUSTOMER is granted at sign-up. ADMIN comes from
    `ADMIN_EMAILS`, is audited, and is granted when a session is created.
    A soft-deleted user cannot start a session.
  - **Removed:** the bearer JWT, the phone OTP and `jsonwebtoken`.
  - **Origin/CSRF checks are pinned on.** Better Auth turns them off
    under `NODE_ENV=test`, which would have made the tests weaker than
    production.
  - **Build changes:**
    - `apps/api` is now `module: node20`, because Better Auth is ESM-only
      and Node's `require(esm)` loads it.
    - CI runs Node 24, and the engine floor is Node 22.12.
    - `AUTH_SECRET` replaces `JWT_SECRET`.
  - **`verify:journey`** signs in by magic link read from Mailpit. The
    seeded professionals have emails (`pro-0101@pronow.test` …).
  - **19 integration tests:**
    - the email link: content, cookie flags, single use, expiry, and the
      token stored hashed;
    - the API guard: forged cookie, bearer and OTP all refused;
    - sign-out;
    - Google: sign-up, verified linking, refusal to link an unverified
      email;
    - the admin allowlist and its audit;
    - CSRF, and an off-site callback;
    - Secure cookies on https.
- **Known gap:** the Expo apps' sign-in is broken until Phase 3 (decision A).
- **Step 4, done:** authorization.
  - `requireRole()` plus ownership folded into the query
    (`auth/access.ts`). Another person's record answers 404.
  - The audit found **10 routes** that let any signed-in user read or
    change another person's records. All of them are fixed, and so are
    two related bugs:
    - Customer side: `GET /v1/jobs/:id`, `/match`, `/cancel`, quote
      approval, and the `Idempotency-Key` replay.
    - Professional side: en-route, arrive, start and complete, sending a
      quote, skipping an offer (which also freed the professional and
      re-dispatched a job that had already been accepted), and ending a
      shift.
    - The job WebSocket, which admitted anyone.
    - Related: reviews leaked a job's status to a stranger.
    - Related: the socket handler used the pre-v10 `connection.socket`
      API and crashed on every connection.
  - Tests: `idor.int.test.ts` has 20 tests, each with a wrong-person
    case and a right-person control. 16 of them failed before the fix.
  - The access table is in `docs/06-API-SPEC.md` §Access.

- **Library: Better Auth** (Prisma adapter, mounted at `/api/auth/*`).
  - Handles OAuth state/PKCE, CSRF, email verification, session rotation
    and rate limiting.
  - Picked over hand-rolled auth because those are the parts that go
    wrong.
- **Sign-in methods:** Google (OIDC), and email magic link (a one-time,
  hashed, 15-minute, single-use token). No passwords in the MVP, so there
  is nothing to leak and no reset flow.
- **Session:** an httpOnly, `Secure`, `SameSite=Lax` cookie, rotated on
  sign-in. The existing bearer JWT is removed from the web path.
- **Migration `1_auth`:**
  - `users`: `phone` becomes nullable (still unique); add `email_verified`,
    `name`, `image_url`, `deleted_at`.
  - New tables: `sessions`, `accounts` (OAuth links), `verifications`.
  - New `user_roles` (CUSTOMER | PROFESSIONAL | ADMIN; a user can hold
    several).
  - `admin_users.role` stays for the admin sub-roles.
- **Account linking** happens only on a *verified* email: a Google account
  and an email-link account with the same verified address become one
  user.
- **Authorization:**
  - A single `requireRole()` / `requireOwnership()` layer replaces
    `auth-context.ts`.
  - Every existing route is audited, and every route gets an
    **access-to-another-user's-record (IDOR) test**: user A can never
    read or act on B's job, address, media or offer.
- **Admin bootstrap:** an `ADMIN_EMAILS` env allowlist. The first sign-in
  of a listed, verified email is granted ADMIN, and the grant is written
  to `audit_log`.
- ~~`@fastify/rate-limit` on `/api/auth/*`: per IP and per email.~~ **Moved to Phase 3** (Dvir, 2026-09-29).
- Sign out, sign out everywhere, and delete my account (soft delete plus
  anonymisation; the retention period is TBD, §5).
- **Acceptance:**
  - An E2E test signs in by email: Playwright reads the link from
    Mailpit's API.
  - An E2E test signs in with Google through the mock issuer.
  - The IDOR suite passes.
  - Cookie flags are checked by a test.

### W1.5 — Stack refresh (S/M) — added 2026-09-29 (Dvir) — **DONE 2026-09-29**
The product is 1–3 majors behind, and Fastify 4 is past end of life. This
epic runs after W1, so its IDOR and auth suites guard the upgrade, and
before W2, so the web app is built once, on current versions. One upgrade
per commit. Each commit gets full CI plus `verify:journey`.
- **Fastify 4 → 5** (`@fastify/cors` → 11, `@fastify/websocket` → 11).
- **`apps/api` to ESM** (`"type": "module"`), which retires the
  `module: node20` workaround from W1.
  **Done:** the API and `packages/{types,config,validation,api-client}`
  are ESM, resolved like a bundler (`ESNext` + `Bundler`, as `packages/ui`
  already was). Relative imports carry `.js`. Production needs a bundle
  (the W10 gap).
- ~~**React 18 → 19, and react-native-web 0.19 → 0.21**~~ **Moved to W2
  step 1** (Dvir, 2026-09-29). Nothing renders `packages/ui` on the web
  until `apps/web` exists, so the upgrade could not be seen. Its only
  current consumers (Expo 51, Next 14) are pinned to React 18.
- **Prisma 5 → 7** (driver adapter, no Rust engine). Fall back to 6 if 7
  costs more than the epic's size.
  **Done: 7.10.0.** npm's `latest` tag points at 8.0.0-rc, so the version
  is pinned. The changes:
  - The connection moves to `apps/api/prisma.config.ts`.
  - Every client comes from `src/db/prisma-client.ts`, which uses the
    `@prisma/adapter-pg` driver adapter.
  - `db:drift` uses `--from-config-datasource`.

  Not proven: the accept path through the adapter under concurrent
  load. `verify:rowlock` races raw SQL, and the journey only runs a
  single accept. Add a Prisma-path race to W10. **Done in W10:**
  `test/integration/accept-race.int.test.ts` (with a control).
- **zod 3 → 4** in `packages/validation`, since Better Auth already
  brings in zod 4.
- **Vitest 2 → current.** Done: 5.0.2 in the product (the demo keeps 2),
  with `@types/node` 24.
- **Result:** 5 commits (`9a9c7cf`…`bc2e13c`), CI green on GitHub. Each
  commit passed the full suite and `verify:journey` 30/30.
- Out of scope: Expo/RN (Phase 3 sets the mobile apps up fresh), and the
  Next.js admin, which folds into `apps/web` (D7).
- **Acceptance:** CI green, `verify:journey` all steps, `db:verify`, and
  no behaviour change visible in the integration suite.

### W2 — Web app shell (M) — **DONE 2026-09-29** (report: `docs/reports/W2.md`, QA: `docs/qa/W2.md`)
**Decided 2026-09-29 (Dvir):**
- **The UI is 100% the demo's**, in Hebrew. Screens are built from the
  same components the demo uses, and **visual parity tests** screenshot
  demo and product at iPhone 15 size with the same data and fail when they
  differ. The flow is the demo's: welcome → sign-in → intro → avatar →
  home.
- **Sign-in: the demo's look, with email link / Google** (W1 decision A
  stands). The screen copies the demo's phone screen layout, type and
  colours and asks for an email. Phone and SMS stay out (D4 is still TBD).
- **The 3D city comes later, in its own epic** (D6 revised). W2 uses the
  demo's still street art wherever the city appears: behind the intro
  slides, behind the home header, and in the "walk the street" card.
- **Demo examples become real data or honest empty states.** That covers
  recent jobs, availability counts and sponsors (CLAUDE.md §3).
- **The API moves to `/api/v1/*`** (A). The client is typed against the
  shared zod schemas and `@pro-now/types`, with no OpenAPI codegen yet
  (B). Installability is checked through Chromium's
  `Page.getInstallabilityErrors`, because Lighthouse dropped its PWA
  category (C).
- Dvir can run the app locally and see it: `npm run dev:web` (see
  CURRENT-STATE).

- **Step 1 (moved from W1.5):** create `apps/web` directly on **React 19
  + react-native-web 0.21**, and widen `packages/ui` peers to
  `react ^18 || ^19`, so the Expo apps and the admin keep working. Check
  the shared screens in WebKit at iPhone 15 size the same day.
- `apps/web`: Vite, react-native-web, react-router, TanStack Query and
  `packages/api-client`.
- The api-client is generated from the zod schemas in
  `packages/validation`, so client and server share one contract.
- **PWA:** manifest (Hebrew name, icons, `display: standalone`), plus a
  service worker via `vite-plugin-pwa` that caches the app shell only,
  never API data. This is also the prerequisite for Web Push on iOS.
- **iPhone specifics:**
  - `dir="rtl" lang="he"`.
  - `viewport-fit=cover` with safe-area insets.
  - `100dvh`, not `100vh`.
  - Inputs ≥16px, so Safari does not zoom.
  - No hover-only affordances.
- **Every data screen has loading, empty, error and offline states**
  (CLAUDE.md §6), driven by the query status, not hand-set flags.
- Sign-in and onboarding screens: the `packages/ui` sign-in screens,
  adapted from phone OTP to "Google / email".
- Fastify serves `apps/web/dist`, with a history fallback to `index.html`.
- **Acceptance:** on WebKit/iPhone 15, a user signs in, lands on home,
  reloads and stays signed in. Lighthouse PWA "installable" passes.

### W3 — Location and addresses (M)
**Decided 2026-09-29 (Dvir):**
- **A. No map-pin step.** The demo's flow stays: "my location now" or a
  typed address, then "אישור הכתובת". The product shows the reverse-geocoded
  street where the demo shows raw coordinates, and geocodes a typed
  address on confirm. A pin step comes back only as its own decision (or
  through the demo first).
- **B. "For someone else" is shown disabled until W6.** Per the demo's own
  rule it belongs to one order, not to an address, and a third party's
  phone is stored with the order.

**DONE 2026-09-29** (report: `docs/reports/W3.md`). The product has the
vendor-neutral geocoding contract, Nominatim and fixture adapters, a
30-day Postgres cache, `/api/v1/geo/reverse` and `/api/v1/geo/search`, and
the web saved-address screen with browser location fallback. The
PostGIS-backed migration/integration checks and the WebKit iPhone 15
acceptance suite are green.

- `GeocodingProvider` interface in `packages/types/providers`, with two
  adapters:
  - **Nominatim** (real; `User-Agent` and contact email set; at most
    1 request/s through a server-side queue).
  - **Fixture** (for tests).
- `GET /api/v1/geo/reverse?lat&lng` and `GET /api/v1/geo/search?q`.
  - Proxied and cached in a `geocode_cache` table: rounded coordinates or
    normalised query, 30 days.
  - Nominatim's usage policy forbids calling it on every keystroke, so
    search runs on submit, or after a ≥800 ms pause, and at least 3
    characters.
- Client flow:
  1. The browser Geolocation API asks for permission, with an explanation
     screen first.
  2. Reverse-geocode the position.
  3. **Confirm the resolved address**: show the street returned by the
     geocoder in Hebrew; there is no separate map-pin step in W3.
  4. Save it as an `Address` with its latitude and longitude.
- **Permission denied or no fix:** fall back to address search. The
  hard-coded "רמת אביב" is gone; the home screen shows the real saved
  address or "בחרו כתובת" (choose an address).
- **Acceptance:** Playwright with `geolocation` + `permissions` set shows
  the right street. The denied path works. The Nominatim adapter has a
  contract test that is marked and skipped in CI (no network).

### W4 — Photos, recordings and text (M)

**DONE 2026-09-29:** the S3-compatible provider,
private upload migration, presign/complete/media routes, READY-upload job
attachment, client-side image re-encoding, browser voice recorder, retry-safe
cleanup worker, and a real SeaweedFS E2E covering three photos plus a voice
note are in place. The native and web customer request flows upload captured
photos and voice before creating the job, and the professional job screen
renders assigned media through signed URLs.

- A `StorageProvider` interface with one **S3-compatible adapter**
  (`@aws-sdk/client-s3` + presigner). It points at SeaweedFS locally and R2 later.
- **Upload flow** (the file never passes through our server):
  1. `POST /api/v1/uploads {kind, mime, bytes}`.
     - The server checks kind/mime against an allowlist and bytes
       against a per-kind cap: photo ≤ 1.5 MB after compression, voice
       ≤ 1.5 MB / 90 s, document ≤ 5 MB.
     - It creates an `uploads` row (PENDING) and returns a presigned PUT
       valid for 5 min, with the Content-Type and Content-Length it
       signed for.
  2. The client PUTs the file straight to storage.
  3. `POST /api/v1/uploads/:id/complete`.
     - The server does a HEAD request to check size and type, and
       sniffs the magic bytes of the first KB.
     - The row becomes READY, and it is attached to a job or document.
- **Reading:** only through `GET /api/v1/media/:id`, which checks
  ownership or assignment and redirects to a presigned GET valid for
  2 min. The bucket is private, with no public URLs.
- **Client-side shrinking:**
  - Photos: `createImageBitmap`, resized to 1600 px on the long edge,
    then canvas to JPEG at q≈0.8 (≈200–400 KB). Re-encoding drops EXIF,
    **including GPS**, which protects the customer's location.
  - Voice: `MediaRecorder`. iOS Safari produces `audio/mp4` (AAC). The
    mime type is feature-detected and the recording is capped at 90 s.
- **Migration `2_media`:**
  - New `uploads` table: id, owner, kind, mime, bytes, sha256, status,
    width/height/duration, storage key, created_at.
  - `job_media` references `uploads`.
  - `professional_documents` references `uploads`.
- **Cleanup worker:** PENDING uploads older than 24 h are deleted, from
  the bucket and the row. A retention sweep deletes media after **4 days** (D3, a setting).
- **Text** stays in Postgres (`jobs.description`, chat later).
- **Capacity:**
  - The average item is ≈0.3 MB, so R2's free 10 GB holds ≈30k items.
  - R2 charges nothing for downloads.
  - An admin KPI shows bucket usage, so we see the limit coming.
- **Acceptance:**
  - E2E: attach 3 photos and a voice note to a request; the assigned
    professional can see them and another professional gets 403.
  - Oversize and wrong-type uploads are rejected.
  - A test proves EXIF is gone.

### W5 — Understanding the request (M) — accuracy we can stand behind

**DONE 2026-09-30** (report: `docs/reports/W5.md`, QA: `docs/qa/W5.md`).
Everything below is built except **voice to text**, which is deferred
until a real-iPhone check (the report says why). The golden set is in CI,
but only 21 of its sentences are real: collecting 300–500 with Amit is
still open.

- Move `service-match.ts` from `packages/ui` to `packages/types`, so the
  server and the client use one matcher.
- `POST /api/v1/match {text}` returns
  `{candidates:[{serviceId, confidence}], urgentCare, clarify?}`.
- A `RequestClassifier` chain:
  1. **KeywordClassifier** (real, free): today's matcher plus the fixes
     below.
  2. **LlmClassifier**: an interface with an adapter behind a flag, **off
     until the model/vendor is decided** (§5). It is constrained to our
     service ids, returns a confidence, and never picks a professional.
- **Fixes to the matcher, each driven by a failing golden sentence:**
  - Negation: "לא צריך חשמלאי" (not an electrician) must remove
    electrician, not add it.
  - Context words: "רכב" (car) blocks the appliance meaning of "דלת …
    לא נפתחת" (door won't open).
  - Ambiguous nouns ("עכבר" = computer mouse or rodent) resolve by their
    neighbours (מחשב = computer → mouse), otherwise **ask**.
- **Confidence to UI rule:**
  - ≥ high: one suggestion, "נראה שזה…" (looks like…) with a confirm
    button.
  - Middle: two options.
  - Low or none: **one short clarifying question**, or the category
    list. The customer always confirms before dispatch.
- **The golden set:** `packages/types/test/fixtures/match-golden.he.json`
  - 300–500 real sentences with the expected service or services,
    collected with Amit.
  - The matching test prints top-1, top-2 and "confidently wrong" rates.
  - CI fails if any rate gets worse than the recorded baseline. From then
    on, accuracy is a number rather than a handful of examples.
- **Feedback loop:** a `match_feedback` table (text, suggested ids, chosen
  id, and whether the professional flagged "wrong service" on arrival).
  Reviewed in admin, fed back into the golden set. Retention TBD.
- **Voice to text:** where available, the Web Speech API (`he-IL`) on the
  device, free. It **must be verified on a real iPhone**; if Hebrew
  dictation is unavailable, the recording is attached and nothing is
  transcribed.
- **Acceptance:** the golden set is in CI with a baseline, and the three
  failing sentences from 2026-09-29 pass.

### W6 — Customer flow on real data (L)

**DONE 2026-09-30** (report: `docs/reports/W6.md`, QA: `docs/qa/W6.md`).
Built under D1 (no money in the app, `IN_APP_PAYMENTS=off`). Left out:
"priced before dispatch" (a demo catch-up), and the professional in a
second browser (W7).

- Catalogue, then describe (text / photo / voice), then intake answers,
  then the price shown, all calculated on the server by the existing
  pricing adapters.
- Then: create the job, see "looking for a professional" (real supply
  only), assignment, live status over the WebSocket, the quote, approval
  (by the orderer only, DECIDED 2026-09-28), completion and the review.
- Order for someone else: the on-site page becomes a signed, expiring link
  (`/s/:token`). The door code is issued by the server at assignment,
  replacing the preview's fixed code. The SMS to the person at home is TBD
  (vendor); in the MVP the orderer shares the link themselves (the
  browser share sheet).
- **Payment in the MVP:** no money moves through the app. How the
  professional is paid is a business decision (§5), and the flow ends at
  "completed" plus a receipt summary.
- **Acceptance:** `verify:journey`, rewritten as a Playwright test, walks
  a customer and a professional (two browser contexts) from sign-in to
  review, on WebKit/iPhone 15.

### W7 — The professional's side and real supply (L)

**DONE 2026-09-30** (report: `docs/reports/W7.md`, QA: `docs/qa/W7.md`).
Also closes W6's two-browser acceptance. Left out: services beyond our
list, the shop's design, automatic registry checks. Added after W7
(2026-09-30): the required photo-or-character step.

- **Onboarding:**
  1. Profile: name and photo (through W4).
  2. Services chosen from the catalogue. Each becomes a
     `ProfessionalService` in PENDING_VERIFICATION, **per service**
     (CLAUDE.md §3).
  3. Their own visit fee and optional night/Shabbat surcharge.
  4. Work area: a centre plus a radius, stored as a `ServiceArea`.
  5. Documents uploaded per service requirement.
- **Shifts:** online/offline. While online and in the foreground, the
  location is sent every 15–30 s (`watchPosition`).
- **A hard platform limit, stated honestly:** a web page on iOS cannot
  track location or wake up in the background. In the MVP a professional
  has to keep the app open while online. The app says so, and goes offline
  automatically when the heartbeat stops (the server already owns
  presence). Phase 2 adds Web Push to wake them; Phase 3 native apps
  remove the limit.
- **Offer screen:** the server-held countdown, and the expected earnings
  before accepting (CLAUDE.md §3). Accept goes through the existing atomic
  accept.
- **Navigation:** Waze
  (`https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`) and Google Maps deep
  links. The ETA shown is straight-line distance ÷ an urban speed, labelled
  "משוער" (estimated), until a routing provider is chosen (§5).
- **Acceptance:**
  - E2E: a new professional completes onboarding, and an admin approves
    one of their services.
  - Only that service receives offers.
  - The heartbeat timeout takes them offline.

### W8 — Admin (M)

**DONE 2026-09-30** (report: `docs/reports/W8.md`, QA: `docs/qa/W8.md`).
Inside `apps/web` (D7). Both acceptance tests run over every admin route.

- `/admin`, requiring the ADMIN role:
  - The **verification queue** per professional-service: documents,
    approve or reject with a reason, and every action written to
    `audit_log`.
  - The job inspector (from the Next.js scaffold): the timeline from
    `job_events`.
  - Users and roles.
  - `MarketActivation` switches (service × area).
  - Match-feedback review (W5).
  - Storage and DB usage against the free-tier limits.
- **Acceptance:**
  - Every admin mutation writes an audit row, covered by a test.
  - A non-admin gets 403 on every `/api/v1/admin/*` route.

### W9 — Realtime and notifications (M)

**DONE 2026-09-30** (report: `docs/reports/W9.md`, QA: `docs/qa/W9.md`).
iOS push waits for the installed app on HTTPS (Phase 2); SMS for D4.

- WebSocket fan-out for job state, offers, quotes and professional
  location, through an in-process `EventBus`, with authorisation per job.
  Reconnect with backoff, then re-sync over REST.
- A **`NotificationProvider` fan-out** with three channels:
  1. **In-app** (the existing `notifications` table and an inbox screen).
  2. **Email** (through an outbox table and a worker, SMTP).
  3. **Web Push**, through the `web-push` library with our own VAPID
     keys, a new `push_subscriptions` table and a service-worker `push`
     handler.
- Each event type has one channel policy. Example: an offer to a
  professional goes to socket + push; "your professional arrived" goes to
  socket + push + in-app.
- Push is built and tested on desktop Chromium locally. **iOS push can
  only be verified in Phase 2**: it needs HTTPS and the app installed on
  the home screen.
- SMS is an interface only (vendor TBD).
- **Acceptance:** E2E where the customer's screen updates live as the
  professional moves through the states. A push test with Chromium shows
  a subscription and a received message.

### W10 — Hardening and go-live readiness (M)
**DONE 2026-09-30** (report: `docs/reports/W10.md`, QA: `docs/qa/W10.md`).
- **Fixed 2026-09-29:** the API production build now bundles the local
  workspace packages with esbuild while leaving third-party dependencies
  external. This preserves Node's native handling of CommonJS dependencies
  such as dotenv and makes `node dist/server.js` importable without `tsx`.
  The regression test is `apps/api/test/production-runtime.test.ts`.
  Acceptance remains: `npm start` serves `/health` from `dist`.
- **Security:**
  - `@fastify/helmet`: CSP (self plus the tile host plus the storage
    host), HSTS, frame-ancestors none.
  - zod validation on every body/query.
  - Request size limits.
  - Logs without personal data (phone and email redacted).
  - `npm audit` in CI.
- **Health and monitoring:**
  - `/api/health` (liveness) and `/api/ready` (DB + storage).
  - Sentry adapter (enabled only when a `SENTRY_DSN` is set).
- **`render.yaml`:** a free web service. Resend's HTTPS API is used for email
  because Render Free does not support pre-deploy commands and should not
  depend on outbound SMTP.
  - Build: `npm ci && prisma generate && npm run build -w apps/web -w apps/api`.
  - Start: `prisma migrate deploy && node apps/api/dist/server.js`.
- **Neon runbook:** pooled URL for the app, direct URL for migrations,
  and PostGIS enabled by the migration.
- A backup/restore drill against a local dump, written up in `docs/16`.
- A security review note (CLAUDE.md §7), and `docs/11-SECURITY.md`
  updated.
- **Acceptance:** a full E2E suite green on a production build
  (`NODE_ENV=production` against the compose stand-ins, with the
  stand-in guard relaxed only by an explicit `ALLOW_LOCAL_STANDINS=1`).

### W11 — Virtual world web experience (M)
**IMPLEMENTED 2026-09-30** (QA: `docs/qa/W11.md`).

- Product-owned Three.js runtime under `apps/web/src/world`; the demo remains
  a visual reference and is not imported at runtime.
- `/world` is a signed-in neighbourhood route with keyboard/pointer movement,
  catalogue-backed shop services, supported interiors, and navigation into the
  existing request composer.
- Searching and assigned-job screens use the same scene runtime as a backdrop.
  Professional identity, vehicle presence, and route progress are rendered
  only from the current job/match/ETA snapshots; missing data remains unknown.
- WebGL, reduced-motion, unsupported-interior, keyboard, missing-ETA, and
  semantic fallback paths are covered by unit and browser tests.
- Measured limitation: the route is an authored temporal illustration, not a
  GPS map. A manual iPhone/desktop pass is still pending (QA note).

## 4. Phase 2 — go live (after W10)

**Status 2026-09-30:** live at **https://pro-now.onrender.com** (accounts
and deploy done). Open from the first smoke test (`docs/16 §Production`):
master now deployed by hand (auto-deploy needs the Render GitHub App on
Amit's account); the catalogue seed has not run; email sign-in needs a
verified domain and Google sign-in its client; the Amit iPhone pass and
the uptime monitor are still to do. Details: `docs/16 §Production`.

Amit (≈1 hour, with step-by-step instructions from us):
1. Accounts: Neon, Render, Cloudflare (R2), Resend. A Google OAuth client
   (consent screen and redirect URI).
2. Optional domain (≈$10/yr). Without one, the address is
   `*.onrender.com`.

Us:
1. Fill the env vars on Render, deploy, run `prisma migrate deploy` and
   seed the catalogue.
2. Smoke-test the production URL.
3. **Amit tests on a real iPhone**: sign-in, location, camera, voice,
   add to home screen, push.
4. Uptime monitor.

Then, in Phase 2 proper (≈50 jobs/day):
- Render paid plan (the free one sleeps after 15 min and wakes in
  ≈1 min, which is unacceptable for live dispatch).
- iOS Web Push verified.
- The LLM classifier switched on, once decided.
- A routing provider for real ETAs.
- Product analytics (vendor TBD).
- SMS for the person at home.
- The payment flow, once decided.

## 4b. Phase 3

- Native apps: Expo set up fresh, with sign-in through Better Auth's Expo
  plugin (decision A).
- **Rate limiting on sign-in** (moved here from W1 by Dvir, 2026-09-29):
  - `@fastify/rate-limit` on `/api/auth/*`, per IP and per email;
  - a shared store once there is more than one API process.
  - Until then, Better Auth's built-in limiter is the only protection. It
    is on by default in production, in memory, per IP and per endpoint,
    with stricter defaults on the sign-in routes. It has no per-email
    limit, so one address can be sent many sign-in emails from rotating
    IPs.

## 5. Decisions we must not invent (added to 18-ROADMAP §Open Decisions)

| # | Decision | Needed by | Default until decided |
|---|---|---|---|
| D1 | How the professional is paid in the MVP | W6 | **DECIDED 2026-09-29: no money in the app for now, and the quote is approved automatically** (no approval step for the orderer in the MVP; the rule "only the orderer approves" returns with payments) |
| D2 | AI model/vendor for understanding requests (cost and privacy of photos) | Phase 2 | Keyword matcher + customer confirmation |
| D3 | Retention period for photos, voice, text and match feedback | W4 | **DECIDED 2026-09-29: 4 days**, then deleted by the retention sweep (a setting, default 4) |
| D4 | SMS vendor (person at home, phone verification) | Phase 2 | Orderer shares the link |
| D5 | Routing/ETA provider | Phase 2 | Straight-line estimate, labelled |
| D6 | Is the 3D city part of the product app? | W2 | **REVISED 2026-09-29 (Dvir): yes, later, in its own epic.** W2 uses still art where the city shows |
| D7 | Admin inside `apps/web` instead of Next.js (§2.6) | W8 | **Built that way 2026-09-30** (W8); `apps/admin` is unused |
| D8 | Which documents are mandatory per service | W7 | Admin decides case by case, recorded |

## 6. Definition of done for every epic (in addition to CLAUDE.md §7)

1. Lint, typecheck and unit tests green; Playwright on WebKit/iPhone 15
   and Chromium green.
2. **Manual pass in the built-in browser at 393×852**:
   - Walk the new flows as a real user, and try to break them: back
     button, double taps, reloading mid-flow, going offline, permission
     denied, long Hebrew text, empty states.
   - Findings recorded in `docs/qa/W<n>.md` with screenshots, each one
     fixed or explicitly deferred.
3. Docs updated, and the epic report states plainly what was **not**
   verified (most often: a real iPhone).
