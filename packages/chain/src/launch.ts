import {
  PublicKey,
  type AddressLookupTableAccount,
  SystemProgram,
  type Connection,
  type Keypair,
  type ParsedTransactionWithMeta,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { pump } from "./sdk";
import { fetchRawCurve } from "./curve";
import { MAX_TX_BYTES, buildV0, estimateComputeUnits, medianPriorityFee, txSize, withComputeBudget } from "./tx";

export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
/** Fallbacks when the user's wallet cannot be simulated yet (e.g. unfunded): create ≈ 107k CU measured on mainnet. */
export const CREATE_CU_FALLBACK = 180_000;
export const BUY_CU_FALLBACK = 160_000;
export const CREATE_AND_BUY_CU_FALLBACK = 320_000;

export interface LaunchTxInput {
  connection: Connection;
  user: PublicKey;
  mint: Keypair;
  vault: PublicKey;
  treasury: PublicKey | null;
  name: string;
  symbol: string;
  uri: string;
  devBuyLamports: bigint;
  launchFeeLamports: bigint;
  vaultRentLamports: bigint;
  maxPriorityMicroLamports: number;
  /** Optional BIAS-owned lookup table with pump's static accounts (see `launchLookupTableKeys`): lets
   * create_v2 + dev buy + transfers fit in ONE atomic transaction. Without it the dev buy is a 2nd tx. */
  lookupTable?: AddressLookupTableAccount | null;
}

export interface LaunchTxOutput {
  /** create_v2 (creator = vault) + launch fee + vault rent [+ dev buy when it fits in one tx]. Mint has signed. */
  tx: VersionedTransaction;
  /** Only when the dev buy does not fit in `tx` (1232-byte limit): ATA + buy, to be signed and sent right after `tx`. */
  buyTx: VersionedTransaction | null;
  blockhash: string;
  lastValidBlockHeight: number;
  computeUnits: number;
  priorityMicroLamports: number;
}

/** System transfers the user pays alongside the create: platform launch fee and the vault's rent float. */
export function launchTransfers(i: {
  user: PublicKey;
  vault: PublicKey;
  treasury: PublicKey | null;
  launchFeeLamports: bigint;
  vaultRentLamports: bigint;
}): TransactionInstruction[] {
  const out: TransactionInstruction[] = [];
  if (i.treasury && i.launchFeeLamports > 0n) {
    out.push(SystemProgram.transfer({ fromPubkey: i.user, toPubkey: i.treasury, lamports: i.launchFeeLamports }));
  }
  if (i.vaultRentLamports > 0n) {
    out.push(SystemProgram.transfer({ fromPubkey: i.user, toPubkey: i.vault, lamports: i.vaultRentLamports }));
  }
  return out;
}

/**
 * Pure: decide whether create + dev buy fit in one transaction. Returns the instruction lists (without compute
 * budget) for the main tx and, if needed, a follow-up buy tx.
 */
export function composeLaunch(
  user: PublicKey,
  createIx: TransactionInstruction,
  buyIxs: TransactionInstruction[],
  transfers: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[] = [],
): { main: TransactionInstruction[]; buy: TransactionInstruction[] | null } {
  const combined = [createIx, ...buyIxs, ...transfers];
  // +2 compute budget instructions (~ 9 + 12 bytes of data, 1 program key)
  const budgetOverhead = 60;
  if (buyIxs.length === 0 || txSize(user, combined, lookupTables) + budgetOverhead <= MAX_TX_BYTES) {
    return { main: combined, buy: null };
  }
  return { main: [createIx, ...transfers], buy: buyIxs };
}

export async function buildLaunchTx(i: LaunchTxInput): Promise<LaunchTxOutput> {
  const P = pump();
  const { connection, user, vault } = i;
  const mint = i.mint.publicKey;
  const createIx = await P.PUMP_SDK.createV2Instruction({
    mint,
    name: i.name,
    symbol: i.symbol,
    uri: i.uri,
    creator: vault,
    user,
    mayhemMode: false,
  });

  let buyIxs: TransactionInstruction[] = [];
  if (i.devBuyLamports > 0n) {
    const online = new P.OnlinePumpSdk(connection);
    const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
    const solAmount = new BN(i.devBuyLamports.toString());
    const amount = P.getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
      quoteMint: NATIVE_MINT,
    });
    const all = await P.PUMP_SDK.createV2AndBuyInstructions({
      global,
      mint,
      name: i.name,
      symbol: i.symbol,
      uri: i.uri,
      creator: vault,
      user,
      amount,
      solAmount,
      mayhemMode: false,
    });
    // all[0] is the same create_v2; the rest is the user's ATA + the first buy.
    buyIxs = all.slice(1);
  }

  const transfers = launchTransfers(i);
  const alts = i.lookupTable ? [i.lookupTable] : [];
  const { main, buy } = composeLaunch(user, createIx, buyIxs, transfers, alts);

  const priority = await medianPriorityFee(
    connection,
    [user, new PublicKey(PUMP_PROGRAM_ID)],
    i.maxPriorityMicroLamports,
  );
  const mainFallback = buyIxs.length > 0 && !buy ? CREATE_AND_BUY_CU_FALLBACK : CREATE_CU_FALLBACK;
  // simulateTransaction runs with sigVerify:false, so the mint signature is not needed to size the tx.
  const units = await estimateComputeUnits(connection, user, main, mainFallback, alts);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  const tx = buildV0(user, withComputeBudget(main, units, priority), blockhash, alts);
  tx.sign([i.mint]);
  const buyTx = buy ? buildV0(user, withComputeBudget(buy, BUY_CU_FALLBACK, priority), blockhash) : null;
  return { tx, buyTx, blockhash, lastValidBlockHeight, computeUnits: units, priorityMicroLamports: priority };
}

/** Pump create+buy accounts that are identical for every launch (globals, fee config, programs-as-accounts…). */
export function staticLaunchKeys(sets: TransactionInstruction[][]): PublicKey[] {
  const programs = new Set(sets.flat().map((ix) => ix.programId.toBase58()));
  const count = new Map<string, number>();
  for (const ixs of sets) {
    const keys = new Set(ixs.flatMap((ix) => ix.keys.filter((k) => !k.isSigner).map((k) => k.pubkey.toBase58())));
    for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [...count]
    .filter(([k, n]) => n === sets.length && !programs.has(k))
    .map(([k]) => new PublicKey(k));
}

/** Keys to put in the BIAS launch lookup table (derived by diffing two synthetic launches). */
export async function launchLookupTableKeys(connection: Connection): Promise<PublicKey[]> {
  const P = pump();
  const online = new P.OnlinePumpSdk(connection);
  const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
  const sets: TransactionInstruction[][] = [];
  for (let n = 0; n < 2; n++) {
    const kp = () => PublicKey.unique();
    const solAmount = new BN(10_000_000);
    sets.push(
      await P.PUMP_SDK.createV2AndBuyInstructions({
        global,
        mint: kp(),
        name: "x",
        symbol: "X",
        uri: "u",
        creator: kp(),
        user: kp(),
        solAmount,
        amount: P.getBuyTokenAmountFromSolAmount({
          global,
          feeConfig,
          mintSupply: null,
          bondingCurve: null,
          amount: solAmount,
          quoteMint: NATIVE_MINT,
        }),
        mayhemMode: false,
      }),
    );
  }
  return staticLaunchKeys(sets);
}

export async function fetchLookupTable(
  connection: Connection,
  address: string | PublicKey,
): Promise<AddressLookupTableAccount | null> {
  const res = await connection.getAddressLookupTable(new PublicKey(address));
  return res.value;
}

export interface LaunchCheckInput {
  user: string;
  mint: string;
  vault: string;
  treasury: string | null;
  launchFeeLamports: bigint;
}

/** Pure: validate a confirmed launch transaction (parsed) + the on-chain curve creator. */
export function checkLaunchTx(
  tx: ParsedTransactionWithMeta | null,
  curveCreator: string | null,
  exp: LaunchCheckInput,
): { ok: boolean; reason?: string; slot?: number } {
  if (!tx) return { ok: false, reason: "transaction not found (not confirmed yet?)" };
  const slot = tx.slot;
  if (!tx.meta) return { ok: false, reason: "transaction has no meta", slot };
  if (tx.meta.err) return { ok: false, reason: `transaction failed: ${JSON.stringify(tx.meta.err)}`, slot };
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  if (keys[0] !== exp.user) return { ok: false, reason: "fee payer is not the launching wallet", slot };
  const userKey = tx.transaction.message.accountKeys[0];
  if (!userKey?.signer) return { ok: false, reason: "launching wallet did not sign", slot };
  if (!keys.includes(exp.mint)) return { ok: false, reason: "mint not in transaction", slot };
  if (!keys.includes(PUMP_PROGRAM_ID)) return { ok: false, reason: "pump program not invoked", slot };
  const logs = tx.meta.logMessages ?? [];
  if (!logs.some((l) => l === "Program log: Instruction: CreateV2" || l === "Program log: Instruction: Create")) {
    return { ok: false, reason: "no pump create instruction in logs", slot };
  }
  if (curveCreator === null) return { ok: false, reason: "bonding curve not found", slot };
  if (curveCreator !== exp.vault) return { ok: false, reason: "coin creator is not the market vault", slot };
  if (exp.treasury && exp.launchFeeLamports > 0n) {
    const paid = tx.transaction.message.instructions.some((ix) => {
      if (!("parsed" in ix) || ix.program !== "system") return false;
      const p = ix.parsed as { type?: string; info?: { source?: string; destination?: string; lamports?: number } };
      return (
        p.type === "transfer" &&
        p.info?.source === exp.user &&
        p.info?.destination === exp.treasury &&
        BigInt(p.info?.lamports ?? 0) >= exp.launchFeeLamports
      );
    });
    if (!paid) return { ok: false, reason: "launch fee transfer missing", slot };
  }
  return { ok: true, slot };
}

export async function verifyLaunchTx(i: {
  connection: Connection;
  signature: string;
  user: string;
  mint: string;
  vault: string;
  treasury: string | null;
  launchFeeLamports: bigint;
}): Promise<{ ok: boolean; reason?: string; slot?: number }> {
  const tx = await i.connection.getParsedTransaction(i.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) return { ok: false, reason: "transaction not found (not confirmed yet?)" };
  const curve = await fetchRawCurve(i.connection, new PublicKey(i.mint));
  return checkLaunchTx(tx, curve?.creator ?? null, i);
}
