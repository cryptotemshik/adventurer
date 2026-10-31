import "server-only";
import { listMarkets } from "@bias/db";
import { getDb } from "./db";
import { withLive } from "./live";

export interface PlatformStats {
  marketsLive: number;
  marketsTotal: number;
  totalEquityUsd: number;
  feesRoutedSol: number;
  profitTakenUsd: number;
  boughtBackSol: number;
  slStops: number;
  liquidations: number;
  /** true when every market shown is a demo market */
  demoOnly: boolean;
}

export async function platformStats(): Promise<PlatformStats> {
  const db = await getDb();
  const all = await withLive(await listMarkets(db, { limit: 500, includeHidden: true }));
  return {
    marketsLive: all.filter((m) => m.status === "live").length,
    marketsTotal: all.length,
    totalEquityUsd: all.reduce((a, m) => a + m.equityUsd, 0),
    feesRoutedSol: all.reduce((a, m) => a + m.feesPositionSol, 0),
    profitTakenUsd: all.reduce((a, m) => a + m.profitTakenUsd, 0),
    boughtBackSol: all.reduce((a, m) => a + m.boughtBackSol, 0),
    slStops: all.reduce((a, m) => a + m.consecutiveStops, 0),
    liquidations: all.filter((m) => m.endReason === "liquidated" && !m.demo).length,
    demoOnly: all.length > 0 && all.every((m) => m.demo),
  };
}
