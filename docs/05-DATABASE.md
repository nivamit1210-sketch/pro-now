# 05 — Database

Authority: server is authoritative for identity eligibility, professional
presence, offer expiry, assignment, job state, pricing result, quote
approval, timers, payment state, ledger and verification. See
`apps/api/prisma/schema.prisma` for the implemented, executable version of
everything below.

## ID / money / time conventions
Opaque `cuid()` IDs everywhere — never sequential/guessable. `created_at` /
`updated_at` on every mutable record. Money stored as integer minor units
(agorot) + ISO currency code, never floats. Timestamps stored UTC; localized
only in the UI.

## Core relationships
`User` 1→0/1 `CustomerProfile`; `User` 1→0/1 `ProfessionalProfile`.
`ProfessionalProfile` 1→N `ProfessionalService`. `Service` belongs to
`Category`, `Category` belongs to `Department`. `ProfessionalProfile` 1→N
`AvailabilitySession`. `Job` belongs to `Customer`, `Service`, `Address`;
0/1 assigned `ProfessionalProfile`. `Job` 1→N `DispatchOffer`. `Job` 1→N
`JobEvent`. `Job` 0→N `Quote`; `Quote` 1→N `QuoteItem`. `Job` 1→N
`PaymentEvent`/`LedgerEntry`. A completed, eligible `Job` has 0→1 customer
`Review` for the assigned professional.

## Table inventory (implemented in Prisma)
`users, customer_profiles, professional_profiles, identity_verifications,
business_profiles, professional_documents, professional_credentials,
departments, categories, services, service_variants, service_add_ons,
professional_services, service_requirements, trust_profiles, service_areas,
addresses, availability_sessions, professional_locations, jobs, job_media,
job_events, dispatch_offers, quotes, quote_items, payments, payment_events,
payout_accounts, payouts, ledger_entries, reviews, review_dimensions,
external_reputation_sources, professional_external_profiles,
external_rating_snapshots, chat_threads, chat_messages, notifications,
refunds, disputes, support_tickets, risk_signals, risk_actions,
blocked_relationships, admin_users, admin_roles, audit_logs, credential_notices, app_config,
market_activations, street_names, geocode_cache`.

## Credential expiry
`professional_credentials.noExpiry` (boolean, default false): "no date
because none applies", against a null `expiresAt` that means nobody entered
one. `credential_notices` (`id`, `credentialId`, `kind` WARN_30 | WARN_7 |
EXPIRED, `sentAt`; unique on `(credentialId, kind)`) makes each expiry notice
once-only; the notice row and the inbox notification commit together
(migration `20261003b_credential_expiry`; docs/10 §Life after approval).

## Identity check
`identity_verifications` holds one row per attempt (the unique on
`professionalId` is dropped; index `(professionalId, createdAt)`). New
columns: `method` (VENDOR | MANUAL), `verificationId`, `uploadIds`
(`[idCard, straight, right, left]`, emptied on deletion), `photosDeletedAt`,
`decidedById`, `decidedAt`, `decisionReason`. `professional_profiles` gains
`dateOfBirth` (date). The media clean-up keeps photos of `MANUAL_REVIEW` /
`PENDING` checks.

## Review loop
`review_rounds` (`professionalId`, `createdById`, `status` DRAFT | SENT |
ANSWERED | CLOSED (CLOSED: the account was refused while the round was
out), `sentAt`, `answeredAt`; a partial unique index
`review_rounds_one_draft` allows one `DRAFT` per professional) and
`fix_requests` (`roundId`, `professionalId`, `itemKey`, `reasonHe`, `status`
OPEN | FIXED | CANCELLED, `fixedAt`; unique `(roundId, itemKey)`).
`VerificationStatus` gains `CHANGES_REQUESTED`. Migration
`20261003a_review_loop`. See `/docs/10-TRUST-VERIFICATION.md §Review loop`.

## Addresses
An `Address` is saved from one of two sources only (`POST /v1/me/addresses`):
a street from `street_names` — Israel's official street list (data.gov.il),
loaded on boot from `apps/api/data/il-streets.json.gz` and refreshed with
`node apps/api/scripts/fetch-streets.mjs` — which the server places on the
map itself, or the device's own location. `geoPrecision` says how closely:
`HOUSE`, `STREET`, `LOCALITY` (only a village of ≤40 streets) or `DEVICE`;
null on rows from before 2026-10-01, when the client sent the coordinates.
`localityCode`/`streetCode` point back into the list.

## Market activation
`MarketActivation` keys on (market/geography, service) and carries
`customer_visible`, `provider_onboarding_enabled`, `dispatch_enabled`, a
pricing-config reference, and an effective period/status. The customer
catalog query always filters through active-market rows — taxonomy
existing in the DB is never sufficient to show a category to a customer.

## Professional service eligibility
`professional_services.status`: `DRAFT | PENDING | APPROVED | DISABLED |
SUSPENDED`. Eligibility is computed from account status, identity
verification, service approval, required credentials, market activation and
risk restrictions — stored as explainable reason codes, not a single
fragile boolean.

## Availability session
Starts only after a server eligibility check and location readiness. One
active shift per professional. Ending a shift is blocked while committed to
an active job, except via an explicit support path. Stores a snapshot of
enabled service IDs / config reference for that session.

## Location
`professional_locations` keeps a latest-state row plus a controlled history
window for active operations: `professional_id, lat/lng (geography),
accuracy, heading/speed (optional), captured_at, received_at,
source/context`. Impossible/too-old updates are rejected per policy.
Matching always uses freshness of `received_at`/`captured_at`. Retention is
configurable (`/docs/12-PRIVACY.md`).

## Job creation transaction
Validate customer/service/market/address → calculate pricing preview →
create `Job` in `DRAFT`/`SEARCHING` → persist immutable initial `JobEvent`
→ create idempotency record → commit → trigger dispatch (outside the DB
transaction, via queue/event).

## Dispatch offers
`dispatch_offers`: `job_id, professional_id, status (CREATED|SENT|VIEWED|
ACCEPTED|SKIPPED|EXPIRED|REVOKED), offered_at, expires_at, responded_at,
score_snapshot, eta_snapshot, payout_snapshot` with a unique constraint
preventing a duplicate *live* offer pair for the same job/professional.

## Atomic accept
Single transaction/lock: verify offer live → verify job assignable → verify
professional eligible/available → reserve job+professional → mark offer
ACCEPTED → revoke competing offers → assign professional → transition job
to `PRO_ASSIGNED` → append events → commit → realtime notify. The losing
professional(s) receive a typed `OFFER_NO_LONGER_AVAILABLE` result, never a
silent failure.

## Quote versioning
A sent `Quote` is immutable; edits create a new version. The customer
approves an exact quote version/hash; `Job.approved_quote_id` records it.
Line items are re-validated server-side; the client never has total
authority.

## Hourly timer
Server stores `service_started_at`, `accumulated_seconds`, and allowed
pauses. The client only interpolates a display value. Billable duration at
completion is computed server-side by policy — a manipulated device clock
cannot change the bill.

## Courier detail
A separate `job_detail`-style module holds pickup/dropoff, package
constraints and proof references, rather than overloading the generic
`jobs` columns with every vertical's fields.

## Payments
Payment state machine is separate from job state:
`CREATED → AUTHORIZING → AUTHORIZED → CAPTURING → CAPTURED → FAILED |
REFUND_PENDING → PARTIALLY_REFUNDED | REFUNDED`. `payment_events` stores the
provider's event ID as a unique key for idempotent webhook processing.
`ledger_entries` are immutable; provider dashboard earnings numbers must
derive from the ledger, never from an ad-hoc sum of job rows.

## Reviews
Unique `(reviewer, job)` constraint. Only the customer of an eligible
completed/paid job may review. Moderation status tracked. External
reputation is never inserted into the internal reviews table.

## Blocking
`blocked_relationships` is symmetric for matching purposes — a block
prevents a future dispatch pair without revealing the sensitive reason to
either party.

## Indexes (minimum set)
PostGIS geography index on `professional_locations` · `jobs(status,
market)` · professional availability/service-eligibility composite ·
`dispatch_offers(job_id, status, expires_at)` · credential
`(professional_id, type, expiry)` · `job_events(job_id, created_at)` ·
`payment_events(provider_event_id)` unique · `reviews(job_id, reviewer_id)`
unique · market-activation lookup.

## Migration rules
Prisma migrations are checked in; no `db push` in production. Rollout must
stay backward-compatible when mobile app versions may lag the backend.
Data backfills are explicit and resumable. A destructive migration requires
a written plan in the PR.
