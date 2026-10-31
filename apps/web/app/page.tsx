import Link from "next/link";
import { listMarkets } from "@bias/db";
import { fmtUsd } from "@bias/shared";
import { getDb } from "@/lib/db";
import { toView } from "@/lib/view";
import { platformStats } from "@/lib/stats";
import { getConfig } from "@/lib/config";
import { MarketsGrid } from "@/components/MarketsGrid";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [rows, stats, cfg] = await Promise.all([getDb().then((db) => listMarkets(db, { limit: 60 })), platformStats(), getConfig()]);
  return (
    <>
      <section className="relative overflow-hidden py-10 sm:py-16">
        <div className="max-w-3xl">
          <p className="num mb-3 text-xs uppercase tracking-[0.3em] text-muted">pump.fun × hyperliquid</p>
          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl">
            every coin
            <br />
            has a <span className="text-long glow-long">bias.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
            launch a coin, pick a position. creator fees fund the trade on hyperliquid. profit buys the coin back and burns it.
            <span className="text-text"> stops included.</span>
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/launch" className="btn btn-long px-5 py-3 text-base">
              launch market
            </Link>
            <Link href="/docs" className="btn px-5 py-3 text-base">
              how it works
            </Link>
          </div>
        </div>
      </section>
      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="platform stats">
        <Stat label="markets live" value={stats.marketsLive} sub={`${stats.marketsTotal} total`} tone="long" />
        <Stat label="total equity" value={fmtUsd(stats.totalEquityUsd)} />
        <Stat label="fees routed" value={`${stats.feesRoutedSol.toFixed(2)} SOL`} sub="to positions" />
        <Stat label="profit taken" value={fmtUsd(stats.profitTakenUsd)} tone="long" />
        <Stat label="bought back 🔥" value={`${stats.boughtBackSol.toFixed(2)} SOL`} tone="accent" />
      </section>
      <MarketsGrid initial={rows.map(toView)} allowlist={cfg.allowlist} />
    </>
  );
}
