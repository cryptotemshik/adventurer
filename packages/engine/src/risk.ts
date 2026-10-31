import { Decimal, LEVERAGE_CAPS, RULES, type Side, type Strategy } from "@bias/shared";
import type { AssetInfo } from "./types";

/** Maintenance margin fraction on Hyperliquid = half of the initial margin at max leverage. */
export function maintenanceFraction(maxLeverage: number): number {
  return 1 / (2 * Math.max(1, maxLeverage));
}

/** Approximate isolated-margin liquidation distance (fraction of entry price) for a fresh position.
 *  Derived from HL's formula liq = entry − side·margin/|sz| / (1 − mmf·side) with margin = notional/L. */
export function liquidationDistance(leverage: number, maxLeverage: number, side: Side): number {
  const mmf = maintenanceFraction(maxLeverage);
  const d = (1 / leverage - mmf) / (side === "long" ? 1 - mmf : 1 + mmf);
  return Math.max(0, d);
}

/** Price-move fraction at which the stop-loss sits: max loss = MAX_LOSS_MARGIN_PCT of margin. */
export function stopDistance(leverage: number, maxLossMarginPct = 50): number {
  return maxLossMarginPct / 100 / leverage;
}

export function leverageCapFor(strategy: Strategy, globalMax = 5): number {
  return Math.min(LEVERAGE_CAPS[strategy.type], globalMax);
}

/** Highest leverage ≤ requested such that SL triggers at most 70% of the way to liquidation
 *  and leverage ≤ the asset's own max leverage. Returns ≥ 1. */
export function safeLeverage(
  requested: number,
  asset: AssetInfo,
  maxLossMarginPct = 50,
  side: Side = "long",
): number {
  let L = Math.max(1, Math.min(Math.floor(requested), asset.maxLeverage));
  void side; // direction can flip by vote, so always check the worse (short) side
  while (L > 1) {
    const sl = stopDistance(L, maxLossMarginPct);
    const liq = Math.min(
      liquidationDistance(L, asset.maxLeverage, "long"),
      liquidationDistance(L, asset.maxLeverage, "short"),
    );
    if (sl <= RULES.SL_LIQ_MAX_RATIO * liq) break;
    L -= 1;
  }
  return L;
}

export interface TriggerLevels {
  sl: Decimal;
  tps: [Decimal, Decimal, Decimal];
}

/** Trigger prices for a leg given entry, side, leverage and tp stage (0..3).
 *  stage 0/1: SL at max-loss; stage 2: SL at breakeven; stage 3: SL at TP1. */
export function triggerLevels(
  entry: Decimal.Value,
  side: Side,
  leverage: number,
  stage: number,
  maxLossMarginPct = 50,
): TriggerLevels {
  const e = new Decimal(entry);
  const dir = side === "long" ? 1 : -1;
  const at = (frac: number) => e.mul(new Decimal(1).add(new Decimal(frac).mul(dir)));
  const tps = RULES.TP_MARGIN_PCT.map((p) => at(p / 100 / leverage)) as [Decimal, Decimal, Decimal];
  let sl = at(-stopDistance(leverage, maxLossMarginPct));
  if (stage === 2) sl = e;
  if (stage >= 3) sl = tps[0];
  return { sl, tps };
}

export interface LegPreview {
  asset: string;
  side: Side;
  requestedLeverage: number;
  leverage: number;
  slPct: number;
  liqPct: number;
  tpPct: number[];
  reduced: boolean;
}

export function previewLeg(
  asset: string,
  side: Side,
  requested: number,
  info: AssetInfo,
  maxLossMarginPct = 50,
): LegPreview {
  const L = safeLeverage(requested, info, maxLossMarginPct, side);
  return {
    asset,
    side,
    requestedLeverage: requested,
    leverage: L,
    slPct: stopDistance(L, maxLossMarginPct) * 100,
    liqPct: liquidationDistance(L, info.maxLeverage, side) * 100,
    tpPct: RULES.TP_MARGIN_PCT.map((p) => p / L),
    reduced: L < requested,
  };
}

export function previewText(p: LegPreview): string {
  const s = p.side === "long" ? "−" : "+";
  const t = p.side === "long" ? "+" : "−";
  return `SL at ${s}${p.slPct.toFixed(1)}% price move · liquidation ≈ ${s}${p.liqPct.toFixed(0)}% · TP ladder ${p.tpPct
    .map((x) => `${t}${x.toFixed(0)}%`)
    .join(" / ")}`;
}

/** Distance of mark to a level as a fraction of mark, signed so that positive = level not yet reached. */
export function distanceTo(mark: Decimal.Value, level: Decimal.Value, side: Side, kind: "below" | "above"): number {
  const m = new Decimal(mark);
  const l = new Decimal(level);
  const d = kind === "below" ? m.sub(l).div(m) : l.sub(m).div(m);
  void side;
  return d.toNumber();
}

/** Risk meter for a leg: distance from mark to SL and to liquidation (positive fractions). */
export function riskMeter(
  mark: Decimal.Value,
  side: Side,
  slPx: Decimal.Value,
  liqPx: Decimal.Value | null,
): { toSl: number; toLiq: number | null } {
  const adverse = side === "long" ? "below" : "above";
  return {
    toSl: distanceTo(mark, slPx, side, adverse),
    toLiq: liqPx === null ? null : distanceTo(mark, liqPx, side, adverse),
  };
}

export interface GuardInput {
  side: Side;
  entry: Decimal.Value;
  mark: Decimal.Value;
  /** stop-loss price at max-loss stage (not the trailed stop) */
  slPx: Decimal.Value;
  /** currently active stop price (may be trailed to breakeven / TP1) */
  activeSlPx?: Decimal.Value;
  liqPx: Decimal.Value | null;
  /** |size| × mark × mmf / (initial margin + uPnL) */
  marginRatio: number;
}

export type GuardVerdict = "ok" | "deleverage" | "sl_missed";

/**
 * Liquidation guard (section 6.5).
 *  - mark through the active stop → the exchange trigger did not fire: close now ("sl_missed").
 *  - liquidation closer to entry than 1.5 × the stop distance (margin eroded by funding/fees, or a bad fill),
 *    or margin ratio > 70% → deleverage.
 * Distances are measured from entry: measured from mark, the ratio (mark−liq)/(mark−sl) tends to 1 as a
 * position goes into profit and would deleverage winners.
 */
export function liquidationGuard(g: GuardInput): GuardVerdict {
  const active = g.activeSlPx ?? g.slPx;
  const { toSl } = riskMeter(g.mark, g.side, active, null);
  if (toSl <= 0) return "sl_missed";
  if (g.liqPx !== null) {
    const e = new Decimal(g.entry);
    const slDist = e.sub(g.slPx).abs();
    const liqDist = e.sub(g.liqPx).abs();
    const liqBeyondSl = g.side === "long" ? new Decimal(g.liqPx).lt(g.slPx) : new Decimal(g.liqPx).gt(g.slPx);
    if (!liqBeyondSl || liqDist.lt(slDist.mul(RULES.LIQ_GUARD_RATIO))) return "deleverage";
  }
  if (g.marginRatio > RULES.LIQ_GUARD_MARGIN_RATIO) return "deleverage";
  return "ok";
}

export function legMarginRatio(
  absSz: Decimal.Value,
  entry: Decimal.Value,
  mark: Decimal.Value,
  leverage: number,
  unrealizedPnl: Decimal.Value,
  maxLeverage: number,
): number {
  const initial = new Decimal(absSz).mul(entry).div(leverage);
  const equity = initial.add(unrealizedPnl);
  if (equity.lte(0)) return Infinity;
  const maint = new Decimal(absSz).mul(mark).mul(maintenanceFraction(maxLeverage));
  return maint.div(equity).toNumber();
}
