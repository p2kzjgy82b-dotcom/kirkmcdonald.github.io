#!/usr/bin/env node
// Deep smoke test: drive a solve on rocket-silo (deepest recipe chain in
// 2.0.77) and verify recipe-rate sum is non-zero / no console errors.
// Touches cycle.js visit + factory.js _getItemGraph + solve.js end-to-end.
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

const PORT = process.env.SMOKE_PORT || 8133
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
        } catch {
            // pending
        }
        await sleep(200)
    }
    throw new Error(`Server never came up on ${PORT}`)
}

let exitCode = 0
try {
    await waitForServer()
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()) })
    page.on("pageerror", (e) => pageErrors.push(e.message))

    // Pre-load with rocket-silo target via URL fragment.
    await page.goto(`${URL_BASE}/calc.html#zrate=m&items=rocket-silo:r:1`, { waitUntil: "networkidle", timeout: 30_000 })
    await page.waitForTimeout(3_000)

    const result = await page.evaluate(() => {
        if (!window.spec) return null
        const lastTotals = window.spec.lastTotals
        if (!lastTotals) return { items: window.spec.items.size, recipes: window.spec.recipes.size, totalRecipes: 0 }
        return {
            items: window.spec.items.size,
            recipes: window.spec.recipes.size,
            totalRecipes: lastTotals.rates.size,
            firstTarget: window.spec.buildTargets[0]?.item?.key ?? null,
        }
    })

    if (!result) throw new Error("window.spec not initialised")
    if (result.totalRecipes < 10) throw new Error(`Only ${result.totalRecipes} recipes in totals (expected 10+)`)

    if (consoleErrors.length || pageErrors.length) {
        console.error("Console errors:", consoleErrors)
        console.error("Page errors:", pageErrors)
        throw new Error(`Smoke test detected ${consoleErrors.length} console + ${pageErrors.length} page errors`)
    }
    console.log("✓ Deep smoke test passed")
    console.log(`  items:          ${result.items}`)
    console.log(`  recipes:        ${result.recipes}`)
    console.log(`  solved recipes: ${result.totalRecipes}`)
    console.log(`  target:         ${result.firstTarget}`)
    await browser.close()
} catch (e) {
    console.error("✗ Deep smoke test failed:", e.message)
    exitCode = 1
} finally {
    server.kill("SIGTERM")
    process.exit(exitCode)
}
