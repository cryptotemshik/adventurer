import { fmtDuration, strategyLabel, type Strategy } from "@bias/shared";

const EPITAPHS = [
  "here lies ${T}. it was early. it was also wrong.",
  "here lies ${T}. the stop worked. the thesis didn't.",
  "${T}: bought the dip. the dip bought back.",
  "rest easy, ${T}. the chart remembers you fondly. nobody else does.",
  "${T} had conviction. the market had more.",
  "here lies ${T}. survived by its stop-loss.",
  "${T} went to get a better entry. never came back.",
  "${T}: risk managed. dignity, less so.",
  "in loving memory of ${T}. it was liquid until it wasn't.",
  "${T} died as it lived: one candle too early.",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function epitaph(ticker: string, mint: string): string {
  return EPITAPHS[hash(mint) % EPITAPHS.length]!.replace("${T}", `$${ticker}`);
}

export function tombstoneReason(i: {
  status: "stopped" | "dead" | "liquidated";
  strategy: Strategy;
  createdAt: number;
  endedAt: number;
  lossPctOfMargin?: number;
}): string {
  const lived = `lived ${fmtDuration(i.endedAt - i.createdAt)}`;
  const strat = strategyLabel(i.strategy);
  if (i.status === "liquidated") return `liquidated · ${strat} · ${lived}`;
  if (i.status === "dead") return `no fees for 14 days · ${strat} · ${lived}`;
  const loss = i.lossPctOfMargin !== undefined ? `stopped at −${Math.round(i.lossPctOfMargin)}% margin` : "stopped";
  return `${loss} · ${strat} · ${lived}`;
}

/** "pay respects": one per wallet per UTC day. */
export function respectsKey(wallet: string, mint: string, now: number): string {
  return `${mint}:${wallet}:${new Date(now).toISOString().slice(0, 10)}`;
}
