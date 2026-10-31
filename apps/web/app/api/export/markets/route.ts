import { listMarkets } from "@bias/db";
import { getDb } from "@/lib/db";
import { handle } from "@/lib/http";
import { toView, type MarketView } from "@/lib/view";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  // neutralise spreadsheet formula injection and quote
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const GET = handle(async () => {
  const rows = (await listMarkets(await getDb(), { limit: 500 })).map(toView);
  const cols: [string, (m: MarketView) => unknown][] = [
    ["ticker", (m) => m.ticker],
    ["name", (m) => m.name],
    ["mint", (m) => m.mint],
    ["strategy", (m) => m.strategyLabel],
    ["status", (m) => m.status],
    ["community", (m) => m.community],
    ["mcap_usd", (m) => m.mcapUsd.toFixed(0)],
    ["equity_usd", (m) => m.equityUsd.toFixed(2)],
    ["upnl_usd", (m) => m.upnlUsd.toFixed(2)],
    ["lifetime_pnl_usd", (m) => m.lifetimePnlUsd.toFixed(2)],
    ["fees_claimed_sol", (m) => m.feesClaimedSol],
    ["fees_to_position_sol", (m) => m.feesPositionSol],
    ["bought_back_sol", (m) => m.boughtBackSol],
    ["burned_pct", (m) => m.burnedPct.toFixed(4)],
    ["created_at", (m) => new Date(m.createdAt).toISOString()],
  ];
  const csv = [cols.map((c) => c[0]).join(","), ...rows.map((m) => cols.map((c) => esc(c[1](m))).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=bias-markets.csv" } });
});
