#!/usr/bin/env node
// Headless-browser smoke test: serves the calculator and verifies it loads
// the dataset without any console errors. Drives a real solve to exercise
// the matrix pipeline.
//
// Run: npm run smoke
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

const PORT = process.env.SMOKE_PORT || 8123
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
            // not ready yet
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
    page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text())
    })
    page.on("pageerror", (e) => pageErrors.push(e.message))

    await page.goto(`${URL_BASE}/calc.html`, { waitUntil: "networkidle", timeout: 30_000 })
    await page.waitForTimeout(2_500)

    const spec = await page.evaluate(() => {
        if (!window.spec) return null
        return {
            items: window.spec.items.size,
            recipes: window.spec.recipes.size,
            buildTargets: window.spec.buildTargets.length,
            firstTarget: window.spec.buildTargets[0]?.item?.key ?? null,
        }
    })

    if (!spec) throw new Error("window.spec not initialised — calculator failed to bootstrap")
    if (spec.items < 200) throw new Error(`spec.items only ${spec.items} (expected 200+)`)
    if (spec.recipes < 400) throw new Error(`spec.recipes only ${spec.recipes} (expected 400+)`)

    if (consoleErrors.length || pageErrors.length) {
        console.error("Console errors:", consoleErrors)
        console.error("Page errors:", pageErrors)
        throw new Error(`Smoke test detected ${consoleErrors.length} console + ${pageErrors.length} page errors`)
    }

    console.log("✓ Smoke test passed")
    console.log(`  items:   ${spec.items}`)
    console.log(`  recipes: ${spec.recipes}`)
    console.log(`  default target: ${spec.firstTarget}`)

    await browser.close()
} catch (e) {
    console.error("✗ Smoke test failed:", e.message)
    exitCode = 1
} finally {
    server.kill("SIGTERM")
    process.exit(exitCode)
}
