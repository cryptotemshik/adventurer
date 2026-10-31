import Link from "next/link";
import { fmtUsd } from "@bias/shared";
import type { MarketView } from "@/lib/view";
import { CoinImage, Pnl, RiskMeter, StatusBadge, StrategyBadge } from "./ui";

/** Compact market card (mobile list, $BIAS page). */
export function MarketCard({ m }: { m: MarketView }) {
  return (
    <Link href={`/t/${m.mint}`} className="panel block p-3 hover:bg-panel-2">
      <div className="flex items-center gap-3">
        <CoinImage src={m.image} ticker={m.ticker} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="num text-sm font-semibold">${m.ticker}</span>
            {m.flagship && <span className="tag text-accent">flagship</span>}
            {m.community && <span className="tag">vote</span>}
            {m.deskBadge && <span className="tag">desk</span>}
            {m.demo && <span className="tag">demo</span>}
          </div>
          <div className="truncate text-xs text-muted">{m.name}</div>
        </div>
        <StatusBadge status={m.status} />
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <StrategyBadge label={m.strategyLabel} direction={m.direction} />
        <span className="num text-xs text-muted">mcap {fmtUsd(m.mcapUsd, 0)}</span>
      </div>
      <dl className="num mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Equity</dt>
          <dd>{fmtUsd(m.equityUsd)}</dd>
        </div>
        <div>
          <dt className="text-muted">Lifetime</dt>
          <dd>
            <Pnl v={m.lifetimePnlUsd} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Burned</dt>
          <dd>{m.burnedPct.toFixed(2)}%</dd>
        </div>
      </dl>
      <div className="mt-2.5">
        <RiskMeter toSl={m.riskToSl} toLiq={m.riskToLiq} />
      </div>
    </Link>
  );
}
