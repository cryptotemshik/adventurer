import type { Metadata } from "next";
import Link from "next/link";
import { listMarkets } from "@bias/db";
import { epitaph, tombstoneReason } from "@bias/engine";
import { getDb } from "@/lib/db";
import { toView } from "@/lib/view";
import { Empty } from "@/components/ui";
import { RespectsButton } from "./RespectsButton";

export const metadata: Metadata = { title: "graveyard", description: "markets that got stopped or died. we'd like it to stay empty." };
export const dynamic = "force-dynamic";

export default async function Graveyard() {
  const rows = (await listMarkets(await getDb(), { status: ["stopped", "dead"], limit: 500 })).map(toView);
  const liquidated = rows.filter((m) => m.endReason === "liquidated").length;
  return (
    <>
      <h1 className="font-display text-3xl font-bold">graveyard</h1>
      <p className="mb-2 text-sm text-muted">stopped: three stops in a row, or a week in cooldown without fees. dead: two weeks without fees. leftovers are bought back and burned.</p>
      <p className="num mb-6 text-sm">
        liquidations: <span className={liquidated ? "text-short" : "text-long"}>{liquidated}</span> <span className="text-muted">(the KPI. it should stay 0.)</span>
      </p>
      {rows.length === 0 ? (
        <Empty title="R.I.P. · here lies nobody (yet)">every market here would come with a tombstone, an epitaph and a stop-loss that did its job.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <article key={m.id} className="panel relative overflow-hidden rounded-t-[80px] p-6 pt-10 text-center">
              <div className="num text-xs uppercase tracking-[0.3em] text-muted">r.i.p.</div>
              <Link href={`/t/${m.mint}`} className="font-display mt-2 block text-3xl font-bold hover:underline">
                ${m.ticker}
              </Link>
              <p className="num mt-2 text-xs text-muted">
                {tombstoneReason({ status: m.endReason === "liquidated" ? "liquidated" : (m.status as "stopped" | "dead"), strategy: m.strategy, createdAt: m.createdAt, endedAt: m.endedAt ?? Date.now() })}
              </p>
              <p className="mt-4 text-sm italic">“{epitaph(m.ticker, m.mint ?? m.id)}”</p>
              <p className="num mt-4 text-xs text-accent">
                burned in life: {m.burnedPct.toFixed(3)}% · {m.boughtBackSol.toFixed(3)} SOL 🔥
              </p>
              <div className="mt-4">
                <RespectsButton mint={m.mint ?? m.id} count={m.respects} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
