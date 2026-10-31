/** Core assets (always allowed) and the extended allowlist (top open-interest perps on Hyperliquid,
 * verified against the Info API on 2026-10-31; re-checked daily by jobs/allowlist.ts). */
export const CORE_ASSETS = ["BTC", "ETH", "SOL", "HYPE"] as const;
export const EXTENDED_ASSETS = [
  "ZEC",
  "NEAR",
  "XRP",
  "ENA",
  "PUMP",
  "UNI",
  "DOGE",
  "kPEPE",
  "BNB",
  "AAVE",
  "LINK",
  "WLD",
  "SUI",
  "ADA",
  "TAO",
  "XMR",
  "ZRO",
  "LIT",
  "XPL",
  "PAXG",
] as const;
export const DEFAULT_ALLOWLIST: string[] = [...CORE_ASSETS, ...EXTENDED_ASSETS];

/** Perp → spot token used for the long leg of a funding farm (Hyperliquid spot, quoted in USDC). */
export const FUNDING_SPOT_TOKEN: Record<string, string> = {
  HYPE: "HYPE",
  BTC: "UBTC",
  ETH: "UETH",
  SOL: "USOL",
};
export const FUNDING_ASSETS = Object.keys(FUNDING_SPOT_TOKEN);

/** Fallback max leverage per asset (from HL meta). The engine always takes min(this, live meta). */
export const ASSET_MAX_LEVERAGE: Record<string, number> = {
  BTC: 40,
  ETH: 25,
  SOL: 20,
  HYPE: 10,
  XRP: 20,
  XMR: 5,
  LIT: 5,
  ZRO: 5,
  TAO: 5,
};
