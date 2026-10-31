import { z } from "zod";
import { DEFAULT_ALLOWLIST } from "./assets";

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"));
const num = (d: number) => z.coerce.number().default(d);
const str = (d = "") => z.string().default(d);

export const ConfigSchema = z.object({
  NEXT_PUBLIC_SITE_URL: str("http://localhost:3000"),
  NEXT_PUBLIC_SOLANA_RPC: str("https://api.mainnet-beta.solana.com"),
  SOLANA_RPC: str(""),
  SOLANA_RPC_FALLBACK: str("https://api.mainnet-beta.solana.com"),
  HL_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  TREASURY_PUBKEY: str(""),
  BIAS_MINT: str(""),
  LAUNCH_FEE_SOL: str("0.02"),
  VAULT_RENT_SOL: str("0.003"),
  MAX_DEV_BUY_SOL: str("1"),
  LAUNCH_COOLDOWN_MIN: num(15),
  LAUNCHES_ENABLED: bool.default(true),
  TRADING_MODE: z.enum(["normal", "close_only", "halted"]).default("normal"),
  FEE_SPLIT_POSITION_BPS: num(7000),
  FEE_SPLIT_LAUNCHER_BPS: num(2000),
  FEE_SPLIT_PLATFORM_BPS: num(1000),
  MIN_CLAIM_SOL: str("0.02"),
  MIN_BRIDGE_SOL: str("0.25"),
  MIN_PAYOUT_SOL: str("0.05"),
  MIN_BUYBACK_USD: str("15"),
  MAX_LEVERAGE: num(5),
  MAX_LOSS_MARGIN_PCT: num(50),
  MAX_SLIPPAGE_BPS: num(50),
  BUYBACK_SLIPPAGE_BPS: num(300),
  MAX_NOTIONAL_PER_MARKET_USD: num(25_000),
  MAX_TOTAL_NOTIONAL_USD: num(250_000),
  GLOBAL_DRAWDOWN_HALT_PCT: num(20),
  VOTE_QUORUM_SUPPLY_PCT: num(1),
  TIER_TRADER: num(50_000),
  TIER_DESK: num(500_000),
  TIER_FUND: num(2_000_000),
  MAX_PRIORITY_MICROLAMPORTS: num(50_000),
  ADMIN_WALLETS: str(""),
  DRY_RUN: bool.default(false),
  DRY_RUN_PAYER: str(""),
  ASSET_ALLOWLIST: str(DEFAULT_ALLOWLIST.join(",")),
});

export type RawConfig = z.infer<typeof ConfigSchema>;

export interface Config extends RawConfig {
  adminWallets: string[];
  allowlist: string[];
}

export function loadConfig(env: Record<string, string | undefined> = readEnv()): Config {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== "") cleaned[k] = v;
  const raw = ConfigSchema.parse(cleaned);
  const split =
    raw.FEE_SPLIT_POSITION_BPS + raw.FEE_SPLIT_LAUNCHER_BPS + raw.FEE_SPLIT_PLATFORM_BPS;
  if (split !== 10_000) throw new Error(`fee split must sum to 10000 bps, got ${split}`);
  if (raw.MAX_LEVERAGE > 5) throw new Error("MAX_LEVERAGE is hard-capped at 5");
  return {
    ...raw,
    adminWallets: raw.ADMIN_WALLETS.split(",").map((s) => s.trim()).filter(Boolean),
    allowlist: raw.ASSET_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

function readEnv(): Record<string, string | undefined> {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/** Strategy-type leverage caps (section 6.1). */
export const LEVERAGE_CAPS = { single: 5, basket: 4, pair: 3, funding: 1 } as const;

/** Constants that are product rules, not deployment knobs. */
export const RULES = {
  /** HL minimum order notional is $10; we keep a margin of safety. */
  MIN_ORDER_USD: 12,
  COOLDOWN_HOURS: 12,
  MAX_CONSECUTIVE_STOPS: 3,
  STOPPED_AFTER_COOLDOWN_DAYS: 7,
  DEAD_AFTER_NO_FEES_DAYS: 14,
  ADD_MIN_INTERVAL_MIN: 60,
  TP_MARGIN_PCT: [25, 50, 100] as const,
  TP_CLOSE_FRACTION_PCT: 25,
  /** SL must trigger at most 70% of the way to liquidation (i.e. ≥30% earlier). */
  SL_LIQ_MAX_RATIO: 0.7,
  LIQ_GUARD_RATIO: 1.5,
  LIQ_GUARD_MARGIN_RATIO: 0.7,
  DELEVERAGE_FRACTION_PCT: 30,
  FUNDING_REBALANCE_PCT: 3,
  FLIP_MIN_HOURS: 24,
  VOTE_MIN_WALLETS: 5,
  VOTE_MAX_WEIGHT_SHARE: 0.1,
  RECONCILE_TOLERANCE_PCT: 1,
  PENDING_LAUNCH_TTL_SEC: 120,
  CLAIM_MAX_INTERVAL_HOURS: 24,
  PAYOUT_MAX_INTERVAL_HOURS: 24,
  TRIGGER_PX_TOLERANCE: 0.002,
  TRIGGER_SZ_TOLERANCE: 0.02,
} as const;

export const DISCLAIMER =
  "positions are leveraged and can lose everything. vaults are operated by the platform. memecoins are extremely risky. nothing here is financial advice.";
export const SLOGAN = "every coin has a bias.";
