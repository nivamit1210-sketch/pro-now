# Demo → product sync

How this is used: `22-WORKING-MODEL.md §4`.

## Marker
**Last demo commit accounted for by the product: `a2bc4a5`** (2026-10-01)

Next catch-up starts with:
```bash
git log --reverse --format='%h %ad %s' --date=short a2bc4a5..master -- tools/design-preview docs/18-ROADMAP.md
```
Already waiting in that range: the 2026-10-01 entries under "Built in the
demo, not yet planned into the product" in `18-ROADMAP.md` (several orders
at once, a repair quoted to whoever ordered, the identity check).

## Open items from earlier catch-ups
| Item | From | What | State |
|---|---|---|---|
| D | 2026-09-30 | The professional's own prices and lines: example prices filled in, one shared visit fee with per-service overrides, a per-professional price list (`ProfessionalPriceLine`, LIST pricing on the server, the customer seeing that professional's lines). Size L. | Waiting for a decision: how a pick from the example list meets a professional's own list |
| F | 2026-09-30 | Services not on our list (`ProfessionalServiceProposal`, an admin queue to map them) | On hold (D3) |
| I | 2026-09-30 | Automatic registry checks (data.gov.il: pest control, doctors, vets, garages, contractors) behind an `ExternalRegistryProvider`; the admin still decides | Not started (L, later) |
| C4 | 2026-10-01 | `npm run parity` asserts the customer flow too: each screen held under 2% difference, so a drift fails the catch-up | Not started |
| D6 | 2026-10-01 | The 3D city in the customer flow: the home's "טיילו ברחוב" card, the walk, the 3D street while searching (W11 built `/world`) | Open |
| T1 | 2026-10-02 | `01487a7`, the copy-and-catalogue part is shipped (search keywords, pro offer/job/earnings/pricing/verification copy, the job band's four named steps). Left from it: the handyman priced by job type (needs LIST pricing on the server, so it goes with D); the phone's back closing home's all-services list (Home keeps its views in component state; it needs one history design for all of them); the job screen's "reminder sent" and its client-side drive countdown (the first sends nothing and the second invents ETA progress, so neither is copied until a real notification and a live ETA back them); everything for someone else, several orders, the identity check and the shift redesign (planned in the next catch-up) | Partly shipped; the marker stays at `a2bc4a5` |

**Deliberately never copied:** the demo's invented supply ("3 פנויים",
"מצאנו 3 התאמות") — the product shows only what the server has; the
demo's 290 vs 285 rounding; "מאושר בכרטיס" (under D1 the customer pays the
professional directly).

## Log
| Date | Range | Done |
|---|---|---|
| 2026-09-29 | baseline, up to `48ee159` | The fork point: `tools/design-preview/lib/{ui,types}` and `packages/{ui,types}` identical. Closing the gap was the production plan (W0–W11). |
| 2026-09-30 | `48ee159..40fd24a` (how a professional joins) | A required photo or trade character (#26); customers see it (A2, #31); sign-out on the pro side (H, #28); business name and tax status (B, #30); welcome, summary, honest progress (G, #33); documents per trade from the research (C, #35); the shop with sign, colour and logo (E, #38). Decisions D1–D4 in `18-ROADMAP.md`. |
| 2026-10-01 | `40fd24a..a2bc4a5` plus a parity walk of the customer flow | The header stays after sending and a trade's own shop on its page (C1, C2, #47); the request form only describes the job (C3, #48); the pro explanation slides (P1, #49); joining finds the trade from free text (P2, #50). |
| 2026-10-02 | none (no marker move) | The professional's tabs (המשמרת · הרווחים · המסמכים שלי · הפרופיל) as routes, the new shift screen, earnings from receipts under D1, documents and services in the server's words, prices saved per service; no price list (item D), no night surcharge, no "available in" (no server support yet). |
