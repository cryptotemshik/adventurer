import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { getTokenBalance, getTokenSupply } from "@bias/chain/launch";
import { tierFor } from "@bias/engine";
import type { Tier } from "@bias/shared";
import { getCachedBalance, setCachedBalance } from "@bias/db";
import { getDb } from "./db";
import { getConfig } from "./config";

let conn: Connection | null = null;
export function connection(): Connection {
  conn ??= new Connection(process.env.SOLANA_RPC || process.env.SOLANA_RPC_FALLBACK || "https://api.mainnet-beta.solana.com", "confirmed");
  return conn;
}

/** Raw token balance (SPL + Token-2022), cached. */
export async function walletTokenBalance(wallet: string, mint: string, maxAgeMs = 600_000): Promise<bigint> {
  const db = await getDb();
  const c = await getCachedBalance(db, wallet, mint, maxAgeMs);
  if (c !== null) return c;
  let b: bigint;
  try {
    b = await getTokenBalance(connection(), new PublicKey(wallet), new PublicKey(mint));
  } catch (e) {
    // a mint that doesn't exist on chain (e.g. a DRY_RUN market) means nobody holds it
    if (/not found|could not find|invalid|AccountNotFound/i.test((e as Error).message)) return 0n;
    throw e;
  }
  await setCachedBalance(db, wallet, mint, b);
  return b;
}

const supplyCache = new Map<string, { at: number; v: { amount: bigint; decimals: number } }>();
export async function tokenSupply(mint: string) {
  const c = supplyCache.get(mint);
  if (c && Date.now() - c.at < 600_000) return c.v;
  const v = await getTokenSupply(connection(), new PublicKey(mint));
  supplyCache.set(mint, { at: Date.now(), v });
  return v;
}

export async function walletTier(wallet: string | null): Promise<{ tier: Tier; balance: number }> {
  const cfg = await getConfig();
  const th = { trader: cfg.TIER_TRADER, desk: cfg.TIER_DESK, fund: cfg.TIER_FUND };
  if (!cfg.BIAS_MINT) return { tier: tierFor(0, th, false), balance: 0 };
  if (!wallet) return { tier: "none", balance: 0 };
  try {
    const raw = await walletTokenBalance(wallet, cfg.BIAS_MINT, 60_000);
    const balance = Number(raw) / 1e6;
    return { tier: tierFor(balance, th, true), balance };
  } catch {
    return { tier: "none", balance: 0 };
  }
}
