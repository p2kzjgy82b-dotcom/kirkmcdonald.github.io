# Space Age 2.0.77 Dataset Update

This branch refreshes the Space Age dataset from 2.0.55 → **2.0.77** and adds a project-hygiene baseline (package.json, ESLint, Vitest, GitHub Actions CI).

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
- `tests/dataset.test.js` — 30 Vitest unit tests asserting structural integrity (referential ingredient/result lookups, recipe-category coverage by producers, sprite hash, counts, singleton vs list shapes).
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
