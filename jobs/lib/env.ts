import { loadConfig, type Config, type TradingMode } from "@bias/shared";
import { createDb, httpBackend, getSettings, type Db } from "@bias/db";

export interface JobEnv {
  cfg: Config;
  db: Db;
  network: "testnet" | "mainnet";
  dryRun: boolean;
  now: () => number;
  log: (...a: unknown[]) => void;
}

/** Jobs talk to the production DB through the worker (BIAS_DB_URL + JOB_TOKEN), or to a local SQLite file. */
export async function jobDb(): Promise<Db> {
  const url = process.env.BIAS_DB_URL;
  const token = process.env.JOB_TOKEN;
  if (url && token) return createDb(httpBackend(url, token));
  const { nodeDb } = await import("@bias/db/node");
  return nodeDb(process.env.BIAS_SQLITE_PATH ?? "apps/web/.data/bias.db");
}

export async function effectiveConfig(db: Db, base = loadConfig()): Promise<Config> {
  const s = await getSettings(db);
  const cfg: Config = { ...base };
  if (s.LAUNCHES_ENABLED !== undefined) cfg.LAUNCHES_ENABLED = s.LAUNCHES_ENABLED === "true";
  if (s.TRADING_MODE) cfg.TRADING_MODE = s.TRADING_MODE as TradingMode;
  if (s.MAX_NOTIONAL_PER_MARKET_USD) cfg.MAX_NOTIONAL_PER_MARKET_USD = Number(s.MAX_NOTIONAL_PER_MARKET_USD);
  if (s.MAX_TOTAL_NOTIONAL_USD) cfg.MAX_TOTAL_NOTIONAL_USD = Number(s.MAX_TOTAL_NOTIONAL_USD);
  if (s.ASSET_ALLOWLIST) cfg.allowlist = s.ASSET_ALLOWLIST.split(",").map((x) => x.trim()).filter(Boolean);
  return cfg;
}

export async function makeEnv(db?: Db): Promise<JobEnv> {
  const d = db ?? (await jobDb());
  const cfg = await effectiveConfig(d);
  return {
    cfg,
    db: d,
    network: cfg.HL_NETWORK,
    dryRun: cfg.DRY_RUN,
    now: () => Date.now(),
    log: (...a) => console.log(new Date().toISOString(), ...a),
  };
}

export function requireSecret(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (GitHub Actions secret)`);
  return v.trim();
}
