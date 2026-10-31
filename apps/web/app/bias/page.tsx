import type { Metadata } from "next";
import Link from "next/link";
import { listEvents, listMarkets } from "@bias/db";
import { fmtUsd } from "@bias/shared";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { toView } from "@/lib/view";
import { MarketCard } from "@/components/MarketCard";
import { EventFeed } from "@/components/EventFeed";
import { TierCheck } from "./TierCheck";

export const metadata: Metadata = { title: "$BIAS", description: "The flagship market. 10% of fees from every market buys back and burns $BIAS." };
export const dynamic = "force-dynamic";

export default async function BiasPage() {
  const db = await getDb();
  const cfg = await getConfig();
  const all = (await listMarkets(db, { limit: 500, includeHidden: true })).map(toView);
  const flagship = all.find((m) => m.flagship);
  const platformSol = all.reduce((a, m) => a + m.feesPlatformSol, 0);
  const events = (await listEvents(db, { types: ["buyback", "burn"], limit: 200 })).filter((e) => e.marketId === "platform" || e.marketId === flagship?.id);
  const tiers = [
    ["trader", cfg.TIER_TRADER, "free launches · trader badge"],
    ["desk", cfg.TIER_DESK, "everything in trader + basket, pair & funding farm strategies · desk badge on your markets"],
    ["fund", cfg.TIER_FUND, "everything in desk + featured on the home page for 24h after launch (1×/day)"],
  ] as const;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">
        $BIAS
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        $BIAS is a market like any other: its creator fees fund a position on hyperliquid and profit buys back &amp; burns $BIAS. on top of that, 10% of
        the fees of every market and every launch fee buy back and burn $BIAS.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {flagship ? (
            <MarketCard m={flagship} />
          ) : (
            <div className="panel p-6">
              <div className="num text-xs uppercase tracking-widest text-accent">Not launched yet</div>
              <p className="mt-2 text-sm text-muted">flagship bias: BTC 40% / SOL 30% / HYPE 30% LONG 3×, community bias on.</p>
            </div>
          )}
          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Platform buybacks</h2>
            <p className="num mt-1 text-sm">
              10% share routed: <span className="text-accent">{platformSol.toFixed(4)} SOL</span>
            </p>
            <div className="mt-2">
              <EventFeed events={events} network={process.env.HL_NETWORK ?? "testnet"} />
            </div>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Holder tiers</h2>
            {!cfg.BIAS_MINT && <p className="mt-1 text-xs text-accent">$BIAS isn&apos;t live yet — everyone counts as desk until it is.</p>}
            <ul className="mt-3 space-y-3 text-sm">
              {tiers.map(([t, n, perks]) => (
                <li key={t}>
                  <div className="num">
                    <span className="text-accent">{t}</span> · ≥ {n.toLocaleString("en-US")} $BIAS
                  </div>
                  <div className="text-xs text-muted">{perks}</div>
                </li>
              ))}
            </ul>
          </section>
          <TierCheck />
          {flagship?.mint && (
            <Link href={`/t/${flagship.mint}`} className="btn btn-long w-full">
              Open the $BIAS market · {fmtUsd(flagship.equityUsd)}
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
