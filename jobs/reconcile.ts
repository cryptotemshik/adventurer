/** Standalone reconciliation (no secrets): ledger vs Solana vault balances vs Hyperliquid equity. */
import { activeMarkets } from "@bias/db";
import { makeEnv } from "./lib/env";
import { runJob } from "./lib/run";
import { reconcileOne } from "./lib/reconcile";
import { readonlyOps } from "./lib/readonly";

async function main() {
  const env = await makeEnv();
  await runJob(env, "reconcile", 300_000, async () => {
    const ro = readonlyOps(env.network);
    let bad = 0;
    const markets = (await activeMarkets(env.db)).filter((m) => m.status !== "pending_launch");
    for (const m of markets) {
      const lines = await reconcileOne(env, m, ro, ro);
      if (lines.some((l) => !l.ok)) bad++;
    }
    return `${markets.length} markets reconciled, ${bad} with mismatches`;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
