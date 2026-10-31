import { AddressLookupTableProgram, type Keypair, type PublicKey } from "@solana/web3.js";
import type { ChainCtx, TxResult } from "./connection";
import { launchLookupTableKeys } from "./launch";
import { executeTx } from "./tx";

/**
 * One-off admin action: create the BIAS launch lookup table (authority = payer) with pump's static accounts,
 * so `buildLaunchTx` can put create_v2 + dev buy in one atomic transaction. Costs ~0.003 SOL of rent.
 * Store the returned address as `LAUNCH_LOOKUP_TABLE` and pass the fetched table to `buildLaunchTx`.
 */
export async function createLaunchLookupTable(
  ctx: ChainCtx,
  payer: Keypair,
): Promise<{ address: PublicKey; keys: PublicKey[]; create: TxResult; extend: TxResult }> {
  const keys = await launchLookupTableKeys(ctx.connection);
  const slot = await ctx.connection.getSlot("finalized");
  const [createIx, address] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot,
  });
  const create = await executeTx(ctx, payer, [createIx], [], { computeUnits: 20_000 });
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    lookupTable: address,
    authority: payer.publicKey,
    payer: payer.publicKey,
    addresses: keys.slice(0, 30),
  });
  const extend = ctx.dryRun
    ? { signature: null, simulated: true, logs: ["extend skipped in dry-run (table does not exist yet)"] }
    : await executeTx(ctx, payer, [extendIx], [], { computeUnits: 20_000 });
  return { address, keys, create, extend };
}
