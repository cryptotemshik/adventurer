import { Decimal, type TriggerKind } from "@bias/shared";
import type { ClosedLeg } from "./types";

export interface FillLike {
  oid: number;
  asset: string;
  sz: string;
  px: string;
  closedPnl: string;
  fee: string;
  dir: string;
  time: number;
  tid: number;
}

export interface AccountingResult {
  realizedPnl: Decimal;
  fees: Decimal;
  /** amount to add to the market's profit (buyback) queue */
  profit: Decimal;
  tpHits: { asset: string; stage: number }[];
  closed: ClosedLeg[];
  tpStages: Record<string, number>;
}

/**
 * Turn new fills into accounting facts. `labels` maps trigger oids we placed → their kind.
 * Profit queue: every closing fill with positive net pnl (closedPnl − fee) goes to buybacks;
 * losses reduce principal and are never netted against the queue.
 */
export function accountFills(
  fills: FillLike[],
  labels: Record<number, { asset: string; label: TriggerKind }>,
  tpStages: Record<string, number>,
  openAfter: Set<string>,
): AccountingResult {
  const stages = { ...tpStages };
  let realized = new Decimal(0);
  let fees = new Decimal(0);
  let profit = new Decimal(0);
  const tpHits: { asset: string; stage: number }[] = [];
  const closedMap = new Map<string, ClosedLeg>();
  for (const f of [...fills].sort((a, b) => a.time - b.time || a.tid - b.tid)) {
    const pnl = new Decimal(f.closedPnl);
    const fee = new Decimal(f.fee);
    realized = realized.add(pnl);
    fees = fees.add(fee);
    const net = pnl.sub(fee);
    if (!pnl.isZero() && net.gt(0)) profit = profit.add(net);
    const lab = labels[f.oid];
    const stageBefore = stages[f.asset] ?? 0;
    if (lab && lab.label !== "sl") {
      const k = Number(lab.label.slice(2));
      if (k > stageBefore) {
        stages[f.asset] = k;
        tpHits.push({ asset: f.asset, stage: k });
      }
    }
    if (!openAfter.has(f.asset) && /close|liquidat/i.test(f.dir)) {
      const prev = closedMap.get(f.asset);
      const reason: ClosedLeg["reason"] = lab ? lab.label : /liquidat/i.test(f.dir) ? "sl" : "other";
      closedMap.set(f.asset, {
        asset: f.asset,
        reason: prev && prev.reason === "sl" ? "sl" : reason,
        pnl: new Decimal(prev?.pnl ?? 0).add(pnl).toString(),
        stage: lab?.label === "sl" ? stageBefore : (prev?.stage ?? stageBefore),
      });
    }
  }
  return { realizedPnl: realized, fees, profit, tpHits: dedupe(tpHits), closed: [...closedMap.values()], tpStages: stages };
}

function dedupe(x: { asset: string; stage: number }[]) {
  const seen = new Set<string>();
  return x.filter((h) => {
    const k = `${h.asset}:${h.stage}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
