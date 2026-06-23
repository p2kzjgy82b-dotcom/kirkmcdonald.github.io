// Unit tests for matrix.js (sparse BigInt-rational backend).
//
// These tests verify the public Matrix API exactly as the solver
// consumes it: constructor, index/setIndex/addIndex, mulRow,
// mulPosColumn, appendColumn(s), setColumn, zeroColumn/Row, swapRows,
// copy, toString, iterValues, rowEntries, and rref (canonical
// examples). Sparse storage is invisible at this layer; absent entries
// read back as `zero` and writes of `zero` delete entries — both
// asserted explicitly.
import { describe, it, expect } from "vitest"
import { Matrix } from "../matrix.js"
import { Rational, zero, one } from "../rational.js"

const R = (p, q = 1) => Rational.from_floats(p, q)

function dense(m) {
    // Return matrix as a row-major array of strings for easy diffing.
    const out = []
    for (let i = 0; i < m.rows; i++) {
        const row = []
        for (let j = 0; j < m.cols; j++) {
            row.push(m.index(i, j).toString())
        }
        out.push(row)
    }
    return out
}

describe("constructor + dimensions", () => {
    it("zero-initialized cells read back as `zero` constant", () => {
        const m = new Matrix(2, 3)
        expect(m.rows).toBe(2)
        expect(m.cols).toBe(3)
        expect(m.index(0, 0)).toBe(zero)
        expect(m.index(1, 2)).toBe(zero)
    })

    it("0x0 matrix is legal", () => {
        const m = new Matrix(0, 0)
        expect(m.rows).toBe(0)
        expect(m.cols).toBe(0)
    })
})

describe("index/setIndex/addIndex", () => {
    it("setIndex round-trips", () => {
        const m = new Matrix(2, 2)
        m.setIndex(0, 1, R(5))
        m.setIndex(1, 0, R(3, 7))
        expect(m.index(0, 1).equal(R(5))).toBe(true)
        expect(m.index(1, 0).equal(R(3, 7))).toBe(true)
        expect(m.index(0, 0)).toBe(zero)
    })

    it("setIndex of zero deletes the sparse entry", () => {
        const m = new Matrix(1, 1)
        m.setIndex(0, 0, R(5))
        expect(m.index(0, 0).equal(R(5))).toBe(true)
        m.setIndex(0, 0, zero)
        expect(m.index(0, 0)).toBe(zero)
        // Internal: row map should not contain the key.
        expect(m.rowEntries(0).has(0)).toBe(false)
    })

    it("addIndex accumulates and removes if sum is zero", () => {
        const m = new Matrix(1, 1)
        m.addIndex(0, 0, R(3))
        m.addIndex(0, 0, R(2))
        expect(m.index(0, 0).equal(R(5))).toBe(true)
        m.addIndex(0, 0, R(-5))
        expect(m.index(0, 0)).toBe(zero)
        expect(m.rowEntries(0).has(0)).toBe(false)
    })

    it("addIndex of zero is a no-op", () => {
        const m = new Matrix(1, 1)
        m.addIndex(0, 0, zero)
        expect(m.rowEntries(0).has(0)).toBe(false)
    })
})

describe("mulRow", () => {
    it("scales every nonzero entry in the row", () => {
        const m = new Matrix(2, 3)
        m.setIndex(0, 0, R(2))
        m.setIndex(0, 2, R(3))
        m.setIndex(1, 1, R(7)) // untouched
        m.mulRow(0, R(5))
        expect(m.index(0, 0).equal(R(10))).toBe(true)
        expect(m.index(0, 2).equal(R(15))).toBe(true)
        expect(m.index(1, 1).equal(R(7))).toBe(true)
    })

    it("mulRow by one is a no-op", () => {
        const m = new Matrix(1, 1)
        m.setIndex(0, 0, R(7))
        m.mulRow(0, one)
        expect(m.index(0, 0).equal(R(7))).toBe(true)
    })

    it("mulRow by zero clears the row", () => {
        const m = new Matrix(1, 3)
        m.setIndex(0, 0, R(7))
        m.setIndex(0, 2, R(-3))
        m.mulRow(0, zero)
        expect(m.rowEntries(0).size).toBe(0)
    })
})

describe("mulPosColumn", () => {
    it("multiplies only strictly-positive entries in the column", () => {
        const m = new Matrix(3, 2)
        m.setIndex(0, 0, R(2))   // pos -> scaled
        m.setIndex(1, 0, R(-1))  // neg -> untouched
        m.setIndex(2, 0, R(3))   // pos -> scaled
        m.setIndex(0, 1, R(99))  // different col -> untouched
        m.mulPosColumn(0, R(10))
        expect(m.index(0, 0).equal(R(20))).toBe(true)
        expect(m.index(1, 0).equal(R(-1))).toBe(true)
        expect(m.index(2, 0).equal(R(30))).toBe(true)
        expect(m.index(0, 1).equal(R(99))).toBe(true)
    })
})

describe("swapRows + zero(Col|Row)", () => {
    it("swapRows exchanges rows", () => {
        const m = new Matrix(2, 2)
        m.setIndex(0, 0, R(1)); m.setIndex(0, 1, R(2))
        m.setIndex(1, 0, R(3)); m.setIndex(1, 1, R(4))
        m.swapRows(0, 1)
        expect(dense(m)).toEqual([["3", "4"], ["1", "2"]])
    })

    it("zeroColumn clears a single column across all rows", () => {
        const m = new Matrix(2, 2)
        m.setIndex(0, 0, R(1)); m.setIndex(0, 1, R(2))
        m.setIndex(1, 0, R(3)); m.setIndex(1, 1, R(4))
        m.zeroColumn(0)
        expect(dense(m)).toEqual([["0", "2"], ["0", "4"]])
    })

    it("zeroRow clears the row entirely", () => {
        const m = new Matrix(2, 2)
        m.setIndex(0, 0, R(1)); m.setIndex(0, 1, R(2))
        m.setIndex(1, 0, R(3)); m.setIndex(1, 1, R(4))
        m.zeroRow(0)
        expect(dense(m)).toEqual([["0", "0"], ["3", "4"]])
    })
})

describe("copy + setColumn + appendColumn + appendColumns", () => {
    it("copy is independent", () => {
        const m = new Matrix(1, 1)
        m.setIndex(0, 0, R(7))
        const c = m.copy()
        m.setIndex(0, 0, R(99))
        expect(c.index(0, 0).equal(R(7))).toBe(true)
        expect(m.index(0, 0).equal(R(99))).toBe(true)
    })

    it("setColumn replaces all entries in the column", () => {
        const m = new Matrix(2, 2)
        m.setIndex(0, 0, R(99)) // will be cleared
        m.setColumn(0, [R(1), R(0)])
        expect(m.index(0, 0).equal(R(1))).toBe(true)
        expect(m.index(1, 0)).toBe(zero)
    })

    it("appendColumn adds one column and returns a new Matrix", () => {
        const m = new Matrix(2, 1)
        m.setIndex(0, 0, R(1))
        m.setIndex(1, 0, R(2))
        const m2 = m.appendColumn([R(7), zero])
        expect(m2.rows).toBe(2)
        expect(m2.cols).toBe(2)
        expect(m2.index(0, 1).equal(R(7))).toBe(true)
        expect(m2.index(1, 1)).toBe(zero)
        // Original unchanged.
        expect(m.cols).toBe(1)
    })

    it("appendColumns extends cols without changing contents", () => {
        const m = new Matrix(1, 1)
        m.setIndex(0, 0, R(5))
        const m2 = m.appendColumns(3)
        expect(m2.cols).toBe(4)
        expect(m2.index(0, 0).equal(R(5))).toBe(true)
        expect(m2.index(0, 3)).toBe(zero)
    })
})

describe("iterValues + rowEntries", () => {
    it("iterValues yields every nonzero exactly once", () => {
        const m = new Matrix(2, 3)
        m.setIndex(0, 1, R(5))
        m.setIndex(1, 2, R(7))
        const vals = [...m.iterValues()].map((v) => v.toString()).sort()
        expect(vals).toEqual(["5", "7"])
    })

    it("rowEntries reflects current nonzeros of the row", () => {
        const m = new Matrix(2, 3)
        m.setIndex(0, 1, R(5))
        m.setIndex(0, 2, R(7))
        const cols = [...m.rowEntries(0).keys()].sort()
        expect(cols).toEqual([1, 2])
    })
})

describe("toString", () => {
    it("formats column-aligned decimals", () => {
        const m = new Matrix(2, 2)
        m.setIndex(0, 0, R(1)); m.setIndex(0, 1, R(2))
        m.setIndex(1, 0, R(3)); m.setIndex(1, 1, R(4))
        const s = m.toString()
        // Two rows, two columns, space-separated values.
        const lines = s.split("\n")
        expect(lines).toHaveLength(2)
        expect(lines[0]).toMatch(/1.*2/)
        expect(lines[1]).toMatch(/3.*4/)
    })
})

describe("rref (reduced row echelon form)", () => {
    it("identity matrix is its own RREF with pivots at every column", () => {
        const m = new Matrix(3, 3)
        for (let i = 0; i < 3; i++) m.setIndex(i, i, R(1))
        const pivots = m.rref()
        expect(pivots).toEqual([0, 1, 2])
        expect(dense(m)).toEqual([
            ["1", "0", "0"],
            ["0", "1", "0"],
            ["0", "0", "1"],
        ])
    })

    it("handles row swaps for zero pivots", () => {
        // [[0,1],[1,0]] should swap to identity.
        const m = new Matrix(2, 2)
        m.setIndex(0, 1, R(1))
        m.setIndex(1, 0, R(1))
        const pivots = m.rref()
        expect(pivots).toEqual([0, 1])
        expect(dense(m)).toEqual([
            ["1", "0"],
            ["0", "1"],
        ])
    })

    it("reduces a 2x3 augmented system to RREF", () => {
        // Solve: x + 2y = 3, 3x + 4y = 5  =>  x = -1, y = 2.
        // Augmented matrix:
        //   [1 2 | 3]
        //   [3 4 | 5]
        // RREF:
        //   [1 0 | -1]
        //   [0 1 |  2]
        const m = new Matrix(2, 3)
        m.setIndex(0, 0, R(1)); m.setIndex(0, 1, R(2)); m.setIndex(0, 2, R(3))
        m.setIndex(1, 0, R(3)); m.setIndex(1, 1, R(4)); m.setIndex(1, 2, R(5))
        const pivots = m.rref()
        expect(pivots).toEqual([0, 1])
        expect(dense(m)).toEqual([
            ["1", "0", "-1"],
            ["0", "1", "2"],
        ])
    })

    it("rank-deficient matrix records pivots only on independent columns", () => {
        // Row 2 is 2x row 1; RREF should drop it to zeros with one pivot.
        const m = new Matrix(2, 3)
        m.setIndex(0, 0, R(1)); m.setIndex(0, 1, R(2)); m.setIndex(0, 2, R(3))
        m.setIndex(1, 0, R(2)); m.setIndex(1, 1, R(4)); m.setIndex(1, 2, R(6))
        const pivots = m.rref()
        expect(pivots).toEqual([0])
        expect(dense(m)).toEqual([
            ["1", "2", "3"],
            ["0", "0", "0"],
        ])
    })

    it("rref returns exact rationals (no float drift)", () => {
        // [[2,4],[3,5]] -> RREF [[1,0],[0,1]]; pivot scaling produces
        // exact rational results, not floats.
        const m = new Matrix(2, 2)
        m.setIndex(0, 0, R(2)); m.setIndex(0, 1, R(4))
        m.setIndex(1, 0, R(3)); m.setIndex(1, 1, R(5))
        m.rref()
        expect(m.index(0, 0).equal(one)).toBe(true)
        expect(m.index(1, 1).equal(one)).toBe(true)
        expect(m.index(0, 1)).toBe(zero)
        expect(m.index(1, 0)).toBe(zero)
    })
})
