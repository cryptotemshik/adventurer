import { describe, expect, it } from "vitest";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import "./sdk-node";
import { pump } from "./sdk";
import { checkLaunchTx, composeLaunch, launchTransfers, staticLaunchKeys, PUMP_PROGRAM_ID } from "./launch";
import { txSize, MAX_TX_BYTES } from "./tx";

const user = Keypair.generate().publicKey;
const vault = Keypair.generate().publicKey;
const treasury = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;

async function createIx() {
  return pump().PUMP_SDK.createV2Instruction({
    mint,
    name: "bias",
    symbol: "BIAS",
    uri: "https://ipfs.io/ipfs/bafkreibias",
    creator: vault,
    user,
    mayhemMode: false,
  });
}

describe("launch composition", () => {
  it("create_v2: user signs & pays, vault is only the creator argument", async () => {
    const ix = await createIx();
    expect(ix.programId.toBase58()).toBe(PUMP_PROGRAM_ID);
    const signers = ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58());
    expect(signers.sort()).toEqual([mint.toBase58(), user.toBase58()].sort());
    expect(ix.keys.some((k) => k.pubkey.equals(vault))).toBe(false);
    // creator pubkey is encoded in the instruction data (anchor arg `creator`)
    expect(Buffer.from(ix.data).includes(vault.toBuffer())).toBe(true);
  });

  it("transfers: launch fee to treasury + rent float to vault; fee skipped without treasury or when 0", () => {
    const t = launchTransfers({ user, vault, treasury, launchFeeLamports: 20_000_000n, vaultRentLamports: 3_000_000n });
    expect(t).toHaveLength(2);
    expect(t[0]!.keys[1]!.pubkey.equals(treasury)).toBe(true);
    expect(t[1]!.keys[1]!.pubkey.equals(vault)).toBe(true);
    expect(t[0]!.data.readBigUInt64LE(4)).toBe(20_000_000n);
    expect(launchTransfers({ user, vault, treasury: null, launchFeeLamports: 1n, vaultRentLamports: 3n })).toHaveLength(1);
    expect(launchTransfers({ user, vault, treasury, launchFeeLamports: 0n, vaultRentLamports: 0n })).toHaveLength(0);
  });

  it("dev buy stays in the same tx when it fits, else becomes a follow-up tx", async () => {
    const create = await createIx();
    const transfers = launchTransfers({ user, vault, treasury, launchFeeLamports: 1n, vaultRentLamports: 1n });
    const smallBuy = [SystemProgram.transfer({ fromPubkey: user, toPubkey: vault, lamports: 1 })];
    const a = composeLaunch(user, create, smallBuy, transfers);
    expect(a.buy).toBeNull();
    expect(a.main).toHaveLength(4);
    const fat = new TransactionInstruction({
      programId: new PublicKey(PUMP_PROGRAM_ID),
      keys: Array.from({ length: 18 }, () => ({ pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true })),
      data: Buffer.alloc(40),
    });
    const b = composeLaunch(user, create, [fat], transfers);
    expect(b.buy).toEqual([fat]);
    expect(b.main).toEqual([create, ...transfers]);
    expect(txSize(user, b.main)).toBeLessThan(MAX_TX_BYTES);
  });

  it("static lookup-table keys = keys shared by every launch, minus programs and signers", () => {
    const shared = Keypair.generate().publicKey;
    const prog = Keypair.generate().publicKey;
    const mk = () =>
      new TransactionInstruction({
        programId: prog,
        keys: [
          { pubkey: shared, isSigner: false, isWritable: false },
          { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
          { pubkey: Keypair.generate().publicKey, isSigner: true, isWritable: true },
          { pubkey: prog, isSigner: false, isWritable: false },
        ],
      });
    expect(staticLaunchKeys([[mk()], [mk()]]).map((k) => k.toBase58())).toEqual([shared.toBase58()]);
  });
});

function fixture(over: { err?: unknown; payer?: string; logs?: string[]; fee?: number; feeTo?: string } = {}) {
  const k = (pubkey: string, signer = false) => ({ pubkey: new PublicKey(pubkey), signer, writable: true, source: "transaction" as const });
  return {
    slot: 123,
    blockTime: 1,
    meta: {
      err: over.err ?? null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      logMessages: over.logs ?? [
        `Program ${PUMP_PROGRAM_ID} invoke [1]`,
        "Program log: Instruction: CreateV2",
        `Program ${PUMP_PROGRAM_ID} success`,
      ],
    },
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: [k(over.payer ?? user.toBase58(), true), k(mint.toBase58(), true), k(treasury.toBase58()), k(vault.toBase58()), k(PUMP_PROGRAM_ID)],
        recentBlockhash: "x",
        instructions: [
          { programId: new PublicKey(PUMP_PROGRAM_ID), accounts: [], data: "" },
          {
            program: "system",
            programId: SystemProgram.programId,
            parsed: {
              type: "transfer",
              info: { source: user.toBase58(), destination: over.feeTo ?? treasury.toBase58(), lamports: over.fee ?? 20_000_000 },
            },
          },
        ],
      },
    },
  } as unknown as ParsedTransactionWithMeta;
}

describe("checkLaunchTx", () => {
  const exp = { user: user.toBase58(), mint: mint.toBase58(), vault: vault.toBase58(), treasury: treasury.toBase58(), launchFeeLamports: 20_000_000n };
  it("accepts a valid launch", () => {
    expect(checkLaunchTx(fixture(), vault.toBase58(), exp)).toEqual({ ok: true, slot: 123 });
  });
  it("rejects wrong creator, payer, missing fee, failed tx, missing create, missing tx", () => {
    expect(checkLaunchTx(fixture(), user.toBase58(), exp).reason).toMatch(/creator/);
    expect(checkLaunchTx(fixture({ payer: vault.toBase58() }), vault.toBase58(), exp).reason).toMatch(/fee payer/);
    expect(checkLaunchTx(fixture({ fee: 1 }), vault.toBase58(), exp).reason).toMatch(/launch fee/);
    expect(checkLaunchTx(fixture({ feeTo: vault.toBase58() }), vault.toBase58(), exp).reason).toMatch(/launch fee/);
    expect(checkLaunchTx(fixture({ err: { InstructionError: [0, "x"] } }), vault.toBase58(), exp).reason).toMatch(/failed/);
    expect(checkLaunchTx(fixture({ logs: [] }), vault.toBase58(), exp).reason).toMatch(/create/);
    expect(checkLaunchTx(null, vault.toBase58(), exp).ok).toBe(false);
    expect(checkLaunchTx(fixture(), null, exp).reason).toMatch(/curve/);
  });
  it("skips the fee check when no fee is due", () => {
    expect(checkLaunchTx(fixture({ fee: 0 }), vault.toBase58(), { ...exp, launchFeeLamports: 0n }).ok).toBe(true);
  });
});
