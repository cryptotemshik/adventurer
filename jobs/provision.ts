/**
 * Print (and optionally insert) public addresses for market indices — used to verify that the seeds in
 * GitHub Actions match what you generated offline (SETUP.md), and to bootstrap a local dev DB.
 *   MASTER_SEED=… AGENT_SEED=… pnpm tsx jobs/provision.ts 0 5 [--insert]
 */
import { addPoolAddresses } from "@bias/db";
import { marketAddresses, solanaVaultKeypair } from "@bias/keys";
import { jobDb, requireSecret } from "./lib/env";
import { PLATFORM_INDEX } from "./lib/chain-ops";

async function main() {
  const master = requireSecret("MASTER_SEED");
  const agent = requireSecret("AGENT_SEED");
  const from = Number(process.argv[2] ?? 0);
  const count = Number(process.argv[3] ?? 5);
  const rows = Array.from({ length: count }, (_, i) => marketAddresses(master, agent, from + i));
  for (const r of rows) console.log(`#${r.index}\tvault ${r.solVault}\thl ${r.hlAccount}\tagent ${r.hlAgent}`);
  console.log(`platform vault (set TREASURY_PUBKEY to this to burn launch fees too): ${solanaVaultKeypair(master, PLATFORM_INDEX).publicKey}`);
  if (process.argv.includes("--insert")) {
    await addPoolAddresses(await jobDb(), rows.map((r) => ({ idx: r.index, solVault: r.solVault, hlAccount: r.hlAccount, hlAgent: r.hlAgent })));
    console.log(`inserted ${rows.length} pool rows`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
