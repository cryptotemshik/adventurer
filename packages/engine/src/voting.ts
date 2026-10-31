import { Decimal, RULES, type Direction } from "@bias/shared";

export interface VoteInput {
  wallet: string;
  choice: Direction;
  /** raw token balance (base units) */
  balance: bigint;
}

export interface Tally {
  weights: Record<Direction, number>;
  rawTotal: number;
  wallets: number;
  quorum: boolean;
  quorumWeight: number;
  winner: Direction | null;
  shares: Record<Direction, number>;
}

/** UTC day id for a round, e.g. "2026-10-31". */
export function roundId(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function roundEndsAt(round: string): number {
  return Date.parse(`${round}T00:00:00.000Z`) + 86_400_000;
}

/**
 * sqrt-weighted tally. Each wallet's weight is sqrt(balance), capped at 10% of the round's raw total weight.
 * Quorum: ≥ 5 wallets and raw weight ≥ sqrt(quorumPct% of supply) (the "sqrt-equivalent" of that share).
 */
export function tallyVotes(votes: VoteInput[], supply: bigint, quorumPct: number): Tally {
  const latest = new Map<string, VoteInput>();
  for (const v of votes) if (v.balance > 0n) latest.set(v.wallet, v);
  const list = [...latest.values()];
  const raw = list.map((v) => new Decimal(v.balance.toString()).sqrt().toNumber());
  const rawTotal = raw.reduce((a, b) => a + b, 0);
  const cap = rawTotal * RULES.VOTE_MAX_WEIGHT_SHARE;
  const weights: Record<Direction, number> = { long: 0, short: 0, flat: 0 };
  list.forEach((v, i) => {
    weights[v.choice] += Math.min(raw[i]!, cap);
  });
  const quorumWeight = new Decimal(supply.toString()).mul(quorumPct).div(100).sqrt().toNumber();
  const quorum = list.length >= RULES.VOTE_MIN_WALLETS && rawTotal >= quorumWeight;
  const capped = weights.long + weights.short + weights.flat;
  const shares: Record<Direction, number> = {
    long: capped ? weights.long / capped : 0,
    short: capped ? weights.short / capped : 0,
    flat: capped ? weights.flat / capped : 0,
  };
  let winner: Direction | null = null;
  if (quorum) {
    const sorted = (Object.entries(weights) as [Direction, number][]).sort((a, b) => b[1] - a[1]);
    if (sorted[0]![1] > sorted[1]![1]) winner = sorted[0]![0];
  }
  return { weights, rawTotal, wallets: list.length, quorum, quorumWeight, winner, shares };
}

/** Message a holder signs to vote (SIWS-style, includes nonce + round so it can't be replayed). */
export function voteMessage(i: { domain: string; wallet: string; mint: string; round: string; choice: Direction; nonce: string }): string {
  return [
    `${i.domain} wants you to vote with your Solana account:`,
    i.wallet,
    "",
    `vote ${i.choice} on market ${i.mint} for round ${i.round}. this is a signature, not a transaction. it costs nothing.`,
    "",
    `Nonce: ${i.nonce}`,
  ].join("\n");
}
