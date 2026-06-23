/*Copyright 2015-2019 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

import { zero } from "./rational.js"

function pivot(A, row, col) {
    let x = A.index(row, col)
    A.mulRow(row, x.reciprocate())
    // Snapshot the pivot row's nonzeros into a flat array so we can
    // iterate without paying per-entry Map overhead and without holding
    // a live view (the pivot row itself is unchanged by the loop below,
    // but defensive copying is cheap relative to BigInt arithmetic).
    const pivRow = A.rowEntries(row)
    const pivCols = new Array(pivRow.size)
    const pivVals = new Array(pivRow.size)
    {
        let k = 0
        for (const [c, v] of pivRow) {
            pivCols[k] = c
            pivVals[k] = v
            k++
        }
    }
    const ncols = pivCols.length
    for (let r = 0; r < A.rows; r++) {
        if (r === row) {
            continue
        }
        const ratio = A.index(r, col)
        if (ratio.isZero()) {
            continue
        }
        // newVal(r, c) = A(r, c) - A(row, c) * ratio
        // A(row, c) is zero outside pivCols, so the update is a no-op
        // there. Iterate the (handful of) pivot-row nonzeros only.
        for (let k = 0; k < ncols; k++) {
            const c = pivCols[k]
            const newVal = A.index(r, c).sub(pivVals[k].mul(ratio))
            A.setIndex(r, c, newVal)
        }
    }
}

function pivotCol(A, col) {
    let best_ratio = null
    let best_row = null
    for (let row = 0; row < A.rows - 1; row++) {
        let x = A.index(row, col)
        if (!zero.less(x)) {
            continue
        }
        let ratio = A.index(row, A.cols - 1).div(x)
        if (best_ratio === null || ratio.less(best_ratio)) {
            best_ratio = ratio
            best_row = row
        }
    }
    if (best_ratio !== null) {
        pivot(A, best_row, col)
    }
    return best_row
}

export function simplex(A) {
    while (true) {
        // Find the most-negative entry in the cost row (last row). With
        // sparse storage we iterate only the row's nonzeros; columns
        // that are absent are implicitly zero, which can't beat a
        // running minimum that is already ≤ zero. If no nonzero entry
        // is negative, the running min stays at `zero` and we exit.
        let min = zero
        let minCol = null
        const costRow = A.rowEntries(A.rows - 1)
        const lastCol = A.cols - 1
        for (const [col, x] of costRow) {
            if (col === lastCol) continue
            if (x.less(min)) {
                min = x
                minCol = col
            }
        }
        if (!min.less(zero)) {
            return
        }
        let bestRow = pivotCol(A, minCol)
        if (bestRow === null) {
            // The simplex LP is unbounded along this column. In a
            // correctly-formulated recipe-graph tableau this is
            // unreachable, but raise a real Error rather than the
            // historical typo `new Exception(...)` which itself threw
            // a ReferenceError and obscured the actual cause.
            throw new Error("simplex: failed to pivot (unbounded LP)")
        }
    }
}
