import "server-only";
import { ledgerSums, listMarkets } from "@bias/db";
import { getDb } from "./db";
import { toView, safeJson, type MarketView } from "./view";
import type { ReconLine } from "@bias/engine";

export interface ProofRow {
  market: MarketView;
  recon: ReconLine[];
  sums: Record<string, string>;
}

export async function proofRows(): Promise<ProofRow[]> {
  const db = await getDb();
  const markets = await listMarkets(db, { limit: 500, includeHidden: true });
  const out: ProofRow[] = [];
  for (const m of markets) {
    const sums = await ledgerSums(db, m.id);
    out.push({
      market: toView(m),
      recon: safeJson<ReconLine[]>(m.reconJson, []),
      sums: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v.toString()])),
    });
  }
  return out;
}
