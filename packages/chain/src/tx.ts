import {
  ComputeBudgetProgram,
  type AddressLookupTableAccount,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type Keypair,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { ChainCtx, TxResult } from "./connection";

export const MAX_TX_BYTES = 1232;
export const DEFAULT_CU = 200_000;
export const MAX_CU = 1_400_000;
const COMPUTE_BUDGET_ID = ComputeBudgetProgram.programId.toBase58();

/**
 * Spec: median of `getRecentPrioritizationFees`. Most slots report 0, which makes a plain median 0 and the tx
 * slow to land, so the median is taken over the non-zero samples (falls back to 0 when all are zero).
 */
export function priorityFromSamples(samples: number[], cap: number): number {
  const nz = samples.filter((x) => x > 0);
  return Math.min(cap, median(nz));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.floor((s[mid - 1]! + s[mid]!) / 2);
}

/** Median recent prioritization fee (µlamports/CU) for the given writable accounts, capped. */
export async function medianPriorityFee(
  connection: Connection,
  writable: PublicKey[],
  cap: number,
): Promise<number> {
  try {
    const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: writable.slice(0, 128) });
    return priorityFromSamples(fees.map((f) => f.prioritizationFee), cap);
  } catch {
    return Math.min(cap, 1_000);
  }
}

/** Lamports the priority fee costs: units × µlamports / 1e6, rounded up. */
export function priorityFeeLamports(units: number, microLamports: number): bigint {
  return (BigInt(units) * BigInt(microLamports) + 999_999n) / 1_000_000n;
}

export function stripComputeBudget(ixs: TransactionInstruction[]): TransactionInstruction[] {
  return ixs.filter((ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_ID);
}

export function withComputeBudget(
  ixs: TransactionInstruction[],
  units: number,
  microLamports: number,
): TransactionInstruction[] {
  const out = [ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(MAX_CU, Math.max(1_000, units)) })];
  if (microLamports > 0) out.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  return [...out, ...stripComputeBudget(ixs)];
}

export function buildV0(
  payer: PublicKey,
  ixs: TransactionInstruction[],
  blockhash: string,
  lookupTables: AddressLookupTableAccount[] = [],
): VersionedTransaction {
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(
      lookupTables,
    ),
  );
}

/** Serialized size of a v0 tx with these instructions (signatures included); MAX_SAFE_INTEGER if it cannot encode. */
export function txSize(
  payer: PublicKey,
  ixs: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[] = [],
): number {
  try {
    return buildV0(payer, ixs, PublicKey.default.toBase58(), lookupTables).serialize().length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export async function simulate(
  connection: Connection,
  tx: VersionedTransaction,
): Promise<{ err: unknown; logs: string[]; unitsConsumed: number }> {
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  return { err: sim.value.err, logs: sim.value.logs ?? [], unitsConsumed: sim.value.unitsConsumed ?? 0 };
}

/** Simulate with a max CU limit and return consumed units × 1.1 (or `fallback` if simulation fails). */
export async function estimateComputeUnits(
  connection: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  fallback = DEFAULT_CU,
  lookupTables: AddressLookupTableAccount[] = [],
): Promise<number> {
  try {
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = buildV0(payer, withComputeBudget(ixs, MAX_CU, 0), blockhash, lookupTables);
    const sim = await simulate(connection, tx);
    if (sim.err || !sim.unitsConsumed) return fallback;
    return Math.ceil(sim.unitsConsumed * 1.1);
  } catch {
    return fallback;
  }
}

export interface ExecuteOpts {
  maxPriorityMicroLamports?: number;
  /** Fixed CU limit; when omitted the tx is simulated to size it (+10%). */
  computeUnits?: number;
  attempts?: number;
}

/**
 * Build → (dry run: simulate and return) → sign → send → confirm, rebuilding with a fresh blockhash
 * when the previous one expired without the tx landing.
 */
export async function executeTx(
  ctx: ChainCtx,
  payer: Keypair,
  ixs: TransactionInstruction[],
  extraSigners: Keypair[] = [],
  opts: ExecuteOpts = {},
): Promise<TxResult> {
  const { connection } = ctx;
  const body = stripComputeBudget(ixs);
  const writable = [...new Set(body.flatMap((ix) => ix.keys.filter((k) => k.isWritable).map((k) => k.pubkey.toBase58())))].map(
    (k) => new PublicKey(k),
  );
  const units = opts.computeUnits ?? (await estimateComputeUnits(connection, payer.publicKey, body));
  const price = await medianPriorityFee(connection, writable, opts.maxPriorityMicroLamports ?? 50_000);
  const full = withComputeBudget(body, units, price);

  if (ctx.dryRun) {
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = buildV0(payer.publicKey, full, blockhash);
    const sim = await simulate(connection, tx);
    if (sim.err) {
      throw new ChainSimulationError(`simulation failed: ${JSON.stringify(sim.err)}`, sim.logs);
    }
    return { signature: null, simulated: true, logs: sim.logs };
  }

  const attempts = opts.attempts ?? 3;
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = buildV0(payer.publicKey, full, blockhash);
    tx.sign([payer, ...extraSigners]);
    try {
      const signature = await sendAndConfirmRaw(connection, tx, lastValidBlockHeight);
      if (signature) return { signature, simulated: false };
    } catch (e) {
      lastErr = e;
      if (e instanceof ChainTxFailedError) throw e; // landed but failed: do not resend
    }
  }
  throw new Error(`transaction not confirmed after ${attempts} attempts: ${String(lastErr ?? "blockhash expired")}`);
}

export class ChainSimulationError extends Error {
  constructor(
    message: string,
    public logs: string[],
  ) {
    super(message);
  }
}
export class ChainTxFailedError extends Error {
  constructor(
    message: string,
    public signature: string,
  ) {
    super(message);
  }
}

/** Send and poll until confirmed; rebroadcast every 2s; returns null if the blockhash expired. */
export async function sendAndConfirmRaw(
  connection: Connection,
  tx: VersionedTransaction,
  lastValidBlockHeight: number,
): Promise<string | null> {
  const raw = tx.serialize();
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 0 });
  for (;;) {
    await sleep(2_000);
    const st = (await connection.getSignatureStatuses([signature])).value[0];
    if (st?.err) throw new ChainTxFailedError(`transaction failed: ${JSON.stringify(st.err)}`, signature);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return signature;
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) return null;
    await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
