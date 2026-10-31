import type { Metadata } from "next";
import Link from "next/link";
import { shortAddr } from "@bias/shared";
import { proofRows } from "@/lib/proof";
import { hlExplorerAddr, solscanAccount, solscanToken } from "@/lib/links";
import { Empty } from "@/components/ui";

export const metadata: Metadata = { title: "Proof", description: "Every vault, Hyperliquid account, claim, trade, buyback and burn, reconciled." };
export const dynamic = "force-dynamic";

const sol = (s?: string) => (Number(s ?? 0) / 1e9).toFixed(4);
const usd = (s?: string) => `$${(Number(s ?? 0) / 1e6).toFixed(2)}`;

export default async function Proof() {
  const rows = await proofRows();
  const network = process.env.HL_NETWORK ?? "testnet";
  const red = rows.filter((r) => r.recon.some((l) => !l.ok)).length;
  const sum = (k: string) => rows.reduce((a, r) => a + Number(r.sums[k] ?? 0), 0);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Proof</h1>
          <p className="text-sm text-muted">Every vault on Solana and account on Hyperliquid, with every claim, trade, buyback and burn linked and reconciled against the ledger.</p>
        </div>
        <a className="btn" href="/api/proof" download>
          Export JSON
        </a>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-4" aria-label="totals">
        <div className="panel p-4">
          <div className="text-xs text-muted">fees claimed</div>
          <div className="num text-xl">{sol(String(sum("claim:SOL")))} SOL</div>
        </div>
        <div className="panel p-4">
          <div className="text-xs text-muted">= launcher + platform + position</div>
          <div className="num text-xl">
            {sol(String(sum("split_launcher:SOL")))} + {sol(String(sum("split_platform:SOL")))} + {sol(String(sum("split_position:SOL")))}
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-xs text-muted">bridged in / bought back</div>
          <div className="num text-xl">
            {sol(String(sum("bridge_in:SOL")))} / {sol(String(sum("buyback:SOL")))} SOL
          </div>
        </div>
        <div className={`panel p-4 ${red ? "border-short/60" : "border-long/40"}`}>
          <div className="text-xs text-muted">reconciliation</div>
          <div className={`num text-xl ${red ? "text-short" : "text-long"}`}>{red ? `${red} market(s) off by > 1%` : "All within 1%"}</div>
        </div>
      </section>

      <section className="panel mb-6 p-5 text-sm leading-relaxed text-muted" aria-label="custody">
        <h2 className="mb-2 text-sm font-semibold text-text">Custody</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>each market has its own solana vault and its own hyperliquid account, derived from a master seed that lives only in github actions secrets. margin is isolated: one market&apos;s loss can&apos;t touch another.</li>
          <li>trading uses a separate hyperliquid <span className="text-text">agent</span> key (second seed, separate workflow). an agent can trade. it cannot withdraw.</li>
          <li>withdrawals only go to the market&apos;s own vault (and then into its own buyback), or to addresses in the config. never to user-supplied addresses, except each launcher&apos;s payout wallet for their 20%.</li>
          <li>the website never sees a seed. it only stores public addresses. this is custodial — vaults are operated by the platform.</li>
        </ul>
      </section>

      {rows.length === 0 ? (
        <Empty title="No markets yet.">Each market appears here with its addresses and a line-by-line reconciliation.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map(({ market: m, recon, sums }) => {
            const bad = recon.some((l) => !l.ok);
            return (
              <details key={m.id} id={m.id} className={`panel p-4 ${bad ? "border-short/60" : ""}`}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <Link href={`/t/${m.mint}`} className="num font-semibold hover:underline">
                    ${m.ticker}
                  </Link>
                  <span className="text-xs text-muted">{m.strategyLabel}</span>
                  <span className={`tag ml-auto ${bad ? "border-short/60 text-short" : "border-long/40 text-long"}`}>{bad ? "Mismatch > 1%" : recon.length ? "Reconciled" : "No snapshot yet"}</span>
                </summary>
                <div className="num mt-4 grid gap-4 text-xs md:grid-cols-2">
                  <dl className="space-y-1">
                    {m.mint && <A k="mint" v={m.mint} href={solscanToken(m.mint)} />}
                    <A k="solana vault" v={m.solVault} href={solscanAccount(m.solVault)} />
                    <A k="hyperliquid account" v={m.hlAccount} href={hlExplorerAddr(m.hlAccount, network)} />
                    <A k="agent (trade-only)" v={m.hlAgent} href={hlExplorerAddr(m.hlAgent, network)} />
                    <A k="launcher payout" v={m.payoutWallet} href={solscanAccount(m.payoutWallet)} />
                  </dl>
                  <dl className="space-y-1">
                    <R k="claimed" v={`${sol(sums["claim:SOL"])} SOL`} />
                    <R k="→ launcher / platform / position" v={`${sol(sums["split_launcher:SOL"])} / ${sol(sums["split_platform:SOL"])} / ${sol(sums["split_position:SOL"])}`} />
                    <R k="paid out (launcher / platform)" v={`${sol(sums["payout_launcher:SOL"])} / ${sol(sums["payout_platform:SOL"])}`} />
                    <R k="bridged in" v={`${sol(sums["bridge_in:SOL"])} SOL`} />
                    <R k="deposited on HL" v={usd(sums["deposit:USD"])} />
                    <R k="realized pnl / fees / funding" v={`${usd(sums["realized_pnl:USD"])} / ${usd(sums["trade_fee:USD"])} / ${usd(sums["funding:USD"])}`} />
                    <R k="withdrawn profit" v={usd(sums["withdraw:USD"])} />
                    <R k="bought back / burned" v={`${sol(sums["buyback:SOL"])} SOL / ${sums["burn:TOKEN"] ?? "0"} raw`} />
                  </dl>
                </div>
                {recon.length > 0 && (
                  <table className="num mt-4 w-full text-xs">
                    <thead className="text-left text-muted">
                      <tr>
                        <th className="font-normal">check</th>
                        <th className="font-normal">expected</th>
                        <th className="font-normal">actual</th>
                        <th className="font-normal">diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recon.map((l) => (
                        <tr key={l.key} className={l.ok ? "" : "text-short"}>
                          <td className="py-1">{l.ok ? "ok" : "off"} · {l.label}</td>
                          <td>{Number(l.expected).toFixed(4)}</td>
                          <td>{Number(l.actual).toFixed(4)}</td>
                          <td>{l.diffPct.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}

function A({ k, v, href }: { k: string; v: string; href: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd>
        <a className="hover:underline" href={href} target="_blank" rel="noreferrer">
          {shortAddr(v, 8)} ↗
        </a>
      </dd>
    </div>
  );
}
function R({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
