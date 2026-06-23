#!/usr/bin/env node
// Validates a Kirk-format dataset for structural integrity.
// Usage: node tools/validate-dataset.js [path/to/data.json]
// Default: data/space-age-2.0.77.json

import { readFileSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const datasetPath = resolve(process.argv[2] || join(__dirname, "..", "data", "space-age-2.0.77.json"))

if (!existsSync(datasetPath)) {
    console.error(`Dataset not found: ${datasetPath}`)
    process.exit(1)
}

const data = JSON.parse(readFileSync(datasetPath, "utf8"))
const errors = []
const warnings = []
const err = (m) => errors.push(m)
const warn = (m) => warnings.push(m)

// 1. Required top-level keys
const REQUIRED_KEYS = [
    "items", "recipes", "resources", "plants", "spoilage", "planets",
    "modules", "mining_drills", "crafting_machines", "boilers",
    "offshore_pumps", "agricultural_tower", "rocket_silo", "beacon",
    "belts", "fuel", "groups", "surface_properties", "fluids", "sprites",
]
for (const k of REQUIRED_KEYS) {
    if (!(k in data)) err(`missing top-level key: ${k}`)
}

// 2. Item-key index, plus fluid keys
const itemKeys = new Set()
for (const it of data.items || []) {
    if (!it.key) err(`item missing 'key': ${JSON.stringify(it).slice(0, 100)}`)
    itemKeys.add(it.key)
}
for (const fl of data.fluids || []) {
    if (fl.item_key) itemKeys.add(fl.item_key)
}

// 3. Referential integrity for recipes/resources
for (const r of data.recipes || []) {
    for (const ing of r.ingredients || []) {
        if (!itemKeys.has(ing.name)) err(`recipe '${r.key}': ingredient '${ing.name}' has no item`)
    }
    for (const res of r.results || []) {
        if (!itemKeys.has(res.name)) err(`recipe '${r.key}': result '${res.name}' has no item`)
    }
}
for (const r of data.resources || []) {
    for (const res of r.results || []) {
        if (!itemKeys.has(res.name)) err(`resource '${r.key}': result '${res.name}' has no item`)
    }
}

// 4. Every recipe category covered by some producer
const producerCats = new Set()
for (const m of data.crafting_machines || []) {
    for (const c of m.crafting_categories || []) producerCats.add(c)
}
for (const m of data.rocket_silo || []) {
    for (const c of m.crafting_categories || []) producerCats.add(c)
}
const recipeCats = new Set((data.recipes || []).map((r) => r.category).filter(Boolean))
const orphaned = [...recipeCats].filter((c) => !producerCats.has(c))
if (orphaned.length) err(`recipe categories with no producer: ${orphaned.join(", ")}`)

// 5. Sprite sheet hash matches file
if (data.sprites?.hash) {
    const spritePath = join(dirname(datasetPath), "..", "images", `sprite-sheet-${data.sprites.hash}.png`)
    if (!existsSync(spritePath)) {
        warn(`sprite-sheet PNG not found at ${spritePath}`)
    } else {
        const buf = readFileSync(spritePath)
        const actual = createHash("md5").update(buf).digest("hex")
        if (actual !== data.sprites.hash) {
            err(`sprite hash mismatch: declared ${data.sprites.hash}, actual ${actual}`)
        }
    }
}

// 6. Sanity counts
const counts = {
    items: data.items?.length ?? 0,
    recipes: data.recipes?.length ?? 0,
    resources: data.resources?.length ?? 0,
    crafting_machines: data.crafting_machines?.length ?? 0,
    mining_drills: data.mining_drills?.length ?? 0,
    fluids: data.fluids?.length ?? 0,
    planets: data.planets?.length ?? 0,
    fuel: data.fuel?.length ?? 0,
}
if (counts.items < 350) err(`item count low: ${counts.items}`)
if (counts.recipes < 500) err(`recipe count low: ${counts.recipes}`)

console.log(`Dataset: ${datasetPath}`)
console.log(`Sizes:`, counts)
if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`)
    for (const w of warnings) console.log(`  ! ${w}`)
}
if (errors.length) {
    console.log(`\nErrors (${errors.length}):`)
    for (const e of errors.slice(0, 30)) console.log(`  ✗ ${e}`)
    if (errors.length > 30) console.log(`  ... and ${errors.length - 30} more`)
    process.exit(1)
}
console.log("\n✓ All structural checks passed")

export { data, itemKeys, counts }
