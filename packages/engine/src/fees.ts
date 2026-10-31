import { LAMPORTS_PER_SOL, RULES, bpsOf, solToLamports } from "@bias/shared";

export interface SplitBps {
  position: number;
  launcher: number;
  platform: number;
}

export interface FeeSplit {
  position: bigint;
  launcher: bigint;
  platform: bigint;
}

/** 70/20/10 split of claimed creator fees. Rounding dust goes to the position. */
export function splitFees(claimed: bigint, bps: SplitBps): FeeSplit {
  if (bps.position + bps.launcher + bps.platform !== 10_000) throw new Error("split must sum to 10000 bps");
  if (claimed < 0n) throw new Error("negative claim");
  const launcher = bpsOf(claimed, bps.launcher);
  const platform = bpsOf(claimed, bps.platform);
  return { launcher, platform, position: claimed - launcher - platform };
}

/** Should we claim now? ≥ MIN_CLAIM_SOL accrued, or ≥ 24h since last claim with anything accrued. */
export function shouldClaim(claimable: bigint, minClaimSol: string, lastClaimAt: number | null, now: number): boolean {
  if (claimable <= 0n) return false;
  if (claimable >= solToLamports(minClaimSol)) return true;
  return lastClaimAt === null ? false : now - lastClaimAt >= RULES.CLAIM_MAX_INTERVAL_HOURS * 3_600_000;
}

/** Batch payouts to launcher/platform: when owed ≥ MIN_PAYOUT_SOL or once a day. Never below rent-safe dust. */
export function shouldPayout(owed: bigint, minPayoutSol: string, lastPayoutAt: number | null, now: number): boolean {
  if (owed < 1_000_000n) return false; // < 0.001 SOL is not worth a signature
  if (owed >= solToLamports(minPayoutSol)) return true;
  return lastPayoutAt === null || now - lastPayoutAt >= RULES.PAYOUT_MAX_INTERVAL_HOURS * 3_600_000;
}

/** Amount of the position pipeline to bridge to Hyperliquid (all of it once ≥ MIN_BRIDGE_SOL), keeping a fee buffer. */
export function bridgeAmount(pipeline: bigint, minBridgeSol: string, feeBuffer = 5_000_000n): bigint {
  const min = solToLamports(minBridgeSol);
  if (pipeline < min) return 0n;
  const amt = pipeline - feeBuffer;
  return amt > 0n ? amt : 0n;
}

export const SOL = LAMPORTS_PER_SOL;
