import "server-only";
import { listMarkets } from "@bias/db";
import { getDb } from "./db";
import { toView } from "./view";

export interface PlatformStats {
  marketsLive: number;
  marketsTotal: number;
  totalEquityUsd: number;
  feesRoutedSol: number;
  profitTakenUsd: number;
  boughtBackSol: number;
  slStops: number;
  liquidations: number;
}

export async function platformStats(): Promise<PlatformStats> {
  const db = await getDb();
  const all = (await listMarkets(db, { limit: 500, includeHidden: true })).map(toView);
  return {
    marketsLive: all.filter((m) => m.status === "live").length,
    marketsTotal: all.length,
    totalEquityUsd: all.reduce((a, m) => a + m.equityUsd, 0),
    feesRoutedSol: all.reduce((a, m) => a + m.feesPositionSol, 0),
    profitTakenUsd: all.reduce((a, m) => a + m.profitTakenUsd, 0),
    boughtBackSol: all.reduce((a, m) => a + m.boughtBackSol, 0),
    slStops: all.reduce((a, m) => a + m.consecutiveStops, 0),
    liquidations: all.filter((m) => m.endReason === "liquidated").length,
  };
}
