# PRO NOW — Current state and handoff (read this first)

Last updated 2026-10-01. Who we are, where things are, how we work, what is
next. Product decisions live in `docs/18-ROADMAP.md`; the product's epics in
`docs/21-PRODUCTION-PLAN.md`; older history in `git log`.

---

## 1. Who is who

**The working model is `docs/22-WORKING-MODEL.md` (decided 2026-09-29). Read it first.**

- **Amit** is the owner of PRO NOW: product manager and founder. He works
  on **the demo** (`tools/design-preview/**`): he keeps making the product
  script more accurate and expanding it. He is **not a programmer and speaks
  Hebrew only**, so every answer to him is in Hebrew, short, and free of
  jargon. His standing preferences are in §6.
- **Dvir (דביר)** is a senior backend engineer (7 years at Lemonade). He
  works on **the product** (`apps/**`, `packages/**`): he turns the demo
  into production-ready software (`docs/21-PRODUCTION-PLAN.md`) and then
  keeps it caught up with the demo. He writes in **English**; answer him in
  English, technically and precisely.
- **The demo and the product share no code.** The demo has its own copies
  in `tools/design-preview/lib/{ui,types}`, and `npm run lint` enforces the
  split. `docs/DEMO-SYNC.md` records the last demo commit the product has
  accounted for.
- **Who is typing:** Amit writes Hebrew and commits as `nivamit1210-sketch`;
  Dvir writes English and commits as `Dvir Baumel`. If it is unclear, ask.
  In an Amit session, never edit `apps/` or `packages/`.

## 2. Phase and goal

- **Now: a browser demo for fundraising.** The demo must work end to end
  for every service, look alive, and be demonstrable in every part.
- **After fundraising:** App Store / Play, real backend deployment, and the
  vendor decisions (payments, KYC, SMS, hosting). The web app and API are
  live at https://pro-now.onrender.com for friends to test (see §3).
- The product rules in `CLAUDE.md` still govern everything: NOW-first, real
  supply only, server-authoritative, and no invented business decisions
  (§4 there).

## 3. What exists and where

| Thing | Where | State |
|---|---|---|
| **The demo** (what investors see) | `tools/design-preview` → published as a Claude Artifact: https://claude.ai/artifact/7YRPcVfEuhVCmcK3PKVeJW (see the version in the last commit message; "anyone with the link") | Static bundle, **no backend**: fixtures in the bundle, the customer↔pro loop simulated client-side. Every one of the 47 services passes the full flow to payment (`qa/pp_all.mjs`). |
| **The real app** (Dvir's track) | `apps/web` (React 19 + react-native-web, the demo's screens) on `apps/api` | W0–W11 done (`docs/21`). **Production: https://pro-now.onrender.com** (Render; state and open items in `docs/16 §Production`; check it with `npm run smoke:prod`). Run locally: `docker compose up -d`, then `npm run dev:app` → http://localhost:5180 (emails: http://localhost:8025). Tests: `npm run test:int`, `npm run test:e2e` (Chromium at iPhone 16 Pro size), `npm run parity` (vs the demo). |
| API | `apps/api` (Fastify, Prisma, Postgres 16 + PostGIS; Redis optional) | Served with the web app at https://pro-now.onrender.com. Local stack: `docker compose up -d` (PostGIS on :54320, Mailpit :8025, S3 :8333, mock OIDC :8089), `cp .env.example apps/api/.env`, `npm run db:migrate:deploy -w apps/api && npm run db:seed && npm run dev:api`. |
| Mobile apps | `apps/customer-mobile`, `apps/pro-mobile` (Expo) | Typecheck clean. **Never built for a device.** |
| Admin | `apps/admin` (Next.js 14) | About 320-line scaffold: KPI page with labelled demo figures, and a job inspector that fetches the API. **No auth/RBAC yet.** |
| Shared logic | `packages/types` (domain, catalogue, state machines, pricing), `packages/ui` (the product's screens). The demo has its own fork in `tools/design-preview/lib/{ui,types}` since 2026-09-29 | Tested 2026-09-29: types 726, ui 453, api 262, validation 18; the demo's copies run the same 726 + 453. |
| Films (customer / pro / business) | `~/Desktop/PRO NOW - סרטונים/` (mp4). Code: `tools/design-preview/film/` | Recorded from the demo. They **predate** the 2026-09-28 shops, search and pricing work, and should be re-recorded. |
| NDA draft (Hebrew, .docx) | `~/Desktop/PRO NOW - הסכם סודיות.docx` | A draft, not legal advice. Blanks: parties, term in years, court district. |
| Git | Private GitHub repo `nivamit1210-sketch/pro-now` | Every change lands as a PR with auto-merge once `CI passed` is green (`docs/22 §2`). |

## 4. How to work on the demo

**Run and check it locally**
```bash
npm run preview:build                         # builds tools/design-preview/dist
cd tools/design-preview && npx vite preview --port 4421 --strictPort --host 127.0.0.1
```

Useful URL params:
- `?time=day|night` pins the city's lighting. By default it follows the phone clock: day from 06:00 to 18:00.
- `?city=1&x=<x>&z=<z>` spawns you in the 3D street.
- `?city=1&fly=<shopId>&found=4` plays the search flight.
- `?hd=1` loads the full-size art.

**QA tools** live in `tools/design-preview/qa/`. Run them from that folder with
`PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
Screenshots go to `qa/out/`.
- `node pp_all.mjs "<category tile>" "<service>"` runs the whole customer↔pro loop for one service.
- `zsh all47b.sh` runs all 47 services. **Run it sequentially, never in parallel**: parallel runs flake under load.
- `node shops.mjs <x> <z> <name>` walks up to a shop, enters, and opens its menu. `shopcheck.mjs` also takes the street and interior shots.
- `onsite.mjs` covers the "order for someone else" flow, `price.mjs` / `price_flow.mjs` check that the price follows the answers, and `search.mjs` checks free-text search.
- `allreqs.mjs` lists every file the app requests. Use it before a publish to decide what must be uploaded.
- `crawl.mjs` presses every button on every reachable screen (`MAX=600 WORKERS=3`) and writes `out/results.json`.
  On 2026-09-29: 600 presses, 83 screens, 0 errors. The "dead" ones were file pickers, and sheets that are intentionally modal.
- `media.mjs` checks that photos and a voice note reach the professional. `deny.mjs` covers recording without mic permission and the menu toggle. `protabs.mjs` covers the pro tabs.
- `SHOTS=<tag> node pp_all.mjs …` takes a screenshot at every step. `python3 sheet.py <tag>` turns them into a contact sheet.
- `W=<tag> node waiting.mjs "<tile>" "<service>"` photographs the on-the-way screen over time, scrolled, and the tracking map.
- Switching sides in scripts: the header has no "מקצוען" button any more. Every script's `press(/^מקצוען$/)` goes through a wrapper that uses the demo bar ("הצצה לצד המקצוען") or the menu.

**The consistency guard (run it after any catalogue, copy, price or search change)**
- `cd tools/design-preview/lib/ui && npx vitest run test/catalog-consistency.test.ts` — all 47 services: money words per pricing kind (`pricingKindOf`), trade nouns (`visitTermsHe`), no other trade's words in a service's price lines / prompts / symptoms, search finds each service by its name and every keyword. It runs inside `npm test` too.
- Review agents live in `.claude/agents/`: **`ux-director`** (screenshots every screen, ranks fixes), **`ux-copy-editor`** (Hebrew copy per service and pricing kind, gender agreement), **`consistency-guard`** (runs the guard and the end-to-end runs, reports or fixes). In a session where they are not listed as agent types, run `general-purpose` with "follow `.claude/agents/<name>.md`".

**Publishing to the artifact**
- Build, then publish `tools/design-preview/dist/index.html` to the URL above with `root` = the `dist` folder and a `files` map.
- Upload only what changed: usually the new `assets/index-*.js` plus `null` for the previous bundle, plus any new or changed images.
- The capability `sample` is carried forward automatically.
- **Hard limit: 512 files per artifact version.** It sits around 509 now. The shop rooms added on 2026-09-28 are published only in the phone edition (`world/s/`). The city falls back `m/ → s/` on desktop.
- Always simulate the published set before publishing: block the files that aren't uploaded and check the city loads.

**Art pipeline (shops and characters)**
1. Generate in ChatGPT through Claude in Chrome, in the chat thread named "יצירת חזית Lust".
   - Per shop, generate 7 images: `<id>_street` (1254², on #00FF00), `_wall_back`/`_left`/`_right` (1536×1024, straight-on), `_floor` (1254²), `_props` (4 separate items on #00FF00), and `_venue` (1024×1536, facade with the pro in the door, on green; upload the character as a reference).
   - Type the prompt as a **single line**, because a newline sends the message.
   - Ask for **no real brand logos**.
   - Download images through a blob `<a download>` in the page.
2. `node ingest-shop.mjs ~/Downloads/shop_<id> <id>`. It keys out the green, splits the props, trims green hems off the walls, and retires the old height maps.
3. Measure the window on the facade with `qa/grid.py`, then add a `SHOP_WINDOWS` entry in `src/city/street.ts`, add the id to `BUILT_ROOMS` (with the prop count) and `VENUE_READY` in `src/city/City.tsx`, and extend the `_height` regex.
4. `node make-light.mjs` generates the `m/` and `s/` editions. Add the new `s/` rooms to `src/city/phoneFiles.json`.
5. Characters: `python3 ingest-character.py <png> <id>` writes `character_<id>_world` and `_icon`.

**City gotchas**
- Shops in the 3D street sit about 4 m from their roster `z` (the doorway of `auto` is at z ≈ -4, not 0).
- "Places" (dog park, pull-in bay, courier point, garden, bench) sit 8.8 m from shop doors. In front of a shop's frontage, the shop's "היכנס" wins.
- Rooms are `boxRoom.ts`: walls, floor, props, a procedural ceiling with downlights and cove light, and props that fade when the camera is inside them.
- Street cut-outs (trees, parked vehicles) hide when the camera passes through them.

## 5. Recent work (details in `docs/18-ROADMAP.md` and `docs/21-PRODUCTION-PLAN.md`)

- **Demo, 2026-10-01 (Amit's track), published as one version before a live presentation:**
  - Professional's join: free text recognises the trade, with autocomplete. Prices are his own and every line is editable. The join ends in his own shop: his sign with PRO NOW above his name, in his colour.
  - Identity check: date of birth (18+), ID card, then face straight/right/left; a person decides in admin and the photos are deleted on decision. Without it and the required documents nobody is approved for work.
  - Customers find his shop by searching inside the 3D city. Every customer back button now goes back.
  - Ordered for someone else: even a repair is quoted in the app (photo plus written findings) to the person who ordered, who approves and pays there. The person at home only gets SMS: the door code, then "עמית אישר ושילם".
  - The customer's name is עמית.
  - Details are in `docs/18-ROADMAP.md` (2026-10-01 entries).
- **Product (Dvir's track), up to 2026-10-01:** W0–W11 are done — accounts,
  the web app, addresses, media, request understanding, the customer's and the
  professional's flows on real data, admin, realtime and push, hardening, and
  the `/world` neighbourhood. Demo catch-ups of 2026-09-30 and 2026-10-01 are
  shipped except the items open in `docs/DEMO-SYNC.md`. No money moves in the
  app (D1): the customer pays the professional directly.
- **Rules worth knowing by heart:** each pro sets their own visit fee (no floor
  or ceiling); an approved quote includes the visit fee; repairs are charged
  only the visit-and-diagnosis fee, price-list work is held and released after
  completion, and some work is priced before dispatch ("two kinds of work");
  only the person who ordered approves and pays; "פנוי בעוד XX דקות" counts as
  availability; the next stage is "request for a later time", with no pro
  calendar.

## 6. Working with Amit (standing preferences)

- **Hebrew only**, plain words, short. While working on long tasks, give a one-line Hebrew status update now and then.
- **When he says "talk to me before acting", propose first and wait.** He has also given blanket approval for long autonomous runs ("יש לך אישור להכל"). Still confirm pushes, publishing anything new outward, and anything irreversible.
- Show before publishing when he asks to see first. Otherwise publish to the same artifact URL and tell him the version.
- Never invent a business, legal or vendor decision. Build an interface, mark it TBD, and ask.
- Everything "alive and bright". No robotic narration in films. Don't send redundant videos.
- Report honestly what was **not** checked. For example, a real iPhone has never been tested; ask Amit to try the link on his phone.

## 7. Open items and suggested next steps

1. **Production** (`docs/16 §Production`): Brevo keys for email sign-in, Google sign-in keys,
   Amit's iPhone pass, an uptime monitor.
2. **Next demo catch-up** from the marker in `docs/DEMO-SYNC.md` — the
   2026-10-01 demo work (several orders, the repair quoted to the orderer;
   the identity check is shipped) is waiting.
3. **Re-record the three films** so they show the new shops, search,
   pricing, joining and ordering for someone else.
4. **"Request for a later time"**, the agreed next stage.
5. **Per-professional price lists** (sync item D; the design needs Amit).
6. **Remove the remaining real-brand logos** in the appliance lab art.
7. **Repository hygiene:** Git LFS or a bucket for art (1,300+ binaries in
   git), and splitting `tools/design-preview/src/App.tsx`.
8. **Before real money or real users:** the vendor decisions in
   `docs/18-ROADMAP.md §Open decisions` (payments, KYC, SMS, routing).
