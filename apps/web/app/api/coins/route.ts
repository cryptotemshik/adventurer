import { handle, ok } from "@/lib/http";

const cache = new Map<string, { at: number; v: unknown }>();

/** DexScreener prices for up to 30 visible mints (cached 60s). */
export const GET = handle(async (req: Request) => {
  const mints = (new URL(req.url).searchParams.get("mints") ?? "")
    .split(",")
    .filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m))
    .slice(0, 30);
  if (!mints.length) return ok({});
  const key = mints.slice().sort().join(",");
  const c = cache.get(key);
  if (c && Date.now() - c.at < 60_000) return ok(c.v, { cache: 60 });
  const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`);
  const pairs = r.ok ? ((await r.json()) as { baseToken: { address: string }; priceUsd?: string; marketCap?: number; fdv?: number }[]) : [];
  const out: Record<string, { priceUsd: number; mcapUsd: number }> = {};
  for (const p of pairs) {
    const a = p.baseToken.address;
    if (!out[a]) out[a] = { priceUsd: Number(p.priceUsd ?? 0), mcapUsd: Number(p.marketCap ?? p.fdv ?? 0) };
  }
  cache.set(key, { at: Date.now(), v: out });
  return ok(out, { cache: 60 });
});
