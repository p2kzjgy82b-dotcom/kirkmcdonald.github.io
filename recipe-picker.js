/*Copyright 2026

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Per-row recipe picker. When an item has more than one producing recipe
(for example iron-plate via smelting vs casting-iron via foundry), the
totals-table row shows a "▾" affordance next to the recipe icon. Clicking
opens a popover listing every candidate recipe for that item; toggling
calls spec.setDisable / spec.setEnable and re-solves the factory.

This is purely a UI layer on top of the existing disable/enable plumbing
in factory.js, so URL-fragment persistence already works for free.*/

import { spec } from "./factory.js"

let popover = null
let popoverOwner = null  // DOM node that opened the current popover

function ensurePopover() {
    if (popover !== null) return popover
    popover = document.createElement("div")
    popover.className = "recipe-picker-popover"
    popover.style.display = "none"
    document.body.appendChild(popover)
    // Dismiss on outside click.
    document.addEventListener("click", (event) => {
        if (popover.style.display === "none") return
        if (popover.contains(event.target)) return
        if (popoverOwner !== null && popoverOwner.contains(event.target)) return
        hidePopover()
    })
    // Dismiss on Escape.
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && popover.style.display !== "none") {
            hidePopover()
        }
    })
    return popover
}

function hidePopover() {
    if (popover !== null) {
        popover.style.display = "none"
        popover.innerHTML = ""
    }
    popoverOwner = null
}

// Returns the recipes that could produce `item`, excluding:
//   * the synthetic DisabledRecipe sentinel (not in item.recipes anyway)
//   * recycling recipes (where `item` is a byproduct, not a chosen path)
//   * recipes whose primary (first) product is not `item` (i.e. ones
//     where `item` appears only as a secondary byproduct, like the way
//     casting-iron-stick yields iron-stick primarily but other recipes
//     might emit iron-plate as a side effect).
// Includes recipes currently disabled via spec.disable, so the user can
// re-enable them from the picker.
function candidateRecipes(item) {
    let out = []
    for (let r of item.recipes) {
        if (r.key.endsWith("-recycling")) continue
        if (r.products && r.products.length > 0 && r.products[0].item !== item) continue
        out.push(r)
    }
    return out
}

// Render the popover anchored next to `anchor`, listing every candidate
// recipe for `item`. `activeRecipe` is the recipe currently selected for
// the row (used to highlight the default entry).
function showPopover(anchor, item, activeRecipe) {
    let pop = ensurePopover()
    popoverOwner = anchor
    pop.innerHTML = ""

    let title = document.createElement("div")
    title.className = "recipe-picker-title"
    title.textContent = `Recipes for ${item.name}`
    pop.appendChild(title)

    let list = document.createElement("div")
    list.className = "recipe-picker-list"
    pop.appendChild(list)

    let candidates = candidateRecipes(item)
    // Sort: active recipe first, then enabled, then disabled.
    candidates.sort((a, b) => {
        if (a === activeRecipe) return -1
        if (b === activeRecipe) return 1
        let aDis = spec.disable.has(a) ? 1 : 0
        let bDis = spec.disable.has(b) ? 1 : 0
        if (aDis !== bDis) return aDis - bDis
        return a.name.localeCompare(b.name)
    })

    for (let recipe of candidates) {
        let row = document.createElement("div")
        row.className = "recipe-picker-row"
        let disabled = spec.disable.has(recipe)
        if (!disabled) row.classList.add("enabled")
        if (recipe === activeRecipe) row.classList.add("active")

        // Icon
        let iconHolder = document.createElement("span")
        iconHolder.className = "recipe-picker-icon"
        iconHolder.appendChild(recipe.icon.make(24, true))
        row.appendChild(iconHolder)

        // Name + building label
        let label = document.createElement("span")
        label.className = "recipe-picker-label"
        let building = spec.getBuilding(recipe)
        let buildingName = building ? building.name : "(no building)"
        label.textContent = `${recipe.name} — ${buildingName}`
        row.appendChild(label)

        // Status
        let status = document.createElement("span")
        status.className = "recipe-picker-status"
        if (recipe === activeRecipe) {
            status.textContent = "active"
        } else if (disabled) {
            status.textContent = "disabled"
        } else {
            status.textContent = "enabled"
        }
        row.appendChild(status)

        row.addEventListener("click", (event) => {
            event.stopPropagation()
            selectRecipe(recipe, item)
        })

        list.appendChild(row)
    }

    // Hint about the radio behaviour and global override.
    let hint = document.createElement("div")
    hint.className = "recipe-picker-hint"
    hint.textContent = "Picking a recipe disables the others for this item. Use Settings → Recipes to re-enable globally."
    pop.appendChild(hint)

    // Position the popover near the anchor. Use viewport coordinates so it
    // works regardless of page scroll.
    pop.style.display = "block"
    let rect = anchor.getBoundingClientRect()
    let popRect = pop.getBoundingClientRect()
    let top = rect.bottom + window.scrollY + 4
    let left = rect.left + window.scrollX
    // Keep within the viewport's right edge.
    let maxLeft = window.scrollX + document.documentElement.clientWidth - popRect.width - 8
    if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft)
    pop.style.top = `${top}px`
    pop.style.left = `${left}px`
}

// Select `recipe` as THE producer for `item`. Enables `recipe` if it was
// disabled, and disables every other primary producer of `item` -- a
// radio-style switch matching the user's mental model ("pick which
// machine builds this line"). Recycling recipes and recipes that only
// emit `item` as a byproduct are left untouched, since disabling them
// would unrelatedly break other items. The user can still override
// recipes globally via Settings -> Recipes.
function selectRecipe(recipe, item) {
    if (spec.disable.has(recipe)) {
        spec.setEnable(recipe)
    }
    for (let other of candidateRecipes(item)) {
        if (other === recipe) continue
        if (!spec.disable.has(other)) {
            spec.setDisable(other)
        }
    }
    spec.updateSolution()
    // updateSolution() rebuilds the table, which destroys our anchor; hide.
    hidePopover()
}

// Wire up the recipe-picker affordance on a building-cell d3 selection.
// `selection` is a d3 selection of <td.building-icon> elements whose data
// is { item, recipe, ... }. Only rows whose item has more than one
// candidate recipe get the affordance.
export function attachRecipePicker(selection) {
    selection.each(function (d) {
        if (!d || !d.item || !d.recipe) return
        if (candidateRecipes(d.item).length < 2) return
        let cell = this
        // Find the recipe icon (the first .icon in this cell). The building
        // cell renders recipe-icon ":" building-icon when !d.single.
        let icons = cell.querySelectorAll("img.icon, .icon")
        if (icons.length < 1) return
        let recipeIcon = icons[0]
        recipeIcon.classList.add("recipe-picker-anchor")
        recipeIcon.style.cursor = "pointer"
        recipeIcon.title = `Click to choose a different recipe for ${d.item.name}`

        // Caret marker so users discover the affordance.
        let caret = document.createElement("span")
        caret.className = "recipe-picker-caret"
        caret.textContent = "\u25BE"  // ▾
        recipeIcon.insertAdjacentElement("afterend", caret)

        let openHandler = (event) => {
            event.stopPropagation()
            // Toggle: if the popover is already open for this anchor, close.
            if (popoverOwner === recipeIcon && popover && popover.style.display !== "none") {
                hidePopover()
                return
            }
            showPopover(recipeIcon, d.item, d.recipe)
        }
        recipeIcon.addEventListener("click", openHandler)
        caret.addEventListener("click", openHandler)
    })
}
