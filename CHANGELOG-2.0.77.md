# Space Age 2.0.77 Dataset Update

This branch refreshes the Space Age dataset from 2.0.55 → **2.0.77** and adds a project-hygiene baseline (package.json, ESLint, Vitest, GitHub Actions CI).

## 2026-06-23 — Native BigInt (drop peterolson/big-integer)

Replaces the vendored [peterolson/big-integer](https://github.com/peterolson/BigInteger.js) library (~7 KB minified) with platform-native `BigInt`. `BigInt` has been baseline available across all evergreen browsers since 2020.

**Changes:**

1. `rational.js` — rewritten on top of native BigInt primitives. Internal helpers added: `babs` (abs), `bgcd` (iterative Euclidean), `bdivmod` (truncated euclidean). Operator translation: `.plus`/`.times`/`.minus`/`.divide` → `+`/`*`/`-`/`/`; `.lesser`/`.equals` → `<`/`===`; `.shiftLeft(n)` → `<< BigInt(n)`; `.pow(n)` → `** BigInt(n)`; `.toJSNumber()` → `Number()`; `bigInt.zero|one|minusOne` → `0n|1n|-1n`; `bigInt(s)` → `BigInt(s)`. Edge case: `BigInt(float)` rejects non-integer doubles, so `from_float` uses `Math.trunc(floatPart)` even though the loop already drives `floatPart` to an integer value.
2. `calc.html` — removed `<script src="third_party/BigInteger.min.js"></script>`.
3. `third_party/BigInteger.min.js` — deleted (7 KB).
4. `eslint.config.js` — dropped the `bigInt` global.
5. `tests/rational.test.js` — new file with 51 unit tests covering normalization, arithmetic, comparisons, `divmod`/`floor`/`ceil`, `from_float` IEEE-754 round-trip exactness, `from_float_approximate` 1/3 detection, `from_string` (integer / decimal / fraction / mixed forms), and `toString`/`toDecimal`/`toUpDecimal`/`toMixed`.

**Behavioral parity:** The new module is a strict drop-in. One historical quirk preserved verbatim: `from_float_approximate(2/3)` does not snap to the canonical `2/3` rational because the sentinel `_two_thirds = 33333/50000` doesn't match `Math.round((2/3) * 100000) = 66667`. This was also true in Kirk's original — not a regression. (`1/3` and `n + 1/3` still snap correctly.)

**Headless-browser verification:** smoke test passes with zero console errors; rational primitives verified end-to-end (`1/2 + 1/3 = 5/6`, `1e15 * 1e15 = 10^30` exact via arbitrary-precision BigInt).

Test count: 42 → 93 passing.

## 2026-06-23 — Character as first-class producer

Adds the player **character** as a regular `crafting_machine` so hand-crafted recipes have an explicit producer in the calculator UI (previously they had no associated building, no rate, no power figure).

**Character properties** (from Wube's `space-age/base-data-updates.lua`):

- `crafting_speed = 1.0`
- `crafting_categories = {crafting, electronics, pressing, recycling-or-hand-crafting, organic-or-hand-crafting, organic-or-assembling}` (6 categories — turn-1's FactorioLab snapshot only had 3; Wube's space-age data-updates is authoritative)
- `energy_source = {type: "void"}`, `energy_usage = 0`
- `module_slots = 0`, `prod_bonus = 0`, `allowed_effects = []`
- Icon sourced from [Factorio Wiki — Player.png](https://wiki.factorio.com/images/Player.png) (64×64, rescaled to 32 px sprite cell)

**Changes:**

1. `adapter_work/build_kirk_dataset.py` — sprite sheet extended by one 32 px row (991×959 → 991×991); character icon embedded at cell `(0, 29)`; character entry appended to `crafting_machines[]`. New sprite hash `cb6bfb57cb98800fddf4267e728e5a2c`.
2. `factory.js` — added `"recycler"` and `"biochamber"` to `DEFAULT_BUILDINGS`. Without this, `BuildingGroup.getDefault()` would have fallen back to highest-speed (character, 1.0) for `recycling-or-hand-crafting` and `organic-or-*`, overriding the correct UX default (recycler 0.5, biochamber 2.0).
3. `tests/dataset.test.js` — 5 new invariants covering character presence, 6-category coverage, void energy source, sprite-cell mapping, and DEFAULT_BUILDINGS preservation.

**Headless-browser verification:** all 6 character categories register a producer, defaults preserved (asm-1 for crafting/electronics/pressing, biochamber for organic-*, recycler for recycling-or-hand-crafting), rate math correct — `iron-gear-wheel` defaults to 1.0/sec on asm-1 and computes 2.0/sec when character is selected (speed 1.0 × time 0.5 = 2/sec).

Test count: 37 → 42 passing.

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
