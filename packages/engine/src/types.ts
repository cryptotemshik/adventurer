import type { Direction, EventType, MarketStatus, Strategy, TradingMode, TriggerKind } from "@bias/shared";

export interface AssetInfo {
  szDecimals: number;
  maxLeverage: number;
}

export interface LegState {
  asset: string;
  /** signed size: >0 long, <0 short */
  szi: string;
  entryPx: string;
  leverage: number;
  liquidationPx: string | null;
  unrealizedPnl: string;
  marginUsed: string;
}

export interface TriggerState {
  oid: number;
  asset: string;
  tpsl: "tp" | "sl";
  triggerPx: string;
  sz: string;
  isBuy: boolean;
}

export interface ClosedLeg {
  asset: string;
  reason: TriggerKind | "other";
  pnl: string;
  /** tp stage the leg was at when the close happened */
  stage: number;
}

export interface MarketState {
  id: string;
  strategy: Strategy;
  status: MarketStatus;
  direction: Direction;
  community: boolean;
  paused: boolean;
  now: number;
  createdAt: number;
  lastFeeAt: number | null;
  lastAddAt: number | null;
  lastFlipAt: number | null;
  stoppedAt: number | null;
  cooldownUntil: number | null;
  consecutiveStops: number;
  /** take-profit stage per asset (0..3) */
  tpStages: Record<string, number>;
  account: {
    /** perp account value (USD) */
    accountValue: string;
    /** free perp collateral (USD) */
    withdrawable: string;
    /** spot balances by token (total) incl. USDC */
    spot: Record<string, string>;
  };
  legs: LegState[];
  triggers: TriggerState[];
  marks: Record<string, string>;
  spotMarks?: Record<string, string>;
  assets: Record<string, AssetInfo>;
  spotAssets?: Record<string, AssetInfo>;
  /** average funding rate per 8h window, most recent first (funding farm only) */
  fundingWindows?: number[];
  /** finalized vote result, if any (community markets only) */
  vote?: { direction: Direction; round: string } | null;
  /** legs closed since the previous tick (from fills) */
  closed?: ClosedLeg[];
  /** USD earmarked for buyback (profit queue) that must not be redeployed */
  reservedUsd?: string;
}

export interface GlobalState {
  tradingMode: TradingMode;
  /** current notional across all markets (USD) */
  totalNotionalUsd: string;
  maxNotionalPerMarketUsd: number;
  maxTotalNotionalUsd: number;
  maxLeverage: number;
  maxLossMarginPct: number;
  slippageBps: number;
}

export interface PlannedTrigger {
  label: TriggerKind;
  tpsl: "tp" | "sl";
  isBuy: boolean;
  sz: string;
  triggerPx: string;
}

export type OrderReason = "open" | "add" | "reduce" | "close" | "deleverage" | "flip" | "rebalance" | "stop";

export interface StatusPatch {
  direction?: Direction;
  cooldownUntil?: number | null;
  consecutiveStops?: number;
  stoppedAt?: number | null;
  lastFlipAt?: number | null;
  lastAddAt?: number | null;
  tpStages?: Record<string, number>;
}

export type Action =
  | { kind: "set_leverage"; asset: string; leverage: number }
  | {
      kind: "order";
      asset: string;
      isBuy: boolean;
      sz: string;
      reduceOnly: boolean;
      reason: OrderReason;
      markPx: string;
    }
  | { kind: "spot_order"; token: string; isBuy: boolean; sz: string; markPx: string; reason: OrderReason }
  | { kind: "replace_triggers"; asset: string; cancelOids: number[]; place: PlannedTrigger[] }
  | { kind: "cancel_triggers"; asset: string; oids: number[] }
  | { kind: "add_margin"; asset: string; usd: string; isLong: boolean }
  | { kind: "set_status"; status: MarketStatus; reason: string; patch?: StatusPatch }
  | { kind: "event"; type: EventType; message: string }
  | { kind: "alert"; message: string };

export interface Decision {
  actions: Action[];
  notes: string[];
}
