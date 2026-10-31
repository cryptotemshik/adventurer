import { handle, ok, fail } from "@/lib/http";

const cache = new Map<string, { at: number; v: unknown }>();

/** Candles for the asset chart (mainnet prices; cached 60s). */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const coin = u.get("coin") ?? "";
  const interval = u.get("interval") ?? "1h";
  if (!/^[A-Za-z0-9]{1,12}$/.test(coin) || !["15m", "1h", "4h", "1d"].includes(interval)) return fail(400, "bad params");
  const key = `${coin}:${interval}`;
  const c = cache.get(key);
  if (c && Date.now() - c.at < 60_000) return ok(c.v, { cache: 60 });
  const ms = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 }[interval]!;
  const r = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime: Date.now() - ms * 300, endTime: Date.now() } }),
  });
  if (!r.ok) return fail(502, "hyperliquid unavailable");
  const raw = (await r.json()) as { t: number; o: string; h: string; l: string; c: string }[];
  const v = raw.map((k) => ({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c }));
  cache.set(key, { at: Date.now(), v });
  return ok(v, { cache: 60 });
});
