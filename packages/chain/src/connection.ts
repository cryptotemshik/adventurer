import { Connection, type Commitment } from "@solana/web3.js";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

/**
 * Connection with a fallback RPC: any network error, 429 or 5xx on the primary endpoint is retried once
 * on the fallback (Helius Free → public mainnet-beta). Works in Node and in Cloudflare Workers.
 */
export function getConnection(primary?: string, fallback?: string, commitment: Commitment = "confirmed"): Connection {
  const main = primary || fallback || DEFAULT_RPC;
  const alt = fallback && fallback !== main ? fallback : null;
  if (!alt) return new Connection(main, { commitment });
  const fetchWithFallback = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const res = await fetch(input, init);
      if (res.status !== 429 && res.status < 500) return res;
    } catch {
      /* fall through to fallback */
    }
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return fetch(url.replace(main, alt), init);
  };
  return new Connection(main, { commitment, fetch: fetchWithFallback as typeof fetch, disableRetryOnRateLimit: true });
}

export interface ChainCtx {
  connection: Connection;
  dryRun: boolean;
}

export interface TxResult {
  signature: string | null;
  simulated: boolean;
  logs?: string[];
}
