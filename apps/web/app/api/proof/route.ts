import { listEvents, listLedger } from "@bias/db";
import { getDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { proofRows } from "@/lib/proof";

/** Full JSON export: every market's public addresses, reconciliation, ledger and events. */
export const GET = handle(async () => {
  const db = await getDb();
  const [rows, events, ledger] = await Promise.all([proofRows(), listEvents(db, { limit: 1000 }), listLedger(db, undefined, 10_000)]);
  return new Response(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        hlNetwork: process.env.HL_NETWORK ?? "testnet",
        markets: rows.map((r) => ({
          id: r.market.id,
          mint: r.market.mint,
          ticker: r.market.ticker,
          status: r.market.status,
          strategy: r.market.strategy,
          solVault: r.market.solVault,
          hlAccount: r.market.hlAccount,
          hlAgent: r.market.hlAgent,
          launcher: r.market.launcher,
          payoutWallet: r.market.payoutWallet,
          reconciliation: r.recon,
          ledgerSums: r.sums,
        })),
        ledger,
        events,
      },
      null,
      2,
    ),
    { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=bias-proof.json", "cache-control": "no-store" } },
  );
});
export const dynamic = "force-dynamic";
void ok;
