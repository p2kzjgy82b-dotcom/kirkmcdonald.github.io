// Unit tests for rational.js (native BigInt backend).
// Covers arithmetic, normalization, parsing, and edge cases.
import { describe, it, expect } from "vitest"
import {
    Rational,
    zero,
    one,
    half,
    oneThird,
    twoThirds,
    minusOne,
} from "../rational.js"

const R = (p, q = 1n) => new Rational(BigInt(p), BigInt(q))

describe("normalization", () => {
    it("reduces via GCD", () => {
        const r = R(6, 9)
        expect(r.p).toBe(2n)
        expect(r.q).toBe(3n)
    })

    it("normalizes negative denominator", () => {
        const r = R(1, -2)
        expect(r.p).toBe(-1n)
        expect(r.q).toBe(2n)
    })

    it("zero numerator gives zero", () => {
        const r = R(0, 7)
        expect(r.isZero()).toBe(true)
    })

    it("constants are correctly normalized", () => {
        expect(zero.p).toBe(0n)
        expect(one.equal(R(1, 1))).toBe(true)
        expect(half.equal(R(1, 2))).toBe(true)
        expect(oneThird.equal(R(1, 3))).toBe(true)
        expect(twoThirds.equal(R(2, 3))).toBe(true)
        expect(minusOne.equal(R(-1, 1))).toBe(true)
    })
})

describe("arithmetic", () => {
    it("add", () => {
        expect(half.add(oneThird).equal(R(5, 6))).toBe(true)
    })

    it("sub", () => {
        expect(one.sub(oneThird).equal(twoThirds)).toBe(true)
    })

    it("sub identity for zero", () => {
        expect(half.sub(zero)).toBe(half)
    })

    it("mul", () => {
        expect(half.mul(half).equal(R(1, 4))).toBe(true)
    })

    it("mul identity for one and zero", () => {
        expect(half.mul(one)).toBe(half)
        expect(one.mul(half)).toBe(half)
        expect(half.mul(zero)).toBe(zero)
        expect(zero.mul(half)).toBe(zero)
    })

    it("div", () => {
        expect(half.div(oneThird).equal(R(3, 2))).toBe(true)
    })

    it("reciprocate", () => {
        expect(R(3, 7).reciprocate().equal(R(7, 3))).toBe(true)
    })

    it("pow integer exponent", () => {
        expect(half.pow(3).equal(R(1, 8))).toBe(true)
        expect(R(2, 3).pow(4).equal(R(16, 81))).toBe(true)
    })

    it("abs", () => {
        expect(R(-3, 5).abs().equal(R(3, 5))).toBe(true)
        expect(R(3, 5).abs().equal(R(3, 5))).toBe(true)
    })
})

describe("comparisons", () => {
    it("less", () => {
        expect(oneThird.less(half)).toBe(true)
        expect(half.less(oneThird)).toBe(false)
        expect(half.less(half)).toBe(false)
    })

    it("less across negative", () => {
        expect(minusOne.less(zero)).toBe(true)
        expect(zero.less(one)).toBe(true)
    })

    it("equal", () => {
        expect(R(2, 4).equal(half)).toBe(true)
    })

    it("isOne, isZero, isInteger", () => {
        expect(one.isOne()).toBe(true)
        expect(half.isOne()).toBe(false)
        expect(zero.isZero()).toBe(true)
        expect(R(3, 1).isInteger()).toBe(true)
        expect(half.isInteger()).toBe(false)
    })
})

describe("divmod, floor, ceil", () => {
    it("divmod of integers", () => {
        const { quotient, remainder } = R(7, 1).divmod(R(3, 1))
        expect(quotient.equal(R(2, 1))).toBe(true)
        expect(remainder.equal(R(1, 1))).toBe(true)
    })

    it("floor of positive non-integer", () => {
        expect(R(7, 3).floor().equal(R(2, 1))).toBe(true)
    })

    it("floor of integer", () => {
        expect(R(6, 3).floor().equal(R(2, 1))).toBe(true)
    })

    it("floor of negative non-integer rounds toward -inf", () => {
        expect(R(-7, 3).floor().equal(R(-3, 1))).toBe(true)
    })

    it("ceil of non-integer", () => {
        expect(R(7, 3).ceil().equal(R(3, 1))).toBe(true)
    })

    it("ceil of integer is itself", () => {
        expect(R(6, 3).ceil().equal(R(2, 1))).toBe(true)
    })
})

describe("from_float", () => {
    it("exact for integers", () => {
        expect(Rational.from_float(5).equal(R(5, 1))).toBe(true)
        expect(Rational.from_float(0).equal(zero)).toBe(true)
    })

    it("exact for 0.5", () => {
        expect(Rational.from_float(0.5).equal(half)).toBe(true)
    })

    it("exact for 0.25", () => {
        expect(Rational.from_float(0.25).equal(R(1, 4))).toBe(true)
    })

    it("returns zero for non-finite inputs", () => {
        expect(Rational.from_float(NaN)).toBe(zero)
        expect(Rational.from_float(Infinity)).toBe(zero)
        expect(Rational.from_float(-Infinity)).toBe(zero)
    })

    it("round-trips back to JS float", () => {
        // 0.1 is not exact in IEEE-754; from_float captures the exact
        // float value, which toFloat returns identically.
        expect(Rational.from_float(0.1).toFloat()).toBe(0.1)
        expect(Rational.from_float(1.5).toFloat()).toBe(1.5)
        expect(Rational.from_float(3.14159).toFloat()).toBe(3.14159)
    })
})

describe("from_float_approximate", () => {
    it("recognizes 1/3", () => {
        expect(Rational.from_float_approximate(1 / 3).equal(oneThird)).toBe(true)
    })

    it("approximates 2/3 to 5-digit precision", () => {
        // The original 1/3 sentinel _two_thirds = 33333/50000 doesn't
        // match Math.round((2/3) * 100000) = 66667, so the sentinel
        // branch never fires for 2/3 specifically; the function falls
        // through to the generic 5-digit rounding. This matches Kirk's
        // historical behavior.
        const approx = Rational.from_float_approximate(2 / 3)
        expect(Math.abs(approx.toFloat() - 2 / 3)).toBeLessThan(1e-4)
    })

    it("recognizes integer fast path", () => {
        expect(Rational.from_float_approximate(7).equal(R(7, 1))).toBe(true)
    })

    it("recognizes integer + 1/3 mix", () => {
        expect(
            Rational.from_float_approximate(2 + 1 / 3).equal(R(7, 3))
        ).toBe(true)
    })
})

describe("from_string and from_decimal", () => {
    it("parses integer string", () => {
        expect(Rational.from_string("42").equal(R(42, 1))).toBe(true)
    })

    it("parses negative integer string", () => {
        expect(Rational.from_string("-42").equal(R(-42, 1))).toBe(true)
    })

    it("parses decimal string", () => {
        expect(Rational.from_string("0.5").equal(half)).toBe(true)
        expect(Rational.from_string("1.25").equal(R(5, 4))).toBe(true)
    })

    it("parses fractional string", () => {
        expect(Rational.from_string("3/4").equal(R(3, 4))).toBe(true)
    })

    it("parses mixed string", () => {
        // "2+1/3" means 2 + 1/3 = 7/3
        expect(Rational.from_string("2+1/3").equal(R(7, 3))).toBe(true)
    })

    it("from_decimal with no decimal point", () => {
        expect(Rational.from_decimal("17").equal(R(17, 1))).toBe(true)
    })
})

describe("toString and toDecimal", () => {
    it("integer toString omits denominator", () => {
        expect(R(5, 1).toString()).toBe("5")
    })

    it("non-integer toString uses p/q form", () => {
        expect(half.toString()).toBe("1/2")
    })

    it("toDecimal for 1/2 is 0.5", () => {
        expect(half.toDecimal()).toBe("0.5")
    })

    it("toDecimal for 1/3 with 3 digits rounds to 0.333", () => {
        expect(oneThird.toDecimal(3)).toBe("0.333")
    })

    it("toDecimal of integer has no decimal part", () => {
        expect(R(7, 1).toDecimal()).toBe("7")
    })

    it("toDecimal preserves negative sign", () => {
        expect(R(-1, 2).toDecimal()).toBe("-0.5")
    })

    it("toUpDecimal rounds non-divisible up", () => {
        // 1/3 with 2 digits → "0.34" (rounded up since 1/3 > 0.33)
        expect(oneThird.toUpDecimal(2)).toBe("0.34")
    })

    it("toMixed shows mixed form for non-integer > 1", () => {
        expect(R(7, 3).toMixed()).toBe("2 + 1/3")
    })

    it("toMixed shows simple form for integer", () => {
        expect(R(6, 3).toMixed()).toBe("2")
    })

    it("toMixed shows simple form for proper fraction", () => {
        expect(half.toMixed()).toBe("1/2")
    })
})

describe("toFloat", () => {
    it("integer", () => {
        expect(R(5, 1).toFloat()).toBe(5)
    })

    it("half", () => {
        expect(half.toFloat()).toBe(0.5)
    })

    it("third is close to 1/3", () => {
        expect(Math.abs(oneThird.toFloat() - 1 / 3)).toBeLessThan(1e-15)
    })
})
