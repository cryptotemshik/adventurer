import { Decimal } from "@bias/shared";

export interface BreakerInput {
  /** total equity across markets now (USD) */
  equityNow: Decimal.Value;
  /** total equity 24h ago (USD) */
  equity24hAgo: Decimal.Value;
  /** deposits − withdrawals during the last 24h (USD) — not trading losses */
  netFlows24h: Decimal.Value;
}

/** Circuit breaker (6.8): trading loss over 24h > haltPct of equity → close_only. */
export function circuitBreaker(i: BreakerInput, haltPct: number): { trip: boolean; drawdownPct: number } {
  const base = new Decimal(i.equity24hAgo);
  if (base.lte(0)) return { trip: false, drawdownPct: 0 };
  const loss = base.add(i.netFlows24h).sub(i.equityNow);
  const pct = loss.div(base).mul(100).toNumber();
  return { trip: pct > haltPct, drawdownPct: Math.max(0, pct) };
}
