# 06 — API Spec

Versioned REST (`/v1`) + authenticated WebSocket channels. Runtime
validation at every boundary via `packages/validation` (zod). Typed error
codes, never leaking stack traces/SQL/vendor secrets. Every response error
uses:
```
{ "code": "OFFER_EXPIRED", "message": "...", "details": { ... }, "requestId": "..." }
```

## Domains
`/auth  /me  /customer  /professional  /verification  /services  /markets
/availability  /location  /jobs  /dispatch  /quotes  /payments  /payouts
/reviews  /reputation  /chat  /notifications  /support  /admin`

## Key endpoints (semantics fixed; exact REST shape may be refined via
OpenAPI without semantic drift)
```
# Sign-in (Better Auth, mounted at /api/auth; docs/21 W1). The session is an
# httpOnly cookie, Secure on https; bearer tokens and phone OTP were removed.
POST /api/auth/sign-in/magic-link        { email, callbackURL }  → emails a one-time 15-min link
GET  /api/auth/magic-link/verify?token=…  → sets the session cookie, redirects to callbackURL
POST /api/auth/sign-in/social             { provider: "google", callbackURL } → { url } (OIDC + PKCE)
GET  /api/auth/callback/google            → sets the session cookie, redirects
GET  /api/auth/get-session                → { user, session } | null
POST /api/auth/sign-out
POST /api/auth/revoke-sessions           → signs the person out everywhere
DELETE /v1/me                             → delete my account: soft delete + anonymisation; 409 ACTIVE_JOB during a job
GET  /v1/catalog                      (market-filtered department/category/service tree)
POST /v1/match                        (signed in; which services a typed sentence could be: candidates, confidence band, clarify?, urgentCare — docs/21 W5)
POST /v1/match/feedback               (signed in; suggested vs chosen service for a sentence; kept 4 days)
POST /v1/jobs                         (idempotent create; triggers dispatch)
GET  /v1/jobs/:id
POST /v1/jobs/:id/cancel
POST /v1/pro/shifts                   (GO ONLINE)
POST /v1/pro/shifts/:id/end
POST /v1/pro/location                 (presence ping, rate-limited)
POST /v1/offers/:id/accept            (idempotent, atomic)
POST /v1/offers/:id/skip
POST /v1/jobs/:id/en-route
POST /v1/jobs/:id/arrive
POST /v1/jobs/:id/start
POST /v1/jobs/:id/quotes              (professional creates/sends a quote)
POST /v1/quotes/:id/approve           (idempotent)
POST /v1/jobs/:id/complete            (idempotent)
POST /v1/jobs/:id/reviews
GET  /v1/pro/status                   (presence, open shift + shiftStartedAt/shiftJobs, active job)
GET  /v1/pro/services                 (per-service eligibility with the named missing requirement, and price)
PATCH /v1/pro/services/:id/pricing
GET  /v1/pro/earnings                 (last 7 days; with IN_APP_PAYMENTS=off, from each job's SETTLED_OUTSIDE_APP receipt: paidDirectly, gross only)
GET  /v1/pro/verification
GET  /v1/pro/public-profile           (their profile as customers see it: the match card's summary, approved services, published reviews)
```

## Idempotency
`Idempotency-Key` header required on: `POST /v1/jobs`,
`POST /v1/offers/:id/accept`, `POST /v1/quotes/:id/approve`,
`POST /v1/jobs/:id/complete`, and all payment-mutating endpoints. Server
stores the key + response for replay.

## WebSocket channels
- Private authenticated **user channel**: notifications, offer pushes.
- Private **job channel**, authorized to job participants + admin only:
  offer/offer-expired, assignment, job-state, quote, approval, location
  stream, payment state.
- **As built (W6, 2026-09-30):** the job channel sends `READY` on connect and
  `JOB_EVENT {eventType, at}` for every `job_events` row written for the job,
  by any writer (a Prisma query extension publishes to an in-process bus).
  It carries no state: the client re-reads `GET /v1/jobs/:id`. A client
  message is answered with `PONG` (keep-alive).
- **As built (W9):** `WS /v1/ws/me`, the person's own channel: `OFFER` the
  moment dispatch sends one, `NOTIFICATION` for the inbox. The job channel
  also carries `PRO_LOCATION` while the professional is on the way (no
  coordinates, at most one per 10 s); the client re-reads the ETA.
  Notifications: in-app (`GET /v1/me/notifications`, `POST .../read`),
  email through `email_outbox`, and Web Push with our own VAPID keys
  (`GET /v1/push/public-key`, `POST/DELETE /v1/me/push-subscriptions`).
  The channel policy per event is `domain/notifications/policy.ts`. SMS is
  an interface only (D4).
- Events are versioned with sequence IDs to support dedupe/resync on
  reconnect. No sensitive broadcast rooms. Push notifications (FCM/APNs)
  are a wake/fallback mechanism only — the socket + a resync-from-server
  call are the source of truth after reconnect. The client's own countdown
  is never authoritative for offer validity — the server's `expires_at` is.

## Paths (since W2, 2026-09-29)
Every path the server answers besides the web app is under `/api`:
- REST at `/api/v1/*`;
- sign-in at `/api/auth/*`;
- the job socket at `/api/v1/ws/jobs/:id`.

The endpoint lists in this document keep their historical `/v1/...`
spelling; read each as `/api/v1/...`. `GET /health` stays at the root
for the host's health check.

## Access (who may call what) — enforced since W1, 2026-09-29

The server decides access in two layers, in `apps/api/src/auth/access.ts`:
- **Role:** `requireRole()` answers 401 without a session, and 403
  without the role.
- **Ownership:** the caller is part of the query itself. So another
  person's record answers **404**, exactly like one that does not exist.

`test/integration/idor.int.test.ts` covers every row below with a
wrong-person case and a right-person case.

| Route | Role | Ownership |
|---|---|---|
| `GET /v1/catalog` | public | — |
| `GET/POST /v1/me/addresses` | CUSTOMER | The caller's own, by construction. POST takes `{kind:"street", localityCode, streetCode, houseNumber?, details?}` (the server geocodes it; 422 `ADDRESS_NOT_ON_MAP` when the map does not know the street) or `{kind:"location", lat, lng, details?}`. Never free text with coordinates. |
| `GET /v1/geo/streets?q=` | CUSTOMER | Street suggestions from two characters, from `street_names` (no third party sees keystrokes). |
| `POST /v1/jobs` | CUSTOMER | The address must be the caller's. An Idempotency-Key used by another customer gets 409 and no replay. |
| `GET /v1/jobs/:id`, `GET /v1/jobs/:id/match` | CUSTOMER | the job's customer |
| `POST /v1/jobs/:id/cancel`, `/confirm-completion` | CUSTOMER | the job's customer |
| `POST /v1/jobs/:id/reviews` | CUSTOMER | The job's customer. Ownership is checked before status, so a status never leaks. |
| `POST /v1/quotes/:id/approve` | CUSTOMER | the customer of the quote's job (only the orderer approves) |
| `POST /v1/jobs/:id/en-route` · `/arrive` · `/start` · `/complete` | PROFESSIONAL | the job's assigned professional |
| `POST /v1/jobs/:id/quotes`, `GET /v1/pro/jobs/:id` | PROFESSIONAL | the job's assigned professional |
| `POST /v1/offers/:id/accept`, `/skip` | PROFESSIONAL | The offer's professional. Skip works only on a live offer (CREATED/SENT/VIEWED), otherwise 409. |
| `/v1/pro/*` (shifts, location, earnings, verification, offers/current, services, reputation) | PROFESSIONAL | the caller's own profile; `shifts/:id/end` also checks the shift is theirs |
| `DELETE /v1/me` | signed in | the caller's own account |
| `WS /v1/ws/jobs/:id` | signed in | the job's customer or its assigned professional; otherwise closed with 4404 |

Admin reads come with the admin API (W8). Until then no route bypasses
ownership for ADMIN.

## API security
Every object access is authorized to the acting user (no IDOR). Admin
endpoints sit behind a separate RBAC policy. Uploads go through short-lived
signed URLs with type/size validation. Rate limits scale with endpoint
risk; OTP, login, location-ping and offer-accept are specially protected.

## Contract tests (required before an epic touching the API is "done")
OpenAPI/client compatibility · full state-transition matrix · idempotency
replay · concurrent-accept race · webhook replay/out-of-order · realtime
resync after reconnect.
