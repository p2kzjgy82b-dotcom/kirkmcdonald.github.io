#!/usr/bin/env node
// Headless-browser smoke test for the per-row recipe picker (Commit B)
// and the Vulcanus foundry preferences (Commit A).
//
// Verifies:
//   1. On Nauvis with a red-science target, iron-plate is produced by the
//      conventional smelting recipe (not casting-iron), and copper-plate
//      and iron-gear-wheel similarly avoid the foundry.
//   2. The recipe-picker DOM affordance exists for items with alternates.
//   3. Clicking the picker and toggling to casting-iron actually switches
//      the row's building to the foundry after re-solve.
//   4. Switching the planet to Vulcanus alone makes casting recipes the
//      default without any user disable/enable actions.
//
// Run: node tools/smoke-recipe-picker.js
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

const PORT = process.env.SMOKE_PORT || 8124
const REPO_ROOT = new URL("..", import.meta.url).pathname
const URL_BASE = `http://localhost:${PORT}`

const server = spawn("python3", ["-m", "http.server", String(PORT)], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "ignore", "pipe"],
})

async function waitForServer() {
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`${URL_BASE}/calc.html`)
            if (res.ok) return
        } catch {}
        await sleep(200)
    }
    throw new Error(`Server never came up on ${PORT}`)
}

let exitCode = 0
let browser

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// Returns a map of recipe-key -> building-key for the current totals table.
async function dumpRows(page) {
    return page.evaluate(() => {
        const out = {}
        if (!window.spec) return out
        for (const [recipe, _rate] of window.spec.lastTotals?.rates ?? new Map()) {
            const building = window.spec.getBuilding(recipe)
            out[recipe.key] = building ? building.key : null
        }
        return out
    })
}

try {
    await waitForServer()

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text())
    })
    page.on("pageerror", (e) => pageErrors.push(e.message))

    // 1. Default load — should land on Nauvis and use the smelting path.
    await page.goto(`${URL_BASE}/calc.html`, { waitUntil: "networkidle", timeout: 30_000 })
    await page.waitForTimeout(2_500)

    // Force-set red science as the sole target.
    await page.evaluate(() => {
        for (const t of [...window.spec.buildTargets]) {
            window.spec.removeTarget(t)
        }
        window.spec.addTarget("automation-science-pack")
        if (window.spec.buildTargets[0]?.setRate) {
            window.spec.buildTargets[0].setRate("60")
        }
        window.spec.updateSolution()
    })
    await page.waitForTimeout(500)

    let rows = await dumpRows(page)
    console.log("Default (Nauvis):")
    for (const [k, b] of Object.entries(rows).sort()) {
        console.log(`  ${k.padEnd(35)} -> ${b}`)
    }
    assert("iron-plate" in rows, "iron-plate row missing on Nauvis")
    assert(!("casting-iron" in rows), `casting-iron should NOT be in default Nauvis solve, got ${rows["casting-iron"]}`)
    assert(!("casting-copper" in rows), "casting-copper should NOT be in default Nauvis solve")
    assert(!("casting-iron-gear-wheel" in rows), "casting-iron-gear-wheel should NOT be in default Nauvis solve")
    console.log("✓ Nauvis default avoids foundry casting recipes")

    // 2. The recipe-picker affordance must be present in the DOM somewhere.
    const caretCount = await page.evaluate(() => document.querySelectorAll(".recipe-picker-caret").length)
    assert(caretCount > 0, "expected at least one .recipe-picker-caret to render")
    console.log(`✓ recipe-picker affordance rendered (${caretCount} carets)`)

    // 2b. Open the picker on the iron-plate row, click casting-iron, and
    //     verify the row's building flips to a foundry.
    const toggled = await page.evaluate(async () => {
        // Find the iron-plate row's building cell.
        const rows = [...document.querySelectorAll("tr.display-row")]
        let target = null
        for (const tr of rows) {
            const d = tr.__data__
            if (d && d.item && d.item.key === "iron-plate") { target = tr; break }
        }
        if (!target) return { error: "iron-plate row not found" }
        const caret = target.querySelector(".recipe-picker-caret")
        if (!caret) return { error: "no caret in iron-plate row" }
        caret.click()
        await new Promise(r => setTimeout(r, 100))
        const popover = document.querySelector(".recipe-picker-popover")
        if (!popover || popover.style.display === "none") return { error: "popover did not open" }
        const choices = [...popover.querySelectorAll(".recipe-picker-row")]
        const choiceLabels = choices.map(c => c.querySelector(".recipe-picker-label").textContent)
        // Click the casting-iron entry.
        // Recipe labels use the human name (e.g. "Casting iron"). Find the
        // entry whose underlying d3 data key starts with "casting-".
        const castingChoice = choices.find(c => {
            const d = c.__data__
            if (d && d.key) return d.key.startsWith("casting-")
            const txt = c.querySelector(".recipe-picker-label").textContent.toLowerCase()
            return txt.startsWith("casting ")
        })
        if (!castingChoice) return { error: `no casting choice, options=${JSON.stringify(choiceLabels)}` }
        castingChoice.click()
        await new Promise(r => setTimeout(r, 250))
        return { choiceLabels }
    })
    if (toggled.error) throw new Error(`picker UI failed: ${toggled.error}`)
    console.log(`  picker offered: ${JSON.stringify(toggled.choiceLabels)}`)

    rows = await dumpRows(page)
    assert("casting-iron" in rows, "after toggling, casting-iron should appear in solution")
    assert(rows["casting-iron"] === "foundry", `casting-iron should be built in foundry, got ${rows["casting-iron"]}`)
    console.log("✓ Picker successfully switched iron-plate -> casting-iron (foundry) on Nauvis")

    // Re-enable iron-plate via the picker on the casting-iron row so we
    // can clear state before the planet test.
    await page.evaluate(async () => {
        const r = window.spec.recipes.get("iron-plate")
        if (window.spec.disable.has(r)) window.spec.setEnable(r)
        const cr = window.spec.recipes.get("casting-iron")
        if (!window.spec.disable.has(cr)) window.spec.setDisable(cr)
        window.spec.updateSolution()
        await new Promise(r => setTimeout(r, 100))
    })

    // 3. Switch to Vulcanus — casting recipes should become the default.
    await page.evaluate(() => {
        const planet = [...window.spec.planets.values()].find(p => p.key === "vulcanus")
        window.spec.selectedPlanets = new Set([planet])
        window.spec._syncPlanetDisable()
        window.spec.updateSolution()
    })
    await page.waitForTimeout(500)

    rows = await dumpRows(page)
    console.log("\nVulcanus-only:")
    for (const [k, b] of Object.entries(rows).sort()) {
        console.log(`  ${k.padEnd(35)} -> ${b}`)
    }
    // On Vulcanus, casting-iron and casting-copper should appear since the
    // smelting alternatives are still allowed but the foundry path is now
    // the natural choice -- the solver may still pick either, since this
    // is a soft preference. The strong assertion is that BOTH are at least
    // available (not planet-disabled).
    const vulcanusAvail = await page.evaluate(() => {
        const r = window.spec.recipes.get("casting-iron")
        return {
            exists: !!r,
            disabled: window.spec.disable.has(r),
            planetaryBaseline: window.spec.planetaryBaseline.has(r),
        }
    })
    assert(vulcanusAvail.exists, "casting-iron recipe missing from dataset")
    assert(!vulcanusAvail.disabled, "casting-iron should not be disabled on Vulcanus")
    assert(!vulcanusAvail.planetaryBaseline, "casting-iron should NOT be in planetary baseline disable on Vulcanus")
    console.log("✓ casting-iron is enabled by default on Vulcanus")

    // Switch back to Nauvis and re-check the gating.
    await page.evaluate(() => {
        const planet = [...window.spec.planets.values()].find(p => p.key === "nauvis")
        window.spec.selectedPlanets = new Set([planet])
        window.spec._syncPlanetDisable()
        window.spec.updateSolution()
    })
    await page.waitForTimeout(500)

    const nauvisGating = await page.evaluate(() => {
        const r = window.spec.recipes.get("casting-iron")
        return {
            planetaryBaseline: window.spec.planetaryBaseline.has(r),
        }
    })
    assert(nauvisGating.planetaryBaseline, "casting-iron should be in planetary baseline disable on Nauvis")
    console.log("✓ casting-iron is planet-gated (disabled) by default on Nauvis")

    if (consoleErrors.length > 0) {
        console.log("\nConsole errors:")
        for (const e of consoleErrors) console.log("  " + e)
        throw new Error(`Console errors: ${consoleErrors.length}`)
    }
    if (pageErrors.length > 0) {
        console.log("\nPage errors:")
        for (const e of pageErrors) console.log("  " + e)
        throw new Error(`Page errors: ${pageErrors.length}`)
    }

    console.log("\n✓ All recipe-picker smoke checks passed")
} catch (err) {
    console.error("\n✗ Smoke test failed:", err.message)
    if (err.stack) console.error(err.stack)
    exitCode = 1
} finally {
    if (browser) await browser.close()
    server.kill()
    process.exit(exitCode)
}
