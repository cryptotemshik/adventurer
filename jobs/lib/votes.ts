import { listRounds, listVotes, upsertRound, type Market } from "@bias/db";
import { roundId, tallyVotes } from "@bias/engine";
import type { Direction } from "@bias/shared";
import type { JobEnv } from "./env";
import type { ChainOps } from "./venue";

/**
 * Finalize yesterday's round (first job run after 00:00 UTC). Balances are re-checked at tally time
 * when a balance reader is available, so tokens moved after voting don't count twice.
 */
export async function finalizeRounds(
  env: JobEnv,
  m: Market,
  supplyOf: ChainOps["supply"],
  balanceOf?: (wallet: string, mint: string) => Promise<bigint>,
): Promise<string | null> {
  if (!m.community || !m.mint) return null;
  const today = roundId(env.now());
  const yesterday = roundId(env.now() - 86_400_000);
  const existing = (await listRounds(env.db, m.id, 5)).find((r) => r.round === yesterday);
  if (existing && existing.status === "final") return null;
  const votes = await listVotes(env.db, m.id, yesterday);
  const supply = await supplyOf(m.mint).catch(() => 1_000_000_000n * 1_000_000n);
  const inputs = [];
  for (const v of votes) {
    let bal = BigInt(v.balance);
    if (balanceOf) {
      try {
        const now = await balanceOf(v.wallet, m.mint);
        bal = now < bal ? now : bal;
      } catch {}
    }
    inputs.push({ wallet: v.wallet, choice: v.choice as Direction, balance: bal });
  }
  const t = tallyVotes(inputs, supply, env.cfg.VOTE_QUORUM_SUPPLY_PCT);
  await upsertRound(env.db, {
    marketId: m.id,
    round: yesterday,
    status: "final",
    longW: t.weights.long,
    shortW: t.weights.short,
    flatW: t.weights.flat,
    wallets: t.wallets,
    quorum: t.quorum,
    winner: t.winner,
    applied: !t.quorum || !t.winner || t.winner === m.direction,
    finalizedAt: env.now(),
  });
  void today;
  return t.quorum ? (t.winner ?? "tie") : "no quorum";
}
