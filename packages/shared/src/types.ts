export type Side = "long" | "short";
/** Effective direction of a market. For pairs: long = "long A / short B", short = reversed. */
export type Direction = "long" | "short" | "flat";
export type StrategyType = "single" | "basket" | "pair" | "funding";

export interface SingleStrategy {
  type: "single";
  asset: string;
  side: Side;
  leverage: number;
}
export interface BasketStrategy {
  type: "basket";
  side: Side;
  leverage: number;
  legs: { asset: string; weightBps: number }[];
}
export interface PairStrategy {
  type: "pair";
  long: string;
  short: string;
  leverage: number;
}
export interface FundingStrategy {
  type: "funding";
  asset: string;
}
export type Strategy = SingleStrategy | BasketStrategy | PairStrategy | FundingStrategy;

export type MarketStatus =
  | "pending_launch"
  | "waiting_for_fees"
  | "live"
  | "cooldown"
  | "flat"
  | "stopped"
  | "dead";

export type TradingMode = "normal" | "close_only" | "halted";

export type TriggerKind = "sl" | "tp1" | "tp2" | "tp3";

export type EventType =
  | "launch"
  | "claim"
  | "split"
  | "payout"
  | "bridge_in"
  | "bridge_arrived"
  | "open"
  | "add"
  | "reduce"
  | "close"
  | "tp_hit"
  | "sl_hit"
  | "deleverage"
  | "flip"
  | "flat"
  | "cooldown"
  | "withdraw"
  | "buyback"
  | "burn"
  | "stopped"
  | "dead"
  | "alert";

export type LedgerType =
  | "claim"
  | "split_launcher"
  | "split_platform"
  | "split_position"
  | "payout_launcher"
  | "payout_platform"
  | "bridge_in"
  | "in_transit"
  | "deposit"
  | "trade_fee"
  | "funding"
  | "realized_pnl"
  | "withdraw"
  | "buyback"
  | "burn";

export type Tier = "none" | "trader" | "desk" | "fund";
