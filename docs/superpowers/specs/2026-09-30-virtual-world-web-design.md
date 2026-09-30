# Virtual World for the Web — Design Specification

**Status:** Approved 2026-09-30  
**Date:** 2026-09-30  
**Scope:** `apps/web` only

## Goal

Implement the customer-facing virtual world from the demo as a functional
part of the production web app: a rendered city that can be explored,
entered, and used during search and the assigned-professional wait, while
real job state and professional data remain authoritative.

Success means a signed-in customer can open the neighbourhood, move through
the street, enter supported service venues, select a real catalogue service,
complete the existing request flow, watch the search/reveal sequence, and
play the waiting scene while a real assigned job progresses. The same job
must recover correctly after refresh or a transient connection failure.

## Context and constraints

- `tools/design-preview` is the specification-by-example, but it is not a
  production dependency. The product must not import demo source, demo
  fixtures, or demo-only packages.
- `apps/web` currently uses static city art (`CityHero` and related scenes)
  and the existing production UI/API flow. The 3D city is a separate epic
  after W2, per `docs/21-PRODUCTION-PLAN.md` D6.
- The server is authoritative for job state, assignment, professional
  identity, ETA, and pricing. The world is a renderer/controller, not a
  source of business truth.
- The current product deliberately has no routing vendor and does not expose
  exact professional GPS coordinates to the customer. The route scene will
  animate an illustrated journey from server ETA progress; it must not claim
  that the vehicle is at a precise real-world coordinate.
- Hebrew RTL is the primary UI direction. Every world action must have an
  accessible DOM control or equivalent keyboard path.
- Native mobile, professional-side 3D, payment/auth changes, and a real
  routing/maps integration are out of scope.

## Chosen approach

Create a product-owned Three.js runtime under `apps/web/src/world/`, using
the demo's behavior and artwork as reference but porting the implementation
into focused production modules. React owns page state and accessible DOM
overlays; Three.js owns the visual scene and camera. The runtime accepts
explicit props/state and emits semantic events such as `onRequestService`,
`onExit`, and `onWorldError`.

The existing shared pure contracts are reused where they are already
appropriate, including job-to-scene mapping and assignment-route progress in
`packages/types`. Browser/WebGL lifecycle code remains in `apps/web` so the
domain package stays platform-neutral.

## Product behavior

### Ambient mode

Welcome, onboarding, and home may render a living city backdrop when the
world is available. Existing catalogue and account actions remain usable
through normal UI controls. The static city art remains a valid fallback.

### Explore mode

The customer opens “טיול בשכונה” from the home world entry point. Keyboard,
pointer, and touch controls move the chosen avatar through the street. The
camera follows the avatar with the demo's eased third-person behavior.

Supported shop interiors open a product-owned interior scene. The shop sheet
is populated from the real catalogue data already available to the web app;
selecting a service returns to `RequestComposer` with that service selected.
Availability counts are omitted unless the API explicitly supplies them.
An art asset without a supported interior is visible but not enterable.

### Search mode

While a job is `DRAFT`, `SEARCHING`, or `OFFERING`, the camera plays the
search flight. Steering is disabled. The world does not render unnamed
candidate professionals. When `getJobMatch` returns an assigned
professional, the controller plays the match reveal once, then transitions
to route mode.

### Route mode

For `PRO_ASSIGNED` through `COMPLETION_PENDING`, the professional's vehicle
travels from the matching district toward the customer's illustrated point.
The current web contract exposes the accepted offer's ETA snapshot and its
server `computedAt` timestamp, not a customer-facing GPS stream. The client
uses those server facts plus the current job status and the shared
assignment-route logic to animate an illustrative time-progress value. It is
clamped, held at the start until the job is en route, and stopped at arrival;
REST/socket reconciliation can move it forward or back to the server-backed
state. It is never a GPS position.

The customer can steer their own avatar during the wait. Job status, ETA,
professional identity, cancellation, completion, and quote actions remain
available in the DOM overlay and retain the current production behavior.
When the job is in arrival, diagnosis, work, quote, completion, or review
states, the world is contextual; the existing job controls remain primary.

## Architecture

### World runtime modules

- `WorldCanvas`: owns WebGL creation, pixel-ratio limits, animation loop,
  resize/visibility handling, disposal, and capability detection.
- `WorldScene`: composes the street, districts, avatar, ambient dressing,
  vehicle, route, and interior scene from an explicit world model.
- `WorldCamera`: implements named shots (`wide`, `character`, `shopfront`),
  search flight, reveal, and route follow transitions.
- `WorldInput`: normalizes keyboard, pointer, and touch input into movement
  commands and respects reduced-motion/accessibility settings.
- `WorldOverlay`: React/DOM layer for Hebrew RTL actions, sheets, labels,
  focus management, and non-visual status messages.
- `worldAssets`: a literal, typed manifest for files under
  `apps/web/public/world`; no runtime-generated asset paths that defeat
  bundler/cache checks.
- `worldController`: pure transition/reconciliation logic that maps the
  product page state to `Ambient`, `Explore`, `Search`, or `Route` and
  reports semantic events to the host screen.

### Host integration

- `Home` owns entry into Explore and passes catalogue services into shop
  menus. Selecting a service uses the existing `RequestComposer` path.
- `Onboarding` and the existing art backdrops use named ambient shots when
  the world is loaded, otherwise retain their current still-art behavior.
- `Job` passes the existing job query and match query into the controller.
  The socket remains an invalidation signal and REST remains the source of
  the rendered facts.
- `ErrorScreen`/`LoadingScreen` semantics remain the host responsibility;
  world-specific asset/WebGL errors are recoverable and fall back to the
  static art without losing the job or service action.

No database migration or new API route is required for the initial epic. The
existing `/jobs/:id/match` contract remains the source of the professional
and ETA snapshot; if a future routing vendor exposes live progress, it can be
added to that contract without changing the world renderer boundary.

## Error, privacy, and fallback behavior

- If WebGL is unavailable, initialization fails, or the device is judged
  unable to render the scene reliably, use the current static city art and
  render the same DOM actions.
- If an individual asset fails, keep the scene alive with the remaining
  layers and report a non-blocking diagnostic; never replace a missing
  professional with a fabricated person.
- If match data is absent, do not show a professional name, photo, rating,
  vehicle identity, or ETA. Show the world state that is actually known.
- If ETA is null, keep the route vehicle stationary/unknown rather than
  inventing a countdown or progress. If the match snapshot is older than the
  job's current server state, the next REST/socket reconciliation wins.
- If the socket disconnects, keep the last server-backed scene briefly and
  let the existing query refetch reconcile the mode. Do not advance job
  state locally.
- Pause the render loop when the tab is hidden and dispose all geometries,
  materials, textures, and post-processing targets on unmount.

## Performance and accessibility targets

- Lazy-load the world runtime only on screens/modes that need it.
- Cap device pixel ratio at 1.5 on coarse-pointer devices and 2 on desktop,
  matching the demo's measured mobile strategy.
- Keep the scene responsive at the existing iPhone 15 viewport and a normal
  desktop viewport without blocking page interaction.
- Respect `prefers-reduced-motion`: use static/short transitions and disable
  ambient motion while preserving necessary state changes.
- Provide visible keyboard focus, arrow/WASD movement, an exit control, and
  a “continue without the world” path.
- Keep all important service/job actions in semantic DOM, with Hebrew labels,
  accessible names, and live-region updates for mode changes.

## Verification and acceptance

### Unit tests

Cover the pure controller and mapping behavior:

- every relevant `JobState` maps to the correct world mode;
- match reveal requires actual match data and plays once;
- route progress is clamped and never calculated from a guessed GPS point;
- missing ETA/location leaves the vehicle unknown/stationary;
- shop entry is allowed only when an interior exists;
- unsupported WebGL/reduced motion selects the fallback policy;
- exiting Explore and selecting a service emit stable semantic events.

### Browser tests

At the existing iPhone 15 and desktop viewports, cover:

- open the neighbourhood and move with keyboard/touch controls;
- enter a supported shop, open its service sheet, and select a real service;
- unsupported shop/interior shows an honest non-enterable state;
- create a real job and observe search → match reveal → route;
- refresh during search and route and reconstruct the correct world mode;
- disconnect/reconnect and recover through REST invalidation;
- WebGL fallback preserves service selection and job actions;
- keyboard focus and reduced-motion paths remain usable.

### Visual and regression gates

- Add world screenshots for wide, character, shopfront, search, reveal, and
  route shots at iPhone 15 and desktop sizes.
- Compare the product shots to the demo as a behavioral/visual parity
  reference, allowing only documented differences caused by real data or
  the product's honest empty states.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and
  the existing web E2E/journey suites before completion.

## Rollout and non-goals

The first implementation should land behind a small world capability boundary
inside the web app, not a production feature flag that changes business
truth. This allows the static-art fallback to remain the safe runtime path
while the full world is verified on supported browsers.

Non-goals for this epic:

- importing or symlinking demo source;
- exact map/GPS visualization;
- adding a maps vendor or changing ETA semantics;
- native mobile implementation;
- professional-side 3D presence;
- payment, authentication, dispatch, or pricing redesign;
- inventing availability, ratings, candidates, or professional locations.
