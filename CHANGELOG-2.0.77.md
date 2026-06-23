# Space Age 2.0.77 Dataset Update

This branch refreshes the Space Age dataset from 2.0.55 → **2.0.77** and adds a project-hygiene baseline (package.json, ESLint, Vitest, GitHub Actions CI).

## 2026-06-23 — Pumpjack cleanup

Resolves the long-standing `// XXX: Do something about pumpjacks` and `// XXX: Still a hack.` notes in `recipe.js`.

**Before:** `building.js` explicitly skipped the pumpjack when iterating `data.mining_drills`. `recipe.js` had a hardcoded `PumpjackRecipe` class with `category=null` that fluid resources were routed into. With a null category, `FactorySpecification.getBuilding` returned `null`, so fluid resources never had an associated producer — meaning no building count, no power figure, no module slots in the calculator UI.

**After:** Pumpjack is now registered as a regular `Miner` with `categories = {"basic-fluid"}`, and fluid resources (`crude-oil`, `lithium-brine`, `fluorine-vent`, `sulfuric-acid-geyser`) flow through the same `MiningRecipe` code path as solid ones. Dispatch happens via the standard `BuildingGroup` lookup keyed off `recipe.category`.

Four code changes:

1. `building.js` — removed the `if (d.key == "pumpjack") continue` skip.
2. `recipe.js` — deleted the `PumpjackRecipe` class and the `if (category === "basic-fluid")` special branch in `getRecipes`.
3. `tools/build_kirk_dataset.py` (adapter) — fluid resource `results` are normalized from FactorioLab's `{amount_min, amount_max, probability}` to a single `amount` field (mean of min/max) so the shape matches solid resources for `recipe.js`'s mining loop.
4. `tests/dataset.test.js` — 4 new invariants covering pumpjack registration, unified result shape, sole-producer assertion, and rate sanity check (10 crude-oil/sec at base speed).

Headless-browser verification: zero console/page errors, all four fluid resources dispatch to `pumpjack`, and `ratePerSec` is correctly 1 (× 10 amount = 10 fluid/sec, matching Wube's stated base pumpjack throughput).

Test count: 33 → 37 passing.


## Data changes

| Section            | 2.0.55 | 2.0.77 | Δ        |
|--------------------|--------|--------|----------|
| items              | 359    | 361    | +2       |
| recipes            | 621    | 613    | −8 *     |
| resources          | 12     | 12     | 0        |
| crafting_machines  | 16     | 16     | 0        |
| mining_drills      | 4      | 4      | 0        |
| fluids             | 33     | 33     | 0        |
| fuel               | 20     | 24     | +4       |
| modules            | 12     | 12     | 0        |
| planets            | 6      | 6      | 0        |

\* −8 = +32 new 2.0.77 recipes − 40 Kirk-only recipes for items FactorioLab 2.0.77 doesn't expose (blueprint, pistol, loader, coin, etc.). Net useful coverage is larger.

## How it was generated

Source: [FactorioLab](https://factoriolab.github.io) `data/spa/data.json` v2.0.77.

The adapter is `tools/build_kirk_dataset.py` (not committed in this branch — kept in the parent workspace). It maps FactorioLab's flat per-item schema to Kirk's separated `items / recipes / resources / crafting_machines / mining_drills / fluids / fuel / modules / belts / boilers / offshore_pumps / agricultural_tower / rocket_silo / beacon / planets / groups / surface_properties / spoilage / plants` shape, translating units (kJ/min → W, items/sec → items/tick, MJ → J) and merging fluid thermal data + group taxonomy from Kirk 2.0.55 where FactorioLab doesn't expose it.

The icon sprite sheet was rescaled from FactorioLab's 66 px cells to Kirk's 32 px cells (991×959 PNG), MD5'd, and embedded as `sprites.hash`.

## Known gaps

- `steam-165` fluid is missing `max_temperature` / `heat_capacity` — FactorioLab doesn't expose fluid thermal data; will need a Wube Lua pass.
- 32 new 2.0.77 recipes use synthesized `subgroup` / `order` strings (functional but not Wube-canonical for UI grouping).
- 40 Kirk-only 2.0.55 recipes (blueprint, pistol, loader, coin, …) are not present because FactorioLab 2.0.77 omits those items.

## Tooling added

- `package.json` — pinned to Node 20, declares scripts: `lint`, `test`, `validate:dataset`, `smoke`, `serve`.
- `eslint.config.js` — flat-config ESLint catching `no-undef` and unused vars (warn). Already surfaces 13 genuine `no-undef` bugs in Kirk's code (`Popper`, `Exception`, `minusOne`) — left for a follow-up PR.
- `tests/dataset.test.js` — 37 Vitest unit tests asserting structural integrity (referential ingredient/result lookups, recipe-category coverage by producers, sprite hash, counts, singleton vs list shapes, authoritative resource categories, pumpjack as first-class building).
- `tools/validate-dataset.js` — standalone validator script.
- `tools/smoke-test.js` — Playwright headless test that serves `calc.html`, loads the dataset, and asserts the page initialises with zero console errors and a populated `window.spec`.
- `.github/workflows/ci.yml` — runs `validate:dataset` + `lint` (non-blocking) + `test` on push & PR, then a separate job runs `smoke` with Playwright.

## How to verify locally

```bash
npm install
npm run validate:dataset    # structural checks
npm test                    # 30 unit tests
npm run smoke               # headless-browser end-to-end
npm run serve               # then open http://localhost:8000/calc.html
```
