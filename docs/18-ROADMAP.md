# 18 — Decisions and open questions

The product's decision log. **Open decisions** are business, legal or
vendor questions that code must not answer (`/CLAUDE.md §4`): build an
interface plus a labelled sandbox adapter, and record the question here.
**Decided** entries are dated and say who decided. Older demo history is in
`git log`; how the product catches up with the demo is in
`22-WORKING-MODEL.md`.

## Open decisions

**Vendors:** payment marketplace (Israel) · KYC/identity — needs an
`IdentityVerificationProvider` with ID document, liveness with head turns
and face match · maps/routing for geocoding and real ETAs (prices below) ·
SMS (person at home, phone verification) · chat/call masking · analytics ·
AI model for understanding requests (the `LlmClassifier` stays off until
decided) · malware scanning of uploads · long-term hosting, and the Neon
plan (how far back point-in-time restore reaches) · whether production
keeps Sentry, Telegram and UptimeRobot.

**Business and legal:** legal entity, tax and invoice model · commission
or registration fee (below) · cancellation fees and policy · provider
insurance · background-check policy where lawful (a criminal-record
certificate is never requested — demanding one is an offence in Israel) ·
the lawyer's 17 questions in the research report, notably police approval
for tutors of minors · pilot geography · which `PILOT` services to open,
and doctor/vet/gas (`INACTIVE` until there is a legal answer) · support
hours and response time · data retention (below) · admin MFA · brand,
trademark and domain clearance · sponsorships: price, who is accepted,
and whether they ship at all (`01-PRD.md §Sponsored shops`).

**Product:**
- **Per-professional price lists** (sync item D): how a pick from the
  example list meets a professional's own list. Until then the web app
  shows the demo's example lists, every figure labelled "לדוגמה" (decided
  below).
- **Pricing kind per service** — Amit: *"צריך לחשוב על זה"*.
- **Several live orders at once** — see the 2026-10-01 entry below.
- **Services beyond our list** — on hold (D3).
- **For Amit's demo first** (the product shows no UI the demo lacks —
  Dvir, 2026-10-02):
  - *Deleting the account* from "החשבון שלי". The server already does it
    (`DELETE /v1/me`; refused while a job is in progress) and people need
    a way to, but no screen offers it.
  - *The profile shows the character the customer chose* (`/avatar`), not
    a generated face — today the header and the profile disagree.
- **Demo bugs for Amit** (seen on an iPhone, Dvir, 2026-10-02; only Amit
  edits the demo):
  - *"יש לך עסק?" form, with the keyboard up* (e.g. on "האתר"): the form is
    cut off under the field and an empty dark area fills the rest. The
    product fixed the same thing in its request form and sign-in (#78, #80):
    while typing, the screen is the strip above the keyboard, and a fixed
    layout must scroll instead of stacking.
  - *"יש לך עסק?" form, after scrolling*: the round back button floats over
    the text ("בכנות: אנחנו בתחילת הדרך…"). The content needs the back
    control's clearance (`BACK_BUTTON_CLEARANCE`), or the button scrolls
    with it.

### The commission — the ledger is waiting on it
Every completed job writes a `CUSTOMER_CHARGE` row and stops there. Setting
`app_config["payments.commission.percent"] = {"percent": N}` completes the
split (fee rounds down; fee + payable = charge). Until then
`/v1/pro/earnings` shows what was charged and nothing payable. While no money moves through the app (D1), it reads the receipts jobs closed with instead, marked `paidDirectly`.

### Data retention
`DELETE /v1/me` erases identifiers and every way to sign in at once, and
keeps jobs, payments and reviews pointing at the anonymised user. Open: how
long those are kept and whether a review's text is erased (needs a legal
and tax answer). Photos, voice and text: **decided 4 days** (D3, a
setting). Error data: follows Sentry's plan. Identity-check photos (ID card,
face): **decided, kept until the admin's decision on that check, then
deleted**; the decision record stays (Dvir, 2026-10-02,
`10-TRUST-VERIFICATION.md §Identity check`). Open: how long an identity
check nobody decides (an abandoned application) keeps its photos; today
they are kept until a decision. The same question covers the
`GOVERNMENT_ID`/`SELFIE` document uploads of earlier applicants.

### Minimum age for a professional
**18, for now** (Dvir, 2026-10-02). The server enforces it on the date of
birth and again at account approval (`10-TRUST-VERIFICATION.md §Identity
check`). A legal review may change it per category.

### How long a customer waits before being told nobody is coming
`DISPATCH_SEARCH_DEADLINE_SECONDS`, default **300**. After it, SYSTEM
cancels with `NO_PROFESSIONAL_AVAILABLE` and the customer is told. A
starting point, not an answer.

### The price comparison's parameters
`price-context.ts` compares a quote with the middle half of what was paid
for the same service in PRO NOW, only from `MIN_SAMPLE` (8) quotes in
`SAMPLE_WINDOW_DAYS` (90), with no geography yet. Never an outside or
invented price. The customer sees only one case — a quote above what the
work usually costs, as a question with the professional's explanation;
below or within shows nothing (Amit: *"לא מחפש להיות הכי זול, מחפש להיות
מהיר, הוגן, חדשני"*).

### The maps vendor, with the numbers (read 2026-09-21; re-check)
| | Free per month | Then |
|---|---|---|
| Mapbox Maps SDK | 25,000 MAU | $4.00 / 1,000 MAU to 125k |
| Mapbox Directions | 100,000 requests | $2.00 / 1,000 to 500k |
| Google dynamic maps | 10,000 loads | $7.00 / 1,000 to 100k |
| MapLibre + self-hosted tiles | — | hosting only |

Mapbox bills per person, Google per map load (one customer watching one job
is many loads). Drawing the streets needs no vendor (decided 2026-09-21,
below); the vendor is needed only for geocoding and real ETAs, behind
`MapsRoutingProvider`.

## Built in the demo, not yet planned into the product
Entries after the `DEMO-SYNC.md` marker, kept as written so the next
catch-up reads them in full.

### BUILT 2026-10-01 (demo, Amit) — several orders at once; only real data in the customer's profile

Amit ordered a carpenter, walked the city during the wait and ordered a barber
inside a shop; the first order vanished. Now each order keeps its own
professional, stage and clock:
- **Dock.** "ההזמנות שלך עכשיו", a chip per order with a progress ring,
  status in words and minutes.
- **Switcher.** "1 מתוך 2" on an order's own screens.
- **City.** A strip over the 3D street, plus a note when a parked order's
  professional is getting close.
- **Calls list.** Every live order is in "הקריאות שלי".

The spec is `tools/design-preview/out/multi-order-spec.md`; the test is
`qa/multi_order.mjs`.

The customer side now shows only what really happened: addresses the person
typed, calls they really made, and no sample card. A professional's own shop
survives reopening the demo (same number → straight to his shop).

**TBD — not decided in code (Open decisions):**
- The maximum number of simultaneous live orders per customer.
- Whether the same service at the same address may be ordered twice. The demo
  neither warns nor blocks.
- The cancellation policy and fee when one of several orders is cancelled.
- Whether price-list holds for several orders can coexist. This depends on the
  payment provider.

### BUILT 2026-10-01 (demo, Amit) — ordered for someone else: the repair is quoted to whoever ordered

When a call is ordered for someone else (the son abroad for his parents),
the parents must not haggle at the door. So even a repair — normally
visit-and-diagnosis in the app and the repair settled directly — is
quoted IN THE APP: the professional must attach a photo of the fault and
write what he found (a voice note too), the quote goes only to the person
who ordered, who sees what was found → what the price includes → the sum,
and approves and pays there. The professional starts only after that
approval. The person at home is not in the app: they get SMS — the first
carries the professional and the door code, the second arrives by itself
when the orderer approves ("עמית אישר ושילם … אין צורך לשלם כלום").
Ordering for yourself is unchanged. Real SMS needs the notification vendor
(TBD, `NotificationProvider`).

### BUILT 2026-10-01 (demo, Amit) — identity check before work: ID card, face, match

Amit, after joining Lime: the join photographs the ID card, shows it being
read, then opens the front camera and asks the professional to look
straight, then right, then left, and matches the face to the card. Only
then does the documents step go on. He may skip ahead ("אחר כך") to look
around the app, but **nobody is approved for work** — no automatic
approval, the shift button gives way to "השלמת הרישום" — until the
identity check and the required documents are done.

In the demo (`tools/design-preview/src/IdentityCheck.tsx`) the photo and the
camera are real and stay on the phone; the reading of the card and the
face match are played, and the screen says so. **The KYC/identity vendor
that does it for real is still TBD** (Open decisions above) — the product
needs an `IdentityVerificationProvider` adapter for it (ID document +
liveness with head turns + face match), with a sandbox adapter until the
vendor is chosen.


Also decided (Amit, 2026-09-30, after joining as a vet in a live demo):
- **For demonstrations only, documents and the photo may be skipped too** ("דלג לעכשיו
  (הדגמה)"); the summary says they were skipped. Not a product rule — in the product they stay
  required.
- **The handyman is priced by the kind of job, not by the hour**: "הנדימן" is a price-list
  service (demo lines: shelf/picture, door or cupboard, small furniture, handle or hinge). Amit
  on pricing in general: *"צריך לחשוב על זה"* — per-service pricing kinds stay open for review.

## Decided

### 2026-10-01 (Dvir) — an address is a real place
- Suggestions as you type, from two characters, come from Israel's official
  street list (data.gov.il) in our own database — not from a vendor, and
  not from Nominatim, whose policy forbids autocomplete.
- An address is saved only from that list or from the device's location;
  the server places a street on the map itself and refuses one the map
  does not know (`ADDRESS_NOT_ON_MAP`) rather than guess. A big city is
  never located at its centre.
- Known gap, for the maps-vendor decision above: OpenStreetMap misses some
  streets under their official names (e.g. ז'בוטינסקי in Ramat Gan is
  "דרך זאב ז'בוטינסקי"), and those are refused today.

### 2026-09-30 (Dvir) — how a professional joins (sync D1–D4)
- **D1 — faces.** A photo is approved as it is, for now. Customers see the
  photo, or the trade's drawn character when that was the choice, on the
  match, tracking and review screens and on the on-site page. Before the
  match there is no face.
- **D2 — the street.** The 3D street becomes part of the product. The shop
  is stored now and placed in the street when the city arrives (W11 built
  the first `/world`).
- **D3 — services beyond our list.** On hold.
- **D4 — documents per trade.** The research's list (`onboardingDocsFor`)
  is the product's mandatory-documents rule.

### 2026-09-30 (Dvir) — example price lists in the product
Until professionals have their own lists, the web app shows the demo's
example lists (`previewPriceLists`) on the service page and in "מה
להזמין?", every figure labelled "לדוגמה". Picks reach the professional
with that label (`structuredAnswers.exampleListPicks`) and bind nobody.

### 2026-09-29 (Dvir) — the production plan's decisions
From `21-PRODUCTION-PLAN.md §Decisions`: **no money moves in the app for
now** and the quote is approved on sending; the customer pays the
professional directly (D1) · media retention 4 days (D3) · the 3D city
joins the product in its own epic (D6) · admin lives in `apps/web` (D7).

### 2026-09-29 (Dvir) — how we work
Errors go to Sentry, alerts to a Telegram bot, uptime to UptimeRobot (free
plans, behind `ErrorReporter` / `AlertNotifier`; `16-DEPLOYMENT.md`). One
branch and one PR per change; `master` merges only on green CI. The demo
and the product are separate tracks that share no code
(`22-WORKING-MODEL.md`).

### 2026-09-29 (Amit) — two kinds of work, and what goes through the app
Amit: *"אין לי דרך לעקוף את זה שהוא ייתן הצעת מחיר במקום ואז יגידו לו עזוב
קח פחות במזומן."* Each service is priced one way only:

1. **Priced only once somebody looks** (`VISIT_QUOTE`): plumbing,
   electrical, appliances, renovation trades, garden, alarms, computer and
   phone repair, vet, a car that will not start. **The app charges only the
   visit-and-diagnosis fee**, set by each professional. The repair is
   agreed and paid directly (`DIAGNOSIS → COMPLETION_PENDING`, settlement
   `VISIT_FEE_ONLY`).
2. **Priced by its kind** (`FIXED`, a price list): haircut, nails, makeup,
   massage, trainer, tutor, pets, cleaning, furniture, TV mounting,
   curtains, locksmith, flat tyre, house-call doctor.
   The customer picks from that professional's list and sees the price
   before accepting; the amount is held and released after the customer
   confirms completion.
3. **Priced before anybody sets off** (`quoteBeforeDispatch`): towing,
   small moving, post-renovation cleaning, painting, gardening, pest
   control. ONE professional answers the offer with a price; the customer
   approves it on the match card, and only then is he assigned. A declined
   price passes to the next professional — never several prices at once.
   *Server side not built yet.*
4. "זוג ידיים" stays hourly; courier stays distance-based.

No problem questions before calling: the customer describes in words, a
recording or photos.

### 2026-09-29 (Amit) — how a professional joins
Work only after PRO NOW approves the professional's documents, details and
online reviews. Area: a home radius by default; while online, offers
follow the live location. Prices: their own lines, never limited to our
list. Documents from research (`tools/design-preview/research/reports/`):
licences per trade where the law requires them (electrician, gas, AC under
the 7/2025 law, pest control, vet, doctor, towing, mobile garage,
work-at-height above 2 m); everyone gives ID, a selfie and a tax file;
insurance and certificates are recommended. A registered person goes
straight to their own page. Everything required stays required; only the
shop's design may be skipped.

### 2026-09-28 (Amit) — ordering for someone else; only the orderer approves
The person at home gets a link (no app, no account) saying who is coming,
what was verified and the door code to ask for. The professional sees who
opens the door and the code to say. **The quote, approval and payment
belong to the orderer alone.** Built in the product in W6 (signed `/s/:token`
link, server-issued code; the orderer shares the link until there is an
SMS vendor).

### 2026-09-27 (Amit) — "available in XX minutes" counts as availability
A professional finishing a job can mark "פנוי בעוד 15/30/45/60 דק׳"; he is
offered, and the wait is inside the arrival time. *Server side not built.*
Future booking is deferred on purpose: the next stage is **"request for a
later time"** — the customer picks a time, nearby professionals accept,
the customer confirms. No professional calendar.

### 2026-09-27 (Amit) — the demo opens every service
For demonstration only (`demoOpenServiceIds`). The catalogue's
`activationStatus`, the app and the server are unchanged.

### 2026-09-26 (Amit) — visit fees
Each professional sets their own visit fee, with no floor or ceiling;
abusers are blocked. The fee is shown on the person (match sheet), never
as one figure on the service page. An approved quote **includes** the
visit fee (`settlement.ts` reads it as replacing); a customer who declines
owes the fee alone. A professional may set a night/Shabbat surcharge,
shown before ordering. (Since 2026-09-29, repairs no longer go through a
quote at all — see "two kinds of work".)

### 2026-09-23 (Amit) — when the money moves
Visit fee on arrival; the quote's amount **held** on approval; **captured**
only when the customer confirms the work is done. Details:
`09-PAYMENTS.md`; in code `packages/types/src/payment-moments.ts`. Under
D1 (2026-09-29) no money moves in the app yet.

### 2026-09-23 (Amit) — how somebody reaches a human
WhatsApp and email, recorded in `packages/types/src/support.ts`. No
support hours or response time are promised (`supportHoursHe` says so).

### 2026-09-22 — the catalogue the server dispatches
The customer catalogue (`packages/types/src/pilot-catalog.ts`, 47 services)
is the source; `activationStatus` is `ACTIVE`, `PILOT` (modelled, off) or
`INACTIVE` (legal decision pending). Every ACTIVE service must exist in the
`services` table — `catalog-bridge.test.ts` fails otherwise. Required
documents are seeded from `service-documents.ts` (D4). Adding a service is
one entry in `pilot-catalog.ts`; `content-completeness.test.ts` refuses a
half-written one.

### 2026-09-21 (Amit) — real streets without a maps vendor
Only the street *shape* is real: an OpenStreetMap extract fetched once
(`fetch-geo.mjs`), committed and checked (`npm run verify:geo`), drawn in
our own palette. No tiles, no account. `geo-truth.ts` gives every drawn
position a provenance and refuses invented positions on a real surface; a
route carries metres, never minutes (`04-TECH-ARCHITECTURE.md`).

### Demo design decisions already in the product's scope
"(תצוגה)" removed from example names (the demo declares itself in the demo
bar) · the wait is the 3D street with the professional's van driving to
the customer, plus a separate street plan for "לעקוב אחרי…", no toggle ·
words, photos and prices are scoped to one order and one service · pricing
copy comes from `pricingKindOf` / `visitTermsHe`, verbs agree with the
professional's gender · every shop in the street has a facade, a room and
the professional in the doorway · free-text search understands everyday
Hebrew and shows "מד״א 101" for a life-threatening sentence · a fixed or
hourly price follows the customer's answers (example tables).
