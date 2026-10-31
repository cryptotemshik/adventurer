import "server-only";
import type { AssetInfo } from "@bias/engine";

const API = () => (process.env.HL_NETWORK === "mainnet" ? "https://api.hyperliquid.xyz/info" : "https://api.hyperliquid-testnet.xyz/info");
const MAINNET = "https://api.hyperliquid.xyz/info";

const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttl: number, f: () => Promise<T>): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttl) return c.v as T;
  const v = await f();
  cache.set(key, { at: Date.now(), v });
  return v;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`hyperliquid ${r.status}`);
  return (await r.json()) as T;
}

/** Mid prices (cached 15s). Display prices come from mainnet even when trading runs on testnet. */
export function allMids(): Promise<Record<string, string>> {
  return cached("mids", 15_000, () => post<Record<string, string>>(MAINNET, { type: "allMids" }));
}

/** Perp asset meta for the risk preview (cached 10 min). Uses the trading network's limits. */
export function perpAssets(): Promise<Record<string, AssetInfo>> {
  return cached("meta:" + API(), 600_000, async () => {
    const meta = await post<{ universe: { name: string; szDecimals: number; maxLeverage: number; isDelisted?: boolean }[] }>(API(), { type: "meta" });
    const out: Record<string, AssetInfo> = {};
    for (const u of meta.universe) if (!u.isDelisted) out[u.name] = { szDecimals: u.szDecimals, maxLeverage: u.maxLeverage };
    // mainnet limits are the binding ones for production; take the stricter of both networks
    if (API() !== MAINNET) {
      try {
        const mm = await post<{ universe: { name: string; szDecimals: number; maxLeverage: number }[] }>(MAINNET, { type: "meta" });
        for (const u of mm.universe) if (out[u.name]) out[u.name]!.maxLeverage = Math.min(out[u.name]!.maxLeverage, u.maxLeverage);
      } catch {}
    }
    return out;
  });
}

export function hlExplorer(address: string): string {
  return process.env.HL_NETWORK === "mainnet"
    ? `https://app.hyperliquid.xyz/explorer/address/${address}`
    : `https://app.hyperliquid-testnet.xyz/explorer/address/${address}`;
}
