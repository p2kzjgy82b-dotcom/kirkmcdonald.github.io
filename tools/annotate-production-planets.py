#!/usr/bin/env python3
"""Annotate recipes with `production_planets` — a soft planet-preference allowlist.

When a recipe declares `production_planets`, it is enabled by default ONLY when
one of those planets is selected. Users can still re-enable it manually on any
planet via the Settings panel; this just changes the default starting state so
new sessions don't immediately suggest awkward/inefficient recipes.

Scope: only recipes where the "natural" alternative on certain planets
is obviously better (e.g. coal mining vs coal synthesis on Nauvis/Vulcanus).
Recipes that are practically available everywhere after research (biter-egg,
biolab, productivity-module-3, captive-biter-spawner) are intentionally NOT
listed here — they can be used on any planet once unlocked, and the user is
the better judge of when their tech actually unlocks them.

Run: python3 tools/annotate-production-planets.py
"""
import json
import sys
from pathlib import Path

DATASET = Path(__file__).resolve().parent.parent / "data" / "space-age-2.0.77.json"

# Allowlist: recipe key -> list of planet keys where it's preferred-by-default.
# Disabled by default everywhere else (but user can re-enable manually).
PRODUCTION_PLANETS = {
    # Coal can be mined on Nauvis and Vulcanus. Coal-synthesis (carbon + sulfur
    # + water) is an inefficient/circular fallback that's the natural choice
    # only on planets with no native coal: Gleba, Fulgora, Aquilo.
    "coal-synthesis": ["gleba", "fulgora", "aquilo"],

    # Foundry casting recipes. Each of these has a smelting- or
    # crafting-category alternative that produces the same item. The casting
    # path is the natural Vulcanus default (foundry + molten metal pipeline),
    # while Nauvis/other planets default to the conventional recipe. Users
    # can still re-enable casting recipes manually on any planet via Settings
    # once they have a foundry available.
    "casting-iron":                  ["vulcanus"],
    "casting-copper":                ["vulcanus"],
    "casting-steel":                 ["vulcanus"],
    "casting-iron-gear-wheel":       ["vulcanus"],
    "casting-iron-stick":            ["vulcanus"],
    "casting-copper-cable":          ["vulcanus"],
    "casting-pipe":                  ["vulcanus"],
    "casting-pipe-to-ground":        ["vulcanus"],
    "casting-low-density-structure": ["vulcanus"],

    # The lava-based molten-metal recipes are Vulcanus-exclusive in practice
    # (no lava elsewhere). Default them to Vulcanus only so Nauvis doesn't
    # suggest a pipeline that can't be built. The ore-based molten-iron /
    # molten-copper recipes (ore + calcite) are NOT gated -- they work
    # anywhere a foundry exists.
    "molten-iron-from-lava":         ["vulcanus"],
    "molten-copper-from-lava":       ["vulcanus"],
}

def main():
    with open(DATASET) as f:
        data = json.load(f)

    valid_planets = {p["key"] for p in data["planets"]}

    # Strip any stale annotations from prior runs.
    for r in data["recipes"]:
        if "production_planets" in r and r["key"] not in PRODUCTION_PLANETS:
            del r["production_planets"]
            print(f"  cleared stale annotation on {r['key']}")

    changed = 0
    for r in data["recipes"]:
        key = r["key"]
        if key in PRODUCTION_PLANETS:
            allowed = PRODUCTION_PLANETS[key]
            for p in allowed:
                if p not in valid_planets:
                    print(f"ERROR: unknown planet {p!r} for {key}", file=sys.stderr)
                    sys.exit(1)
            r["production_planets"] = allowed
            changed += 1
            print(f"  annotated {key}: {allowed}")

    if changed != len(PRODUCTION_PLANETS):
        missing = set(PRODUCTION_PLANETS) - {r["key"] for r in data["recipes"]}
        print(f"WARNING: missing: {missing}", file=sys.stderr)

    with open(DATASET, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"\nUpdated {changed} recipe(s) in {DATASET.name}")

if __name__ == "__main__":
    main()
