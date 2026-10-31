import type { Action, AssetInfo, LegState, TriggerState, FillLike, PlannedTrigger } from "@bias/engine";
import type { TriggerKind } from "@bias/shared";
import type { Market } from "@bias/db";

/** Exchange state for one market account, in engine terms. */
export interface VenueState {
  account: { accountValue: string; withdrawable: string; spot: Record<string, string> };
  legs: LegState[];
  triggers: TriggerState[];
}

export interface ExecResult {
  ok: boolean;
  note: string;
  /** trigger oids placed, with labels (replace_triggers) */
  placed?: { oid: number; asset: string; label: TriggerKind; tpsl: "tp" | "sl"; triggerPx: string; sz: string }[];
  filledSz?: string;
}

/** Trading venue as seen by the agent (trade-only key). */
export interface Venue {
  marks(): Promise<Record<string, string>>;
  assets(): Promise<Record<string, AssetInfo>>;
  spotInfo(): Promise<{ assets: Record<string, AssetInfo>; marks: Record<string, string> }>;
  state(m: Market): Promise<VenueState>;
  fills(m: Market, sinceMs: number): Promise<FillLike[]>;
  /** average funding per 8h window, most recent first */
  fundingWindows(asset: string, now: number): Promise<number[]>;
  execute(m: Market, a: Action): Promise<ExecResult>;
}

/** Treasury operations on the market's HL master account (withdrawal-capable key, buyback workflow only). */
export interface HlTreasuryOps {
  exists(m: Market): Promise<boolean>;
  state(m: Market): Promise<VenueState>;
  sellSpot(m: Market, token: string, sz: string): Promise<{ usdc: string }>;
  buySpot(m: Market, token: string, usd: string): Promise<{ sz: string }>;
  usdTransfer(m: Market, usd: string, toPerp: boolean): Promise<void>;
  approveAgent(m: Market): Promise<void>;
  spotSend(m: Market, destination: string, token: string, amount: string): Promise<void>;
}

/** Solana-side operations for a market vault (and the platform vault). */
export interface ChainOps {
  claimable(m: Market): Promise<bigint>;
  claim(m: Market): Promise<{ sig: string | null; lamports: bigint }>;
  vaultBalance(address: string): Promise<bigint>;
  payout(index: number, outs: { to: string; lamports: bigint }[]): Promise<string | null>;
  depositAddress(m: Market): Promise<string>;
  withdrawAddress(m: Market): Promise<string>;
  send(index: number, to: string, lamports: bigint): Promise<string | null>;
  buyAndBurn(index: number, mint: string, lamports: bigint): Promise<{ buySig: string | null; burnSig: string | null; tokens: bigint }>;
  supply(mint: string): Promise<bigint>;
  coin(mint: string): Promise<{ priceUsd: number; mcapUsd: number; progress: number; graduated: boolean } | null>;
}

export type { PlannedTrigger };
