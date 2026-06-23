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
"use strict"

// Native BigInt helpers. Replaces the peterolson/big-integer library
// (Kirk's original `bigInt` global) with the platform built-in. All
// arithmetic in this module operates on BigInt primitives directly.

function babs(x) {
    return x < 0n ? -x : x
}

function bgcd(a, b) {
    a = babs(a)
    b = babs(b)
    while (b !== 0n) {
        const t = b
        b = a % b
        a = t
    }
    return a
}

// Truncated euclidean divmod, matching peterolson/big-integer's
// `divmod` semantics: quotient truncates toward zero, remainder shares
// the sign of the dividend.
function bdivmod(a, b) {
    return { quotient: a / b, remainder: a % b }
}

export class Rational {
    constructor(p, q) {
        if (q < 0n) {
            p = -p
            q = -q
        }
        const gcd = bgcd(p, q)
        if (gcd > 1n) {
            p = p / gcd
            q = q / gcd
        }
        this.p = p
        this.q = q
    }
    toFloat() {
        return Number(this.p) / Number(this.q)
    }
    toString() {
        if (this.q === 1n) {
            return this.p.toString()
        }
        return this.p.toString() + "/" + this.q.toString()
    }
    toDecimal(maxDigits, roundingFactor) {
        if (maxDigits == null) {
            maxDigits = 3
        }
        if (roundingFactor == null) {
            roundingFactor = new Rational(5n, 10n ** BigInt(maxDigits + 1))
        }

        var sign = ""
        var x = this
        if (x.less(zero)) {
            sign = "-"
            x = zero.sub(x)
        }
        x = x.add(roundingFactor)
        var divmod = bdivmod(x.p, x.q)
        var integerPart = divmod.quotient.toString()
        var decimalPart = ""
        var fraction = new Rational(divmod.remainder, x.q)
        var ten = new Rational(10n, 1n)
        while (maxDigits > 0 && !fraction.equal(roundingFactor)) {
            fraction = fraction.mul(ten)
            roundingFactor = roundingFactor.mul(ten)
            divmod = bdivmod(fraction.p, fraction.q)
            decimalPart += divmod.quotient.toString()
            fraction = new Rational(divmod.remainder, fraction.q)
            maxDigits--
        }
        if (fraction.equal(roundingFactor)) {
            while (decimalPart[decimalPart.length - 1] == "0") {
                decimalPart = decimalPart.slice(0, decimalPart.length - 1)
            }
        }
        if (decimalPart != "") {
            return sign + integerPart + "." + decimalPart
        }
        return sign + integerPart
    }
    toUpDecimal(maxDigits) {
        var fraction = new Rational(1n, 10n ** BigInt(maxDigits))
        var divmod = this.divmod(fraction)
        var x = this
        if (divmod.remainder.p !== 0n) {
            x = x.add(fraction)
        }
        return x.toDecimal(maxDigits, zero)
    }
    toMixed() {
        var divmod = bdivmod(this.p, this.q)
        if (divmod.quotient === 0n || divmod.remainder === 0n) {
            return this.toString()
        }
        return divmod.quotient.toString() + " + " + divmod.remainder.toString() + "/" + this.q.toString()
    }
    isZero() {
        return this.p === 0n
    }
    isOne() {
        return this.p === 1n && this.q === 1n
    }
    isInteger() {
        return this.q === 1n
    }
    ceil() {
        var divmod = bdivmod(this.p, this.q)
        var result = new Rational(divmod.quotient, 1n)
        if (divmod.remainder !== 0n) {
            result = result.add(one)
        }
        return result
    }
    floor() {
        var divmod = bdivmod(this.p, this.q)
        var result = new Rational(divmod.quotient, 1n)
        if (result.less(zero) && divmod.remainder !== 0n) {
            result = result.sub(one)
        }
        return result
    }
    equal(other) {
        return this.p === other.p && this.q === other.q
    }
    less(other) {
        return this.p * other.q < this.q * other.p
    }
    abs() {
        if (this.less(zero)) {
            return this.mul(minusOne)
        }
        return this
    }
    add(other) {
        return new Rational(
            this.p * other.q + this.q * other.p,
            this.q * other.q
        )
    }
    sub(other) {
        if (other.isZero()) return this
        return new Rational(
            this.p * other.q - this.q * other.p,
            this.q * other.q
        )
    }
    mul(other) {
        if (this.isZero()) return zero
        if (other.isZero()) return zero
        if (this.isOne()) return other
        if (other.isOne()) return this
        return new Rational(
            this.p * other.p,
            this.q * other.q
        )
    }
    div(other) {
        return new Rational(
            this.p * other.q,
            this.q * other.p
        )
    }
    divmod(other) {
        var quotient = this.div(other)
        var div = quotient.floor()
        var mod = this.sub(other.mul(div))
        return {quotient: div, remainder: mod}
    }
    reciprocate() {
        return new Rational(this.q, this.p)
    }
    // exp must be a JS number with an integer in it.
    pow(exp) {
        const e = BigInt(exp)
        return new Rational(this.p ** e, this.q ** e)
    }

    static from_decimal(s) {
        let i = s.indexOf(".")
        if (i === -1 || i === s.length - 1) {
            return new Rational(BigInt(s), 1n)
        }
        let integerPart = new Rational(BigInt(s.slice(0, i)), 1n)
        let numerator = BigInt(s.slice(i + 1))
        let denominator = 10n ** BigInt(s.length - i - 1)
        return integerPart.add(new Rational(numerator, denominator))
    }

    static from_string(s) {
        var i = s.indexOf("/")
        if (i === -1) {
            return Rational.from_decimal(s)
        }
        var j = s.indexOf("+")
        var q = BigInt(s.slice(i + 1))
        var p
        if (j !== -1) {
            var integer = BigInt(s.slice(0, j))
            p = BigInt(s.slice(j + 1, i)) + integer * q
        } else {
            p = BigInt(s.slice(0, i))
        }
        return new Rational(p, q)
    }

    static from_integer(x) {
        return Rational.from_floats(x, 1)
    }

    static from_float(arg) {
        if (arg === 0 || !Number.isFinite(arg) || Number.isNaN(arg)) {
            return zero
        }
        if (Number.isInteger(arg)) {
            return Rational.from_integer(arg)
        }
        let x = Math.abs(arg)
        let exp = Math.max(-1023, Math.floor(Math.log2(x)) + 1)
        let floatPart = x * Math.pow(2, -exp)
        for (let i = 0; i < 300 && floatPart !== Math.floor(floatPart); i++) {
            floatPart *= 2
            exp--
        }
        // floatPart is now an integer-valued double; BigInt() refuses
        // doubles that aren't exact integers, so Math.trunc satisfies
        // the strict type check without changing the value.
        let numerator = BigInt(Math.trunc(floatPart))
        let denominator = 1n
        if (exp > 0) {
            numerator = numerator << BigInt(exp)
        } else {
            denominator = denominator << BigInt(-exp)
        }
        // Note: original Kirk code preserves sign behavior of bigInt's
        // implicit float->integer conversion (which sees a positive
        // value here because of the abs() above). Preserved verbatim.
        return new Rational(numerator, denominator)
    }

    // This function is a hack, which intentionally limits its precision
    // in order to paper over floating-point inaccuracies.
    static from_float_approximate(x) {
        if (Number.isInteger(x)) {
            return Rational.from_floats(x, 1)
        }
        // Sufficient precision for our data?
        var r = new Rational(BigInt(Math.round(x * 100000)), 100000n)
        // Recognize 1/3 and 2/3 explicitly.
        var divmod = r.divmod(one)
        if (divmod.remainder.equal(_one_third)) {
            return divmod.quotient.add(oneThird)
        } else if (divmod.remainder.equal(_two_thirds)) {
            return divmod.quotient.add(twoThirds)
        }
        return r
    }

    static from_floats(p, q) {
        return new Rational(BigInt(p), BigInt(q))
    }
}

// Decimal approximations.
var _one_third = new Rational(33333n, 100000n)
var _two_thirds = new Rational(33333n, 50000n)

var minusOne = new Rational(-1n, 1n)
var zero = new Rational(0n, 1n)
var one = new Rational(1n, 1n)
var half = new Rational(1n, 2n)
var oneThird = new Rational(1n, 3n)
var twoThirds = new Rational(2n, 3n)

export { minusOne, zero, one, half, oneThird, twoThirds }
