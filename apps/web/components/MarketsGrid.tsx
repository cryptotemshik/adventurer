"use client";

import { useMemo, useState } from "react";
import type { MarketView } from "@/lib/view";
import { MarketCard } from "./MarketCard";
import { MarketsTable } from "./MarketsTable";
import { Empty } from "./ui";
import { usePolling } from "./usePolling";

const SORTS = [
  ["newest", "Newest"],
  ["mcap", "Market cap"],
  ["pnl", "Top PnL"],
  ["largest", "Largest"],
  ["burned", "Most burned"],
  ["tp", "Closest to TP"],
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

  const sel = "input h-8 w-auto py-0 text-[13px]";
  return (
    <section aria-label="markets">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 border-b border-line">
        <div className="flex flex-wrap" role="tablist" aria-label="sort">
          {SORTS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={sort === k} className="tab" onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pb-2">
          <select className={sel} value={strategy} onChange={(e) => setStrategy(e.target.value)} aria-label="strategy">
            <option value="">All strategies</option>
            <option value="single">Single</option>
            <option value="basket">Basket</option>
            <option value="pair">Pair</option>
            <option value="funding">Funding farm</option>
          </select>
          <select className={sel} value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="asset">
            <option value="">All assets</option>
            {allowlist.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className={sel} value={side} onChange={(e) => setSide(e.target.value)} aria-label="side">
            <option value="">Any side</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
            <option value="flat">Flat</option>
          </select>
          <select className={sel} value={community} onChange={(e) => setCommunity(e.target.value)} aria-label="community voting">
            <option value="">Any direction</option>
            <option value="true">Holder vote</option>
            <option value="false">Fixed</option>
          </select>
          <select className={sel} value={bonding} onChange={(e) => setBonding(e.target.value)} aria-label="bonding">
            <option value="">Curve + graduated</option>
            <option value="bonding">On curve</option>
            <option value="graduated">Graduated</option>
          </select>
        </div>
      </div>
      {featured.length > 0 && sort === "newest" && (
        <div className="mb-4">
          <div className="label mb-2">Featured</div>
          <MarketsTable markets={featured} />
        </div>
      )}
      {markets.length === 0 ? (
        <Empty title="No markets yet.">The first one launched will show up here.</Empty>
      ) : (
        <>
          <div className="hidden md:block">
            <MarketsTable markets={markets} />
          </div>
          <div className="grid gap-2 md:hidden">
            {markets.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
