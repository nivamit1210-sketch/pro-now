# 13 — Admin, operations and analytics

The admin is built from v1. Since W8 (2026-09-30) it lives inside the web
app at `/admin` (D7); `apps/admin` (Next.js) is unused. Every admin route
is 403 for anyone not in `ADMIN_EMAILS`, and every admin mutation writes an
`audit_log` row.

## What exists (W8)
- **Applications / verification queue** per professional and per service:
  account documents, licences, approve or reject with a reason.
- **Review loop** (docs/10 §Review loop): on an application in review every
  item has "בקשת תיקון" with a reason; marks are drafts (cancellable) until
  "החזרה לתיקון (N)" sends them as one round, which takes the application
  out of the queue. It comes back tagged "חזר אחרי תיקון", showing each item
  as "תוקן" or "השתנה" and the earlier rounds. `IDENTITY` can be marked only
  while the check is undecided (409 IDENTITY_NOT_OPEN). An open request of a
  sent round can be taken back ("ביטול הבקשה"). Account approval is refused
  while items are marked or the application is back with the professional
  (CHANGES_REQUESTED). Refusing the account cancels open requests and closes
  a sent round as CLOSED. Marks, cancels and sends are audited.
- **Identity block** on the professional's page: date of birth, the check's
  status and the four photos (2-minute signed links; each opening is
  audited as `IDENTITY_PHOTOS_VIEWED`). Two immediate decisions: approve and
  reject (reason required); a retake is the `IDENTITY` mark below. The photos are deleted
  after the decision commits; the decision record stays. Account approval
  stays blocked until a `VERIFIED` check and age 18.
- **Credential expiry** (docs/10 §Life after approval): the `תוקף` tab holds
  three lists: "פג בקרוב" (within 30 days, soonest first, without those a
  verified renewal covers), "פג תוקף" and "אומת בלי תאריך תפוגה" (to fill in a
  date or `ללא תוקף`), plus "חידושים לבדיקה": pending renewals of approved
  professionals, ordered by when the credential they replace expires.
  Verifying a credential needs a date or `ללא תוקף` (the two exclude each
  other, and both clear after each decision). An hourly check
  (first run a minute after start) warns the professional 30 and 7 days ahead
  and on expiry, and sets `EXPIRED`.
- **After approval:** legal name and date of birth are locked once identity is
  verified; staff correct them with a reason (audited, the professional is
  told). A tax-status change on an approved account puts an inbox notice to
  every ADMIN user. The professional's page shows "שינויים אחרונים" (30 days).
- **Job inspector** with the full `job_events` timeline. It is what turns
  "I waited half an hour and nobody came" into an answer:
  ```
  10:31:04  Customer created job
  10:31:09  Offer → Pro #291
  10:31:31  Offer expired
  10:31:32  Offer → Pro #831
  10:31:40  Accepted
  10:43:21  Arrived
  ```
- **Users and roles.**
- **Market switches** (`MarketActivation`: service × area × customer
  visibility × onboarding × dispatch).
- **Match feedback** review (W5) and storage/DB usage against free-tier
  limits.

## Still to build
- A dashboard: jobs today, GMV, online professionals, active searches and
  jobs, average ETA, acceptance, cancellation and completion rates,
  unfulfilled demand.
- A live map: online professionals, searching jobs, en-route jobs, stalled
  jobs, "no pro found" hotspots.
- Risk queues: duplicates, complaints/incidents, re-verification,
  suspensions and appeals, each with reason codes.
- Remote configuration in `app_config` for offer timeout, radius
  expansion, location freshness, scoring weights, cancellation rules and
  feature flags. **No production-critical constant lives in client code.**
- Support runbooks (detection, user message, admin action, escalation,
  audit) for: no professional found, professional not moving, unreachable
  party, safety complaint, payment failure, refund, credential issue,
  vendor outage, suspend/restore.

## Analytics (vendor TBD)
Behind `analytics-provider.ts`. Every event carries version, actor,
job/session id and timestamp, and no unnecessary PII.

- **Customer:** `app_opened · address_selected · category_selected ·
  request_submitted · matching_started · match_found · match_failed ·
  match_cancelled · quote_received · quote_approved · quote_rejected ·
  job_completed · payment_succeeded · payment_failed · review_submitted ·
  job_cancelled · support_opened`.
- **Professional:** `onboarding_started · identity_submitted ·
  verification_approved · service_enabled · shift_started · shift_ended ·
  offer_received · offer_accepted · offer_skipped · offer_expired ·
  arrived · quote_sent · service_completed · payout_viewed`.
- **Liquidity KPIs** — "when a customer asks NOW, can we get someone moving
  toward them?": online and eligible supply by service and zone, match
  rate, time to first offer and to acceptance, ETA, acceptance rate,
  utilisation, earnings per online hour, cancellations, no-shows,
  completion, repeat rate, unfulfilled demand.

No KPI threshold is frozen before a real pilot baseline exists.
