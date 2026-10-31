"use client";

import Link from "next/link";
import { fmtUsd, shortAddr, DISCLAIMER } from "@bias/shared";
import type { MarketView } from "@/lib/view";
import { usePolling } from "@/components/usePolling";
import { CoinImage, Pnl, RiskMeter, Stat, StatusBadge, StrategyBadge } from "@/components/ui";
import { EventFeed, type FeedEvent } from "@/components/EventFeed";
import { EquityChart, PriceChart, type Level } from "@/components/Charts";
import { VotePanel } from "./VotePanel";
import { hlExplorerAddr, pumpFun, solscanAccount, solscanToken } from "@/lib/links";

interface Leg {
  asset: string;
  szi: string;
  entryPx: string;
  leverage: number;
  liquidationPx: string | null;
  unrealizedPnl: string;
  marginUsed: string;
}
interface Trig {
  asset: string;
  label: string;
  triggerPx: string;
  sz: string;
}
export interface Detail {
  market: MarketView;
  position: { legs: Leg[]; triggers: Trig[]; marks: Record<string, string>; updatedAt: number } | null;
  events: FeedEvent[];
  equity: { t: number; v: number }[];
  rounds: { round: string; winner: string | null; quorum: boolean; longW: number; shortW: number; flatW: number; wallets: number }[];
  vote: { round: string; endsAt: number; votes: number; tally: { shares: Record<string, number>; quorum: boolean; wallets: number; winner: string | null } } | null;
  network: string;
}

export function MarketDetail({ initial, siteUrl }: { initial: Detail; siteUrl: string }) {
  const [d] = usePolling<Detail>(`/api/markets/${initial.market.id}`, 20_000, initial);
  const m = d.market;
  const legs = d.position?.legs ?? [];
  const trig = d.position?.triggers ?? [];
  const firstAsset = legs[0]?.asset ?? assetsOf(m)[0] ?? "BTC";
  const levels: Level[] = [];
  const l0 = legs.find((l) => l.asset === firstAsset);
  if (l0) {
    levels.push({ price: +l0.entryPx, label: "entry", color: "#E8EAED" });
    if (l0.liquidationPx) levels.push({ price: +l0.liquidationPx, label: "liq", color: "#FF3B5C", dashed: true });
  }
  for (const t of trig.filter((t) => t.asset === firstAsset)) {
    levels.push({ price: +t.triggerPx, label: t.label.toUpperCase(), color: t.label === "sl" ? "#FF3B5C" : "#00E58F", dashed: t.label !== "sl" });
  }
  const share = `https://x.com/intent/tweet?text=${encodeURIComponent(`$${m.ticker} has a bias: ${m.strategyLabel}. fees fund the trade, profit burns the supply. ${siteUrl}/t/${m.mint}`)}`;

  return (
    <div className="space-y-6">
      <header className="panel flex flex-col gap-4 p-5 md:flex-row md:items-center">
        <CoinImage src={m.image} ticker={m.ticker} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold">${m.ticker}</h1>
            <span className="text-muted">{m.name}</span>
            <StatusBadge status={m.status} />
            {m.flagship && <span className="chip border-accent/50 text-accent">flagship</span>}
            {m.community && <span className="chip">🗳 community</span>}
            {m.paused && <span className="chip text-accent">close-only</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StrategyBadge label={m.strategyLabel} direction={m.direction} />
            <span className="num text-xs text-muted">
              CA{" "}
              <button className="hover:text-text" onClick={() => m.mint && navigator.clipboard?.writeText(m.mint)} title="copy">
                {shortAddr(m.mint ?? "", 6)} ⧉
              </button>
            </span>
            <span className="num text-xs text-muted">launcher {shortAddr(m.launcher)}</span>
            <span className="num text-xs text-muted">{new Date(m.createdAt).toISOString().slice(0, 10)}</span>
          </div>
          {m.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{m.description}</p>}
        </div>
        <div className="w-full md:w-64">
          <RiskMeter toSl={m.riskToSl} toLiq={m.riskToLiq} />
          <div className="mt-3 flex flex-wrap gap-2">
            {m.mint && (
              <a className="btn btn-long" href={pumpFun(m.mint)} target="_blank" rel="noreferrer">
                buy on pump.fun
              </a>
            )}
            <a className="btn" href={share} target="_blank" rel="noreferrer">
              share
            </a>
            <Link className="btn" href={`/proof#${m.id}`}>
              proof
            </Link>
          </div>
        </div>
      </header>

      {m.status === "cooldown" && m.cooldownUntil && (
        <p className="panel border-flat/40 p-3 text-sm text-flat">stop-loss hit. cooling down until {new Date(m.cooldownUntil).toISOString().slice(0, 16).replace("T", " ")} utc, then re-entering with fresh fees.</p>
      )}
      {m.status === "waiting_for_fees" && <p className="panel p-3 text-sm text-accent">waiting for fees: the position opens once enough creator fees reach hyperliquid.</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="position summary">
        <Stat label="equity" value={fmtUsd(m.equityUsd)} sub={`notional ${fmtUsd(m.notionalUsd)}`} />
        <Stat label="uPnL" value={<Pnl v={m.upnlUsd} />} />
        <Stat label="lifetime PnL" value={<Pnl v={m.lifetimePnlUsd} pct={m.lifetimePnlPct} />} />
        <Stat label="burned 🔥" value={`${m.burnedPct.toFixed(3)}%`} sub={`${m.boughtBackSol.toFixed(3)} SOL bought back`} tone="accent" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="panel p-4" aria-label="position">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">position</h2>
              <span className="num text-xs text-muted">hyperliquid {d.network}</span>
            </div>
            {legs.length === 0 ? (
              <p className="py-4 text-sm text-muted">no open position.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="num w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      {["asset", "side", "size", "notional", "entry", "mark", "liq", "lev", "margin", "uPnL"].map((h) => (
                        <th key={h} className="pb-2 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((l) => {
                      const mark = +(d.position?.marks[l.asset] ?? l.entryPx);
                      const long = +l.szi > 0;
                      return (
                        <tr key={l.asset} className="border-t border-line">
                          <td className="py-2">{l.asset}</td>
                          <td className={long ? "text-long" : "text-short"}>{long ? "long" : "short"}</td>
                          <td>{Math.abs(+l.szi)}</td>
                          <td>{fmtUsd(Math.abs(+l.szi) * mark)}</td>
                          <td>{fmtPx(+l.entryPx)}</td>
                          <td>{fmtPx(mark)}</td>
                          <td className="text-short">{l.liquidationPx ? fmtPx(+l.liquidationPx) : "—"}</td>
                          <td>{l.leverage}×</td>
                          <td>{fmtUsd(+l.marginUsed)}</td>
                          <td>
                            <Pnl v={+l.unrealizedPnl} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4">
              <PriceChart coin={firstAsset} levels={levels} />
            </div>
          </section>

          <section className="panel p-4" aria-label="equity curve">
            <h2 className="font-display mb-2 text-lg">equity</h2>
            {d.equity.length ? <EquityChart points={d.equity} /> : <p className="py-6 text-sm text-muted">day 0. the curve starts with the first fees.</p>}
          </section>

          <section className="panel p-4" aria-label="events">
            <h2 className="font-display mb-2 text-lg">tape</h2>
            <EventFeed events={d.events} network={d.network} />
          </section>
        </div>

        <aside className="space-y-6">
          {m.community && <VotePanel market={m} vote={d.vote} rounds={d.rounds} />}
          <section className="panel p-4" aria-label="life of the market">
            <h2 className="font-display mb-3 text-lg">life of the market</h2>
            <dl className="num space-y-1.5 text-sm">
              <Row k="fees claimed" v={`${m.feesClaimedSol.toFixed(4)} SOL`} />
              <Row k="→ launcher (20%)" v={`${m.feesLauncherSol.toFixed(4)} SOL`} />
              <Row k="→ $BIAS burn (10%)" v={`${m.feesPlatformSol.toFixed(4)} SOL`} />
              <Row k="→ position (70%)" v={`${m.feesPositionSol.toFixed(4)} SOL`} />
              <Row k="in pipeline / in transit" v={`${m.pipelineSol.toFixed(3)} / ${m.inTransitSol.toFixed(3)} SOL`} />
              <Row k="deployed collateral" v={fmtUsd(m.depositedUsd)} />
              <Row k="realized PnL" v={fmtUsd(m.realizedPnlUsd)} />
              <Row k="profit taken" v={fmtUsd(m.profitTakenUsd)} />
              <Row k="bought back" v={`${m.boughtBackSol.toFixed(4)} SOL`} />
              <Row k="tokens burned" v={`${fmtTokens(m.burnedTokens)} (${m.burnedPct.toFixed(3)}%)`} />
            </dl>
          </section>
          <section className="panel p-4" aria-label="addresses">
            <h2 className="font-display mb-3 text-lg">addresses</h2>
            <dl className="num space-y-1.5 text-xs">
              {m.mint && <LinkRow k="mint" v={m.mint} href={solscanToken(m.mint)} />}
              <LinkRow k="solana vault" v={m.solVault} href={solscanAccount(m.solVault)} />
              <LinkRow k="hl account" v={m.hlAccount} href={hlExplorerAddr(m.hlAccount, d.network)} />
              <LinkRow k="hl agent (trade-only)" v={m.hlAgent} href={hlExplorerAddr(m.hlAgent, d.network)} />
            </dl>
          </section>
          <section className="panel p-4" aria-label="coin market">
            <h2 className="font-display mb-2 text-lg">coin</h2>
            <dl className="num space-y-1.5 text-sm">
              <Row k="price" v={m.priceUsd ? `$${m.priceUsd.toPrecision(4)}` : "—"} />
              <Row k="mcap" v={fmtUsd(m.mcapUsd, 0)} />
              <Row k="bonding curve" v={m.graduated ? "graduated" : `${m.bondingProgress.toFixed(1)}%`} />
            </dl>
            {!m.graduated && (
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-line">
                <div className="h-full bg-long" style={{ width: `${Math.min(100, m.bondingProgress)}%` }} />
              </div>
            )}
            {m.mint && m.graduated && (
              <iframe title="dexscreener chart" src={`https://dexscreener.com/solana/${m.mint}?embed=1&theme=dark&info=0`} className="mt-3 h-80 w-full rounded border border-line" loading="lazy" />
            )}
          </section>
        </aside>
      </div>
      <p className="text-xs text-muted">{DISCLAIMER}</p>
    </div>
  );
}

function assetsOf(m: MarketView): string[] {
  const s = m.strategy;
  if (s.type === "basket") return s.legs.map((l) => l.asset);
  if (s.type === "pair") return [s.long, s.short];
  return [s.asset];
}
const fmtPx = (p: number) => (p >= 1000 ? p.toFixed(1) : p >= 1 ? p.toFixed(3) : p.toPrecision(4));
const fmtTokens = (raw: string) => {
  const n = Number(raw) / 1e6;
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0);
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
function LinkRow({ k, v, href }: { k: string; v: string; href: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd>
        <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
          {shortAddr(v, 6)} ↗
        </a>
      </dd>
    </div>
  );
}
