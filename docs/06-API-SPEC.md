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
POST /v1/pro/join                     (now requires dateOfBirth YYYY-MM-DD; under 18 → 422 UNDER_MINIMUM_AGE and the role is not granted)
POST /v1/pro/application/identity { documentUploadId, selfieUploadIds: [straight, right, left] }
                                      (422 UPLOAD_NOT_READY, 409 IDENTITY_ALREADY_VERIFIED | IDENTITY_REJECTED (a refusal is final); a retake supersedes an undecided check and deletes its photos except any the new check reuses; serialized by a row lock on the profile)
POST /v1/admin/identity/:id/decision { action: APPROVE|REJECT, reason? }
                                      (RETAKE is gone: it is the `IDENTITY` mark of a review round; reason required for REJECT; 404 IDENTITY_NOT_FOUND, 409 IDENTITY_NOT_CURRENT | IDENTITY_ALREADY_DECIDED; same row lock; photos deleted after commit)
GET  /v1/admin/professionals/:id  (gains `identity`: 2-minute signed photo links, each opening audited as IDENTITY_PHOTOS_VIEWED; and `review` { draft, current (with request ids; status SENT | ANSWERED | CLOSED), earlier, changedItemKeys: changes since the latest sent round, or before any round since the latest PRO_APPLICATION_SUBMITTED })
POST /v1/admin/professionals/:id/fix-requests { itemKey, reasonHe (3-500) }
                                      (ADMIN, audited FIX_REQUEST_MARKED, a re-mark with beforeJson { reasonHe: previous }; 201 { id }; 404 PROFESSIONAL_NOT_FOUND, 409 NOT_IN_REVIEW | IDENTITY_NOT_OPEN (IDENTITY only while the check is MANUAL_REVIEW/PENDING), 422 UNKNOWN_ITEM; marks go into the one draft round)
DELETE /v1/admin/fix-requests/:id     (ADMIN, audited FIX_REQUEST_CANCELLED with afterJson { status: CANCELLED }; 204; any request of the draft round, or an OPEN one of a SENT round; 404 FIX_REQUEST_NOT_FOUND, 409 ALREADY_SENT for a FIXED/CANCELLED request or an ANSWERED/CLOSED round)
POST /v1/admin/professionals/:id/review-round/send
                                      (ADMIN, audited REVIEW_ROUND_SENT; 200 { roundId, count }; round SENT, account CHANGES_REQUESTED, one inbox notice, push after commit; an IDENTITY request whose check is no longer MANUAL_REVIEW/PENDING is cancelled, not sent, and left out of `count`; 404 PROFESSIONAL_NOT_FOUND, 409 NOTHING_MARKED (also when that IDENTITY request was all; nothing changes) | NOT_IN_REVIEW)
POST /v1/admin/professionals/:id/decision (approve) answers 409 FIXES_PENDING while items are marked or the account is CHANGES_REQUESTED; refusing cancels open requests and closes a sent round as CLOSED
GET  /v1/admin/pro-applications       (each queue item gains `returned: boolean`: its latest sent round is ANSWERED)
POST /v1/pro/application/submit       (409 FIXES_OPEN { open: [itemKey] } while a request is open; success closes the round as ANSWERED)
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

## Identity check additions (2026-10-02)
- Upload kind `IDENTITY` (jpeg/png/webp, at most 3 MB). Account documents
  are `TAX_FILE` only.
- Missing-item codes `IDENTITY` and `DATE_OF_BIRTH`.
- Account approval answers 409 `IDENTITY_NOT_VERIFIED` |
  `DATE_OF_BIRTH_MISSING` | `UNDER_MINIMUM_AGE`.
- An identity submit over a refused check answers 409 `IDENTITY_REJECTED`:
  a refusal is final. `RETAKE_REQUESTED` is the decision that asks for new
  photos. Since the review loop the retake is the `IDENTITY` mark of a
  round (docs/10 §Review loop); the admin decision accepts APPROVE | REJECT.
- The professional's application view adds `fixRequests: [{ itemKey,
  reasonHe, status }]` (the current round) and `changesRequested: boolean`
  (account status `CHANGES_REQUESTED`).

## API security
Every object access is authorized to the acting user (no IDOR). Admin
endpoints sit behind a separate RBAC policy. Uploads go through short-lived
signed URLs with type/size validation. Rate limits scale with endpoint
risk; OTP, login, location-ping and offer-accept are specially protected.

## Contract tests (required before an epic touching the API is "done")
OpenAPI/client compatibility · full state-transition matrix · idempotency
replay · concurrent-accept race · webhook replay/out-of-order · realtime
resync after reconnect.
