import {
  Decimal,
  FUNDING_ASSETS,
  FUNDING_SPOT_TOKEN,
  LEVERAGE_CAPS,
  RULES,
  type Direction,
  type Side,
  type Strategy,
  type Tier,
} from "@bias/shared";
import { previewLeg, type LegPreview } from "./risk";
import type { AssetInfo } from "./types";

export interface LegPlan {
  asset: string;
  side: Side;
  /** fraction of total notional, in bps */
  weightBps: number;
  requestedLeverage: number;
}

const opposite = (s: Side): Side => (s === "long" ? "short" : "long");

/** Directional legs for a strategy given the current effective direction. Empty when flat. */
export function strategyLegs(s: Strategy, direction: Direction): LegPlan[] {
  if (direction === "flat") return [];
  const flip = direction === "short";
  switch (s.type) {
    case "single":
      return [{ asset: s.asset, side: direction, weightBps: 10_000, requestedLeverage: s.leverage }];
    case "basket":
      return s.legs.map((l) => ({
        asset: l.asset,
        side: direction,
        weightBps: l.weightBps,
        requestedLeverage: s.leverage,
      }));
    case "pair": {
      const a: Side = flip ? "short" : "long";
      return [
        { asset: s.long, side: a, weightBps: 5_000, requestedLeverage: s.leverage },
        { asset: s.short, side: opposite(a), weightBps: 5_000, requestedLeverage: s.leverage },
      ];
    }
    case "funding":
      return [{ asset: s.asset, side: "short", weightBps: 10_000, requestedLeverage: 1 }];
  }
}

/** Initial direction a market starts with. */
export function initialDirection(s: Strategy): Direction {
  switch (s.type) {
    case "single":
    case "basket":
      return s.side;
    case "pair":
    case "funding":
      return "long";
  }
}

export function strategyAssets(s: Strategy): string[] {
  switch (s.type) {
    case "single":
    case "funding":
      return [s.asset];
    case "basket":
      return s.legs.map((l) => l.asset);
    case "pair":
      return [s.long, s.short];
  }
}

export function requiredTier(s: Strategy): Tier {
  return s.type === "single" ? "none" : "desk";
}

export interface ValidateOpts {
  allowlist: string[];
  maxLeverage: number;
  community: boolean;
  tierAllowsAdvanced: boolean;
}

export function validateStrategy(s: Strategy, o: ValidateOpts): string[] {
  const errs: string[] = [];
  const allowed = new Set(o.allowlist);
  for (const a of strategyAssets(s)) if (!allowed.has(a)) errs.push(`asset ${a} is not on the allowlist`);
  const cap = Math.min(LEVERAGE_CAPS[s.type], o.maxLeverage);
  if (s.type !== "funding") {
    if (!Number.isInteger(s.leverage) || s.leverage < 1) errs.push("leverage must be a positive integer");
    if (s.leverage > cap) errs.push(`max leverage for ${s.type} is ${cap}×`);
  }
  if (s.type === "basket") {
    const sum = s.legs.reduce((a, l) => a + l.weightBps, 0);
    if (sum !== 10_000) errs.push("basket weights must sum to 100%");
    if (new Set(s.legs.map((l) => l.asset)).size !== s.legs.length) errs.push("basket assets must be unique");
    if (s.legs.length < 2 || s.legs.length > 3) errs.push("basket needs 2–3 assets");
  }
  if (s.type === "pair" && s.long === s.short) errs.push("pair legs must be different assets");
  if (s.type === "funding") {
    if (!FUNDING_ASSETS.includes(s.asset)) errs.push(`funding farm needs a liquid HL spot market (${FUNDING_ASSETS.join(", ")})`);
    if (o.community) errs.push("community bias is not available for funding farms");
  }
  if (s.type !== "single" && !o.tierAllowsAdvanced) errs.push(`${s.type} strategies require the desk tier`);
  return errs;
}

/** Per-leg risk preview (leverage after safety reduction, SL/liq/TP distances). Pair legs share one leverage. */
export function previewStrategy(
  s: Strategy,
  assets: Record<string, AssetInfo>,
  maxLossMarginPct = 50,
  direction: Direction = initialDirection(s),
): LegPreview[] {
  const legs = strategyLegs(s, direction === "flat" ? initialDirection(s) : direction);
  const pv = legs.map((l) =>
    previewLeg(l.asset, l.side, l.requestedLeverage, assets[l.asset] ?? fallbackInfo(l.asset), maxLossMarginPct),
  );
  if (s.type === "pair" || s.type === "basket") {
    const L = Math.min(...pv.map((p) => p.leverage));
    return legs.map((l) =>
      previewLeg(l.asset, l.side, L, assets[l.asset] ?? fallbackInfo(l.asset), maxLossMarginPct),
    ).map((p) => ({ ...p, requestedLeverage: l0(s), reduced: p.leverage < l0(s) }));
  }
  return pv;
}

function l0(s: Strategy): number {
  return s.type === "funding" ? 1 : s.leverage;
}

export function fallbackInfo(asset: string): AssetInfo {
  return { szDecimals: 2, maxLeverage: asset === "BTC" ? 40 : asset === "ETH" ? 25 : 10 };
}

/** Minimum free collateral (USD) required before the first open is possible. */
export function minCollateralUsd(s: Strategy, assets: Record<string, AssetInfo>, maxLossMarginPct = 50): number {
  if (s.type === "funding") return RULES.MIN_ORDER_USD * 2 * 1.05;
  const pv = previewStrategy(s, assets, maxLossMarginPct);
  const legs = strategyLegs(s, initialDirection(s));
  let need = 0;
  legs.forEach((l, i) => {
    const L = pv[i]?.leverage ?? 1;
    need = Math.max(need, (RULES.MIN_ORDER_USD / (l.weightBps / 10_000)) / L);
  });
  return Math.ceil(need * 1.05 * 100) / 100;
}

export function fundingSpotToken(asset: string): string | undefined {
  return FUNDING_SPOT_TOKEN[asset];
}

/** Round a size down to the asset's size decimals. */
export function roundSz(sz: Decimal.Value, szDecimals: number): Decimal {
  return new Decimal(sz).toDecimalPlaces(szDecimals, Decimal.ROUND_DOWN);
}
