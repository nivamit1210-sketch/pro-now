# 07 — Job & Professional State Machines

All transitions below are validated **server-side only**. A client can never
set an arbitrary state. Every transition writes an immutable `job_event`
with actor, timestamp, metadata and a correlation/request ID. An invalid
transition returns a typed error — the server never silently "repairs" a
job into a different state.

## Job (customer-facing) state machine
```
DRAFT
  → SEARCHING
SEARCHING
  → OFFERING
OFFERING
  → PRO_ASSIGNED
  → CANCELLED
PRO_ASSIGNED
  → PRO_EN_ROUTE
PRO_EN_ROUTE
  → PRO_ARRIVED
PRO_ARRIVED
  → DIAGNOSIS            (visit+quote services only)
  → IN_PROGRESS           (fixed/hourly/courier — no diagnosis step)
DIAGNOSIS
  → COMPLETION_PENDING    (diagnosis-only visit: the visit fee is the whole in-app charge — 2026-09-29)
  → WAITING_QUOTE_APPROVAL (kept in the server; the product no longer routes repairs through it)
WAITING_QUOTE_APPROVAL
  → IN_PROGRESS
  → CANCELLED / DISPUTED  (per reason matrix)
IN_PROGRESS
  → COMPLETION_PENDING
COMPLETION_PENDING
  → COMPLETED
COMPLETED
  → PAYMENT_PENDING   (IN_APP_PAYMENTS=sandbox: the ledger path)
  → REVIEW_PENDING    (IN_APP_PAYMENTS=off, the MVP default, D1: no money moves;
                       a SETTLED_OUTSIDE_APP event records what is owed to the
                       professional directly, from the same settlement)
PAYMENT_PENDING
  → PAYMENT_CAPTURED
  → (recoverable failure → retry → PAYMENT_CAPTURED, or CANCELLED/DISPUTED per policy)
PAYMENT_CAPTURED
  → REVIEW_PENDING
REVIEW_PENDING
  → CLOSED
```
While no money moves through the app (docs/21 §5 D1), a quote is approved
by the system when it is sent (`QUOTE_APPROVED`, actor `SYSTEM`), so
`WAITING_QUOTE_APPROVAL` is passed through immediately. "Only the orderer
approves" returns with in-app payments.

Any cancellation/dispute transition requires an allowed
`(source_state, actor, reason_code) → target_state` matrix entry — this
matrix lives in `apps/api/src/domain/job/transitions.ts` and is unit-tested
exhaustively.

## Professional presence/shift state machine
```
OFFLINE
  → STARTING_SHIFT
STARTING_SHIFT
  → AVAILABLE
AVAILABLE
  → OFFER_RECEIVED
OFFER_RECEIVED
  → RESERVED           (atomic accept in progress)
  → AVAILABLE           (skip/expire)
RESERVED
  → ASSIGNED
ASSIGNED
  → EN_ROUTE
EN_ROUTE
  → ARRIVED
ARRIVED
  → SERVICING
SERVICING
  → COMPLETING
COMPLETING
  → AVAILABLE            (shift still active, no blocking incident)
  → ENDING_SHIFT         (professional ends shift)
ENDING_SHIFT
  → OFFLINE
```

### Cancellation is its own edge (added 2026-09-22)

The job machine allows a cancellation from `PRO_ASSIGNED`,
`PRO_EN_ROUTE`, `PRO_ARRIVED`, `WAITING_QUOTE_APPROVAL` and
`IN_PROGRESS`. The presence machine above has no edge out of any of the
matching states except forward — so a job cancelled after assignment left
its professional stranded mid-machine and, because dispatch only
considers `AVAILABLE` professionals, invisible for the rest of their
shift. Punished for a cancellation that was not theirs.

The forward edges are correct as written: there is no such thing as
un-arriving, and walking somebody forward through steps that never
happened would write `ARRIVED` for a visit nobody made into the record a
support agent reads back.

So a cancellation releases directly to `AVAILABLE` from any committed
state, as a named exception rather than an ordinary transition —
`presenceAfterCancellation()` in
`apps/api/src/domain/job/pro-presence-transitions.ts`. `ENDING_SHIFT` is
not released: a cancelled job is not a reason to put somebody back to
work.

A professional may end shift only when not committed to an active job,
except via an explicit emergency/support path. `WORKING → AVAILABLE`
without passing through `COMPLETED`/`CANCELLED` is impossible by
construction (enforced in the same transitions module, not by UI
discipline).

## Location & the state machine
`OFFLINE` → no dispatch location tracking of any kind. `AVAILABLE`/online →
location updates sufficient for presence/matching. Any state from
`ASSIGNED` through `COMPLETING` ("active job") → tracking appropriate for
ETA/job-flow with a battery-aware update cadence. Stale location past a
configurable threshold makes the professional temporarily ineligible
(removed from the `AVAILABLE` matching pool) until fresh location resumes.

## Recovery
App kill / background / network loss must reconcile purely from server
truth on reconnect — no client-cached state is trusted as authoritative.
See `/docs/08-DISPATCH-ENGINE.md §Realtime` for the resync contract.
