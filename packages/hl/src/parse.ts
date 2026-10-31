/** Pure response → domain mappers (unit-tested without network). */
import type { HlAccountState, HlAssetMeta, HlFill, HlLeg, HlSpotPair, HlTriggerOrder, Hex, MarketOrderResult } from "./types";
import { D } from "./format";

export interface RawMeta {
  universe: { name: string; szDecimals: number; maxLeverage: number; onlyIsolated?: boolean; isDelisted?: boolean }[];
}

export function parsePerpMeta(meta: RawMeta): Record<string, HlAssetMeta> {
  const out: Record<string, HlAssetMeta> = {};
  meta.universe.forEach((u, i) => {
    if (u.isDelisted) return;
    out[u.name] = {
      name: u.name,
      assetId: i,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
      onlyIsolated: !!u.onlyIsolated,
    };
  });
  return out;
}

export interface RawSpotMeta {
  universe: { tokens: [number, number] | number[]; name: string; index: number; isCanonical?: boolean }[];
  tokens: { name: string; szDecimals: number; weiDecimals: number; index: number; tokenId: string; isCanonical?: boolean }[];
}

/** Map base-token name → its USDC spot pair. Prefers canonical pairs, then the lowest index. */
export function parseSpotPairs(spot: RawSpotMeta): Record<string, HlSpotPair> {
  const tokens = new Map(spot.tokens.map((t) => [t.index, t]));
  const usdc = spot.tokens.find((t) => t.name === "USDC");
  if (!usdc) return {};
  const out: Record<string, HlSpotPair & { canonical: boolean }> = {};
  for (const u of spot.universe) {
    const [baseIdx, quoteIdx] = u.tokens;
    if (quoteIdx !== usdc.index || baseIdx === undefined) continue;
    const base = tokens.get(baseIdx);
    if (!base) continue;
    const canonical = !!u.isCanonical || !!base.isCanonical;
    const existing = out[base.name];
    const better =
      !existing || (canonical && !existing.canonical) || (canonical === existing.canonical && u.index < existing.assetId - 10_000);
    if (!better) continue;
    out[base.name] = {
      token: base.name,
      pairName: u.name,
      assetId: 10_000 + u.index,
      szDecimals: base.szDecimals,
      tokenIndex: base.index,
      tokenId: base.tokenId as Hex,
      weiDecimals: base.weiDecimals,
      canonical,
    };
  }
  const result: Record<string, HlSpotPair> = {};
  for (const [k, { canonical: _c, ...v }] of Object.entries(out)) result[k] = v;
  return result;
}

export interface RawClearinghouse {
  marginSummary: { accountValue: string; totalNtlPos: string; totalMarginUsed: string };
  withdrawable: string;
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      leverage: { type: "isolated" | "cross"; value: number };
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      liquidationPx: string | null;
      marginUsed: string;
      cumFunding: { sinceOpen: string };
    };
  }[];
}

export interface RawOpenOrder {
  coin: string;
  side: "B" | "A";
  sz: string;
  oid: number;
  isTrigger: boolean;
  triggerPx: string;
  reduceOnly: boolean;
  orderType: string;
}

export function parseLegs(ch: RawClearinghouse): HlLeg[] {
  return ch.assetPositions
    .map(({ position: p }) => ({
      asset: p.coin,
      szi: p.szi,
      entryPx: p.entryPx,
      positionValue: p.positionValue,
      unrealizedPnl: p.unrealizedPnl,
      marginUsed: p.marginUsed,
      liquidationPx: p.liquidationPx,
      leverage: p.leverage.value,
      isolated: p.leverage.type === "isolated",
      cumFunding: p.cumFunding.sinceOpen,
    }))
    .filter((l) => !new D(l.szi).isZero());
}

export function parseTriggers(orders: RawOpenOrder[]): HlTriggerOrder[] {
  return orders
    .filter((o) => o.isTrigger)
    .map((o) => ({
      oid: o.oid,
      asset: o.coin,
      isBuy: o.side === "B",
      sz: o.sz,
      triggerPx: o.triggerPx,
      tpsl: /take profit/i.test(o.orderType) ? ("tp" as const) : ("sl" as const),
      reduceOnly: o.reduceOnly,
    }));
}

export function parseAccountState(
  ch: RawClearinghouse,
  orders: RawOpenOrder[],
  spot: { balances: { coin: string; total: string; hold: string }[] },
): HlAccountState {
  const spotOut: HlAccountState["spot"] = {};
  for (const b of spot.balances) spotOut[b.coin] = { total: b.total, hold: b.hold };
  return {
    accountValue: ch.marginSummary.accountValue,
    withdrawable: ch.withdrawable,
    totalMarginUsed: ch.marginSummary.totalMarginUsed,
    totalNtlPos: ch.marginSummary.totalNtlPos,
    legs: parseLegs(ch),
    triggers: parseTriggers(orders),
    spot: spotOut,
  };
}

export interface RawFill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  closedPnl: string;
  fee: string;
  dir: string;
  hash: string;
  oid: number;
  tid: number;
}

export function parseFills(fills: RawFill[]): HlFill[] {
  return fills
    .map((f) => ({
      oid: f.oid,
      asset: f.coin,
      px: f.px,
      sz: f.sz,
      side: f.side,
      time: f.time,
      closedPnl: f.closedPnl,
      fee: f.fee,
      dir: f.dir,
      hash: f.hash,
      tid: f.tid,
    }))
    .sort((a, b) => a.time - b.time || a.tid - b.tid);
}

export type RawOrderStatus =
  | { resting: { oid: number } }
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { error: string }
  | string;

export function parseMarketOrderStatus(status: RawOrderStatus | undefined, requestedSz: string): MarketOrderResult {
  if (status === undefined) return { oid: null, filledSz: "0", avgPx: null, status: "unknown" };
  if (typeof status === "string") return { oid: null, filledSz: "0", avgPx: null, status };
  if ("error" in status) throw new Error(status.error);
  if ("filled" in status) {
    const full = new D(status.filled.totalSz).gte(requestedSz);
    return {
      oid: status.filled.oid,
      filledSz: status.filled.totalSz,
      avgPx: status.filled.avgPx,
      status: full ? "filled" : "partial",
    };
  }
  return { oid: status.resting.oid, filledSz: "0", avgPx: null, status: "resting" };
}
