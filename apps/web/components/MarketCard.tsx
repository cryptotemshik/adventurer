import Link from "next/link";
import { fmtUsd } from "@bias/shared";
import type { MarketView } from "@/lib/view";
import { CoinImage, Pnl, RiskMeter, StatusBadge, StrategyBadge } from "./ui";

export function MarketCard({ m }: { m: MarketView }) {
  return (
    <Link href={`/t/${m.mint}`} className="panel group block p-4 transition hover:border-[#3a404a]">
      <div className="flex items-start gap-3">
        <CoinImage src={m.image} ticker={m.ticker} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="num font-semibold">${m.ticker}</span>
            {m.flagship && <span className="chip border-accent/50 text-accent">flagship</span>}
            {m.community && <span className="chip" title="community bias: holders vote daily">🗳</span>}
            {m.deskBadge && <span className="chip text-flat">desk</span>}
          </div>
          <div className="truncate text-sm text-muted">{m.name}</div>
        </div>
        <StatusBadge status={m.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StrategyBadge label={m.strategyLabel} direction={m.direction} />
        <span className="num text-xs text-muted">mcap {fmtUsd(m.mcapUsd, 0)}</span>
        <span className="num text-xs text-muted">{m.graduated ? "graduated" : `curve ${m.bondingProgress.toFixed(0)}%`}</span>
      </div>
      <dl className="num mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">equity</dt>
          <dd className="text-sm">{fmtUsd(m.equityUsd)}</dd>
        </div>
        <div>
          <dt className="text-muted">uPnL</dt>
          <dd className="text-sm">
            <Pnl v={m.upnlUsd} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">lifetime</dt>
          <dd className="text-sm">
            <Pnl v={m.lifetimePnlUsd} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">fees → pos</dt>
          <dd>{m.feesPositionSol.toFixed(3)} SOL</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted">bought back / burned</dt>
          <dd className="text-accent">
            {m.boughtBackSol.toFixed(3)} SOL · {m.burnedPct.toFixed(2)}% 🔥
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <RiskMeter toSl={m.riskToSl} toLiq={m.riskToLiq} />
      </div>
    </Link>
  );
}
