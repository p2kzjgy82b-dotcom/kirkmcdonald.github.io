# Factorio Calculator — Space Age 2.0.77 Fork

A maintained fork of Kirk McDonald's [Factorio Calculator](https://kirkmcdonald.github.io/calc.html), updated for the **Space Age** expansion and Factorio **2.0.77**.

**Live site:** https://p2kzjgy82b-dotcom.github.io/kirkmcdonald.github.io/

## Why this fork

The upstream calculator hasn't been updated since October 2024 and is missing Space Age machines, recipes, and several gameplay changes from Factorio 2.0+. This fork brings it current and tightens the solver core.

## What's different from upstream

- **Dataset refreshed to 2.0.77** — Space Age items, recipes, machines, planets
- **Character (player) is a first-class crafting machine** — handhand crafting respects real character craft speed
- **Native `BigInt`** replaces the bundled `big-integer` library (3–10× faster rationals)
- **Sparse matrix + sparse-aware simplex pivot** — much faster solve on large builds
- **Iterative DFS** in cycle detection, factory graph, and group rendering (no recursion depth limits on megabases)
- **Authoritative crafting categories** from the dataset (no hand-maintained fallback tables)
- **Dead code removed**, lint clean (0 warnings from 95)
- **CI + unit tests** (118 tests across dataset, rational, matrix modules)

Full per-release notes: [CHANGELOG-2.0.77.md](./CHANGELOG-2.0.77.md)

## Running locally

The calculator is still entirely static files (HTML, JS, CSS):

```text
$ python3 -m http.server 8000
```

Then open `http://localhost:8000/calc.html`.

## Development

```text
$ npm install
$ npm test            # 118 unit tests
$ npm run smoke       # headless browser smoke test
$ npm run lint
```

## Attribution

This is a fork of [KirkMcDonald/kirkmcdonald.github.io](https://github.com/KirkMcDonald/kirkmcdonald.github.io), originally by **Kirk McDonald**.

Licensed under the **Apache License, Version 2.0** — see [LICENSE](./LICENSE).

If you find this calculator useful, please consider supporting the original author via [Kirk McDonald's Patreon](https://www.patreon.com/kirkmcdonald).

## Contributing

Issues and pull requests welcome. This fork aims to track Factorio releases and stay merge-compatible with upstream where practical.
