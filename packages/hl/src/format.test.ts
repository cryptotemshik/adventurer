import { describe, expect, it } from "vitest";
import { roundPrice, roundSize, slippagePrice, usdToNtli } from "./format";

describe("roundSize", () => {
  it("rounds down to szDecimals", () => {
    expect(roundSize("0.123456789", 5)).toBe("0.12345");
    expect(roundSize("1.999", 2)).toBe("1.99");
    expect(roundSize("12.9", 0)).toBe("12");
    expect(roundSize(0.00000099, 5)).toBe("0");
    expect(roundSize("3.10", 2)).toBe("3.1");
  });
  it("rejects negatives", () => {
    expect(() => roundSize("-1", 2)).toThrow();
  });
});

describe("roundPrice", () => {
  it("keeps integers regardless of significant figures", () => {
    expect(roundPrice("97123.456789", 5)).toBe("97123");
    expect(roundPrice("123456.7", 5)).toBe("123457");
    expect(roundPrice("123456", 0)).toBe("123456");
  });
  it("caps at 5 significant figures", () => {
    expect(roundPrice("3456.789", 4)).toBe("3456.8");
    expect(roundPrice("187.6543", 2)).toBe("187.65");
    expect(roundPrice("42.123456", 2)).toBe("42.123");
  });
  it("caps decimals at 6 - szDecimals (perp) and 8 - szDecimals (spot)", () => {
    // kPEPE-like: szDecimals 0 → 6 decimals max
    expect(roundPrice("0.0123456", 0)).toBe("0.012346");
    // szDecimals 2 → 4 decimals
    expect(roundPrice("0.123456", 2)).toBe("0.1235");
    // spot szDecimals 2 → 6 decimals
    expect(roundPrice("0.0123456", 2, true)).toBe("0.012346");
    expect(roundPrice("0.0123456", 2, false)).toBe("0.0123");
  });
  it("supports directional rounding", () => {
    expect(roundPrice("187.6543", 2, false, "up")).toBe("187.66");
    expect(roundPrice("187.6543", 2, false, "down")).toBe("187.65");
  });
  it("never returns exponent notation or zero", () => {
    expect(roundPrice("0.00000001", 0)).toBe("0.000001");
    expect(roundPrice(1e-7, 2, true)).toBe("0.000001");
  });
  it("rejects non-positive prices", () => {
    expect(() => roundPrice("0", 2)).toThrow();
  });
});

describe("slippagePrice", () => {
  it("applies bps away from mark and rounds away from mark", () => {
    expect(slippagePrice("100", true, 50, 2)).toBe("100.5");
    expect(slippagePrice("100", false, 50, 2)).toBe("99.5");
    // 3456.78 * 1.005 = 3474.0639 → up to 5 sf = 3474.1
    expect(slippagePrice("3456.78", true, 50, 4)).toBe("3474.1");
    // 3456.78 * 0.995 = 3439.4961 → down = 3439.4
    expect(slippagePrice("3456.78", false, 50, 4)).toBe("3439.4");
    expect(slippagePrice("97000", true, 50, 5)).toBe("97485");
  });
  it("zero slippage still yields a valid tick", () => {
    expect(slippagePrice("187.6543", true, 0, 2)).toBe("187.66");
  });
});

describe("usdToNtli", () => {
  it("converts to integer micro-USD", () => {
    expect(usdToNtli("12.345678")).toBe(12_345_678);
    expect(usdToNtli("-1.5")).toBe(-1_500_000);
    expect(usdToNtli("0.0000001")).toBe(0);
  });
});
