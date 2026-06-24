#!/usr/bin/env python3
"""Annotate recipes with `production_planets` allowlist.

Some recipes lack `surface_conditions` in the upstream data but are
practically gated by research/tech to specific planets. This script
adds an explicit allowlist so the calculator can hide them on planets
where they are not legitimately available.

Run: python3 tools/annotate-production-planets.py
"""
import json
import sys
from pathlib import Path

DATASET = Path(__file__).resolve().parent.parent / "data" / "space-age-2.0.77.json"

# Allowlist: recipe key -> list of planet keys where it should be enabled.
# Rationale: these recipes are unlocked via Gleba/Fulgora/Aquilo research
# (biter eggs, coal synthesis) and should NOT appear on a fresh Nauvis-only
# planet selection. Coal is mineable on Nauvis and Vulcanus directly.
PRODUCTION_PLANETS = {
    # Coal synthesis: Gleba research unlock. Coal is mineable on Nauvis & Vulcanus.
    "coal-synthesis":          ["gleba", "fulgora", "aquilo"],
    # Productivity module 3: requires biter-egg, which needs Captivity (Gleba late-game).
    "productivity-module-3":   ["gleba", "fulgora", "aquilo"],
    # Biolab: requires biter-egg.
    "biolab":                  ["gleba", "fulgora", "aquilo"],
    # Captive biter spawner: Captivity tech, Gleba-late.
    "captive-biter-spawner":   ["gleba", "fulgora", "aquilo"],
    # Biter-egg production recipe (captive-spawner-process building).
    "biter-egg":               ["gleba", "fulgora", "aquilo"],
}

def main():
    with open(DATASET) as f:
        data = json.load(f)

    valid_planets = {p["key"] for p in data["planets"]}
    changed = 0
    for r in data["recipes"]:
        key = r["key"]
        if key in PRODUCTION_PLANETS:
            allowed = PRODUCTION_PLANETS[key]
            for p in allowed:
                if p not in valid_planets:
                    print(f"ERROR: unknown planet {p!r} in allowlist for {key}", file=sys.stderr)
                    sys.exit(1)
            r["production_planets"] = allowed
            changed += 1
            print(f"  annotated {key}: {allowed}")

    if changed != len(PRODUCTION_PLANETS):
        missing = set(PRODUCTION_PLANETS) - {r["key"] for r in data["recipes"]}
        print(f"WARNING: {len(missing)} expected recipes not found: {missing}", file=sys.stderr)

    with open(DATASET, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"\nUpdated {changed} recipes in {DATASET.name}")

if __name__ == "__main__":
    main()
