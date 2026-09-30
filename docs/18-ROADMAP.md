# 18 — Roadmap, Build Order & Open Decisions

## Build order / epics
```
EPIC 0  — Repository & docs                  (this delivery)
EPIC 1  — Database foundation                 (this delivery, first pass)
EPIC 2  — Auth & account                      (this delivery, first pass)
EPIC 3  — Professional verification            (interfaces + sandbox, this delivery)
EPIC 4  — Customer discovery/request           (this delivery, first pass — mobile UI)
EPIC 5  — Pro services & shift                 (this delivery, first pass — mobile UI)
EPIC 6  — Dispatch                             (this delivery, core engine + tests)
EPIC 7  — Realtime                             (this delivery, WS scaffold)
EPIC 8  — Active job (nav/arrival/service/completion)
EPIC 9  — Pricing/quotes (4 adapters)
EPIC 10 — Payments/ledger (sandbox provider; real vendor after business decision)
EPIC 11 — Reputation (PRO NOW reviews now; external provider after terms validation)
EPIC 12 — Admin/Ops (dashboard + job inspector, this delivery, first pass)
EPIC 13 — Safety/support
EPIC 14 — Analytics/observability
EPIC 15 — Hardening (security/perf/concurrency/offline/a11y/RTL QA)
EPIC 16 — Staging/pilot
EPIC 17 — Production/store readiness
```
Each epic's precise acceptance criteria live in `/docs/19-CLAUDE-RULES.md`.
See `/docs/EPIC-0-REPORT.md` for exactly how far this delivery got through
epics 0–7 and what remains.

## Pilot philosophy
Build broad, launch narrow. `MarketActivation` controls service × geography
× customer-visibility × provider-onboarding × dispatch, independently.
Never market a category before supply density and operational policy are
ready. See `/docs/09b-SERVICE-CATALOG.md` for the seeded pilot candidates.

## Open decisions — human/business/legal, must NOT be invented in code
Israeli payment marketplace provider · KYC/identity provider · exact maps/
routing commercial setup · external Google-reputation implementation/terms
· legal entity and tax/invoice model · commission percentage ·
cancellation fees · provider insurance policy · which credentials are
mandatory by category · background-check policy where lawful · pilot
geography · pilot services beyond the seeded candidates · support hours/
SLA · data retention periods · chat/call masking vendor · analytics vendor
· cloud hosting vendor · final brand/trademark/domain clearance.

Added 2026-09-29 by `/docs/21-PRODUCTION-PLAN.md §5` (D1–D8): how the
professional is paid in the MVP · AI model/vendor for understanding
requests · retention of photos/voice/text · SMS vendor · routing/ETA
provider · whether the 3D city is in the product app (**decided 2026-09-30: yes,
soon**) · admin inside `apps/web` · mandatory documents per service (**decided
2026-09-30: the research's list**). Both are answered in the 2026-09-30 entry below.

Added 2026-09-30 by W10 (`/docs/11-SECURITY.md §Security review`): admin
MFA · malware scanning of uploads (vendor) · Neon plan, i.e. how far back
point-in-time restore reaches (`/docs/16-DEPLOYMENT.md §Neon runbook`).

The maps one has its numbers written down below — see *The maps vendor,
with the numbers*. The decision is still a decision; what is no longer
missing is the price of each option and what each one costs us in
honesty.

### Decided — how somebody reaches a human (2026-09-23)

Off the open list above. Amit: *"ערוץ תמיכה תעשה וואטסאפ 0547222218
אימייל nivamit1210@gmail.com כרגע."* Recorded in
`packages/types/src/support.ts` rather than typed into a screen, so the
day it stops being a founder's own phone it changes in one place.

Still open, and deliberately not invented: support HOURS and a response
time. A channel is a fact; "we answer within an hour" is a promise, and
promising one on a personal phone is how a marketplace loses trust the
first night nobody answers. `supportHoursHe` says the true thing instead.

### Sponsored shops — mechanism built, list not decided (2026-09-23)

A brand renting a building in the waiting neighbourhood, with a link out
to its own site. Amit: *"ככה אגייס שיווק וכסף."* The product rules are
built and tested (`sponsor-shops.ts`); what a sponsorship costs, who is
accepted, and whether sponsored shops ship in the customer app at all
remain open and belong on the list above. See `/docs/20-SPONSORS.md`.

### Decided — when the money moves (2026-09-23)

Not on the list above any more, and it never belonged to the vendor
question: WHEN `authorize` and `capture` are called is a product rule,
and Amit has made it.

Visit fee on arrival. The quote's amount HELD on the customer's
approval, so the professional never works against a promise. Captured
only when the customer confirms the work is finished, so the money does
not leave before the job is done.

Written up with the reasoning in `/docs/09-PAYMENTS.md § When the money
moves`, and in code as `packages/types/src/payment-moments.ts`, whose
invariants are asserted against the canonical order of a visit. The
vendor remains open; nothing about this decision names one.

Everywhere one of these matters, the codebase exposes an interface + a
labeled sandbox adapter + an `app_config`/roadmap TODO — never a guessed
answer.

### TBD — how long a deleted account's records are kept (asked 2026-09-29, W1)
"Delete my account" (`DELETE /v1/me`) erases the person's identifiers at
once: email, name, phone, photo, addresses, and a professional's names.
It also removes every way to sign in. What it keeps is the records other
people depend on: jobs, payments and reviews, pointing at the anonymised
user. **Open:** how long those are kept, and whether a review's free text
is erased with the account. This needs a legal and tax answer (invoice
retention in Israel), not a code one. Until it is decided they are kept.

### TBD — which catalogue is the product's service list (asked 2026-09-22)

There are two, and they do not know about each other.

`packages/types/pilot-catalog.ts` is what the customer sees: **47
services**, with keywords, symptoms, photo prompts and matching modes.
Every screen is built from it. The `services` table is what the server
dispatches: **25 rows**, seeded from `/docs/09b-SERVICE-CATALOG.md`.

They share neither ids nor codes. `POST /v1/jobs` looks a service up by
database id and the customer app sends the pilot catalogue's id, so **no
job the customer app has ever tried to create could have succeeded**. The
wiring was there; the two halves spoke different languages.

**Resolved for the ACTIVE set, 2026-09-22.** The first framing of this
was wrong and worth correcting: it counted all 47 customer-facing services
against 25 database rows and called the gap 31. But the catalogue already
distinguishes the three cases, deliberately —

| `activationStatus` | Count | Meaning |
|---|---|---|
| `ACTIVE` | 17 | offered now |
| `PILOT` | 26 | modelled, switch off — correct to be absent |
| `INACTIVE` | 4 | gas, a doctor, a vet — a legal decision is pending |

— so the real defect was nine services that said ACTIVE while the server
had never heard of them. Those nine are in the seed now, carried from the
catalogue with their own price models and durations. Nothing was invented,
and `catalog-bridge.test.ts` now fails if any ACTIVE service is ever again
unorderable, or if a mapping is ever added for an INACTIVE one.

**Still open**, and still a business decision: whether the 26 `PILOT`
services should be opened, one at a time or as a set. Each needs a
professional supply before it is worth switching on, which is the sizing
argument `pilot-catalog.ts` makes for itself. Doctor and vet stay
INACTIVE until there is a legal answer, and the codebase should keep
refusing to guess one.

**Also still open, and larger:** `ServiceRequirement` is empty for every
service in the database. The catalogue states `requiredCredentials` per
service — a pest control licence, enhanced identity for a locksmith — and
nothing has ever carried them into the table that dispatch reads. The
credential-eligibility engine, twenty-seven tests of it, is checking every
candidate against an empty list. Which credentials are mandatory is named
in §4 as a decision this codebase must not invent; the catalogue has
already recorded an answer, so the work is to carry it, not to make it.

### TBD — the commission, which the ledger is now waiting on (2026-09-22)

Payments and the ledger are built (§21). Every job that completes writes a
CUSTOMER_CHARGE row, and **stops there**, because the platform fee and the
professional's payable cannot be computed without a commission
percentage — named in `/CLAUDE.md §4` as a decision this codebase must not
invent. `/v1/pro/earnings` therefore shows what was charged and nothing
payable, which is true rather than convenient.

Setting `app_config["payments.commission.percent"]` to `{"percent": N}`
completes the split from that moment on. Both states are walked by
`verify:journey` and both pass; the fee rounds down so rounding never
costs the professional, and fee plus payable equal the charge exactly.

### TBD — what counts as "the market" in the price comparison (2026-09-22)

Amit: *"אחרי שמקבלים הצעת מחיר, צריך שיהיה מחיר בהשוואה לשוק לראות אם יקר
או לא יקר. המטרה שלנו לתת מחיר נח לכל כיס עם מקצוענים מקסימום."*

Built: `apps/api/src/domain/pricing/price-context.ts` compares a quote
against the middle half of what was actually paid for the SAME service in
PRO NOW, and returns nothing at all below `MIN_SAMPLE` (8). The screen
shows a range, the band, and always the sample size.

Three choices in it are business decisions, not engineering ones, and
they are currently defensible defaults rather than answers:

- **The window** — `SAMPLE_WINDOW_DAYS = 90`. Trades freshness against
  sample size, and is the sort of thing a regulator asks about.
- **The minimum sample** — 8. Chosen so a "range" is not one or two
  people's opinions. The legal exposure of being wrong here is
  asymmetric: an under-confident silence costs nothing.
- **Geography** — currently none, because the pilot is one area. The
  moment there are two, "what people paid" has to mean "near you" or the
  comparison misleads in both directions.

Not open, and not up for discussion (/CLAUDE.md §3): the sample is PRO
NOW's own approved quotes and nothing else. No estimate, no seeded
"typical price per trade", no blend with an outside feed — /docs/10
forbids scraping and no price data has been licensed. Telling an Israeli
consumer a price is below market without a basis is a legal exposure as
well as a lie.

**Narrowed the same day, on Amit's second note:** *"אם זה עושה בעיות אז
אל. אני לא מחפש להיות הכי זול, מחפש להיות מהיר, הוגן, חדשני."*

The legal exposure was already handled by construction — no claim about
"the market", only what was paid here, silent below the minimum. What
was left was the FRAMING, and he is right about it: cheap-or-expensive
makes the product a price-comparison site.

So the engine still measures all three positions (ops will want them)
and the customer sees exactly one: a quote above what the work usually
costs, put as a question with the professional's own explanation one tap
away. Below and within show nothing at all — "מחיר טוב!" pushes
professionals downward, which is the opposite of wanting the best of
them, and it encourages choosing plumbing on price. `shouldPromptAboutPrice`
is where that line is kept, and tests assert each of the three silences.

Also worth recording, because it is the goal behind the original request
and no screen achieves it: *"מחיר נח לכל כיס עם מקצוענים מקסימום"* is a
supply-and-price-level strategy. Fairness is the part that can be built
without inventing a business rule.

### DECIDED 2026-09-30 (Dvir) — how a professional joins: faces, the street, new services, documents
Answers to D1–D4 of `docs/sync/SYNC-2026-09-30.md`:
- **D1 — faces.** A professional's photo is approved as it is, for now. Customers see
  the photo or, when that was the choice, the trade's drawn character. The customer the
  professional is sent to sees it on the match, tracking and review screens, and so does
  the person at the door on the on-site page. Before the match there is still no face.
- **D2 — the street.** The 3D street will be part of the product soon. The shop is
  stored now and is placed in the street when the city arrives.
- **D3 — services beyond our list.** On hold. We may not support proposing new services
  through the system at all.
- **D4 — documents per trade.** The research's list (`onboardingDocsFor`, Amit
  2026-09-29) is the product's rule for which documents are mandatory per service. The
  demo will apply it soon as well. This answers "mandatory documents per service" in
  Open Decisions.

### DECIDED 2026-09-29 (Dvir) — error tracking is Sentry, alerts go to Telegram
For the tester phase, the product stores errors in Sentry's free plan and
sends real-time alerts through a Telegram bot. Uptime is watched by
UptimeRobot's free plan. All three were chosen on cost (free) and on real-time
push to a phone. Both sit behind interfaces (`ErrorReporter`, `AlertNotifier`),
so a paid or self-hosted replacement is one adapter. How it works and how to
set it up: `docs/23-OBSERVABILITY.md`. Still open: whether production keeps
these vendors, and how long error data is kept (part of the data-retention
decision above).

### DECIDED 2026-09-29 (Dvir) — one branch and one PR per change; master merges only on green CI
Several agent sessions work at once, so no session commits to `master`
anymore. Each change gets its own worktree and branch, and lands as a PR
with auto-merge. `master` accepts a PR only when the `CI passed` check is
green on a branch that is up to date with it. Render deploys only green
commits. The procedure is in `docs/22-WORKING-MODEL.md §2`; the admin
applies the ruleset with `scripts/setup-branch-protection.sh`.

### DECIDED 2026-09-29 — the demo and the product are separate tracks
Amit works on the demo (`tools/design-preview`). Dvir works on the product
(`apps/*`, `packages/*`). Both land changes through pull requests (next entry). The two share no code:
the demo has its own forked copies in `tools/design-preview/lib/{ui,types}`,
and `npm run lint` enforces the split. The product catches up with the demo
on request, starting from the marker in `docs/DEMO-SYNC.md`. The full model
is in `docs/22-WORKING-MODEL.md`.

### DECIDED 2026-09-29 — two kinds of work, and what goes through the app

Amit: *"אין לי דרך לעקוף את זה שהוא ייתן הצעת מחיר במקום ואז יגידו לו עזוב
קח פחות במזומן."* So each service is priced one way only:

1. **Work priced only once somebody looks** (`VISIT_QUOTE`): plumbing (blockage,
   leak, tap), electrical (fault, socket/lighting), appliances (AC, fridge,
   washer, solar heater, gas), renovation trades (paint, tiling, drywall,
   carpentry, glass, sealing), garden, alarm/cameras, computer and phone repair,
   vet, handyman, a car that will not start, towing. **The app charges the
   visit-and-diagnosis fee, set by each professional, and nothing else.** The
   repair — its price and its payment — is agreed between the customer and the
   professional directly. The visit ends at the diagnosis
   (`DIAGNOSIS → COMPLETION_PENDING`, settlement `VISIT_FEE_ONLY`).
2. **Work priced by its kind** (`FIXED`, a price list): haircut, nails, makeup,
   massage, trainer, tutor, dog walk, dog grooming, pet sitting, cleaning,
   post-renovation cleaning, pest control, furniture, TV mounting, curtains,
   lockout, cylinder, car lockout, flat tyre, house-call doctor. Each
   professional sets a price for each kind of job; the customer picks from the
   list, sees that professional's price before accepting, and **the amount is
   held on the card and released to him after the customer confirms the work
   is done** (payment vendor still TBD — Open Decisions).
3. **Work priced before anybody sets off** (`quoteBeforeDispatch`, priced as
   `VISIT_QUOTE` with an approved quote): towing, small moving, post-renovation
   cleaning, painting, gardening, pest control. The customer describes and
   photographs (and, for towing and moving, where to); the call is offered to
   ONE professional, who answers with a price; the customer approves it on the
   match card and only then is he assigned. A declined price passes the call
   to the next professional — never several prices at once (no auction,
   /CLAUDE.md §3). The approved amount is held and released after completion.
   Server: the priced offer (price on the offer, customer approval before
   `PRO_ASSIGNED`) is not built yet — the preview simulates it.
4. `זוג ידיים` stays hourly; courier stays distance-based.

**No problem questions before calling.** The customer describes in words, a
recording or photos; the only choice left is, for price-list work, what to order
from the list. This supersedes the per-answer price tables of 2026-09-27 and,
for repairs, "an approved quote includes the visit fee" (the server still
supports quotes; the product no longer routes repairs through them).

### DECIDED + BUILT (demo) 2026-09-29 — how a professional joins

Amit: *"לא הכנו טופס הצטרפות… בלי זה אי אפשר לצאת לדרך."* Decisions (Amit):
- **A professional receives work only after PRO NOW approves him** — his documents, his
  details, and his ratings and reviews online.
- **Area:** a home radius as a default; when he goes online, calls follow his live location,
  anywhere — "זה כל הרעיון".
- **Prices:** he may add his own lines and services we did not think of — never limited to
  our list.
- **Money:** no commission or subscription is shown or decided now; a business plan will
  decide (registration fee vs. commission). Still TBD under CLAUDE.md §4.
- **Documents:** from research, not guesses — `tools/design-preview/research/reports/מסמכים
  נדרשים לבעלי מקצוע.md`. Legal licences are required per trade (electrician, gas, AC — new
  law 7/2025, pest control, vet, doctor, towing = recovery vehicle + driver permit, mobile
  garage for on-site tyre repair, work-at-height above 2 m); everyone gives ID, a selfie and a
  tax file (עוסק); third-party insurance and trade certificates are recommended. **No
  criminal-record certificate is ever requested** — demanding one is an offence in Israel.
  Open for a lawyer (17 questions in the report), notably whether police approval under the
  sex-offender law applies to tutors of minors on a platform.

Also decided (Amit, 2026-09-30): **someone already registered goes straight to his own page**
— customer or professional — with no explanation, character or joining again (demo: by phone
number, plus a "התנתקות" menu item to show it). **Everything required stays required, prices
included; only the shop's design may be skipped** ("דלג — אעצב את החנות אחר כך"), opening with
our defaults and a "לעצב את החנות" link on the open-shop screen.

Built in the demo (Amit's track): `ProOnboardingBody` (lib/ui) — welcome · "what you do" in
free text (the matcher ticks the services; custom services allowed) · details & radius ·
documents per trade (`onboardingDocsFor`, lib/types) with licence numbers for registries ·
prices per pricing kind with his own lines · his shop in our street (sign, logo → brand
colour, facade preview) · photo or trade character · summary → "sent" with the approval
steps. Reached from "אני מקצוען" (first time) and the menu's demo group. For the product
(Dvir): the registries that can be checked automatically are listed in the report
(data.gov.il: pest control daily with status, doctors, vets, garages, contractors).

### BUILT 2026-09-29 (preview) — the wait is alive, and every word belongs to its service

Amit, reviewing on his phone: the waiting screen was *"מסך מת שגם השעון לא זז"*, the
tracking map *"לא מספיק מרשימה"*, and words leaked between orders and trades —
"ציפורניים" in a towing request, a plumber's price lines on a tow, "סבא" on an order
placed for himself, "דמי ביקור" on quote-first work.

- **The drive, in our street.** While a professional is on the way, the waiting screen
  and the tracking map show the 3D street with his trade's van (tow truck, plumber's
  van…) leaving his shop and driving to a light where the customer lives, a camera
  following it, a chevron ribbon for the route (`City` prop `route`, `street.heroVan`,
  `RouteCity` in the preview). Progress is the share of the server's ETA that has
  passed — how far along, never a claimed position.
- **One live card instead of six controls** (`LiveEtaCard`): who is coming, an mm:ss
  countdown that ticks every second, arrival clock, progress line, safety as one small
  control. Under it an invitation to walk the city while waiting (`StrollInvite`, the
  customer's own walk cycle). Removed from that screen: the headline, the minutes tile,
  "העיר שלנו", the loose safety pill, "עקוב אחרי המקצוען", the map disclaimer.
- **The side switch left the header.** "מקצוען" at the top is gone; the demonstration's
  way across is the menu ("הצצה לצד המקצוען") and the demo bar during a live job.
- **One order's words belong to that order.** Text, photos, recording, destination and
  price-list picks are scoped to the service they were written for and to one request
  (`draftFor` in the preview). An address "for someone else" applies to one order.
- **Pricing words come from the pricing kind** — `pricingKindOf()` (LIST · VISIT ·
  QUOTE_FIRST · HOURLY · DISTANCE) and the trade's nouns from `visitTermsHe()` (a vet's
  "בדיקה/הטיפול", a tiler's "בדיקה ומדידה/העבודה", a plumber's "אבחון/התיקון"). Hebrew
  verbs agree with the professional's gender.
- **Per-trade quote lines** (`previewQuoteLines`, `quoteLinesFor`) for the six
  priced-before-dispatch services; never another trade's rows.
- **The consistency guard** — `packages/ui/test/catalog-consistency.test.ts` runs with
  every test run over all 47 services: money copy per pricing kind, trade words per
  service, price lines per trade, search by name and keyword. It found and fixed: search
  sending "ניקיון אחרי שיפוץ" to cleaning, "השגחה על חיית מחמד" to the vet, "תליית
  טלוויזיה ומסכים" to a courier, "מכונה" to cars; a car symptom on the home locksmith.
  The matcher now ranks a letter-for-letter word above a shared stem and rewards the
  service's full name.
- **Lust** opens as its new walk-in room (the city at its door, `enterShopId`), not the
  old picture page. **Another match** at a one-shop trade flies a loop down the street.
- Review agents in `.claude/agents/`: `ux-director`, `ux-copy-editor`, `consistency-guard`.

**Second round, from the agents' first review (same day):** minutes-first countdown with a
seconds sweep; his name tag over his van; a still of the street under the 3D view so it
never opens on an empty sky; the set-off animation opaque, in the pro's gender, with the
customer's own avatar at home; every tracking line, band and button chosen by the pricing
kind (hourly: rate and "השעון רץ"; delivery: "אספתי — יוצאים למסירה", "המשלוח נמסר",
fare = base + per-km over an EXAMPLE 6 km, `deliveryFare`, since the real distance needs a
maps vendor); example visit fees for every VISIT service; the vet no longer shows
hairdressers or a plumbing receipt; the pro's shift lists his own trade; the paid screen says
"סכום העבודה" (commission is still TBD); "זמן מובטח" removed (a guarantee is a business
promise nobody made); plural address to the customer; one-amount price form for
priced-before-dispatch work; the service page no longer asks for words twice.

**DECIDED (Amit, 2026-09-29): "(תצוגה)" is removed from example professionals' names.**
"תסמוך על העובדים… חד משמעית מסכים איתם." The preview declares itself a demonstration
in the demo bar ("הדגמה — לא חלק מהאפליקציה") and on the welcome, not inside every
sentence that names somebody. Nothing changes for production: real professionals are the
server's, and no example person ever reaches it. The example street plan says "מפת הדגמה"
once, readably, instead of a faint repeated watermark.

**UPDATE (Amit, 2026-09-29, later): back to the card + "טיול בעיר שלנו" card + "בינתיים" tiles.**
He tried the one-panel version, three alternative buttons and a menu-style list, and chose
the earlier layout ("זה יותר הכיוון… או לא לגעת כרגע, לא קריטי"). Kept from the rounds in
between: the calm (non-walking) avatar, pull-up/tap for job details, face-only pin over the
van, look-ahead traffic. The paragraph below is the superseded step.

**(superseded) DECIDED (Amit, 2026-09-29): the waiting screen keeps its top card; the rest is calmed.**
The design review counted eleven shapes and the minutes three times. Amit: the top card
(who, minutes, arrival, progress, safety) stays — "זה מה שהבן אדם רוצה לראות בבירור";
the rest was left to the team. So: over his van only his face (no number); the stroll
invitation and the "בינתיים" tiles merged into ONE drawer — a gold "טיול בעיר שלנו בזמן
ש… בדרך" button with the customer's own character breathing (no walk cycle: eight frames
of different sizes made it jump), two quiet links "מפת הרחובות ›" · "פרטי העבודה ›", and
pull-up (or tap) opens the job's details (what, price, where to, address). Traffic now
pulls out 18 m before a parked car instead of driving into it.

**DECIDED (Amit, 2026-09-29): two screens, two maps.** The main waiting screen is the 3D
street with his van driving home (`RouteCity`); "לעקוב אחרי …" is the street plan with the
vehicle on its route — framed so the vehicle AND the home are both on screen, a glowing
route, a pulsing "הבית שלך" pin, a "יוסי · 14 דק׳" chip — and no toggle between them.
Minutes lead on both. The stroll invitation is a live window: our shopfronts sliding past,
the customer's own character walking, a glowing "כניסה".

### BUILT 2026-09-28 (preview) — ordering for someone else, including the door

Amit's headline case: a plumber for grandpa, ordered and paid from the
grandson's phone. The address screen already took the name and number of the
person at home; now the rest of the visit knows about them:

- **The person at home** gets one text message with a link — no app, no
  account — to a page (`OnSiteBody`) that says who is coming, what was
  verified, when, and the single thing to do: ask for the door code before
  opening ("if he does not know it — do not open, call the orderer"). It says
  plainly that nothing is paid or approved at the door.
- **The professional** sees who is at the door and who ordered, and the code
  he must say (`ProJobBody.doorCodeHe`), and the address is the recipient's.
- **The orderer** sees "יוסי יצא אל סבא יוסף", a line on the waiting and
  tracking screens with what the person at home was sent, and keeps the
  quote, the approval and the payment.

Not built, and needed before production: sending the SMS (NotificationProvider
— vendor TBD, see Open Decisions), a short-lived signed link for the page, and
the door code issued by the server with the assignment (the preview shows one
fixed code).

**DECIDED 2026-09-28 (Amit): only the person who ordered approves.** The quote,
the approval and the payment belong to the orderer alone; the person at home is
never asked to approve or pay anything, and their page says so.

### BUILT 2026-09-28 — every shop in the street is a real shop

Amit: *"אני צריך שכל החנויות יראו כמו המספרה."* All fourteen houses now have
what the barbershop has: a straight-on facade whose window you can see into,
a room you walk into (back and side walls, floor, furniture), and the
professional standing in the open doorway on the order sheet. Drawn in the
chat (ChatGPT) one piece at a time and installed with `ingest-shop.mjs`; the
renovation and odd-jobs professionals, who wore photographs, were redrawn in
the illustrated style (`ingest-character.py`). The old drawings are kept in
`public/world/_retired/`.

### BUILT 2026-09-27 — a fixed or hourly price follows the customer's answers

Amit: *"באיפור היה 350 שקל לא משנה מה בחרתי."* A fixed or hourly service now
carries a price table keyed by its own intake answers
(`packages/ui/src/catalog/choicePrices.ts`): the kind of job sets the price,
extras add to it, "how many" multiplies it; for hourly work the answers
estimate the hours. The customer sees the price move as they answer, and the
same figure reaches the match card, the professional's offer and "מתחיל לעבוד".
The tables are the preview's **example price list** — professionals set their
own prices (below), and a professional's own base scales the whole table. How
a professional edits a per-answer price list is still to design; the server
has no such table yet. Visit-and-quote services are untouched on purpose: the
only price before the visit is the visit fee.

### BUILT 2026-09-27 — free-text search understands everyday Hebrew

Amit typed *"נחנחק לי החתול"* and the app said it did not understand. The
matcher (`service-match.ts`) now reads words in any form (particles, endings),
forgives one slipped letter, scores by how much of the sentence a service
explains, and searches every service's symptoms and a much larger vocabulary.
Where it still finds nothing, the preview asks Claude to read the sentence for
meaning (only when framed inside Claude; ids from our own list only), and
otherwise opens the full list — never a dead end. A life-threatening sentence
about a person shows "חייגו למד״א 101" above any service; about an animal, one
line pointing to an emergency vet as well. In production the fallback
classifier is a server feature, not yet built.

### DECIDED 2026-09-27 — "available in XX minutes" is availability; future booking is the next stage

Amit, from tester feedback: a professional finishing another job can mark
**"פנוי בעוד XX דקות"** (15/30/45/60). To the customer he counts as
available now: he is offered, the card says "פנוי בעוד 30 דק׳", and the wait
is inside the arrival time (wait + travel) — nobody is told ten minutes.
When the time comes he is on shift without pressing anything. Built in the
preview (`ProShiftBody.availableAtMs`, `MatchSheet.availableInHe`); the server
side is a presence field and a dispatch-eligibility rule, not yet built.

Future booking was discussed and **deferred on purpose**. The MVP stays
NOW-only (§3 of CLAUDE.md). The agreed next stage is "request for a later
time": the customer picks a date and hour and sends it; professionals in the
area accept if it suits them; the customer sees who accepted and confirms.
It needs no calendar from professionals and invents no availability. A full
availability calendar was rejected for now: it adds work for professionals
and moves away from "now", which is the product's edge.

### DECIDED 2026-09-27 — the preview demonstrates every service

Amit: *"שיהיה אפשר לעשות הדגמה על כל חלקי האפליקציה — שלא יבחרו משהו לדוגמה
ואז לא יעבוד."* The browser preview (`tools/design-preview`) opens every
service for ordering — the pilot ones, the booked-for-later ones and the
licensed ones (`demoOpenServiceIds`). This is a demonstration setting in the
preview only: the catalogue's `activationStatus` is unchanged, the apps and
the server still refuse them, and each still needs its decision before it is
real (verification policy for personal-contact services, the request-for-later
stage for scheduled work, licences for gas/doctor/vet/towing).

### DECIDED 2026-09-26 — each professional sets their own visit fee

Amit, answering a tester who asked of the figure on the service page
*"של מי המחיר? לבעלי המקצוע יש מחירים שונים"*: **each professional
decides** ("כל אחד מחליט"). So the service page and the catalogue tiles
say "דמי ביקור לפי המקצוען" and name no figure (`priceExplainer(…,
{ stage: "service" })`, `catalogAdapter.priceHint`), and the fee is shown
on the person — the match sheet and the match confirmation — before the
customer accepts. Not bounded either (Amit, same day): *"לא מגבילים כל
אחד לעצמו, ברגע שנראה שמישהו גונב ומרמה נחסום אותו"* — no floor or
ceiling; abuse is a trust-and-safety matter handled by blocking the
professional. Still open: where the professional sets the fee
(`ProPricingBody` exists as a screen; the server field does not).

### DECIDED 2026-09-26 — an approved quote INCLUDES the visit fee

Amit: *"דמי ביקור מתקזזים מהתיקון, אם מאשרים הצעת מחיר זה יהיה כולל."*
This is the REPLACING reading below, which `settlement.ts` and
`pro-jobs.ts` already implement. The screens now say it: the service page
and match sheet ("אם תאשרו הצעת מחיר — הם כלולים בה"), the approval total
("כולל מע״מ ודמי הביקור"), and the professional's quote builder ("דמי
הביקור כלולים בהצעה"). A customer who declines the quote owes the visit
fee alone.

### (resolved above) — does an approved quote replace the visit fee or add to it?

`settlement.ts` reads it as REPLACING. `/docs/02-UX-FLOWS.md` C12 shows
the customer a quote with its own total and asks them to approve it, and
charging that total plus a fee agreed earlier would make the approval
screen a lie. `pro-jobs.ts` already tells the professional their earnings
the same way, so the two agree.

The other reading — a visit fee always payable, with approved work on top
— is a legitimate trade practice and a one-line change in each place. It
is a pricing decision rather than a bug, and it is worth being deliberate
about before anybody is charged under either.

### TBD — how long a customer waits before being told nobody is coming

`DISPATCH_SEARCH_DEADLINE_SECONDS`, added 2026-09-22 with the offer-expiry
fallback, currently defaults to **300 seconds**. Until then the server
keeps walking down the ranked list and re-checking the market; after it,
the job is cancelled by SYSTEM with `NO_PROFESSIONAL_AVAILABLE` and the
customer is told the truth.

Five minutes is a starting point, not an answer. It is the moment this
product either keeps a promise or breaks one, it interacts with the
support SLA (also TBD), and it is plainly a business call rather than an
engineering one — so it is a number in config, recorded here, and not a
decision the codebase claims to have made.

### The one that is blocking a real complaint, with the numbers

Amit, on the artifact: *"איפה כל הדברים של כל המקצועות? למה אין, ולא קיים
בקטלוג?"* He is right that it feels thin, and "which services to add" is
on the list above — each one needs a pricing model, a typical duration,
the credentials it mandates, and a judgement about whether it belongs in
a NOW marketplace at all. None of that is an engineering answer.

What IS an engineering answer is the shape of the problem, so the decision
takes a minute instead of an evening. 47 services today, and the imbalance
is the whole story:

| Front door | Services |
| --- | --- |
| לבית | 25 |
| ניקיון | 4 |
| רכב | 4 |
| חיות | 4 |
| ביוטי ושיער | 3 |
| בריאות וכושר | 3 |
| הובלות ומשלוחים | 2 |
| מחשבים וסלולר | 2 |

Half the catalogue is behind one door. A customer who taps "מחשבים
וסלולר" sees two rows and closes the app; a customer who taps "לבית" sees
a wall. Both are the same decision not yet made.

Adding one is a single entry in `packages/types/src/pilot-catalog.ts` —
name, pricing model, typical minutes, required credentials — and the home
grid, the category page, the sentence matcher and the professional's
eligibility list all pick it up, because they are all derived from that
one file. `content-completeness.test.ts` refuses a half-written entry, so
a service cannot be added without the fields that make it work.

### The maps vendor, with the numbers (asked 2026-09-21)

Amit: *"ברגע שיהיה חיבור לספק המפות נוכל לעשות הדמיות אמיתיות? במקום בתים
אמיתיים יהיו את המבנים והדמויות שלנו? ורק הצורה של המפה תהיה אמיתית? כמה
זה עולה? איך מתחברים?"*

**Yes, and it is the normal way to use these products.** A modern map is
vector tiles — roads, water, parks, land use, building footprints, labels
— each as its own layer, plus a STYLE that says how each layer is drawn
or whether it is drawn at all. So the real street geometry can stay while
the built environment is replaced with ours: building layers switched
off, our shopfronts placed at real coordinates as symbol layers, parks
and water kept in their true shapes and recoloured to our palette,
figures moving along the real street network. That is a style and a
sprite sheet, not a custom renderer.

Published prices, read on 2026-09-21 — they move, so re-check before
deciding:

| | Free per month | Then |
| --- | --- | --- |
| Mapbox Maps SDK (mobile) | 25,000 monthly active users | $4.00 / 1,000 MAU to 125k, $3.20 to 250k, $2.40 above |
| Mapbox Directions | 100,000 requests | $2.00 / 1,000 to 500k |
| Google Maps dynamic maps | 10,000 map loads | $7.00 / 1,000 to 100k, $5.60 to 500k |
| MapLibre + a tile vendor or self-hosted | — | hosting; the renderer is open source and the style is entirely ours |

The shapes of those two bills are different in a way that matters for
this product. Mapbox charges per PERSON per month however many times they
open the map; Google charges per map LOAD, and in a dispatch product one
customer watching one job is many loads. At 50,000 customers a month
Mapbox is about $100; the same traffic on per-load pricing is not
comparable in kind, so the estimate has to be built from expected loads
per job rather than from users.

Connecting is small and is already scaffolded: `MapsRoutingProvider` in
`packages/types` is the interface, the sandbox adapter is what runs
today, and a real vendor is an account, a token in `.env` (never
committed) and one adapter. The work is not the integration.

**Two things that are NOT engineering and must be decided first.** Which
vendor, which is on the list above and stays there. And the fact that the
moment our shops sit at real coordinates, the map starts making claims
about WHERE professionals are — today the city is honest precisely
because it is labelled an illustration and its positions are invented
(/CLAUDE.md §3). On a real map every position drawn must come from the
server and must be true, and "approximate area" has to be a deliberate,
designed answer rather than a blurred marker.

### And then it was built without the vendor (2026-09-21, same day)

Amit, an hour later: *"אני רוצה לחבר מפה אמיתית שונראה איך העולם שלנו
והקוד שלנו יושב עליה אולי יהיה יותר קל לשים את החנויות והדמויות על מפה
אמיתית"* — and *"ואני רוצה שאתה תעשה הכל!!!!"*

The answer above still stands for every word of it EXCEPT the assumption
in the first sentence, which was mine and not his: that a real map means a
tile vendor. Re-read his own earlier question and the specification is in
it — *"ורק הצורה של המפה תהיה אמיתית"*. The SHAPE. Not the pictures.

So what is real is the GEOMETRY, and geometry is a file:

- `packages/types/src/world-geo.ts` — an extract (real ways, areas and
  bounds) plus a Web-Mercator projection into the `{u,v}` every venue,
  route, walker and camera in this codebase already speaks. Swapping what
  `{u,v}` MEANS moves the entire city at once; that is what the last month
  of putting every position into one coordinate system bought.
- `packages/ui/.../GeoPlate.tsx` — the extract drawn in `livingPalette`.
  Our night, our asphalt, our lane markings, on real street centrelines.
- `tools/design-preview/fetch-geo.mjs` — Overpass → extract, run once,
  committed, dated, attributed. `npm run verify:geo <file>` is the gate.

Three things this buys that a tile layer does not:

1. **No vendor decision** (/CLAUDE.md §4). A tile URL in a config file is
   that decision taken quietly; an ODbL extract is not. The vendor table
   above stays open, and `MapsRoutingProvider` is still the seam for the
   thing a vendor is actually needed for — geocoding and route ETAs.
2. **The shops place themselves.** `plotSpotsFromGeo` finds real building
   plots that front a real street, stands each shopfront a pavement's
   width off the kerb and faces it at the road. `PLATE_SPOTS` took three
   rounds of bitmap erosion and two of those rounds answered the wrong
   question. This is exactly the *"יותר קל לשים את החנויות"* Amit guessed
   at, and he was right.
3. **Sizes become true.** A real extract has metres in it, so a shopfront
   is 16m and a person is 1.7m rather than fractions chosen by eye — and a
   camera shot is a number of METRES across the frame (`SHOT_METRES`)
   rather than a fraction of whatever the ground happens to be.

The §3 consequence in the paragraph above is not softened by any of this
and is the other half of the change: `packages/types/src/geo-truth.ts`
gives every plotted position a provenance, refuses `DECOR` on a real
surface, refuses a NAME on a real surface without a server behind it, and
rewrites the city's disclosure line — on real streets it says *"הרחובות
אמיתיים · העסקים בתצוגה הם המחשה ולא כתובות"* rather than promising a maps
provider that has become unnecessary. `WorldBackdrop` drops its ambient
traffic and its district signage the moment an extract is present. A real
map costs the world its invented crowd; that is the price and it is paid.

**What is still open**: the vendor question above, unchanged, for
geocoding and route ETAs. And the extract itself — every OSM host is
refused by this container's egress proxy (organization policy), so the
fetch runs on Amit's machine. A synthetic fixture (`real: false`,
watermarked, refused by `plotViolations` as a place) proves everything
downstream of it offline.

## MVP success — two levels
**Technical:** stable end-to-end loop, safe atomic assignment, payment
integrity, trust gating, recovery from every edge case in
`/docs/15-QA-TEST-PLAN.md`.
**Pilot marketplace:** high eligible-supply/match rate, acceptable time-to-
match/ETA, real provider earnings opportunity, completion and repeat
behavior, manageable incident/support rate. No KPI threshold is frozen
before a real pilot baseline exists.

## Final development principle
When there is tension between adding features and making NOW reliable,
choose NOW reliability. The MVP wins when a verified professional can
safely go online, a real nearby customer can request a supported service,
the system reliably matches them, both sides know what's happening, the
professional gets paid correctly, and the marketplace immediately knows the
professional is available again. Everything else is secondary until this
loop works repeatedly in the real world.
