# 10 — Trust, Verification & Reputation Engine

Product principle: PRO NOW sends professionals into customers' homes and
locations. Trust is a core marketplace engine, not a profile decoration. A
provider cannot become dispatch-eligible merely by entering a name and
phone number.

## Verification status model
```
DRAFT → IDENTITY_PENDING → IDENTITY_REVIEW → IDENTITY_VERIFIED
      → BUSINESS_PENDING → CREDENTIALS_PENDING → SERVICE_REVIEW
      → APPROVED
APPROVED → LIMITED | SUSPENDED | REVERIFY_REQUIRED | REJECTED (per risk/expiry events)
```
Since 2026-10-02 the `IDENTITY_*` states are recorded on the identity check,
not on the account (see §Identity check in the app).
Dispatch eligibility is **service-specific**, not merely account-specific —
an expired required credential removes only the affected service from
eligibility, not the whole account, where possible.

## Onboarding steps (see `/docs/02-UX-FLOWS.md` P01–P12 for screens)
1. **Account** — phone OTP, email where required, legal name, DOB/
   eligibility where lawful, profile photo, terms/privacy/location consent.
2. **Identity verification** — government ID capture through an approved
   vendor, selfie/liveness, identity/name match, document validity/expiry,
   duplicate-identity detection, manual review fallback. **Do not build
   proprietary biometric verification** — integrate a compliant KYC vendor
   after legal/security review (vendor TBD, see `/docs/18-ROADMAP.md`).
3. **Business profile** — trading name, tax/business status where
   applicable, experience, service areas/radius, transport/vehicle,
   languages, categories, equipment, portfolio, public business links.
4. **Professional credentials** — category-dependent: license number/type
   where legally required, certificates/training, insurance where required,
   expiry, issuer, verification status, manual reviewer + audit trail.
   Expired/revoked required credentials automatically remove the affected
   service from dispatch eligibility.
5. **Service setup** — per enabled service: pricing model, price/visit fee,
   estimated duration, equipment checklist, travel radius, add-ons,
   customer-prep notes.
6. **Reputation import/linking** — connect an existing public business
   profile where platform terms/APIs allow. External reputation is always
   displayed **separately** from PRO NOW reputation — never merge into one
   misleading score.

## Identity check in the app (pilot design, 2026-10-02)

Approved by Dvir on 2026-10-02 for a pilot with real professionals. This is
the first of three pieces: (1) this identity check; (2) the review loop
(admin asks for a fix on any one item, with a reason the professional sees);
(3) life after approval (expiry warnings, which edits need re-approval).
Each piece gets its own plan and PR.

**Why.** Before this, the ID and the face were two plain uploads
(`GOVERNMENT_ID`, `SELFIE`), nothing called `IdentityVerificationProvider`,
and admin approved the account without a record of an identity decision.
The demo (`tools/design-preview/src/IdentityCheck.tsx`) plays the reading
of the card and the face match. The product must not.

**The professional's flow.** It is the first part of the documents step:
ID, then face, then submitted. One action per screen, about 20 seconds.
1. **ID card.** The phone's rear camera (`capture="environment"`) or the
   gallery, then a preview with "נראה טוב" or "צילום מחדש". Quality is
   judged by the reviewer, not guessed on the phone.
2. **Face, three positions.** A live front camera inside a face frame:
   straight, then right, then left, one photo each, with a tick per position.
   MediaPipe face detection on the phone (the demo's `faceSense`, loaded only
   on this screen) takes each photo by itself when the head is in position.
   There is always a manual shutter. With no live camera, the phone's selfie
   camera takes one photo per position.
   **The detection only guides the person. It is not verification.** The
   server never trusts it, and a reviewer looks at the photos ("do not build
   proprietary biometric verification", above).
3. **Submitted.** The screen says "הזהות נשלחה לבדיקה". It never shows a
   "matched" tick that nothing computed.

Also part of the flow:
- Date of birth is asked in the details step, because the provider
  interface requires it. **A professional must be at least 18** (Dvir,
  2026-10-02, for now). The server refuses a date of birth under 18
  (`UNDER_MINIMUM_AGE`), and so does the account approval, counted on the
  day of the decision. The screen says why in plain words ("ההצטרפות
  לבעלי מקצוע מגיל 18"), not a generic error. The reviewer compares the
  date with the ID card.
- "אחר כך" stays: the professional can look around, but cannot be
  approved, and the summary says so.
- A retake becomes the current check. Earlier attempts are kept.

**Data** (one migration):
- `identity_verifications` has one row per attempt (the unique on
  `professionalId` is dropped). The current check is the latest row, and
  `professional-summary.ts` and `on-site.ts` read the latest.
- New fields: the ID upload, the three face uploads (straight, right, left),
  the vendor's `verificationId`, `method` (`VENDOR` | `MANUAL`), and who
  decided, when and why.
- `professional_profiles.dateOfBirth`.
- Identity photos are uploaded with their own kind, `IDENTITY`, in the same
  private storage. **They are kept only until the admin decides** (Dvir,
  2026-10-02):
  - While an attempt has no decision, the media clean-up
    (`domain/storage/media-cleanup.ts`, which deletes uploads older than
    4 days) counts its four photos as evidence, so a slow review never
    loses them.
  - Once the attempt is decided (approved, retake or rejected), its photos
    are deleted from storage. The decision itself stays: who, when, method,
    reason and the provider's answer.
  - An attempt replaced by a retake before any decision is deleted when the
    retake is submitted.
  - So after approval nobody can look at the photos again. A later doubt is
    handled with a new check (re-verification), not with the old photos.

**API.**
- `POST /v1/pro/application/identity { documentUploadId, selfieUploadIds:
  [straight, right, left] }`. The server checks that all four uploads belong
  to the caller, are `READY` and are of kind `IDENTITY`. It sends them to
  `IdentityVerificationProvider.submit()` and stores the result.
- The check's own status records the answer; the account's status flow is
  unchanged (the admin queue lists `SERVICE_REVIEW`), and account approval
  requires a `VERIFIED` current check and age 18 (plan deviation,
  2026-10-02). `RETAKE_REQUESTED` asks the professional to retake;
  `REJECTED` is final (a new submit is 409 `IDENTITY_REJECTED`).
- A retake supersedes an undecided check and deletes its photos, except
  any the new check reuses. Submit is serialized by a row lock on the
  professional's profile. 422 `UPLOAD_NOT_READY`, 409
  `IDENTITY_ALREADY_VERIFIED` | `IDENTITY_REJECTED`.
- A repeated submit with the same four uploads creates one attempt.
- In the application's missing items, one `IDENTITY` item replaces the
  `GOVERNMENT_ID` and `SELFIE` documents.
- **The server refuses to approve an account** unless the current check is
  `VERIFIED` and the date of birth shows 18 (409 `IDENTITY_NOT_VERIFIED` |
  `DATE_OF_BIRTH_MISSING` | `UNDER_MINIMUM_AGE`). No screen can bypass this.
- Web: CSP `script-src` adds only `'wasm-unsafe-eval'`. The face runtime
  lives under `/face/` (model committed, wasm copied at predev/prebuild,
  excluded from the offline precache).
- Customers see the badge `IDENTITY_CHECKED` ("הזהות נבדקה על ידי PRO NOW")
  for a manual approval.
- Every submit and decision is written to `audit_logs` (a professional's
  timeline).

**Admin review.** The application card opens with a "זהות" block:
- The four photos side by side, through short-lived private links. Each
  opening is audited.
- The declared legal name and date of birth.
- The provider's answer. The sandbox is labelled "ספק בדיקה: סביבת ניסיון —
  אין בדיקה אוטומטית". A real vendor's findings (name match, liveness,
  document valid) show in the same place.

The reviewer's three actions:
- **"הזהות אושרה"**: `VERIFIED`, method `MANUAL`.
- **"צילום מחדש"**, with a reason: the professional sees the reason and
  retakes. This is the only fix-request in piece 1. Since piece 2 it is the
  `IDENTITY` mark in a review round, sent with the other marks (§Review
  loop below), not an immediate action.
- **"סירוב"**, reason required: final.

**What customers see.**
- A vendor-verified, non-sandbox check: `זהות אומתה`.
- A manual check: **`הזהות נבדקה על ידי PRO NOW`**. It is a real check, but
  weaker than a vendor's liveness and document reading, so it never shows as
  the stronger badge.
- No identity line otherwise.

**Edge cases.**
- Camera denied or missing: the phone's camera through the file picker.
  If that fails too, the screen explains how to allow the camera; the check
  is never skipped silently.
- Detection fails to load: the manual shutter.
- Each photo uploads as it is taken and has its own retry. Nothing is
  submitted until all four are uploaded.
- Leaving halfway: photos already uploaded are kept on the server. Photos
  taken but not yet sent live only on that phone, and are retaken.
- Retaking while a check is under review: the new attempt is current, and
  the reviewer sees the latest.
- An approved identity later found false: admin suspends the account (an
  existing action) with a reason on the timeline.
- A vendor that answers later uses `getStatus`. The sandbox never needs it.

**Tests ("done" is a passing test).**
- Unit:
  - an account cannot be approved without a `VERIFIED` current check;
  - the age rule: under 18 is refused, the 18th birthday itself is
    accepted, and approval counts the age on the day of the decision;
  - the missing items;
  - "current check = latest";
  - the customer wording for vendor, manual and none.
- Integration (real Postgres):
  - another user's upload is refused;
  - a double submit makes one attempt;
  - a sandbox submit makes a `MANUAL_REVIEW` check and leaves the account status unchanged;
  - a manual approval writes `audit_logs`;
  - approving an account without identity is refused;
  - the media clean-up keeps an undecided attempt's photos past 4 days;
  - a decision (each of the three) deletes that attempt's photos and keeps
    the record;
  - a retake deletes the replaced undecided attempt's photos.
- E2E (Playwright, Chromium's fake camera): a professional joins through the
  check, admin sees the four photos and approves identity, and the account
  can then be approved.
- Manual: a walk at phone size, then Dvir on a phone once sign-in works in
  production.

**Not in this piece.** The vendor itself (TBD). The fix-request loop for
documents, services and the photo (piece 2). Expiry warnings and re-approval
rules (piece 3).

## Review loop: asking for fixes (pilot design, 2026-10-02)

Approved by Dvir on 2026-10-02. This is piece 2 of 3 (piece 1: the identity
check above; piece 3: expiry warnings and re-approval rules).

**Why.** Before this, a reviewer could only approve or refuse the whole
account, verify or reject a licence, or disable a service. Reasons stayed in
`audit_logs`, the photo and the details had no decision at all, and the
professional was never told anything. A pilot with real professionals needs
the reviewer to point at exactly what is wrong, with a reason the
professional sees, and the professional to fix only that and resend.

**Decisions.**
- **One batch per round** (Dvir). The reviewer marks items while reviewing,
  then sends them all at once. The professional gets one notice.
- **What is approved stays approved.** A round only touches the items marked
  in it.
- **Refusal stays separate and final.** Refusing the account, a service or
  identity is not part of a round.
- **The identity "retake" joins the round.** Its immediate action is
  removed; approve and refuse stay immediate.

### Item names
Every item has one stable name, used by requests, fixes and "what changed":

| Name | Covers |
|---|---|
| `IDENTITY` | the identity check |
| `DETAILS` | names, form of address, date of birth, business and tax status |
| `AREA` | home and radius |
| `PORTRAIT` | the photo or trade character |
| `SHOP` | sign, colour, logo |
| `DOCUMENT:TAX_FILE` | the account document |
| `CREDENTIAL:<serviceId>:<requirement>` | a licence or certificate |
| `SERVICE:<serviceId>` | a service applied for, and its price |

### The reviewer (application card in `/admin`)
- **Marking.** Every item has **"בקשת תיקון"**. It takes a reason of at
  least 3 characters and marks the item **"לתיקון: <reason>"**. The mark is
  a draft and can be cancelled.
- **Approving** still works per item. Approving an item that has an open
  request cancels the request.
- **Sending.** **"החזרה לתיקון (N)"** sends every marked item as one round.
  It is disabled with nothing marked.
- **No account approval during a round.** The server refuses it while a
  round is waiting for fixes.
- **The returned application** comes back to the queue showing, per item,
  **"תוקן"** with the original reason. Items changed outside the requests
  are flagged **"השתנה"**, and earlier rounds are listed below the current
  one.

### The professional
- **The notice.** One inbox notice plus a push, linking to the application
  page: "יש כמה דברים לתקן בבקשה".
- **The application page** opens with **"צריך לתקן N דברים"** and the list.
  Each entry shows the reason and a **"לתקן ›"** button into the right step
  of the join: identity/documents, services, prices, photo or details.
- **Counting a fix.** An item counts as fixed when it really changes (a new
  upload, a different value). The server marks it. There is no "fixed"
  button.
- **Resending.** **"שליחה מחדש"** is enabled once every request is fixed,
  and the server enforces it.
- **Other edits.** The professional may also edit other parts of the
  application. Those are flagged "השתנה" for the reviewer.

### Data (one migration)
- **`review_rounds`:** `professionalId`, `createdById`,
  `status` `DRAFT | SENT | ANSWERED`, `sentAt`, `answeredAt`. A partial
  unique index allows at most one `DRAFT` per professional.
- **`fix_requests`:** `roundId`, `professionalId`, `itemKey`, `reasonHe`,
  `status` `OPEN | FIXED | CANCELLED`, `fixedAt`.
- **`VerificationStatus` gains `CHANGES_REQUESTED`.** Sending a round sets
  it, which takes the application out of the queue (the queue lists
  `SERVICE_REVIEW`). Resending sets `SERVICE_REVIEW` again.

### API
**Admin** (every endpoint ADMIN-only and written to `audit_logs`):
- **Mark an item:** `{ itemKey, reasonHe }`. It goes into the draft round,
  created if needed. The server checks that the item exists in this
  application. Marking is allowed only while the account is in
  `SERVICE_REVIEW`.
- **Cancel a draft mark.**
- **Send the round.** One transaction:
  - the round becomes `SENT`;
  - the account becomes `CHANGES_REQUESTED`;
  - an `IDENTITY` request sets the current check to `RETAKE_REQUESTED` and
    deletes its photos (piece 1's path);
  - the inbox notice is stored.

  The push goes out after commit; a push failure is logged and does not
  undo the round. Sending with no marks is refused.
- **`GET /v1/admin/professionals/:id`** adds the draft marks, the current
  round's requests (open or fixed, with reasons), earlier rounds, and the
  items changed since the last submission.
- **`POST /v1/admin/identity/:id/decision`** keeps `APPROVE` and `REJECT`.
  `RETAKE` becomes the `IDENTITY` mark.

**Professional:**
- **One helper inside every save endpoint** (details/business, area,
  documents, credentials, services and pricing, portrait, shop, identity).
  When the item really changed, it marks the item's `OPEN` request `FIXED`
  and writes `PRO_APPLICATION_ITEM_CHANGED` with the item name to
  `audit_logs`.
  - Uploads always count as changed.
  - Value fields are compared before and after.
  - Removing an item resolves its request; the reviewer sees "הוסר".
- **`ProApplicationView` adds `fixRequests: [{ itemKey, reasonHe, status }]`**
  for the current round.
- **`POST /v1/pro/application/submit`** is refused with
  `409 FIXES_OPEN { open: [...] }` while a request is open. On success it
  closes the round as `ANSWERED`.
- **"What changed"** is read from `audit_logs` since the last submission. No
  extra storage, and it stays the professional's single timeline.

**Concurrency.** Mark, send, every fix and resend take the same row lock on
the professional's profile as piece 1, and re-read inside the transaction.

### Edge cases
- **A marked item is approved or refused** by another reviewer: its mark is
  cancelled.
- **The application is not in review** (a professional still on a first
  draft): marking is refused.
- **A changed approved item** is only flagged "השתנה". Whether it loses its
  approval is piece 3.
- **Several rounds** on one application are allowed and all are kept.
- **Applicants in `DRAFT` from an older full refusal** are untouched. They
  resend as before.

### Tests
- **Unit:**
  - item names: building them and checking one exists in an application;
  - the "really changed" comparison per value type;
  - round states: send needs marks; answer needs no open requests.
- **Integration:**
  - mark then send → `CHANGES_REQUESTED`, out of the queue, an inbox notice;
  - an `IDENTITY` mark → retake requested and photos deleted;
  - each save endpoint fixes its own item, and an unchanged save fixes
    nothing;
  - resend refused with `FIXES_OPEN`, then accepted and back in the queue;
  - approving cancels a mark;
  - a send racing with a fix;
  - every new admin endpoint is admin-only and audited.
- **End to end:** a reviewer marks the tax file and the photo and sends. The
  professional sees "צריך לתקן 2 דברים" with both reasons, fixes both
  through "לתקן ›" and resends. The reviewer sees "תוקן" twice and approves.

## Customer-facing trust badges (factual only)
`זהות אומתה` · `עסק אומת` · `רישיון מקצועי אומת` (where applicable) ·
`תעודות נבדקו` · `מוניטין חיצוני מקושר` (when verified) · `X עבודות הושלמו
ב-PRO NOW` · `משתמש ותיק` (only with a defined threshold). **Never** display
an arbitrary trust score like "92/100" unless the methodology is validated
and genuinely useful. **Never** claim "100% safe", "background checked" or
"licensed" unless the exact applicable check is current.

## External reputation
Interface `ExternalReputationProvider`. Data model:
`external_reputation_sources, professional_external_profiles,
external_rating_snapshots, external_review_references,
external_profile_verifications` with fields `source,
external_place/profile_id, profile_url, display_name, rating, review_count,
last_verified_at, ownership/link_status, data_provenance,
allowed_display_fields, sync_status`. Candidate integration: official Google
business/place APIs, subject to terms/attribution/authorization. **Never
scrape.** UI always labels source + freshness, e.g.
`Google ★4.9 · 127 ביקורות` next to `PRO NOW ★4.8 · 43 עבודות מאומתות`. If
the integration isn't ready, hide the external reputation block entirely —
never show mock data as if it were live.

## Fraud / impersonation controls
Risk signals: duplicate identity, duplicate payout destination, suspicious
device/account reuse, repeated phone/account patterns, identity/business
mismatch, edited/suspicious credentials, expired credentials, abnormal
location behavior, account-takeover indicators, unusual complaint/refund/
no-show patterns, attempts to move payment off-platform where prohibited.

Risk actions: `ALLOW · STEP_UP_VERIFICATION · MANUAL_REVIEW ·
TEMPORARY_LIMIT · SERVICE_DISABLE · SUSPEND · REVERIFY`. High-impact
enforcement requires an auditable reason code and a human-review/appeal
path — never a silent automatic ban with no trail.

## Re-verification triggers
Credential expiry · material identity/business change · payout change ·
high-risk account event · suspicious login/device · serious complaint ·
long inactivity where appropriate · periodic category-specific requirement.

## Safety center
Both apps: report issue, block counterpart, contact support, active-job
safety shortcut, incident categorization, jurisdiction-reviewed emergency
guidance (never promise an emergency-response capability we do not
operate), full audit trail of critical job events.
