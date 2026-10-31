import "server-only";
import { Decimal, type Side } from "@bias/shared";
import { riskMeter, triggerLevels } from "@bias/engine";
import { getPosition, type Market } from "@bias/db";
import { getDb } from "./db";
import { allMids } from "./hl-public";
import { safeJson, toView, type MarketView } from "./view";

interface Leg {
  asset: string;
  szi: string;
  entryPx: string;
  leverage: number;
  liquidationPx: string | null;
  unrealizedPnl: string;
  marginUsed: string;
}

/** Re-price a demo market's legs at live Hyperliquid mids. */
export function repriceLegs(legs: Leg[], mids: Record<string, string>): Leg[] {
  return legs.map((l) => {
    const mark = mids[l.asset];
    if (!mark) return l;
    return { ...l, unrealizedPnl: new Decimal(mark).sub(l.entryPx).mul(l.szi).toFixed(4) };
  });
}

function liveNumbers(m: Market, legs: Leg[], mids: Record<string, string>) {
  // funding farms are delta-neutral: the spot long offsets the perp short's price PnL
  const hedged = (safeJson<{ type?: string }>(m.strategy, {}).type ?? "") === "funding";
  const stages = safeJson<Record<string, number>>(m.tpStages, {});
  let upnl = 0;
  let notional = 0;
  let toSl: number | null = null;
  let toLiq: number | null = null;
  let closestTp: number | null = null;
  for (const l of legs) {
    const mark = mids[l.asset] ?? l.entryPx;
    if (!hedged) upnl += Number(l.unrealizedPnl);
    notional += Math.abs(Number(l.szi)) * Number(mark);
    const side: Side = Number(l.szi) >= 0 ? "long" : "short";
    const lv = triggerLevels(l.entryPx, side, l.leverage, stages[l.asset] ?? 0);
    const r = riskMeter(mark, side, lv.sl, l.liquidationPx);
    const sl = Math.max(0.001, r.toSl);
    toSl = toSl === null ? sl : Math.min(toSl, sl);
    if (r.toLiq !== null) toLiq = toLiq === null ? Math.max(0.002, r.toLiq) : Math.min(toLiq, Math.max(0.002, r.toLiq));
    const tp = lv.tps[stages[l.asset] ?? 0];
    if (tp) {
      const d = Math.abs(tp.sub(mark).div(mark).toNumber());
      closestTp = closestTp === null ? d : Math.min(closestTp, d);
    }
  }
  return { upnl, notional, toSl, toLiq, closestTp };
}

/** Market rows → views; demo markets get live uPnL / equity / risk from current Hyperliquid prices. */
export async function withLive(rows: Market[]): Promise<MarketView[]> {
  const demo = rows.filter((m) => m.demo && m.status === "live");
  if (!demo.length) return rows.map(toView);
  let mids: Record<string, string> = {};
  try {
    mids = await allMids();
  } catch {
    return rows.map(toView);
  }
  const db = await getDb();
  const live = new Map<string, Partial<MarketView>>();
  await Promise.all(
    demo.map(async (m) => {
      const pos = await getPosition(db, m.id);
      const legs = repriceLegs(safeJson<Leg[]>(pos?.legs, []), mids);
      if (!legs.length) return;
      const x = liveNumbers(m, legs, mids);
      const realized = Number(m.realizedPnlUsd);
      const deposited = Number(m.depositedUsd);
      live.set(m.id, {
        upnlUsd: x.upnl,
        notionalUsd: x.notional,
        equityUsd: deposited + realized + x.upnl - Number(m.profitTakenUsd),
        lifetimePnlUsd: realized + x.upnl,
        lifetimePnlPct: deposited > 0 ? ((realized + x.upnl) / deposited) * 100 : 0,
        riskToSl: x.toSl,
        riskToLiq: x.toLiq,
        closestTp: x.closestTp,
      });
    }),
  );
  return rows.map((m) => ({ ...toView(m), ...(live.get(m.id) ?? {}) }));
}
