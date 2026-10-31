import { Decimal, RULES } from "@bias/shared";

export interface ReconLine {
  key: string;
  label: string;
  expected: string;
  actual: string;
  diffPct: number;
  ok: boolean;
}

export function reconLine(key: string, label: string, expected: Decimal.Value, actual: Decimal.Value, tolPct: number = RULES.RECONCILE_TOLERANCE_PCT, absTol: Decimal.Value = 0): ReconLine {
  const e = new Decimal(expected);
  const a = new Decimal(actual);
  const diff = a.sub(e).abs();
  const base = Decimal.max(e.abs(), a.abs());
  const diffPct = base.isZero() ? 0 : diff.div(base).mul(100).toNumber();
  const ok = diff.lte(absTol) || diffPct <= tolPct;
  return { key, label, expected: e.toString(), actual: a.toString(), diffPct, ok };
}

/** Ledger sums for one market. SOL amounts in lamports, USD in micro-USD (all as bigint strings). */
export interface LedgerSums {
  claim: bigint;
  split_launcher: bigint;
  split_platform: bigint;
  split_position: bigint;
  payout_launcher: bigint;
  payout_platform: bigint;
  bridge_in: bigint;
  buyback_sol: bigint;
  withdraw_arrived_sol: bigint;
  rent_in: bigint;
  tx_fees: bigint;
  deposit_usd: bigint;
  realized_pnl_usd: bigint;
  trade_fee_usd: bigint;
  funding_usd: bigint;
  withdraw_usd: bigint;
}

export interface ChainActuals {
  vaultLamports: bigint;
  hlAccountValueUsd: string;
  hlUnrealizedUsd: string;
  inTransitLamports: bigint;
}

/**
 * Reconciliation (section 4.6). A line is red when it differs by more than 1%.
 *  1. fees claimed = launcher + platform + position pipeline
 *  2. vault SOL = rent + claimed − payouts − bridged − buybacks + withdrawals − tx fees  (± in transit)
 *  3. HL equity − uPnL = deposits + realized pnl + funding − trade fees − withdrawals
 */
export function reconcileMarket(s: LedgerSums, c: ChainActuals): ReconLine[] {
  const L = (b: bigint) => new Decimal(b.toString()).div(1e9);
  const U = (b: bigint) => new Decimal(b.toString()).div(1e6);
  const lines: ReconLine[] = [];
  lines.push(reconLine("split", "fees claimed = launcher + platform + position", L(s.claim), L(s.split_launcher + s.split_platform + s.split_position)));
  const expectedVault =
    s.rent_in + s.claim - s.payout_launcher - s.payout_platform - s.bridge_in - s.buyback_sol + s.withdraw_arrived_sol - s.tx_fees;
  lines.push(reconLine("vault", "vault balance vs ledger (SOL)", L(expectedVault), L(c.vaultLamports), RULES.RECONCILE_TOLERANCE_PCT, "0.002"));
  const hlExpected = U(s.deposit_usd + s.realized_pnl_usd + s.funding_usd - s.trade_fee_usd - s.withdraw_usd);
  const hlActual = new Decimal(c.hlAccountValueUsd).sub(c.hlUnrealizedUsd);
  lines.push(reconLine("hl", "hyperliquid equity − uPnL vs ledger (USD)", hlExpected, hlActual, RULES.RECONCILE_TOLERANCE_PCT, "0.5"));
  return lines;
}
