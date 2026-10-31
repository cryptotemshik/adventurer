import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  buildLaunchTx,
  getConnection,
  simulate,
  getClaimableCreatorFees,
  hyperunitDepositAddress,
  hyperunitSolFees,
  getBondingCurveState,
} from "./index";

/** Network tests against Solana mainnet (read-only simulation) and Hyperunit testnet. Run with CHAIN_INT=1. */
const run = process.env.CHAIN_INT === "1";
// A large, long-lived funded mainnet wallet used ONLY as fee payer in sigVerify:false simulations.
const FUNDED = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");

describe.skipIf(!run)("mainnet simulation", () => {
  const connection = getConnection(process.env.SOLANA_RPC, "https://api.mainnet-beta.solana.com");
  it("create_v2 with creator = vault ≠ signer simulates OK", async () => {
    const vault = Keypair.generate().publicKey;
    const out = await buildLaunchTx({
      connection,
      user: FUNDED,
      mint: Keypair.generate(),
      vault,
      treasury: Keypair.generate().publicKey,
      name: "bias int test",
      symbol: "BTEST",
      uri: "https://ipfs.io/ipfs/bafkreibiasdryrun",
      devBuyLamports: 0n,
      launchFeeLamports: 20_000_000n,
      vaultRentLamports: 3_000_000n,
      maxPriorityMicroLamports: 50_000,
    });
    const sim = await simulate(connection, out.tx);
    expect(sim.err).toBeNull();
    expect(sim.logs).toContain("Program log: Instruction: CreateV2");
  }, 60_000);
  it("reads a graduated curve and claimable fees", async () => {
    const st = await getBondingCurveState(connection, new PublicKey("9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"));
    expect(st?.complete).toBe(true);
    const f = await getClaimableCreatorFees(connection, Keypair.generate().publicKey);
    expect(f.total).toBe(0n);
  }, 60_000);
});

describe.skipIf(!run)("hyperunit testnet", () => {
  it("generates a solana deposit address for an HL account", async () => {
    const a = await hyperunitDepositAddress("testnet", "0x8f5b2c1e7e5c9a1a4f0c2b6f7d3e9a1b2c3d4e5f");
    expect(a).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    const fees = await hyperunitSolFees("testnet");
    expect(fees.depositFee > 0n).toBe(true);
  }, 30_000);
});
