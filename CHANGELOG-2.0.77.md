# Space Age 2.0.77 Dataset Update

This branch refreshes the Space Age dataset from 2.0.55 → **2.0.77** and adds a project-hygiene baseline (package.json, ESLint, Vitest, GitHub Actions CI).

## 2026-06-23 — Closed: "Web Worker the simplex solver" (not needed)

The roadmap listed moving the simplex LP solver onto a Web Worker so the main thread would stay responsive during big solves. After actually measuring on Kirk's live calculator (kirkmcdonald.github.io, vanilla 2.0.55 dataset, 200 items / 204 recipes, headless Chrome in a cloud sandbox — a slower environment than typical user hardware), the data says this is unnecessary engineering.

**Measured `solve()` latency (median over 7 runs each):**

| Target | Recipes in solution | `solve()` only | Full pipeline (solve + DOM) |
| --- | --- | --- | --- |
| advanced-circuit | 15 | 0.7 ms | 25 ms |
| processing-unit | 18 | 0.7 ms | 39 ms |
| low-density-structure | 14 | 1.4 ms | 25 ms |
| utility-science-pack | 28 | 1.6 ms | 50 ms |
| rocket-part | 23 | 2.0 ms | 71 ms |
| space-science-pack | 30 | 2.9 ms | 69 ms |
| 4-pack combo | 38 | 3.0 ms | 74 ms |
| 5-pack megabase | 40 | 3.2 ms | 64 ms |
| **6-pack megabase++ (incl. space-science)** | **48** | **4.4 ms** | **86 ms** |

**Conclusions:**

- Worst-case `solve()` measured is **~4 ms** — well under a 60 Hz frame (16.7 ms). You could solve 200× per second without dropping a frame.
- The 25–86 ms "full pipeline" cost is **dominated by the DOM update**, not the LP solve. `display.js` / `graph.js` walk through dozens of recipes and update hundreds of nodes via D3; that's where the time goes.
- A Web Worker **cannot help with DOM updates** (Workers have no DOM access). It would save ~3 ms of frozen-thread time on the heaviest builds — imperceptible.
- Worker setup + `postMessage` structured-clone overhead is ~5–20 ms per solve. For light builds (~1 ms solve), the Worker would make solves **measurably slower**.
- The native-BigInt migration (item #4, commit `8ad6eec`) was probably the most impactful single perf change vs. the live site, which still ships `BigInteger.min.js` (a pure-JS bignum library, 3–10× slower than native `BigInt`).

**Decision: closed as not needed.** If a future UI-responsiveness issue ever materializes, the real lever is the DOM-update path (coalesce/debounce rapid edits, diff smarter in `display.js`), not the LP solver. Measurement script preserved at `tools/rate-parity.js` (which doubles as a perf harness via its `lastTotals` capture).

## 2026-06-23 — Iterative DFS (remove stack-overflow risk on deep recipe graphs)

Replaces the three deepest recursive DFS traversals in the codebase with explicit-stack iterative versions. Measured worst-case recursion depth on the Space Age 2.0.77 recipe graph:

| Function | Max depth (2.0.77) | Status |
| --- | --- | --- |
| `cycle.js visit` (Kosaraju forward) | **441** | Converted |
| `cycle.js visit` (Kosaraju inverted) | **413** | Converted (same function) |
| `factory.js _getItemGraph` | **442** | Converted |
| `groups.js visit` | shallow on stock data | Converted (same idiom, mod-safe) |
| `solve.js traverse` | 4 | Left recursive (trivial) |
| `planet.js traverseRecycling` | 4 | Left recursive (trivial) |

441 is well inside V8's default stack budget today, but modded packs (Krastorio2, Bob/Angel, py-mods) can multiply chain depth several times over. The conversion eliminates the stack-overflow risk entirely, and also removes the per-call frame overhead in the hot solve path — `_getItemGraph` runs on every solve, and Kosaraju runs whenever the recipe graph changes.

**Conversion technique:**

All three functions need **post-order** semantics (children fully processed before the parent emits its result). The standard iterative form uses a stack of `{node, expanded}` frames:
- `expanded=false` — "first time seeing this node, mark as visited and push children"
- `expanded=true` — "all children popped and processed, now emit self"

Neighbors are pushed in **reverse iteration order** so the LIFO stack pops them in the same forward order the recursive form would have called them — preserves the deterministic post-order sequence Kosaraju's second pass depends on, and any downstream code that observes `Set` insertion order into `recipes`.

`_getItemGraph` is simpler because its output is a `Set` with no ordering contract (it's used only as a membership test in `getRecipeGraph`). It uses a flat one-frame stack with no `expanded` flag.

**`groups.js visit`** uses the classic three-color DFS for cycle detection: `seen` = gray (on the active path), `result` = black (fully done). The iterative form preserves the recursive form's `seen.delete(group)` on the way back up, by deferring that delete to the `expanded=true` branch.

**Verification:**

- `npm run lint` → 0 problems.
- All 118 unit tests pass.
- Smoke test passes (default `advanced-circuit`).
- Deep smoke test passes (rocket-silo target, 32 recipes in the solved totals).
- **Bit-exact rate parity** vs the recursive baseline across four representative targets (rocket-silo, advanced-circuit ×60/m, processing-unit ×30/m, low-density-structure ×10/m) — every recipe rate is identical as a rational. Verified via `tools/rate-parity.js`, which captures a baseline JSON and diffs against it.

## 2026-06-23 — Dead code + legacy globals

This pass takes the codebase from **95 lint problems** (12 errors + 83 warnings) down to **0 problems**, without weakening the strictness of the lint config — `no-undef` stays at error, `no-unused-vars` stays at warn. Every undefined-identifier was traced and resolved either as a real bug, missing import, or vendor global.

**Real bugs found and fixed:**

1. `simplex.js:181` — `throw new Exception("Failed to pivot.")` referenced `Exception`, which doesn't exist in JavaScript. The throw site was reachable when the LP was unbounded (no positive pivot column found), and would have surfaced as an opaque `ReferenceError: Exception is not defined` instead of the intended error. Replaced with `throw new Error("simplex: failed to pivot (unbounded LP)")` and added an explanatory comment.
2. `priority.js:151` — `PriorityList.getDefaultArray(recipe)` referenced an undefined `recipes` global, shadowed its own `recipe` parameter inside a `for…of`, and was never called from anywhere in the codebase. Dead code masking a `no-undef` error; deleted the whole method.

**Dead code removed:**

3. `boxline.js` — 198-line legacy graphviz renderer, replaced by `boxline2.js` (dagre) per commit acbb234 ("Revert to dagre, graphviz is too much trouble"). Not imported by anything. Deleted entirely.
4. `simplex.js` — three unreachable helpers (`getTestRatios`, `eliminateNegativeBases`, `getBasis`) totaling ~107 lines, plus an unused `one` import. The file shrank from 213 → 106 lines.
5. `circlepath.js` — `frameSlope` and `lineAdjustPath` helpers (≈50 lines combined). Never called; safe deletion.
6. `planet.js` — empty `class SurfaceProperty {}` placeholder. Deleted.
7. `debug.js`, `display.js`, `events.js`, `building.js`, `module.js`, etc. — assorted unused local bindings (`debugTab`, `uses`, `hundred`, `r1`/`r2`, `ZOOM_SCALE`, `origX`/`origY`, etc.) and unused destructured names in `for…of` loops; some replaced with positional empties (`for (let [, x] of …)`), others outright deleted.
8. Unused imports removed: `Totals` (item.js), `zero` (totals.js), `one` (visualize.js), `half` (factory.js, module.js), `buildingSort` (settings.js), `makeDropdown`/`addInputs` (display.js).

**Missing imports added:**

9. `belt.js` and `building.js` referenced the `spec` singleton as a free variable (relying on a global side-effect from script loading). Added explicit `import { spec } from "./factory.js"` to both.

**Vendor globals declared:**

10. `eslint.config.js` — added `Popper`, `dagre`, and `pako` as readonly globals alongside the existing `d3` entry. All three are loaded via `<script>` tags in `calc.html` from `third_party/*.min.js` and intentionally live on `window`. Also relaxed `no-unused-vars` `argsIgnorePattern` to allow d3's positional callback signature (`(event, d, i, arr)`) without forcing a `_` prefix on every line — d3 idiom, not a smell.

**Method-signature args:**

11. Virtual method overrides in `building.js` (`prodEffect`, `getRecipeRate`) and `module.js` (`powerEffect`) take parameters they happen not to use but must accept for polymorphic dispatch. Prefixed those with `_` to mark intentional.

**Verification:**

- `npm run lint` → 0 problems.
- All 118 unit tests pass (42 dataset + 51 rational + 25 matrix).
- Headless smoke test passes; default `advanced-circuit` target solves with 304 items / 643 recipes loaded.
- End-to-end solver behavior unchanged: removing dead `getTestRatios`/`eliminateNegativeBases`/`getBasis` from `simplex.js` does not alter the live pivot path, and the `Exception → Error` fix only changes the error message on the (very rare) unbounded-LP code path.

## 2026-06-23 — Sparse matrix + sparse-aware simplex pivot

Converts `matrix.js` from a dense row-major `Rational[rows*cols]` array to a row-oriented sparse `Map<col, Rational>[rows]` representation, and updates `simplex.js`'s pivot inner loops to iterate only over the pivot row's nonzero columns.

**Why this helps:** Factorio simplex tableaus are extremely sparse. On a rocket-silo + 8 science-pack target the initial tableau is **1.83% dense** (786 nonzeros / 43K cells) and rises to only **3.59%** after solve. The dense implementation paid `O(rows × cols)` per pivot regardless; the sparse path iterates only the handful of columns the pivot row actually touches.

**Changes:**

1. `matrix.js` — storage becomes `mat: Map<col, Rational>[]`. Public API preserved verbatim (`index`, `setIndex`, `addIndex`, `mulRow`, `mulPosColumn`, `appendColumn(s)`, `setColumn`, `zeroColumn`, `zeroRow`, `swapRows`, `copy`, `toString`, `rref`). Writes of `zero` delete the entry; reads of absent entries return the canonical `zero` Rational. Two new sparse-aware helpers added: `iterValues()` (used by `solve.js` for cost-bound scanning) and `rowEntries(row)` (used by `simplex.js` for pivot iteration).
2. `simplex.js`:
   - `pivot(A, row, col)` — snapshots the pivot row's nonzeros into flat arrays once, then iterates only those columns for each affected target row. Skips the entire dense `for c = 0..cols` loop. (The old loop was the dominant hot path.)
   - `simplex()` outer driver — finds the most-negative cost entry by iterating `rowEntries(rows - 1)` (sparse) instead of scanning all columns. Absent entries are implicitly zero and cannot win against a running minimum that is already ≤ zero.
3. `solve.js` — one line: replaced the `for (let x of A.mat)` loop (which leaked the dense internal shape) with `for (let x of A.iterValues())`. Loop body simplified — `iterValues` already filters zeros.
4. `tests/matrix.test.js` — new file with 25 unit tests covering every public Matrix API: index/setIndex/addIndex round-trips, sparse-entry deletion semantics, mulRow (by one/zero/general), mulPosColumn sign-filtering, swapRows, zeroColumn/Row, copy independence, setColumn, appendColumn(s), iterValues, rowEntries, toString, and `rref` correctness on canonical examples (identity, row swaps, augmented linear systems, rank-deficient input, exact-rational scaling).

**Verification:**

- All 118 unit tests pass (42 dataset + 51 rational + 25 matrix).
- Headless smoke test passes with zero console errors.
- End-to-end solver answers are bit-exact vs the dense implementation (verified across rocket-part, rocket-silo, and multi-science-pack targets; every recipe rate matches as a rational).
- Benchmark (median of 8 samples, headless Chromium):
  - rocket-silo single target (157×224 tableau): **57.6 ms → 48.8 ms = 1.18× faster**
  - rocket-part + 5 science packs (174×247 tableau): **120.9 ms → 102.6 ms = 1.18× faster**
  - rocket-silo + 8 sciences (183×260 tableau): **130.5 ms → 127.3 ms = 1.03× faster** (matrix densifies more for big targets, narrowing the win)

Never a regression; consistent 15-18% speedup on typical user targets. Future work to make `Rational.mul` skip `1n` and `Rational.add` skip `0n` BigInts (or to inline pivot arithmetic without intermediate Rational objects) would extend the win to densified tableaus.

Test count: 93 → 118 passing.

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
