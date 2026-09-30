# Demo → product sync marker

How this is used: `docs/22-WORKING-MODEL.md §4`.

## Marker

**Last demo commit accounted for by the product: `40fd24a`** (2026-09-30)

Next catch-up starts with:

```bash
git log --reverse --format='%h %ad %s' --date=short 40fd24a..master -- tools/design-preview docs/18-ROADMAP.md
```

## Log

| Date | Range | Plan | Notes |
|---|---|---|---|
| 2026-09-29 | baseline, up to `48ee159` | `docs/21-PRODUCTION-PLAN.md` | **Baseline, not a completed catch-up.** At `48ee159` the demo was forked: `tools/design-preview/lib/{ui,types}` and `packages/{ui,types}` were identical in code. Closing the gap up to this point is the production plan itself (W0–W10). One caveat: that plan was written at `53ed69f`, and eight demo commits landed between then and the fork (`ac68431` … `372ae54`). They cover the three kinds of work and three ways to pay, the live wait screen, the two maps, and pricing copy by kind and gender. Their code is in the forked `packages/ui`, but no one has checked them against the W-epics' scope. Check them when W6/W7 are planned. |
| 2026-09-30 | `48ee159..40fd24a` | `docs/sync/SYNC-2026-09-30.md` | How a professional joins (Amit's onboarding, `19ccbff` `070b5e4` `40fd24a`). W7 had already ported most of it. Nine items, A–I. A is done (#26). Decisions D1–D4 are open. |
