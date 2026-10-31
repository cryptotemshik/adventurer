import type { Metadata } from "next";
import Link from "next/link";
import { listMarkets } from "@bias/db";
import { epitaph, tombstoneReason } from "@bias/engine";
import { getDb } from "@/lib/db";
import { toView } from "@/lib/view";
import { Empty, PageTitle } from "@/components/ui";
import { RespectsButton } from "./RespectsButton";

export const metadata: Metadata = { title: "Graveyard", description: "Markets that were stopped or closed for inactivity." };
export const dynamic = "force-dynamic";

export default async function Graveyard() {
  const rows = (await listMarkets(await getDb(), { status: ["stopped", "dead"], limit: 500 })).map(toView);
  const liquidated = rows.filter((m) => m.endReason === "liquidated" && !m.demo).length;
  return (
    <>
      <PageTitle
        title="Graveyard"
        sub="Stopped: three stop-losses in a row, or seven days in cooldown without fees. Dead: fourteen days without fees. Whatever is left in the vault is bought back and burned."
      >
        <div className="num text-sm">
          Liquidations: <span className={liquidated ? "text-short" : "text-long"}>{liquidated}</span>
        </div>
      </PageTitle>
      {rows.length === 0 ? (
        <Empty title="Empty.">No market has been stopped or closed yet.</Empty>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="grid-table w-full min-w-[900px] text-[13px]">
            <thead>
              <tr>
                <th>Market</th>
                <th>Reason</th>
                <th>Epitaph</th>
                <th className="!text-right">Burned</th>
                <th className="!text-right">Respects</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="num">
                    <Link href={`/t/${m.mint}`} className="font-semibold hover:underline">
                      ${m.ticker}
                    </Link>
                    {m.demo && <span className="tag ml-2">demo</span>}
                  </td>
                  <td className="num text-xs text-muted">
                    {tombstoneReason({ status: m.endReason === "liquidated" ? "liquidated" : (m.status as "stopped" | "dead"), strategy: m.strategy, createdAt: m.createdAt, endedAt: m.endedAt ?? Date.now() })}
                  </td>
                  <td className="max-w-80 truncate whitespace-normal italic text-muted">{epitaph(m.ticker, m.mint ?? m.id)}</td>
                  <td className="num text-right">
                    {m.burnedPct.toFixed(3)}% · {m.boughtBackSol.toFixed(3)} SOL
                  </td>
                  <td className="text-right">
                    <RespectsButton mint={m.mint ?? m.id} count={m.respects} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
