# 21 — Production plan: from demo to a live web app

Status: **approved 2026-09-29**. W0–W11 are done; the app is live for
testers at https://pro-now.onrender.com. Next: Phase 2 (go live properly).
Each epic's PR description is its report; per-epic reports were folded
into this page on 2026-10-01 (they remain in `git log`).

## 0. Local stand-ins

Every external service has a local stand-in that speaks the same protocol,
so going live is configuration, not code:

| Real (production) | Local stand-in | Switch |
|---|---|---|
| Neon Postgres + PostGIS | `postgis/postgis:16-3.4` | `DATABASE_URL` |
| Cloudflare R2 | SeaweedFS | `S3_ENDPOINT`, keys, bucket |
| Brevo (Resend once we own a domain) | Mailpit | `BREVO_API_KEY` / `RESEND_API_KEY` / `SMTP_URL` |
| Google sign-in | `navikt/mock-oauth2-server` | `GOOGLE_CLIENT_ID/SECRET`, issuer |
| Web Push | our own VAPID keys | `VAPID_*` |
| Nominatim geocoding | real (free), fixture adapter in tests | — |

The server refuses to boot with `NODE_ENV=production` while a stand-in is
configured.

## 2. Architecture for the MVP
```
 iPhone Safari / desktop browser
   same origin:  /        web app (PWA)      /api/*   REST     /api/ws/*  realtime
        ▼
 one Node process (Render): Fastify
   ├─ static apps/web/dist (SPA, service worker, manifest)
   ├─ Better Auth /api/auth/* (Google OIDC + email link, cookie sessions)
   ├─ domain routes /api/v1/*
   ├─ WebSocket, in-process event bus
   └─ in-process workers on Postgres (dispatch sweeper, email outbox, upload cleanup, retention)
        ▼
 Postgres + PostGIS (Neon) · S3 (R2 / SeaweedFS) · email (Brevo / Mailpit)
```
1. **One origin** for app and API, so the session cookie is first-party on
   Safari.
2. **No Redis.** Correctness comes from `SELECT … FOR UPDATE`; Redis is an
   optional latency adapter behind `JobLock`.
3. **Background work in-process**, Postgres as the queue
   (`FOR UPDATE SKIP LOCKED`). A separate worker is Phase 3.
4. **In-process realtime bus**, correct for one instance; LISTEN/NOTIFY or
   Redis behind the same interface for more. Clients re-sync over REST on
   reconnect.
5. **`apps/web`** (Vite, react-native-web, React 19, TanStack Query)
   renders `packages/ui`; the demo's `App.tsx` is not promoted.
6. **Admin inside `apps/web` at `/admin`** (D7).

## 3. Epics (all done)
| Epic | What it delivered | Still open from it |
|---|---|---|
| **W0** Foundation | compose stand-ins, env schema with the production stand-in guard, optional Redis (`JobLock`), CI, `db:drift` | — |
| **W1** Accounts | Better Auth (email link, Google via OIDC), cookie sessions, roles (CUSTOMER, self-service PROFESSIONAL, ADMIN from `ADMIN_EMAILS`, audited), `requireRole` + ownership in every query; 10 IDOR holes fixed (`idor.int.test.ts`); sign out everywhere, delete my account. JWT and phone OTP removed. | Per-email rate limit (Phase 3); Expo sign-in (Phase 3) |
| **W1.5** Stack | Fastify 5, ESM, Prisma 7 (driver adapter), zod 4, Vitest 5 | — |
| **W2** Web shell | `apps/web`: the demo's UI, PWA, RTL, iPhone specifics, loading/empty/error/offline states, `/api/v1/*`, parity screenshots against the demo | Bundle code-splitting |
| **W3** Addresses | `GeocodingProvider` (Nominatim + fixture), 30-day cache, `/geo/reverse` + `/geo/search`, saved addresses with browser location | — |
| **W4** Media | private S3 uploads (presign → PUT → complete with magic-byte sniff), media only through `/media/:id`, EXIF stripped, voice via `MediaRecorder`, cleanup and 4-day retention | — |
| **W5** Understanding | one matcher for server and client (`packages/types`), `POST /match`, `RequestClassifier` chain (keyword now, LLM off until D2), golden set in CI, `match_feedback` | **Voice to text** (needs a real-iPhone check first); golden set has 21 real sentences of the 300–500 planned |
| **W6** Customer flow | catalogue → describe → price → job → searching → match → live status → quote → completion → review, on real data; ordering for someone else with a signed `/s/:token` link and a server-issued door code. No money in the app (D1). | **Priced before dispatch** (needs a new dispatch path) |
| **W7** Professional | join (details, services, area, documents, own prices), approval per service, shifts with a foreground heartbeat, offers with expected earnings, Waze/Google Maps handoff, ETA labelled "משוער" | A professional giving a job back (no route); automatic registry checks; iOS background location (platform limit; native apps fix it) |
| **W8** Admin | applications, job inspector, users and roles, market switches, match feedback, usage; every mutation audited, every route 403 for non-admins | Hebrew labels for codes; operator actions (cancel, dispute, refund) wait on policy |
| **W9** Realtime | per-person channel, live job and ETA, inbox, email outbox, Web Push (own VAPID) | iOS push (needs installed app on HTTPS); events inside transactions are announced before commit (acceptance handled) |
| **W10** Hardening | CSP and security headers, logs without personal data, 64 KB body limit, garbage-input sweep of every route, `audit:shipped`, `/api/health` + `/api/ready`, Neon runbook, restore drill, e2e on the production build (found the Safari http bug and the shared sign-in bucket) | Admin MFA, malware scanning (decisions) |
| **W11** World | product-owned Three.js `/world` neighbourhood (`apps/web/src/world`), catalogue-backed shops, the scene behind searching and the assigned job, with WebGL/reduced-motion/keyboard fallbacks | Manual iPhone/desktop pass; the route is an illustration, not GPS |

**Not verified anywhere yet: a real iPhone** (Safari, add to home screen,
safe areas, location prompts, share sheet, push). Ask Amit.

## 4. Phase 2 — go live (in progress)
Done: Neon, Render, deploy, migrations, the catalogue seed, the smoke test.
Auto-deploy on merge works (2026-10-01). Open (details in
`16-DEPLOYMENT.md`): a domain for email sign-in, Google sign-in keys, Amit's
iPhone pass, the uptime monitor. Then, at ≈50 jobs/day: Render paid plan,
iOS Web Push, the LLM classifier (once D2 is decided), a routing provider
for real ETAs, analytics, SMS for the person at home, the payment flow.

## 4b. Phase 3
Native apps (Expo set up fresh, sign-in through Better Auth's Expo plugin);
`@fastify/rate-limit` on `/api/auth/*` per IP and per email with a shared
store; a separate worker process.

## 5. Decisions (also in `18-ROADMAP.md`)
| # | Decision | State |
|---|---|---|
| D1 | How the professional is paid in the MVP | **Decided 2026-09-29: no money in the app; quote approved on sending.** Except ordered for someone else (2026-10-07): the orderer approves it in the app, still paid directly |
| D2 | AI model/vendor for understanding requests | open — keyword matcher + customer confirmation |
| D3 | Retention for photos, voice, text, match feedback | **Decided: 4 days** (a setting) |
| D4 | SMS vendor | open — the orderer shares the link |
| D5 | Routing/ETA provider | open — straight-line estimate, labelled |
| D6 | The 3D city in the product | **Decided: yes** (W11 built `/world`) |
| D7 | Admin inside `apps/web` | **Built** (W8) |
| D8 | Mandatory documents per service | **Decided 2026-09-30: the research's list** |

## 6. Definition of done for every epic (with `/CLAUDE.md §7`)
1. Lint, typecheck, unit tests, `test:int`, and Playwright (Chromium at
   iPhone 16 Pro size since 2026-10-01; WebKit returns before real users)
   all green.
2. A manual pass in the browser at 393×852: walk the new flows and try to
   break them (back button, double taps, reload mid-flow, offline,
   permission denied, long Hebrew text, empty states).
3. The PR description lists the findings (each fixed or deferred) and says
   plainly what was **not** verified — most often a real iPhone.
4. Docs updated where the architecture or a decision changed.
