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

describe("character (player) as first-class producer", () => {
    // The player character is a regular crafting_machine. Categories and speed
    // are sourced from Wube's CharacterPrototype as patched by Space Age:
    //   crafting_categories = {"crafting", "electronics", "pressing",
    //     "recycling-or-hand-crafting", "organic-or-hand-crafting",
    //     "organic-or-assembling"}
    //   crafting_speed = 1.0
    const character = () => data.crafting_machines.find((m) => m.key === "character")

    it("character is in crafting_machines", () => {
        expect(character()).toBeDefined()
    })

    it("character declares exactly the 6 Wube-defined categories", () => {
        const expected = [
            "crafting",
            "electronics",
            "organic-or-assembling",
            "organic-or-hand-crafting",
            "pressing",
            "recycling-or-hand-crafting",
        ]
        expect([...character().crafting_categories].sort()).toEqual(expected)
    })

    it("character has no fuel, no power, no module slots", () => {
        const c = character()
        expect(c.crafting_speed).toBe(1)
        expect(c.energy_usage).toBe(0)
        expect(c.module_slots).toBe(0)
        expect(c.energy_source.type).toBe("void")
    })

    it("every character category is claimed by at least one recipe", () => {
        // No point listing a category nothing produces in it.
        const recipeCats = new Set(data.recipes.map((r) => r.category))
        const orphans = character().crafting_categories.filter((c) => !recipeCats.has(c))
        expect(orphans).toEqual([])
    })

    it("recycling-or-hand-crafting still has recycler as a producer (not just character)", () => {
        // Sanity check that adding character to this category didn't displace
        // the recycler. The factory.js DEFAULT_BUILDINGS list must include
        // "recycler" so it stays the default.
        const producers = data.crafting_machines
            .filter((m) => m.crafting_categories.includes("recycling-or-hand-crafting"))
            .map((m) => m.key)
            .sort()
        expect(producers).toContain("recycler")
        expect(producers).toContain("character")
    })
})

describe("pumpjack as first-class building", () => {
    // Previously pumpjack was excluded from the building registry and fluid
    // resources went through a hardcoded PumpjackRecipe with category=null.
    // After cleanup, pumpjack is a regular Miner and fluid resources dispatch
    // through the standard category mechanism.
    it("pumpjack is present in mining_drills with basic-fluid category", () => {
        const pumpjack = data.mining_drills.find((d) => d.key === "pumpjack")
        expect(pumpjack).toBeDefined()
        expect(pumpjack.resource_categories).toContain("basic-fluid")
        expect(pumpjack.mining_speed).toBeGreaterThan(0)
        expect(pumpjack.energy_usage).toBeGreaterThan(0)
    })

    it("every basic-fluid resource has a unified result shape (amount, not min/max)", () => {
        const fluids = data.resources.filter((r) => r.category === "basic-fluid")
        expect(fluids.length).toBeGreaterThan(0)
        for (const r of fluids) {
            expect(r.results.length).toBeGreaterThan(0)
            for (const result of r.results) {
                expect(result.amount, `${r.key} result missing amount`).toBeTypeOf("number")
                expect(result).not.toHaveProperty("amount_min")
                expect(result).not.toHaveProperty("amount_max")
            }
        }
    })

    it("pumpjack is the sole producer for basic-fluid resources", () => {
        const fluidDrills = data.mining_drills.filter((d) =>
            (d.resource_categories || []).includes("basic-fluid"),
        )
        expect(fluidDrills.map((d) => d.key)).toEqual(["pumpjack"])
    })

    it("crude-oil mining produces 10 units per cycle at base speed", () => {
        // Sanity check that pumpjack will tick at 10 crude-oil/sec under default settings:
        //   rate = mining_speed / mining_time * amount = 1 / 1 * 10 = 10
        const pumpjack = data.mining_drills.find((d) => d.key === "pumpjack")
        const crude = data.resources.find((r) => r.key === "crude-oil")
        expect(crude.mining_time).toBe(1)
        expect(pumpjack.mining_speed).toBe(1)
        expect(crude.results[0].name).toBe("crude-oil")
        expect(crude.results[0].amount).toBe(10)
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

describe("production_planets annotations", () => {
    // Soft planet preference: recipe is enabled by default only on the
    // listed planets. User can re-enable manually on any planet via
    // Settings. See planet.js Planet.allows().
    const EXPECTED = {
        // Coal is mineable on Nauvis & Vulcanus; coal-synthesis is the
        // natural choice only where there's no native coal.
        "coal-synthesis": ["gleba", "fulgora", "aquilo"],

        // Foundry casting recipes are the Vulcanus default; Nauvis prefers
        // the conventional smelting/crafting alternative. Re-enableable
        // anywhere via Settings.
        "casting-iron":                  ["vulcanus"],
        "casting-copper":                ["vulcanus"],
        "casting-steel":                 ["vulcanus"],
        "casting-iron-gear-wheel":       ["vulcanus"],
        "casting-iron-stick":            ["vulcanus"],
        "casting-copper-cable":          ["vulcanus"],
        "casting-pipe":                  ["vulcanus"],
        "casting-pipe-to-ground":        ["vulcanus"],
        "casting-low-density-structure": ["vulcanus"],

        // Lava-based molten metal is Vulcanus-only (no lava on other planets).
        "molten-iron-from-lava":         ["vulcanus"],
        "molten-copper-from-lava":       ["vulcanus"],
    }
    for (const [key, allowed] of Object.entries(EXPECTED)) {
        it(`${key} prefers ${allowed.join(", ")}`, () => {
            const r = data.recipes.find((x) => x.key === key)
            expect(r, `recipe ${key} missing`).toBeDefined()
            expect(r.production_planets).toEqual(allowed)
        })
    }
    it("each preferred planet exists", () => {
        const planetKeys = new Set(data.planets.map((p) => p.key))
        for (const allowed of Object.values(EXPECTED)) {
            for (const p of allowed) {
                expect(planetKeys.has(p), `unknown planet ${p}`).toBe(true)
            }
        }
    })
    it("biter-egg recipes are NOT planet-restricted (available everywhere after tech)", () => {
        for (const key of ["biter-egg", "captive-biter-spawner", "biolab", "productivity-module-3"]) {
            const r = data.recipes.find((x) => x.key === key)
            expect(r, `recipe ${key} missing`).toBeDefined()
            expect(r.production_planets, `${key} should not be planet-gated`).toBeUndefined()
        }
    })

    it("every annotated casting-* recipe has a non-foundry counterpart producing the same item", () => {
        // This guards against the dataset evolving so that a casting recipe
        // becomes the only producer of an item -- if that ever happens,
        // gating it to Vulcanus would make the item unproducible on Nauvis.
        const recipeByKey = new Map(data.recipes.map((r) => [r.key, r]))
        for (const key of Object.keys(EXPECTED)) {
            if (!key.startsWith("casting-")) continue
            const casting = recipeByKey.get(key)
            const products = casting.products || casting.results || []
            expect(products.length, `${key} has no products`).toBeGreaterThan(0)
            const productName = products[0].name
            const alternates = data.recipes.filter((r) => {
                if (r.key === key) return false
                if (r.category === "metallurgy") return false
                if (r.key.endsWith("-recycling")) return false
                const ps = r.products || r.results || []
                return ps.some((p) => p.name === productName)
            })
            expect(alternates.length, `${key}: no non-foundry alternative producing ${productName}`).toBeGreaterThan(0)
        }
    })

    it("ore-based molten-iron / molten-copper recipes are NOT planet-gated (foundries work anywhere)", () => {
        for (const key of ["molten-iron", "molten-copper"]) {
            const r = data.recipes.find((x) => x.key === key)
            expect(r, `recipe ${key} missing`).toBeDefined()
            expect(r.production_planets, `${key} should not be planet-gated`).toBeUndefined()
        }
    })
})
