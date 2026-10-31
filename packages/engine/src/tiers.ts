import { Decimal, type Strategy, type Tier } from "@bias/shared";

export interface TierThresholds {
  trader: number;
  desk: number;
  fund: number;
}

/** Holder tier from a whole-token balance. Empty BIAS_MINT → everyone is desk (pre-launch testing). */
export function tierFor(balanceTokens: Decimal.Value, t: TierThresholds, biasMintSet = true): Tier {
  if (!biasMintSet) return "desk";
  const b = new Decimal(balanceTokens);
  if (b.gte(t.fund)) return "fund";
  if (b.gte(t.desk)) return "desk";
  if (b.gte(t.trader)) return "trader";
  return "none";
}

const RANK: Record<Tier, number> = { none: 0, trader: 1, desk: 2, fund: 3 };
export const tierAtLeast = (t: Tier, min: Tier) => RANK[t] >= RANK[min];

export function allowedStrategies(t: Tier): Strategy["type"][] {
  return tierAtLeast(t, "desk") ? ["single", "basket", "pair", "funding"] : ["single"];
}

/** Launch fee in lamports: free for trader tier and above. */
export function launchFeeLamports(t: Tier, baseFee: bigint): bigint {
  return tierAtLeast(t, "trader") ? 0n : baseFee;
}

export function tierPerks(t: Tier): string[] {
  const p: string[] = [];
  if (tierAtLeast(t, "trader")) p.push("free launches", "trader badge");
  if (tierAtLeast(t, "desk")) p.push("basket, pair & funding farm strategies", "desk badge on your markets");
  if (tierAtLeast(t, "fund")) p.push("featured on the home page for 24h after launch (1×/day)");
  return p;
}
