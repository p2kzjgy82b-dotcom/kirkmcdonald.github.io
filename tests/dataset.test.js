// Unit tests for the 2.0.77 dataset.
// Verifies structural invariants Kirk's loaders depend on.
import { describe, it, expect, beforeAll } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const datasetPath = join(repoRoot, "data", "space-age-2.0.77.json")

let data

beforeAll(() => {
    expect(existsSync(datasetPath)).toBe(true)
    data = JSON.parse(readFileSync(datasetPath, "utf8"))
})

describe("dataset top-level shape", () => {
    const REQUIRED_KEYS = [
        "items", "recipes", "resources", "plants", "spoilage", "planets",
        "modules", "mining_drills", "crafting_machines", "boilers",
        "offshore_pumps", "agricultural_tower", "rocket_silo", "beacon",
        "belts", "fuel", "groups", "surface_properties", "fluids", "sprites",
    ]
    for (const k of REQUIRED_KEYS) {
        it(`has '${k}'`, () => expect(data[k]).toBeDefined())
    }
})

describe("counts", () => {
    it("has at least 350 items", () => expect(data.items.length).toBeGreaterThanOrEqual(350))
    it("has at least 500 recipes", () => expect(data.recipes.length).toBeGreaterThanOrEqual(500))
    it("has 5+ planets", () => expect(data.planets.length).toBeGreaterThanOrEqual(5))
})

describe("referential integrity", () => {
    let itemKeys
    beforeAll(() => {
        itemKeys = new Set(data.items.map((i) => i.key))
        for (const fl of data.fluids) {
            if (fl.item_key) itemKeys.add(fl.item_key)
        }
    })

    it("every recipe ingredient resolves to an item", () => {
        const broken = []
        for (const r of data.recipes) {
            for (const ing of r.ingredients || []) {
                if (!itemKeys.has(ing.name)) broken.push(`${r.key}/${ing.name}`)
            }
        }
        expect(broken).toEqual([])
    })

    it("every recipe result resolves to an item", () => {
        const broken = []
        for (const r of data.recipes) {
            for (const res of r.results || []) {
                if (!itemKeys.has(res.name)) broken.push(`${r.key}/${res.name}`)
            }
        }
        expect(broken).toEqual([])
    })

    it("every resource result resolves to an item", () => {
        const broken = []
        for (const r of data.resources) {
            for (const res of r.results || []) {
                if (!itemKeys.has(res.name)) broken.push(`${r.key}/${res.name}`)
            }
        }
        expect(broken).toEqual([])
    })
})

describe("recipe categories", () => {
    it("every recipe category is claimed by a producer", () => {
        const producerCats = new Set()
        for (const m of data.crafting_machines) {
            for (const c of m.crafting_categories || []) producerCats.add(c)
        }
        for (const m of data.rocket_silo) {
            for (const c of m.crafting_categories || []) producerCats.add(c)
        }
        const orphans = data.recipes
            .map((r) => r.category)
            .filter((c) => c && !producerCats.has(c))
        expect([...new Set(orphans)]).toEqual([])
    })
})

describe("sprite sheet integrity", () => {
    it("declared hash matches the PNG file", () => {
        const png = join(repoRoot, "images", `sprite-sheet-${data.sprites.hash}.png`)
        expect(existsSync(png)).toBe(true)
        const actual = createHash("md5").update(readFileSync(png)).digest("hex")
        expect(actual).toBe(data.sprites.hash)
    })
})

describe("authoritative resource categories", () => {
    // Every resource MUST declare its category in the dataset. recipe.js no
    // longer silently rewrites missing categories to 'basic-solid'.
    it("every resource has a non-empty category", () => {
        const missing = data.resources
            .filter((r) => !r.category)
            .map((r) => r.key)
        expect(missing).toEqual([])
    })

    it("tungsten-ore is hard-solid (only big-mining-drill mines it)", () => {
        const tungsten = data.resources.find((r) => r.key === "tungsten-ore")
        expect(tungsten?.category).toBe("hard-solid")
    })

    it("every resource category is claimed by at least one mining drill", () => {
        const drillCats = new Set()
        for (const d of data.mining_drills) {
            for (const c of d.resource_categories || []) drillCats.add(c)
        }
        const orphans = data.resources
            .map((r) => r.category)
            .filter((c) => c && !drillCats.has(c))
        expect([...new Set(orphans)]).toEqual([])
    })
})

describe("singletons & lists", () => {
    it("beacon is a single object with module slots", () => {
        expect(typeof data.beacon).toBe("object")
        expect(Array.isArray(data.beacon)).toBe(false)
        expect(data.beacon.energy_usage).toBeGreaterThan(0)
    })

    it("rocket_silo is a list with the silo building", () => {
        expect(Array.isArray(data.rocket_silo)).toBe(true)
        expect(data.rocket_silo.length).toBeGreaterThanOrEqual(1)
        expect(data.rocket_silo[0].key).toBe("rocket-silo")
    })
})
