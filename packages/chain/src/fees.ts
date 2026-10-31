import { PublicKey, type Connection, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import type { ChainCtx, TxResult } from "./connection";
import { pump } from "./sdk";
import { executeTx } from "./tx";
import { getSolBalance } from "./token";

export interface ClaimableFees {
  /** pump bonding-curve creator vault (lamports above rent) + un-swept v3 curve buckets of `mints` */
  bondingCurve: bigint;
  /** PumpSwap (pump-amm) coin-creator vault after graduation */
  pumpSwap: bigint;
  total: bigint;
}

/**
 * What the creator (= market vault) can claim now. Pass the market's mint(s) so fees that v3 trades left in the
 * curve's creator bucket (not yet swept to the vault) are counted too.
 */
export async function getClaimableCreatorFees(
  connection: Connection,
  creator: PublicKey,
  mints: PublicKey[] = [],
): Promise<ClaimableFees> {
  const P = pump();
  const online = new P.OnlinePumpSdk(connection);
  const [curveVault, both] = await Promise.all([
    online.getCreatorVaultBalance(creator),
    online.getCreatorVaultBalanceBothPrograms(creator),
  ]);
  let buckets = 0n;
  for (const m of mints) buckets += await curveCreatorBucket(connection, m, creator);
  const bondingCurve = BigInt(curveVault.toString()) + buckets;
  const pumpSwap = BigInt(both.sub(curveVault).toString());
  return { bondingCurve, pumpSwap, total: bondingCurve + pumpSwap };
}

async function curveCreatorBucket(connection: Connection, mint: PublicKey, creator: PublicKey): Promise<bigint> {
  const P = pump();
  const info = await connection.getAccountInfo(P.bondingCurvePda(mint));
  if (!info) return 0n;
  const bc = P.PUMP_SDK.decodeBondingCurve(info);
  if (!bc.creator.equals(creator)) return 0n;
  return BigInt((bc.creatorFee ?? 0).toString());
}

/** Instructions: sweep the curve buckets of `mints` (permissionless), then collect from both creator vaults. */
export async function claimInstructions(
  connection: Connection,
  vault: PublicKey,
  mints: PublicKey[] = [],
): Promise<TransactionInstruction[]> {
  const P = pump();
  const ixs: TransactionInstruction[] = [];
  for (const m of mints) {
    if ((await curveCreatorBucket(connection, m, vault)) > 0n) {
      ixs.push(
        await P.PUMP_SDK.sweepCreatorFeeInstruction({ payer: vault, mint: m, creator: vault, quoteMint: NATIVE_MINT }),
      );
    }
  }
  const online = new P.OnlinePumpSdk(connection);
  ixs.push(...(await online.collectCoinCreatorFeeInstructions(vault, vault)));
  return ixs;
}

/**
 * Claim all SOL creator fees into the vault (bonding curve + PumpSwap). `lamports` is the vault's balance
 * delta (claimed minus network fee); in dry-run it is the claimable estimate.
 */
export async function claimCreatorFees(
  ctx: ChainCtx,
  vault: Keypair,
  mints: PublicKey[] = [],
): Promise<TxResult & { lamports: bigint }> {
  const claimable = await getClaimableCreatorFees(ctx.connection, vault.publicKey, mints);
  if (claimable.total <= 0n) return { signature: null, simulated: ctx.dryRun, lamports: 0n };
  const ixs = await claimInstructions(ctx.connection, vault.publicKey, mints);
  const before = await getSolBalance(ctx.connection, vault.publicKey);
  const res = await executeTx(ctx, vault, ixs);
  if (res.simulated) return { ...res, lamports: claimable.total };
  const after = await getSolBalance(ctx.connection, vault.publicKey);
  return { ...res, lamports: after - before };
}
