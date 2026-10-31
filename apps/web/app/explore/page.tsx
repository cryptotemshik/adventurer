import type { Metadata } from "next";
import Link from "next/link";
import { listMarkets, type MarketSort } from "@bias/db";
import { fmtUsd } from "@bias/shared";
import { getDb } from "@/lib/db";
import { withLive } from "@/lib/live";
import { Pnl, StatusBadge, StrategyBadge, Empty } from "@/components/ui";

export const metadata: Metadata = { title: "Explore", description: "All bias markets in one table, exportable as CSV." };
export const dynamic = "force-dynamic";

const COLS: [MarketSort | null, string][] = [
  [null, "Market"],
  [null, "Position"],
  [null, "Status"],
  ["mcap", "Mcap"],
  ["largest", "Equity"],
  ["pnl", "Lifetime"],
  [null, "Fees → pos"],
  ["burned", "Bought back"],
  ["tp", "To SL / liq"],
  ["newest", "Age"],
];

export default async function Explore({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sort = (sp.sort as MarketSort) || "newest";
  const rows = await withLive(await listMarkets(await getDb(), { sort, q: sp.q, status: sp.status?.split(","), limit: 500 }));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Explore</h1>
          <p className="text-sm text-muted">{rows.length} markets{sp.q ? ` matching “${sp.q}”` : ""}</p>
        </div>
        <div className="flex gap-2">
          <form className="flex gap-2" action="/explore">
            <input name="q" defaultValue={sp.q} className="input w-56" placeholder="Ticker or contract address" aria-label="search" />
            <button className="btn">Search</button>
          </form>
          <a className="btn" href="/api/export/markets" download>
            Export CSV
          </a>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty title="No matches." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="grid-table num w-full min-w-[980px] text-[13px]">
            <thead>
              <tr>
                {COLS.map(([k, label]) => (
                  <th key={label}>
                    {k ? (
                      <Link href={`/explore?sort=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={sort === k ? "text-long" : "hover:text-text"}>
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">
                    <Link href={`/t/${m.mint}`} className="font-semibold hover:underline">
                      ${m.ticker}
                    </Link>
                    {m.community && <span className="tag ml-2">vote</span>}
                    {m.demo && <span className="tag ml-2">demo</span>}
                  </td>
                  <td className="px-3">
                    <StrategyBadge label={m.strategyLabel} direction={m.direction} />
                  </td>
                  <td className="px-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-3">{fmtUsd(m.mcapUsd, 0)}</td>
                  <td className="px-3">{fmtUsd(m.equityUsd)}</td>
                  <td className="px-3">
                    <Pnl v={m.lifetimePnlUsd} />
                  </td>
                  <td className="px-3">{m.feesPositionSol.toFixed(3)}</td>
                  <td className="px-3 text-accent">{m.boughtBackSol.toFixed(3)} SOL</td>
                  <td className="px-3 text-muted">
                    {m.riskToSl === null ? "—" : `${(m.riskToSl * 100).toFixed(1)}% / ${m.riskToLiq === null ? "—" : (m.riskToLiq * 100).toFixed(1) + "%"}`}
                  </td>
                  <td className="px-3 text-muted">{Math.max(0, Math.floor((Date.now() - m.createdAt) / 86_400_000))}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
