# Virtual World for Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a product-owned Three.js virtual world to `apps/web` that supports ambient city scenes, free-roam shop exploration, search/reveal, and assigned-job route play using real product data.

**Architecture:** `apps/web/src/world` owns the browser/WebGL runtime, scene composition, camera, input, asset manifest, and accessible DOM overlay. Pure job/movement rules reuse existing `@pro-now/types` helpers; `Home` and `Job` remain the hosts and the API remains authoritative.

**Tech Stack:** React 19, TypeScript, Vite, Three.js 0.160, React Router, TanStack Query, Playwright, Vitest, existing `@pro-now/ui` and `@pro-now/types`.

**Spec:** `docs/superpowers/specs/2026-09-30-virtual-world-web-design.md`

## Global Constraints

- Scope is `apps/web` only; native mobile and professional-side 3D are out of scope.
- Never import, symlink, or runtime-depend on `tools/design-preview` source, fixtures, or packages.
- The server remains authoritative for job status, assignment, professional identity, ETA, pricing, and completion state.
- The illustrated vehicle route is temporal progress from server ETA facts, never a real GPS coordinate or exact map claim.
- Hebrew RTL is the primary UI direction; every world action has an accessible DOM path.
- A missing ETA, match, interior, asset, or WebGL capability produces an honest stationary/disabled/fallback state, never invented supply or data.
- No database migration, new API route, payment/auth redesign, routing vendor, or exact-location visualization is included.
- Preserve unrelated working-tree changes in `docs/21-PRODUCTION-PLAN.md`, `render.yaml`, and `.idea/`.

## Review Focus

- Missing match data must not render a professional, rating, vehicle, or ETA; test in Task 1 and Task 7.
- Null or stale ETA must leave the route vehicle stationary/unknown; test in Task 1 and Task 7.
- WebGL failure and reduced motion must preserve semantic service/job actions; test in Task 3 and Task 8.
- A visible shop without an interior must not open a fake room; test in Task 4 and Task 6.
- Refresh or socket loss must reconstruct the server-backed mode through REST; test in Task 7 and Task 8.

---

### Task 1: Define the world model and pure state controller

**Files:**
- Create: `apps/web/src/world/types.ts`
- Create: `apps/web/src/world/worldController.ts`
- Create: `apps/web/src/world/worldController.test.ts`
- Create: `apps/web/src/world/index.ts`
- Modify: none

**Interfaces:**
- Consumes: `JobState`, `JobMatchView`, `EtaView`, `DepartmentCode`, `routeAt`, and `routeProgress` from `@pro-now/types`.
- Produces:
  - `WorldMode = "AMBIENT" | "EXPLORE" | "SEARCH" | "ROUTE" | "FALLBACK"`.
  - `WorldJobInput = { status: JobState | null; match: JobMatchView | null; departmentCode: DepartmentCode | null; nowMs: number; reducedMotion: boolean }`.
  - `WorldRouteModel = { moving: boolean; progress: number | null; eta: EtaView | null; departmentCode: DepartmentCode | null }`.
  - `WorldMoveCommand = { x: number; z: number; sprint: boolean }`.
  - `WorldTrade = { shopId: string; departmentCode: DepartmentCode; nameHe: string; services: readonly { id: string; nameHe: string; descriptionHe?: string | null }[]; interiorAssetId: string | null }`.
  - `WorldSceneModel = { mode: WorldMode; departmentCode: DepartmentCode | null; avatarNo: number | null; shopId: string | null; route: WorldRouteModel | null; trades: Readonly<Record<string, WorldTrade>> }`.
  - `worldModeFor(input: WorldJobInput | { kind: "ambient" | "explore" | "fallback" }): WorldMode`.
  - `worldRouteFor(input: WorldJobInput): WorldRouteModel`.

- [ ] **Step 1: Write failing controller tests.**

```ts
const matchWithEta = (etaSeconds: number | null, computedAtMs = 0): JobMatchView => ({
  jobId: "job-1",
  status: "PRO_EN_ROUTE",
  serviceNameHe: "תיקון בבית",
  professional: {
    id: "pro-1",
    displayName: "מקצוען",
    profilePhotoUrl: null,
    verifications: [],
    proNowCompletedJobs: 0,
    proNowRatingAverage: null,
    proNowRatingCount: 0,
    externalReputation: null,
  },
  eta: etaSeconds === null ? null : { etaSeconds, distanceMeters: null, isRouteBased: false, computedAt: new Date(computedAtMs).toISOString() },
  price: { priceModel: "VISIT_QUOTE", currency: "ILS", visitFeeMinorUnits: 100 },
});

it("does not show a professional before match data exists", () => {
  expect(worldModeFor({ status: "PRO_ASSIGNED", match: null, departmentCode: "HOME", nowMs: 0, reducedMotion: false })).toBe("SEARCH");
});

it("holds assigned work at the route start until it is en route", () => {
  const route = worldRouteFor({ status: "PRO_ASSIGNED", match: matchWithEta(600), departmentCode: "HOME", nowMs: 1000, reducedMotion: false });
  expect(route.moving).toBe(false);
  expect(route.progress).toBe(0);
});

it("uses server ETA facts and clamps progress", () => {
  const route = worldRouteFor({ status: "PRO_EN_ROUTE", match: matchWithEta(600, 0), departmentCode: "HOME", nowMs: 700_000, reducedMotion: false });
  expect(route.progress).toBe(1);
});

it("keeps the vehicle unknown when ETA is null", () => {
  const route = worldRouteFor({ status: "PRO_EN_ROUTE", match: matchWithEta(null), departmentCode: "HOME", nowMs: 0, reducedMotion: false });
  expect(route.progress).toBeNull();
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npm run test --workspace=@pro-now/web -- src/world/worldController.test.ts`

Expected: FAIL because the world module and functions do not exist.

- [ ] **Step 3: Implement the pure mapping.**

Use `scenePhaseForJob` for search/assigned classification. Require non-null
`match` before returning route mode. For an ETA snapshot, call:

```ts
const progress = routeProgress({
  etaSecondsAtAssignment: eta?.etaSeconds ?? null,
  etaSecondsNow: eta?.etaSeconds ?? null,
  nowMs,
  etaReadAtMs: eta ? Date.parse(eta.computedAt) : undefined,
});
```

Return `progress: 0` for `PRO_ASSIGNED`, `progress: null` for missing ETA,
and `moving: true` only for `PRO_EN_ROUTE`. Never add latitude/longitude to
the returned model.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npm run test --workspace=@pro-now/web -- src/world/worldController.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/world
git commit -m "feat(web): define virtual world state model"
```

### Task 2: Add Three.js and establish the typed asset boundary

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json` (generated by npm)
- Create: `apps/web/src/world/assets.ts`
- Create: `apps/web/src/world/assets.test.ts`
- Modify: `apps/web/public/world/**` only for missing files confirmed by the asset inventory

**Interfaces:**
- Consumes: existing files under `apps/web/public/world` and the demo asset inventory as a reference only.
- Produces:
  - `WORLD_ASSETS: Readonly<Record<WorldAssetId, string>>`.
  - `WorldAssetId` string union for city ground, district, character, vehicle, shop, and interior assets.
  - `worldAssetUrl(id: WorldAssetId): string` returning `/world/<literal-file>`.
  - `WorldSceneHandle = { update(model: WorldSceneModel): void; move(command: WorldMoveCommand): void; dispose(): void }`.

- [ ] **Step 1: Add the dependency with the workspace package manager.**

Run: `npm install --workspace=@pro-now/web three@0.160.0 @types/three@0.160.0`

Expected: only `apps/web/package.json` and the matching lockfile dependency
entries change; no demo package is added to the web app.

- [ ] **Step 2: Write the failing manifest test.**

```ts
it("maps every required world id to a literal public asset", () => {
  for (const [id, file] of Object.entries(WORLD_ASSETS)) {
    expect(worldAssetUrl(id as WorldAssetId)).toBe(`/world/${file}`);
    expect(file).toMatch(/\.(webp|png|jpg)$/);
  }
});
```

- [ ] **Step 3: Implement the literal manifest and inventory missing web assets.**

Copy only missing production assets into `apps/web/public/world`; do not
import from `tools/design-preview` at runtime. Keep every asset path literal
so Vite and the browser cache can validate it.

- [ ] **Step 4: Run the focused asset test.**

Run: `npm run test --workspace=@pro-now/web -- src/world/assets.test.ts`

Expected: PASS and no missing-file assertion.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/package.json package-lock.json apps/web/src/world/assets.ts apps/web/src/world/assets.test.ts apps/web/public/world
git commit -m "feat(web): add virtual world assets"
```

### Task 3: Build the renderer lifecycle and capability fallback

**Files:**
- Create: `apps/web/src/world/worldCapabilities.ts`
- Create: `apps/web/src/world/worldCapabilities.test.ts`
- Create: `apps/web/src/world/WorldCanvas.tsx`
- Create: `apps/web/src/world/WorldCanvas.css`
- Modify: `apps/web/src/world/index.ts`

**Interfaces:**
- Consumes: `WorldMode`, `WorldRouteModel`, `WorldAssetId`, and a scene factory.
- Produces:

```ts
export interface WorldCanvasProps {
  mode: WorldMode;
  route: WorldRouteModel | null;
  avatarNo: number | null;
  scene: WorldSceneModel;
  reducedMotion?: boolean;
  onEvent: (event: WorldEvent) => void;
  fallback: React.ReactNode;
}

export type WorldEvent =
  | { type: "EXIT" }
  | { type: "REQUEST_SERVICE"; serviceId: string }
  | { type: "SHOP_NEAR"; shopId: string | null }
  | { type: "ENTER_SHOP"; shopId: string }
  | { type: "WORLD_ERROR"; code: "WEBGL_UNAVAILABLE" | "ASSET_FAILED" | "RENDER_FAILED" };
```

- [ ] **Step 1: Write capability tests.**

Cover WebGL unavailable, reduced motion, coarse-pointer pixel ratio 1.5,
desktop pixel ratio 2, and hidden-document pause policy.

- [ ] **Step 2: Implement capability detection and canvas lifecycle.**

Create the renderer with `antialias: false`, high-performance preference,
SRGB output, capped pixel ratio, and a `requestAnimationFrame` loop. Attach
`visibilitychange`, `ResizeObserver`, and unmount disposal. Call `onEvent`
with `WEBGL_UNAVAILABLE` or `RENDER_FAILED` and render the supplied fallback.

- [ ] **Step 3: Add the semantic canvas shell.**

Wrap the canvas in a labelled region with an `aria-live="polite"` status slot,
an exit button, and a “continue without the world” action. The fallback must
be rendered in the same component tree so host actions survive renderer
failure.

- [ ] **Step 4: Run tests and lint.**

Run: `npm run test --workspace=@pro-now/web -- src/world/worldCapabilities.test.ts && npm run lint --workspace=@pro-now/web`

Expected: PASS with no lint errors.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/world
git commit -m "feat(web): add virtual world renderer lifecycle"
```

### Task 4: Port the street, avatar, vehicle, camera, and shop scene

**Files:**
- Create: `apps/web/src/world/scene/WorldScene.ts`
- Create: `apps/web/src/world/scene/street.ts`
- Create: `apps/web/src/world/scene/player.ts`
- Create: `apps/web/src/world/scene/camera.ts`
- Create: `apps/web/src/world/scene/shopRooms.ts`
- Create: `apps/web/src/world/scene/sceneDisposal.ts`
- Create: `apps/web/src/world/scene/sceneManifest.test.ts`
- Modify: `apps/web/src/world/WorldCanvas.tsx`

**Interfaces:**
- Consumes: `WORLD_ASSETS`, `WorldSceneModel`, `WorldRouteModel`, normalized route steps from `@pro-now/types`, and semantic input commands.
- Produces:

```ts
export function createWorldScene(model: WorldSceneModel): WorldSceneHandle;
```

- [ ] **Step 1: Write the manifest and interaction contract tests.**

Assert that supported interiors have an asset, every route sample remains in
normalized world coordinates, and a shop without `interiorAssetId` emits no
`ENTER_SHOP` event.

- [ ] **Step 2: Port the demo behavior into product-owned modules.**

Use the demo's `City.tsx`, `street.ts`, `player.ts`, `boxRoom.ts`, and
`panoRoom.ts` as visual/behavioral references. Recreate only the required
street, district, avatar, vehicle, interior, and lighting logic under
`apps/web/src/world/scene`; imports must resolve only to `three`, web assets,
and `@pro-now/types`.

- [ ] **Step 3: Implement camera modes and route placement.**

Implement `wide`, `character`, and `shopfront` shots, search flight, reveal,
and route follow. Use `routeAt(departmentCode, progress)` to place the
illustrated vehicle. Never accept a lat/lng input in the scene API.

- [ ] **Step 4: Implement shop entry and disposal.**

Near a supported shop, emit `SHOP_NEAR`; on Enter/tap, cross-fade into its
interior and emit service-selection events from the overlay. Dispose all
textures/materials/geometries when leaving the interior or unmounting.

- [ ] **Step 5: Run focused tests and the web build.**

Run: `npm run test --workspace=@pro-now/web -- src/world/scene/sceneManifest.test.ts && npm run build --workspace=@pro-now/web`

Expected: PASS and a successful Vite build.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/world/scene apps/web/src/world/WorldCanvas.tsx
git commit -m "feat(web): add interactive virtual city scene"
```

### Task 5: Add normalized input and accessible world overlays

**Files:**
- Create: `apps/web/src/world/worldInput.ts`
- Create: `apps/web/src/world/worldInput.test.ts`
- Create: `apps/web/src/world/WorldOverlay.tsx`
- Create: `apps/web/src/world/WorldOverlay.css`
- Modify: `apps/web/src/world/WorldCanvas.tsx`

**Interfaces:**
- Consumes: keyboard events, pointer/touch gestures, `WorldTrade`, `WorldEvent`, and current mode.
- Produces:

```ts
export type MoveCommand = WorldMoveCommand;
export function movementFromKeyboard(keys: ReadonlySet<string>): MoveCommand;
export function movementFromPointer(dx: number, dy: number, radius: number): MoveCommand;
```

- [ ] **Step 1: Write input tests.**

Cover Arrow/WASD equivalence, diagonal normalization, pointer dead-zone,
touch release returning to zero, and Escape producing `EXIT` through the host.

- [ ] **Step 2: Implement input normalization.**

Attach listeners only while Explore/Route is active, prevent page scrolling
only for the world control surface, and remove listeners on cleanup.

- [ ] **Step 3: Implement the RTL overlay.**

Render the current mode, shop name, “היכנס”, service list, exit control, ETA,
professional identity only when match data exists, and a live status message.
Keep service buttons semantic and focusable; clicking a service emits exactly
one `REQUEST_SERVICE` event.

- [ ] **Step 4: Verify focused tests.**

Run: `npm run test --workspace=@pro-now/web -- src/world/worldInput.test.ts && npm run typecheck --workspace=@pro-now/web`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/world
git commit -m "feat(web): add accessible world controls"
```

### Task 6: Add the standalone neighbourhood route and catalogue bridge

**Files:**
- Create: `apps/web/src/world/catalogTrades.ts`
- Create: `apps/web/src/world/catalogTrades.test.ts`
- Create: `apps/web/src/screens/World.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/screens/Home.tsx`

**Interfaces:**
- Consumes: `CatalogResponse` from `api.getCatalog`, `pilotServiceIdForDatabaseCode`, `departmentCodeByServiceId`, `useMe`, and the world runtime.
- Produces: `worldTradesFromCatalog(catalog: CatalogResponse): Readonly<Record<string, WorldTrade>>` and navigation back into the existing `RequestComposer` flow.

- [ ] **Step 1: Write catalogue bridge tests.**

Assert that database catalogue services map to the correct pilot service IDs,
unknown services are omitted rather than assigned to a wrong district, and a
trade without an interior remains visible but has no service-selection event.

- [ ] **Step 2: Implement the bridge and `/world` screen.**

Load the real catalogue with TanStack Query, derive the chosen avatar from
`useMe`, and render `WorldCanvas` with `Explore`. Show `LoadingScreen` and
`ErrorScreen` for catalogue failures. Use the existing catalogue IDs passed
through `resolveServiceId` when starting a request.

- [ ] **Step 3: Wire navigation and request selection.**

Change Home's “טיול בשכונה” menu row from `upcoming: true` to
`onPress={() => navigate("/world")}`. When World emits `REQUEST_SERVICE`,
navigate to `/?service=<pilot-service-id>`. Update Home to consume the query
parameter once, open `RequestComposer`, and replace the URL so refresh does
not reopen an old request.

- [ ] **Step 4: Run tests and the navigation check.**

Run: `npm run test --workspace=@pro-now/web -- src/world/catalogTrades.test.ts && npm run typecheck --workspace=@pro-now/web && npm run build --workspace=@pro-now/web`

Expected: PASS and `/world` is included in the route graph without breaking
existing request navigation.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/App.tsx apps/web/src/screens/Home.tsx apps/web/src/screens/World.tsx apps/web/src/world/catalogTrades.ts apps/web/src/world/catalogTrades.test.ts
git commit -m "feat(web): open the interactive neighbourhood"
```

### Task 7: Integrate search, match reveal, and assigned-job route play

**Files:**
- Create: `apps/web/src/world/JobWorldBackdrop.tsx`
- Create: `apps/web/src/world/jobWorldModel.ts`
- Create: `apps/web/src/world/jobWorldModel.test.ts`
- Modify: `apps/web/src/screens/Job.tsx`

**Interfaces:**
- Consumes: `CustomerJobResponse`, `JobMatchView`, `jobKey`, `useJobSocket`, `departmentCode`, `worldModeFor`, and `worldRouteFor`.
- Produces: `buildJobWorldModel(args): { mode: WorldMode; route: WorldRouteModel | null; match: JobMatchView | null }` and a reusable backdrop element for `SearchingBody`/`TrackingBody`.

- [ ] **Step 1: Write job-world model tests.**

Cover searching with no match, assigned with match, en-route movement,
arrival stopping the vehicle, null ETA, and match disappearing after a REST
refetch. Assert no fallback name or vehicle ID is inserted.

- [ ] **Step 2: Implement the job backdrop.**

Keep `Job`'s existing query/socket ownership. `JobWorldBackdrop` receives
the current query snapshots and re-renders the world from them; it does not
start a second job fetch or mutate the job. Pass it as `backdrop` to both
`SearchingBody` and `TrackingBody`, preserving all existing semantic action
props.

- [ ] **Step 3: Add search/reveal/route timing.**

Use a ref keyed by job ID and match ID to play the reveal once. Use a small
clock state (at most once per second while route mode is active) only to
repaint temporal progress; REST/socket data remains the authority. On null
match or ETA, render the static/fallback world state without invented data.

- [ ] **Step 4: Verify the real job flow locally.**

Run: `npm run e2e --workspace=@pro-now/web -- e2e/w6.spec.ts` after the local API is running, then run the new focused browser test from Task 8.

Expected: the existing request-to-review journey still passes, and search/
assigned states show the world without changing job transitions.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/screens/Job.tsx apps/web/src/world/JobWorldBackdrop.tsx apps/web/src/world/jobWorldModel.ts apps/web/src/world/jobWorldModel.test.ts
git commit -m "feat(web): connect virtual world to live jobs"
```

### Task 8: Add browser coverage, visual parity, and final hardening

**Files:**
- Create: `apps/web/e2e/world.spec.ts`
- Create: `apps/web/e2e/world-fallback.spec.ts`
- Create: `apps/web/parity/world.spec.ts`
- Modify: `docs/21-PRODUCTION-PLAN.md` with the completed web-world epic and measured limitations
- Create: `docs/qa/W11.md`

**Interfaces:**
- Consumes: the routes and events from Tasks 1–7, existing Playwright helpers, and the existing demo parity harness.
- Produces: reproducible browser coverage and a written manual QA record.

- [ ] **Step 1: Write the Explore browser test.**

Use the existing signed-in fixture to navigate to `/world`, press Arrow keys,
open a supported shop, assert the Hebrew service sheet, and select a service.
Assert navigation to `/?service=` and then to the existing request composer.

- [ ] **Step 2: Write fallback and recovery browser tests.**

Stub `HTMLCanvasElement.prototype.getContext` to return `null` before loading
`/world`; assert the static city and semantic actions remain available. In a
job test, reload during search and route, then assert the mode is rebuilt from
the job endpoint. Close the socket and assert the next REST refresh restores
the world state.

- [ ] **Step 3: Add world parity screenshots.**

Capture wide, character, shopfront, search, reveal, and route at the existing
iPhone 15 and desktop viewport settings. Compare against the demo reference
with the current pixel-diff tooling; document intentional differences for
real-data/empty-state behavior instead of relaxing the threshold globally.

- [ ] **Step 4: Run the complete verification set.**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build --workspace=@pro-now/web
npm run e2e --workspace=@pro-now/web
npm run parity --workspace=@pro-now/web
```

Expected: all commands pass; the world E2E and parity artifacts are saved
under the existing ignored Playwright/parity output directories.

- [ ] **Step 5: Perform the manual iPhone 15 and desktop pass.**

Walk welcome → onboarding → home → neighbourhood → shop → request → search
→ match → route → arrival. Record WebGL fallback, reduced motion, keyboard,
refresh, offline, and missing-ETA observations in `docs/qa/W11.md`.

- [ ] **Step 6: Update the production plan and commit the final evidence.**

```bash
git add apps/web/e2e apps/web/parity docs/21-PRODUCTION-PLAN.md docs/qa/W11.md
git commit -m "test(web): verify virtual world journey"
```

## Final self-review checklist

- [x] Every spec section maps to at least one task.
- [x] No task imports demo code or invents supply/location data.
- [x] All interface names used by later tasks are defined by earlier tasks.
- [x] Missing match/ETA, unsupported interiors, fallback, and refresh recovery each have an owning test.
- [x] The plan does not require a database migration or new API route.
- [x] Final verification includes lint, typecheck, unit tests, build, E2E, parity, and manual QA.
