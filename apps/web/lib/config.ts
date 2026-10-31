import "server-only";
import { loadConfig, type Config, type TradingMode } from "@bias/shared";
import { getSettings } from "@bias/db";
import { getDb } from "./db";

let cached: { at: number; cfg: Config } | null = null;

/** Env config + admin overrides stored in the DB (kill switches, limits, allowlist). */
export async function getConfig(): Promise<Config> {
  if (cached && Date.now() - cached.at < 5_000) return cached.cfg;
  const base = loadConfig(process.env as Record<string, string | undefined>);
  let s: Record<string, string> = {};
  try {
    s = await getSettings(await getDb());
  } catch {}
  const cfg: Config = { ...base };
  if (s.LAUNCHES_ENABLED !== undefined) cfg.LAUNCHES_ENABLED = s.LAUNCHES_ENABLED === "true";
  if (s.TRADING_MODE) cfg.TRADING_MODE = s.TRADING_MODE as TradingMode;
  if (s.MAX_NOTIONAL_PER_MARKET_USD) cfg.MAX_NOTIONAL_PER_MARKET_USD = Number(s.MAX_NOTIONAL_PER_MARKET_USD);
  if (s.MAX_TOTAL_NOTIONAL_USD) cfg.MAX_TOTAL_NOTIONAL_USD = Number(s.MAX_TOTAL_NOTIONAL_USD);
  if (s.ASSET_ALLOWLIST) cfg.allowlist = s.ASSET_ALLOWLIST.split(",").map((x) => x.trim()).filter(Boolean);
  cached = { at: Date.now(), cfg };
  return cfg;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
