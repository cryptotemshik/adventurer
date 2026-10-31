"use client";

import { useRouter } from "next/navigation";
import { fmtUsd } from "@bias/shared";
import type { MarketView } from "@/lib/view";
import { CoinImage, Pnl, RiskMeter, StatusBadge, StrategyBadge } from "./ui";

export function MarketsTable({ markets }: { markets: MarketView[] }) {
  const router = useRouter();
  return (
    <div className="panel overflow-x-auto">
      <table className="grid-table num w-full min-w-[1100px] text-[13px]">
        <thead>
          <tr>
            <th>Market</th>
            <th>Position</th>
            <th>Status</th>
            <th className="!text-right">Mcap</th>
            <th className="!text-right">Equity</th>
            <th className="!text-right">uPnL</th>
            <th className="!text-right">Lifetime</th>
            <th className="!text-right">Bought back</th>
            <th className="w-40 min-w-40">To SL / liq</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.id} className="cursor-pointer" onClick={() => router.push(`/t/${m.mint}`)}>
              <td>
                <a href={`/t/${m.mint}`} className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                  <CoinImage src={m.image} ticker={m.ticker} size={24} />
                  <span className="font-semibold">${m.ticker}</span>
                  {m.flagship && <span className="tag text-accent">flagship</span>}
                  {m.community && <span className="tag">vote</span>}
                  {m.demo && <span className="tag">demo</span>}
                </a>
              </td>
              <td>
                <StrategyBadge label={m.strategyLabel} direction={m.direction} />
              </td>
              <td>
                <StatusBadge status={m.status} />
              </td>
              <td className="text-right">
                {fmtUsd(m.mcapUsd, 0)}
                <div className="text-[11px] text-muted">{m.graduated ? "graduated" : `curve ${m.bondingProgress.toFixed(0)}%`}</div>
              </td>
              <td className="text-right">{fmtUsd(m.equityUsd)}</td>
              <td className="text-right">
                <Pnl v={m.upnlUsd} />
              </td>
              <td className="text-right">
                <Pnl v={m.lifetimePnlUsd} />
              </td>
              <td className="text-right">
                {m.boughtBackSol.toFixed(3)} SOL
                <div className="text-[11px] text-muted">{m.burnedPct.toFixed(2)}% burned</div>
              </td>
              <td>
                <RiskMeter toSl={m.riskToSl} toLiq={m.riskToLiq} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
