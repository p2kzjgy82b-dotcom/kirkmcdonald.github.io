#!/usr/bin/env python3
"""
Fix crafting_categories on crafting machines in the Space Age dataset.

The Wube prototype definitions and upstream KirkMcDonald dataset (2.0.55)
both agree on a much narrower set of categories than what currently ships
in space-age-2.0.77.json. The 2.0.77 dataset incorrectly includes generic
"crafting" / "crafting-with-fluid" entries on metallurgy, electromagnetic,
organic, and cryogenic machines, which caused recipes like
automation-science-pack ("red science") to be marked as foundry-buildable.

Authoritative sources:
- https://github.com/wube/factorio-data (base game prototypes)
- https://raw.githubusercontent.com/KirkMcDonald/kirkmcdonald.github.io/master/data/space-age-2.0.55.json

This tool overwrites the crafting_categories field for every known machine
with a curated canonical value derived from those sources.
"""

import json
import sys
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "space-age-2.0.77.json"

CANONICAL_CATEGORIES = {
    "stone-furnace":         ["smelting"],
    "steel-furnace":         ["smelting"],
    "electric-furnace":      ["smelting"],
    "foundry":               ["crafting-with-fluid-or-metallurgy", "metallurgy", "metallurgy-or-assembling", "pressing"],
    "recycler":              ["recycling", "recycling-or-hand-crafting"],
    "biochamber":            ["organic", "organic-or-assembling", "organic-or-chemistry", "organic-or-hand-crafting"],
    "captive-biter-spawner": ["captive-spawner-process"],
    "assembling-machine-1":  ["advanced-crafting", "basic-crafting", "crafting", "electronics", "pressing"],
    "assembling-machine-2":  ["advanced-crafting", "basic-crafting", "crafting", "crafting-with-fluid", "crafting-with-fluid-or-metallurgy", "cryogenics-or-assembling", "electronics", "electronics-or-assembling", "electronics-with-fluid", "metallurgy-or-assembling", "organic-or-assembling", "organic-or-hand-crafting", "pressing"],
    "assembling-machine-3":  ["advanced-crafting", "basic-crafting", "crafting", "crafting-with-fluid", "crafting-with-fluid-or-metallurgy", "cryogenics-or-assembling", "electronics", "electronics-or-assembling", "electronics-with-fluid", "metallurgy-or-assembling", "organic-or-assembling", "organic-or-hand-crafting", "pressing"],
    "oil-refinery":          ["oil-processing"],
    "chemical-plant":        ["chemistry", "chemistry-or-cryogenics", "organic-or-chemistry"],
    "centrifuge":            ["centrifuging"],
    "electromagnetic-plant": ["electromagnetics", "electronics", "electronics-or-assembling", "electronics-with-fluid"],
    "cryogenic-plant":       ["chemistry-or-cryogenics", "cryogenics", "cryogenics-or-assembling"],
    "crusher":               ["crushing"],
    "character":             ["crafting", "electronics", "organic-or-assembling", "organic-or-hand-crafting", "pressing", "recycling-or-hand-crafting"],
}


def main() -> int:
    with DATA_FILE.open() as f:
        data = json.load(f)

    machines = data.get("crafting_machines", [])
    changed = 0
    seen = set()

    for m in machines:
        key = m["key"]
        seen.add(key)
        if key not in CANONICAL_CATEGORIES:
            print(f"WARN: unknown crafting machine '{key}' has no canonical mapping", file=sys.stderr)
            continue
        expected = sorted(CANONICAL_CATEGORIES[key])
        current = sorted(m.get("crafting_categories", []))
        if current != expected:
            diff_add = sorted(set(expected) - set(current))
            diff_rm  = sorted(set(current) - set(expected))
            print(f"FIX {key}:")
            if diff_rm:
                print(f"   remove: {diff_rm}")
            if diff_add:
                print(f"   add:    {diff_add}")
            m["crafting_categories"] = expected
            changed += 1

    missing = set(CANONICAL_CATEGORIES) - seen
    if missing:
        print(f"WARN: canonical mapping has entries not present in dataset: {sorted(missing)}", file=sys.stderr)

    if changed == 0:
        print("No changes needed; dataset already canonical.")
        return 0

    with DATA_FILE.open("w") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)
        f.write("\n")
    print(f"\nUpdated {changed} machine(s) in {DATA_FILE.name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
