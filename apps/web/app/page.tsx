import Link from "next/link";
import { listMarkets } from "@bias/db";
import { fmtUsd } from "@bias/shared";
import { getDb } from "@/lib/db";
import { withLive } from "@/lib/live";
import { platformStats } from "@/lib/stats";
import { getConfig } from "@/lib/config";
import { MarketsGrid } from "@/components/MarketsGrid";
import { Stat, StatStrip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [rows, stats, cfg] = await Promise.all([getDb().then((db) => listMarkets(db, { limit: 60 })), platformStats(), getConfig()]);
  return (
    <>
      <section className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Markets</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Each coin is launched on pump.fun with a position on Hyperliquid. Creator fees fund the position; realized profit buys the coin back and burns
            it. Max 5×, stop-loss on the exchange from entry.{" "}
            <Link href="/docs" className="text-text underline decoration-line underline-offset-4 hover:decoration-muted">
              How it works
            </Link>
          </p>
        </div>
        <Link href="/launch" className="btn btn-long">
          Launch a market
        </Link>
      </section>
      <section className="mb-6" aria-label="platform stats">
        {stats.demoOnly && <div className="label mb-1.5">Demo data · positions priced live from Hyperliquid</div>}
        <StatStrip>
          <Stat label="Live markets" value={`${stats.marketsLive} / ${stats.marketsTotal}`} />
          <Stat label="Total equity" value={fmtUsd(stats.totalEquityUsd)} />
          <Stat label="Fees to positions" value={`${stats.feesRoutedSol.toFixed(2)} SOL`} />
          <Stat label="Profit taken" value={fmtUsd(stats.profitTakenUsd)} />
          <Stat label="Bought back" value={`${stats.boughtBackSol.toFixed(2)} SOL`} />
        </StatStrip>
      </section>
      <MarketsGrid initial={await withLive(rows)} allowlist={cfg.allowlist} />
    </>
  );
}
