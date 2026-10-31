export type HlNetwork = "testnet" | "mainnet";
export type Hex = `0x${string}`;

export interface HlAssetMeta {
  name: string;
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
}

export interface HlSpotPair {
  /** base token name, e.g. "USOL" */
  token: string;
  /** pair name as used by allMids, e.g. "@156" or "PURR/USDC" */
  pairName: string;
  /** order asset id = 10000 + spot universe index */
  assetId: number;
  /** base token szDecimals */
  szDecimals: number;
  tokenIndex: number;
  tokenId: Hex;
  weiDecimals: number;
}

export interface HlLeg {
  asset: string;
  /** signed size; negative = short */
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  marginUsed: string;
  liquidationPx: string | null;
  leverage: number;
  isolated: boolean;
  /** cumulative funding since open (positive = paid) */
  cumFunding: string;
}

export interface HlTriggerOrder {
  oid: number;
  asset: string;
  isBuy: boolean;
  sz: string;
  triggerPx: string;
  tpsl: "tp" | "sl";
  reduceOnly: boolean;
}

export interface HlAccountState {
  accountValue: string;
  withdrawable: string;
  totalMarginUsed: string;
  totalNtlPos: string;
  legs: HlLeg[];
  triggers: HlTriggerOrder[];
  /** spot balances keyed by token name (e.g. "USDC", "USOL") */
  spot: Record<string, { total: string; hold: string }>;
}

export interface HlFill {
  oid: number;
  asset: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  closedPnl: string;
  fee: string;
  dir: string;
  hash: string;
  tid: number;
}

export interface MarketOrderResult {
  oid: number | null;
  filledSz: string;
  avgPx: string | null;
  /** "filled" | "partial" | "unfilled" | "resting" */
  status: string;
}
