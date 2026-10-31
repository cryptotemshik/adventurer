/**
 * MONEY-FLOWS job (GitHub Actions `buyback.yml`, hourly). Holds the MASTER_SEED: claims creator fees,
 * splits 70/20/10, pays out, bridges to Hyperliquid, approves the trade-only agent, withdraws profit,
 * buys back & burns. Never trades positions (that is tick.ts with the agent key).
 */
import { activeMarkets, addPoolAddresses, getMarket, poolStats } from "@bias/db";
import { hlMasterAccount, solanaVaultKeypair } from "@bias/keys";
import { makeEnv, requireSecret } from "./lib/env";
import { runJob } from "./lib/run";
import { HlMasterOps } from "./lib/hl-venue";
import { PLATFORM_INDEX, SolanaOps } from "./lib/chain-ops";
import { platformBuyback, runFlows, type FlowCtx } from "./lib/flows";

const POOL_TARGET = 50;

async function main() {
  const env = await makeEnv();
  const masterSeed = requireSecret("MASTER_SEED");
  await runJob(env, "buyback", 600_000, async (deadline) => {
    // keep the launch address pool stocked (public addresses only; the tick job fills in agent addresses)
    const pool = await poolStats(env.db);
    if (pool.unused < POOL_TARGET) {
      const rows = [];
      for (let i = pool.maxIdx + 1; i <= pool.maxIdx + POOL_TARGET; i++) {
        rows.push({ idx: i, solVault: solanaVaultKeypair(masterSeed, i).publicKey, hlAccount: hlMasterAccount(masterSeed, i).address, hlAgent: "" });
      }
      await addPoolAddresses(env.db, rows);
    }
    const chain = new SolanaOps(masterSeed, env.network, env.dryRun, env.cfg.BUYBACK_SLIPPAGE_BPS);
    const hl = new HlMasterOps(env.network, masterSeed, env.cfg.MAX_SLIPPAGE_BPS);
    const platformVault = chain.keypair(PLATFORM_INDEX).publicKey.toBase58();
    const f: FlowCtx = {
      env,
      chain,
      hl,
      platformVault,
      // Hyperunit testnet pairs HL testnet with Solana devnet: mainnet fees can only bridge to HL mainnet.
      bridgeEnabled: env.network === "mainnet" || process.env.FORCE_BRIDGE === "1",
    };
    const markets = (await activeMarkets(env.db)).filter((m) => m.status !== "pending_launch");
    let n = 0;
    for (const m0 of markets) {
      if (Date.now() > deadline) break;
      const m = (await getMarket(env.db, m0.id))!;
      await runFlows(f, m);
      n++;
    }
    const p = await platformBuyback(f, PLATFORM_INDEX).catch((e) => `platform buyback failed: ${(e as Error).message}`);
    return `${n} markets · platform vault ${platformVault} · ${p}`;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
