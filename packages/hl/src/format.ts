import DecimalBase from "decimal.js";

/** Local Decimal clone so global config changes elsewhere can't affect HL rounding. */
export const D = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;

const MAX_DECIMALS_PERP = 6;
const MAX_DECIMALS_SPOT = 8;
const MAX_SIG_FIGS = 5;

function plain(d: Dec): string {
  // toFixed() without args never uses exponent notation and has no trailing zeros for normalized Decimals.
  const s = d.toFixed();
  return s === "-0" ? "0" : s;
}

/** Round a size DOWN to the asset's szDecimals (lot size). */
export function roundSize(sz: string | number, szDecimals: number): string {
  const d = new D(sz);
  if (d.isNeg()) throw new Error(`size must be non-negative: ${sz}`);
  return plain(d.toDecimalPlaces(szDecimals, D.ROUND_DOWN));
}

export type RoundMode = "nearest" | "up" | "down";

const RM: Record<RoundMode, DecimalBase.Rounding> = {
  nearest: D.ROUND_HALF_UP,
  up: D.ROUND_UP,
  down: D.ROUND_DOWN,
};

/**
 * Round a price to Hyperliquid tick rules:
 * - at most 5 significant figures, unless the price is an integer (integers are always valid);
 * - at most (6 for perps | 8 for spot) − szDecimals decimal places.
 */
export function roundPrice(
  px: string | number | Dec,
  szDecimals: number,
  isSpot = false,
  mode: RoundMode = "nearest",
): string {
  const d = new D(px);
  if (d.lte(0)) throw new Error(`price must be positive: ${px.toString()}`);
  const rm = RM[mode];
  const maxDecimals = Math.max(0, (isSpot ? MAX_DECIMALS_SPOT : MAX_DECIMALS_PERP) - szDecimals);
  let r: Dec;
  if (d.abs().gte(10 ** MAX_SIG_FIGS)) {
    r = d.toDecimalPlaces(0, rm);
  } else {
    r = d.toSignificantDigits(MAX_SIG_FIGS, rm).toDecimalPlaces(maxDecimals, rm);
  }
  if (r.lte(0)) {
    // Too small to represent: return the smallest tick.
    r = new D(10).pow(-maxDecimals);
  }
  return plain(r);
}

/**
 * Limit price for an IOC "market" order: mark ± slippage, rounded *away* from the mark so the
 * effective tolerance is never smaller than requested.
 */
export function slippagePrice(
  markPx: string,
  isBuy: boolean,
  bps: number,
  szDecimals: number,
  isSpot = false,
): string {
  if (bps < 0) throw new Error("slippage must be non-negative");
  const mark = new D(markPx);
  const factor = new D(1).add(new D(bps).div(10_000).mul(isBuy ? 1 : -1));
  return roundPrice(mark.mul(factor), szDecimals, isSpot, isBuy ? "up" : "down");
}

/** USD → integer micro-USD as used by `updateIsolatedMargin.ntli`. */
export function usdToNtli(usd: string): number {
  const n = new D(usd).mul(1_000_000).toDecimalPlaces(0, D.ROUND_DOWN);
  return n.toNumber();
}
