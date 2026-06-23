#!/usr/bin/env node
// Rate-parity tool: drives several solve targets and writes their full
// recipe-rate maps to JSON. Pass a second path to diff against a previous
// baseline. Used to validate refactors (sparse matrix, iterative DFS, etc.)
// produce bit-exact rate output vs an earlier commit.
//
//   node tools/rate-parity.js baseline.json           # write baseline
//   node tools/rate-parity.js current.json baseline.json   # diff
//
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { writeFileSync, readFileSync, existsSync } from "node:fs"

const PORT = process.env.SMOKE_PORT || 8134
const REPO_ROOT = new URL("..", import.meta.url).pathname
const URL_BASE = `http://localhost:${PORT}`
const OUT = process.argv[2]
const COMPARE = process.argv[3]

const server = spawn("python3", ["-m", "http.server", String(PORT)], {
    cwd: REPO_ROOT, stdio: ["ignore", "ignore", "pipe"],
})

async function waitForServer() {
    for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${URL_BASE}/calc.html`); if (r.ok) return } catch {}
        await sleep(200)
    }
    throw new Error("server not up")
}

let exitCode = 0
try {
    await waitForServer()
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.on("pageerror", e => console.error("pageerror:", e.message))

    // Run several targets that probe different recipe depths
    const targets = [
        "rocket-silo:r:1",
        "advanced-circuit:r:60",
        "processing-unit:r:30",
        "low-density-structure:r:10",
    ]
    const collected = {}
    for (const t of targets) {
        await page.goto(`${URL_BASE}/calc.html#zrate=m&items=${t}`, { waitUntil: "networkidle", timeout: 30_000 })
        await page.waitForTimeout(2_000)
        const rates = await page.evaluate(() => {
            if (!window.spec || !window.spec.lastTotals) return null
            const out = {}
            for (const [recipe, rate] of window.spec.lastTotals.rates) {
                out[recipe.key] = rate.toString()
            }
            return out
        })
        if (!rates) throw new Error(`No totals for ${t}`)
        collected[t] = rates
    }

    if (COMPARE && existsSync(COMPARE)) {
        const baseline = JSON.parse(readFileSync(COMPARE, "utf8"))
        let mismatch = 0
        for (const t of targets) {
            const a = baseline[t] || {}
            const b = collected[t] || {}
            const keys = new Set([...Object.keys(a), ...Object.keys(b)])
            for (const k of keys) {
                if (a[k] !== b[k]) {
                    console.error(`MISMATCH ${t} ${k}: baseline=${a[k]} new=${b[k]}`)
                    mismatch++
                }
            }
        }
        if (mismatch > 0) throw new Error(`${mismatch} rate mismatches`)
        console.log("✓ All rates match baseline")
    }
    if (OUT) {
        writeFileSync(OUT, JSON.stringify(collected, null, 2))
        console.log(`Wrote rates to ${OUT}`)
    }
    await browser.close()
} catch (e) {
    console.error("Failed:", e.message)
    exitCode = 1
} finally {
    server.kill("SIGTERM")
    process.exit(exitCode)
}
