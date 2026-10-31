import { PublicKey, type Connection } from "@solana/web3.js";
import { pump } from "./sdk";

/** Standard pump.fun curve: 793.1M of the 1B supply is sold on the curve (6 decimals). */
export const DEFAULT_INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;
export const PUMP_TOKEN_DECIMALS = 6;

export interface BondingCurveState {
  exists: boolean;
  complete: boolean;
  progressPct: number;
  priceSol: number;
  mcapSol: number;
  creator: string | null;
}

export interface RawCurve {
  virtualTokenReserves: bigint;
  virtualQuoteReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: string;
}

/** Pure: derive UI numbers from a decoded curve. */
export function curveNumbers(
  c: RawCurve,
  initialRealTokenReserves = DEFAULT_INITIAL_REAL_TOKEN_RESERVES,
): Omit<BondingCurveState, "exists" | "creator"> {
  const progress = c.complete
    ? 100
    : initialRealTokenReserves > 0n
      ? Number(((initialRealTokenReserves - c.realTokenReserves) * 10_000n) / initialRealTokenReserves) / 100
      : 0;
  const priceSol =
    c.virtualTokenReserves > 0n
      ? Number(c.virtualQuoteReserves) / 1e9 / (Number(c.virtualTokenReserves) / 10 ** PUMP_TOKEN_DECIMALS)
      : 0;
  const mcapSol = priceSol * (Number(c.tokenTotalSupply) / 10 ** PUMP_TOKEN_DECIMALS);
  return { complete: c.complete, progressPct: Math.max(0, Math.min(100, progress)), priceSol, mcapSol };
}

export async function fetchRawCurve(connection: Connection, mint: PublicKey): Promise<RawCurve | null> {
  const P = pump();
  const info = await connection.getAccountInfo(P.bondingCurvePda(mint));
  if (!info) return null;
  const bc = P.PUMP_SDK.decodeBondingCurve(info);
  return {
    virtualTokenReserves: BigInt(bc.virtualTokenReserves.toString()),
    virtualQuoteReserves: BigInt(bc.virtualQuoteReserves.toString()),
    realTokenReserves: BigInt(bc.realTokenReserves.toString()),
    tokenTotalSupply: BigInt(bc.tokenTotalSupply.toString()),
    complete: bc.complete,
    creator: bc.creator.toBase58(),
  };
}

export async function getBondingCurveState(
  connection: Connection,
  mint: PublicKey,
): Promise<BondingCurveState | null> {
  try {
    const raw = await fetchRawCurve(connection, mint);
    if (!raw) return { exists: false, complete: false, progressPct: 0, priceSol: 0, mcapSol: 0, creator: null };
    return { exists: true, creator: raw.creator, ...curveNumbers(raw) };
  } catch {
    return null;
  }
}

export function bondingCurveAddress(mint: PublicKey): PublicKey {
  return pump().bondingCurvePda(mint);
}
export function creatorVaultAddress(creator: PublicKey): PublicKey {
  return pump().creatorVaultPda(creator);
}
