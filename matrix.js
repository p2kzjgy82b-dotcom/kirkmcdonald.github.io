/*Copyright 2015-2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

import { zero, one } from "./rational.js"

// An MxN matrix of rationals, stored row-major sparse: each row is a
// Map<col, Rational> holding only nonzero entries. Reads of unset cells
// return the canonical `zero` Rational, preserving Kirk's original
// dense-Matrix API exactly. Sparse storage exploits the natural sparsity
// of recipe-graph simplex tableaus (~5-15 nonzeros per row vs hundreds
// of columns) and lets pivot inner loops iterate over the union of
// nonzero columns in the source + target rows instead of every column.
export class Matrix {
    constructor(rows, cols, mat) {
        this.rows = rows
        this.cols = cols
        if (mat) {
            this.mat = mat
        } else {
            this.mat = new Array(rows)
            for (let i = 0; i < rows; i++) {
                this.mat[i] = new Map()
            }
        }
    }
    toString() {
        let widths = []
        for (let i = 0; i < this.cols; i++) {
            let width = 0
            for (let j = 0; j < this.rows; j++) {
                let s = this.index(j, i).toDecimal(3)
                if (s.length > width) {
                    width = s.length
                }
            }
            widths.push(width)
        }
        let lines = []
        for (let i = 0; i < this.rows; i++) {
            let line = []
            for (let j = 0; j < this.cols; j++) {
                let s = this.index(i, j).toDecimal(3).padStart(widths[j])
                line.push(s)
            }
            lines.push(line.join(" "))
        }
        return lines.join("\n")
    }
    copy() {
        let mat = new Array(this.rows)
        for (let i = 0; i < this.rows; i++) {
            mat[i] = new Map(this.mat[i])
        }
        return new Matrix(this.rows, this.cols, mat)
    }
    index(row, col) {
        const v = this.mat[row].get(col)
        return v === undefined ? zero : v
    }
    setIndex(row, col, value) {
        if (value.isZero()) {
            this.mat[row].delete(col)
        } else {
            this.mat[row].set(col, value)
        }
    }
    addIndex(row, col, value) {
        if (value.isZero()) return
        const cur = this.mat[row].get(col)
        if (cur === undefined) {
            this.mat[row].set(col, value)
        } else {
            const next = cur.add(value)
            if (next.isZero()) {
                this.mat[row].delete(col)
            } else {
                this.mat[row].set(col, next)
            }
        }
    }
    // Multiplies all positive elements of a column by the value, in-place.
    // (For prod modules.)
    mulPosColumn(col, value) {
        for (let i = 0; i < this.rows; i++) {
            const x = this.mat[i].get(col)
            if (x === undefined || x.less(zero) || x.isZero()) {
                continue
            }
            const next = x.mul(value)
            if (next.isZero()) {
                this.mat[i].delete(col)
            } else {
                this.mat[i].set(col, next)
            }
        }
    }
    mulRow(row, value) {
        if (value.isZero()) {
            this.mat[row].clear()
            return
        }
        if (value.isOne()) {
            return
        }
        const r = this.mat[row]
        for (const [c, x] of r) {
            r.set(c, x.mul(value))
        }
    }
    appendColumn(column) {
        const mat = new Array(this.rows)
        const newCol = this.cols
        for (let i = 0; i < this.rows; i++) {
            const m = new Map(this.mat[i])
            const v = column[i]
            if (v !== undefined && !v.isZero()) {
                m.set(newCol, v)
            }
            mat[i] = m
        }
        return new Matrix(this.rows, this.cols + 1, mat)
    }
    // Returns new matrix with given number of additional columns.
    appendColumns(n) {
        // Nothing to do per cell; new columns are all zero (= absent).
        const mat = new Array(this.rows)
        for (let i = 0; i < this.rows; i++) {
            mat[i] = new Map(this.mat[i])
        }
        return new Matrix(this.rows, this.cols + n, mat)
    }
    setColumn(j, column) {
        for (let i = 0; i < this.rows; i++) {
            const v = column[i]
            if (v.isZero()) {
                this.mat[i].delete(j)
            } else {
                this.mat[i].set(j, v)
            }
        }
    }
    // Sets a column to all zeros.
    zeroColumn(col) {
        for (let i = 0; i < this.rows; i++) {
            this.mat[i].delete(col)
        }
    }
    // Sets a row to all zeros.
    zeroRow(row) {
        this.mat[row].clear()
    }
    swapRows(a, b) {
        const tmp = this.mat[a]
        this.mat[a] = this.mat[b]
        this.mat[b] = tmp
    }
    // Iterates over every nonzero value in the matrix. Used by solve.js
    // to compute the cost-function bounds. With dense storage this was
    // historically a `for (let x of A.mat)`, which assumed an internal
    // flat array; the sparse backend exposes the same logical contract
    // through this method instead.
    *iterValues() {
        for (let i = 0; i < this.rows; i++) {
            for (const v of this.mat[i].values()) {
                yield v
            }
        }
    }
    // Returns an iterable view of the row's nonzero (col, value) pairs.
    // Callers MUST NOT mutate the underlying row during iteration.
    // This lets sparse-aware loops (e.g. simplex.pivot) walk only the
    // O(nnz_row) nonzeros instead of the full O(cols) dense range.
    rowEntries(row) {
        return this.mat[row]
    }
    // Places the matrix into reduced row echelon form, in-place, and returns
    // the column numbers of the pivots.
    rref() {
        const rows = this.rows
        const cols = this.cols
        let piv_row = 0
        let piv_col = 0
        const pivots = []
        while (piv_col < cols && piv_row < rows) {
            let pivot_val
            let pivot_offset = 0
            for (; pivot_offset < rows - piv_row; pivot_offset++) {
                pivot_val = this.index(piv_row + pivot_offset, piv_col)
                if (!pivot_val.isZero()) {
                    break
                }
            }
            if (pivot_offset == rows - piv_row) {
                piv_col++
                continue
            }
            pivots.push(piv_col)
            if (pivot_offset != 0) {
                this.swapRows(piv_row, piv_row + pivot_offset)
            }
            const pivRow = this.mat[piv_row]
            for (let row = 0; row < rows; row++) {
                if (row == piv_row) {
                    continue
                }
                const targetRow = this.mat[row]
                const val = targetRow.get(piv_col)
                if (val === undefined) {
                    continue
                }
                // newVal(c) = pivot_val * target(r,c) - val * piv(r,c)
                //
                // Two phases, no intermediate Set:
                //   1. For each c in pivRow: update or insert into
                //      targetRow. After this phase, targetRow's entries
                //      for cols in pivRow are correct (and only those).
                //   2. For each c in targetRow that was NOT in pivRow,
                //      multiply by pivot_val (the val*pv term is zero).
                //
                // To make phase 2 detect "not in pivRow" cheaply without a
                // second lookup, phase 1 uses a per-entry sentinel: it
                // tags processed columns by writing them directly, so
                // phase 2 just iterates targetRow and skips anything
                // already in pivRow. We use a small temp Map of cols
                // processed-this-iteration to identify which targetRow
                // entries phase 2 should still touch.
                const processed = new Set()
                for (const [c, pv] of pivRow) {
                    processed.add(c)
                    const tv = targetRow.get(c)
                    let newVal
                    if (tv === undefined) {
                        newVal = zero.sub(val.mul(pv))
                    } else {
                        newVal = pivot_val.mul(tv).sub(val.mul(pv))
                    }
                    if (newVal.isZero()) {
                        targetRow.delete(c)
                    } else {
                        targetRow.set(c, newVal)
                    }
                }
                // Phase 2: targetRow entries not in pivRow scale by pivot_val.
                for (const [c, tv] of targetRow) {
                    if (processed.has(c)) continue
                    targetRow.set(c, pivot_val.mul(tv))
                }
            }
            piv_row += 1
        }
        for (let i = 0; i < pivots.length; i++) {
            const j = pivots[i]
            const pivRow = this.mat[i]
            const pivot_val = pivRow.get(j)  // guaranteed nonzero
            pivRow.set(j, one)
            // Divide every other nonzero entry in this row by pivot_val.
            for (const [c, v] of pivRow) {
                if (c > j) {
                    pivRow.set(c, v.div(pivot_val))
                }
            }
        }
        return pivots
    }
}
