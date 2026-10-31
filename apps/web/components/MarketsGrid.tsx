"use client";

import { useMemo, useState } from "react";
import type { MarketView } from "@/lib/view";
import { MarketCard } from "./MarketCard";
import { Empty } from "./ui";
import { usePolling } from "./usePolling";

const SORTS = [
  ["newest", "newest"],
  ["mcap", "market cap"],
  ["pnl", "top pnl"],
  ["largest", "largest"],
  ["burned", "most burned"],
  ["tp", "closest to TP"],
] as const;

export function MarketsGrid({ initial, allowlist }: { initial: MarketView[]; allowlist: string[] }) {
  const [sort, setSort] = useState("newest");
  const [strategy, setStrategy] = useState("");
  const [asset, setAsset] = useState("");
  const [side, setSide] = useState("");
  const [community, setCommunity] = useState("");
  const [bonding, setBonding] = useState("");
  const url = useMemo(() => {
    const p = new URLSearchParams({ sort });
    if (strategy) p.set("strategy", strategy);
    if (asset) p.set("asset", asset);
    if (side) p.set("side", side);
    if (community) p.set("community", community);
    if (bonding) p.set("bonding", bonding);
    return `/api/markets?${p}`;
  }, [sort, strategy, asset, side, community, bonding]);
  const [data] = usePolling<{ markets: MarketView[] }>(url, 20_000, { markets: initial });
  const markets = data.markets;
  const featured = markets.filter((m) => m.featured);

  const sel = "input w-auto py-1.5 text-sm";
  return (
    <section aria-label="markets">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="sort">
          {SORTS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={sort === k} className={`btn py-1.5 ${sort === k ? "border-long/50 text-long" : "text-muted"}`} onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <select className={sel} value={strategy} onChange={(e) => setStrategy(e.target.value)} aria-label="strategy">
            <option value="">all strategies</option>
            <option value="single">single</option>
            <option value="basket">basket</option>
            <option value="pair">pair</option>
            <option value="funding">funding farm</option>
          </select>
          <select className={sel} value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="asset">
            <option value="">all assets</option>
            {allowlist.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className={sel} value={side} onChange={(e) => setSide(e.target.value)} aria-label="side">
            <option value="">any side</option>
            <option value="long">long</option>
            <option value="short">short</option>
            <option value="flat">flat</option>
          </select>
          <select className={sel} value={community} onChange={(e) => setCommunity(e.target.value)} aria-label="community voting">
            <option value="">any bias</option>
            <option value="true">🗳 community</option>
            <option value="false">fixed</option>
          </select>
          <select className={sel} value={bonding} onChange={(e) => setBonding(e.target.value)} aria-label="bonding">
            <option value="">bonding + graduated</option>
            <option value="bonding">bonding</option>
            <option value="graduated">graduated</option>
          </select>
        </div>
      </div>
      {featured.length > 0 && sort === "newest" && (
        <div className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-accent">featured</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}
      {markets.length === 0 ? (
        <Empty title="no markets yet.">be early, or be wrong. either way, launch one.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </section>
  );
}
