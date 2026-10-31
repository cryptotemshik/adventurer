import Decimal from "decimal.js";

/** All money is integer base units in bigint. SOL → lamports (1e9), USD → micro-dollars (1e6). */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const MICRO_PER_USD = 1_000_000n;

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });
export { Decimal };

export function solToLamports(sol: string | number): bigint {
  return BigInt(new Decimal(sol).mul(1e9).toFixed(0, Decimal.ROUND_DOWN));
}
export function lamportsToSol(l: bigint | string): string {
  return new Decimal(l.toString()).div(1e9).toFixed(9).replace(/\.?0+$/, "");
}
export function usdToMicro(usd: string | number): bigint {
  return BigInt(new Decimal(usd).mul(1e6).toFixed(0, Decimal.ROUND_DOWN));
}
export function microToUsd(m: bigint | string): string {
  return new Decimal(m.toString()).div(1e6).toFixed(6).replace(/\.?0+$/, "");
}
/** amount * bps / 10_000, rounded down */
export function bpsOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n;
}
export function maxBig(...xs: bigint[]): bigint {
  return xs.reduce((a, b) => (b > a ? b : a));
}
export function minBig(...xs: bigint[]): bigint {
  return xs.reduce((a, b) => (b < a ? b : a));
}
/** Sum of decimal strings, exact. */
export function dsum(xs: (string | number | Decimal)[]): Decimal {
  return xs.reduce<Decimal>((a, b) => a.add(b), new Decimal(0));
}
