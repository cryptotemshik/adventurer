import { PublicKey, SystemProgram, type Connection, type Keypair } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import type { ChainCtx, TxResult } from "./connection";
import { executeTx } from "./tx";

export async function getSolBalance(connection: Connection, owner: PublicKey): Promise<bigint> {
  return BigInt(await connection.getBalance(owner, "confirmed"));
}

export async function getMintProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`mint ${mint.toBase58()} not found`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(`account ${mint.toBase58()} is not a token mint`);
}

interface OwnedTokenAccount {
  address: PublicKey;
  amount: bigint;
  programId: PublicKey;
}

/** All token accounts of `owner` for `mint`, across SPL Token and Token-2022. */
export async function getOwnedTokenAccounts(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<OwnedTokenAccount[]> {
  // A `mint` filter makes the RPC query whichever token program owns the mint (SPL or Token-2022).
  const res = await connection.getTokenAccountsByOwner(owner, { mint }, "confirmed");
  return res.value.map(({ pubkey, account }) => {
    const programId = account.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const acc = unpackAccount(pubkey, account, programId);
    return { address: pubkey, amount: acc.amount, programId };
  });
}

/** Sum of `owner`'s balance of `mint` over SPL + Token-2022 accounts (raw units). */
export async function getTokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<bigint> {
  const accs = await getOwnedTokenAccounts(connection, owner, mint);
  return accs.reduce((a, b) => a + b.amount, 0n);
}

export async function getTokenSupply(
  connection: Connection,
  mint: PublicKey,
): Promise<{ amount: bigint; decimals: number }> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`mint ${mint.toBase58()} not found`);
  const m = unpackMint(mint, info, info.owner);
  return { amount: m.supply, decimals: m.decimals };
}

/** Max SOL transfers per tx (each adds a 32-byte key + ~14 bytes). */
export const MAX_TRANSFERS_PER_TX = 18;

/** Batched SOL transfers from one signer (zero amounts skipped). One tx per ≤18 recipients. */
export async function transferSolBatch(
  ctx: ChainCtx,
  from: Keypair,
  outs: { to: PublicKey; lamports: bigint }[],
): Promise<TxResult> {
  const nonZero = outs.filter((o) => o.lamports > 0n);
  if (nonZero.length === 0) return { signature: null, simulated: ctx.dryRun, logs: [] };
  if (nonZero.length > MAX_TRANSFERS_PER_TX) throw new Error(`at most ${MAX_TRANSFERS_PER_TX} transfers per batch`);
  const ixs = nonZero.map((o) => SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: o.to, lamports: o.lamports }));
  return executeTx(ctx, from, ixs, [], { computeUnits: 1_000 + 450 * nonZero.length });
}

/**
 * Burn the owner's whole balance of `mint` (SPL or Token-2022) and close the emptied accounts so the rent
 * returns to the owner. Uses burn_checked, which reduces total supply on chain.
 */
export async function burnAllTokens(
  ctx: ChainCtx,
  owner: Keypair,
  mint: PublicKey,
): Promise<TxResult & { amount: bigint }> {
  const accs = await getOwnedTokenAccounts(ctx.connection, owner.publicKey, mint);
  const amount = accs.reduce((a, b) => a + b.amount, 0n);
  if (accs.length === 0) return { signature: null, simulated: ctx.dryRun, amount: 0n };
  const { decimals } = await getTokenSupply(ctx.connection, mint);
  const ixs = accs.flatMap((a) => [
    ...(a.amount > 0n
      ? [createBurnCheckedInstruction(a.address, mint, owner.publicKey, a.amount, decimals, [], a.programId)]
      : []),
    createCloseAccountInstruction(a.address, owner.publicKey, owner.publicKey, [], a.programId),
  ]);
  const res = await executeTx(ctx, owner, ixs);
  return { ...res, amount };
}
