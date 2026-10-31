import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import "./sdk-node";
import { bondingCurveAddress, creatorVaultAddress, curveNumbers } from "./curve";
import { verifySiwsMessage } from "./siws";
import { dryRunMetadataUri, uploadMetadata } from "./metadata";
import { unitPayloads, verifyUnitSignatures, isUnitOperationPending, hyperunitDepositAddress } from "./hyperunit";
import { PUMP_PROGRAM_ID } from "./launch";

describe("PDAs", () => {
  it("bonding curve and creator vault match pump seeds", () => {
    const mint = Keypair.generate().publicKey;
    const creator = Keypair.generate().publicKey;
    const prog = new PublicKey(PUMP_PROGRAM_ID);
    expect(bondingCurveAddress(mint).toBase58()).toBe(
      PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], prog)[0].toBase58(),
    );
    expect(creatorVaultAddress(creator).toBase58()).toBe(
      PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), creator.toBuffer()], prog)[0].toBase58(),
    );
  });
});

describe("curve numbers", () => {
  it("fresh curve: 0% progress, ~28 SOL mcap", () => {
    const n = curveNumbers({
      virtualTokenReserves: 1_073_000_000_000_000n,
      virtualQuoteReserves: 30_000_000_000n,
      realTokenReserves: 793_100_000_000_000n,
      tokenTotalSupply: 1_000_000_000_000_000n,
      complete: false,
      creator: "x",
    });
    expect(n.progressPct).toBe(0);
    expect(n.priceSol).toBeCloseTo(30 / 1_073_000_000, 15);
    expect(n.mcapSol).toBeCloseTo(27.96, 2);
  });
  it("half sold → 50%, complete → 100%", () => {
    const base = { virtualTokenReserves: 1n, virtualQuoteReserves: 1n, tokenTotalSupply: 1n, creator: "x" };
    expect(curveNumbers({ ...base, realTokenReserves: 396_550_000_000_000n, complete: false }).progressPct).toBe(50);
    expect(curveNumbers({ ...base, realTokenReserves: 0n, complete: true }).progressPct).toBe(100);
  });
});

describe("SIWS", () => {
  const sk = ed25519.utils.randomSecretKey();
  const pk = bs58.encode(ed25519.getPublicKey(sk));
  const message = "bias.fun wants you to sign in\nnonce: abc123";
  const sig = bs58.encode(ed25519.sign(new TextEncoder().encode(message), sk));
  it("verifies a valid signature", () => {
    expect(verifySiwsMessage({ message, signatureBase58: sig, publicKeyBase58: pk })).toBe(true);
  });
  it("rejects tampered message, wrong key, garbage", () => {
    expect(verifySiwsMessage({ message: message + "x", signatureBase58: sig, publicKeyBase58: pk })).toBe(false);
    expect(
      verifySiwsMessage({ message, signatureBase58: sig, publicKeyBase58: Keypair.generate().publicKey.toBase58() }),
    ).toBe(false);
    expect(verifySiwsMessage({ message, signatureBase58: "nope0OIl", publicKeyBase58: pk })).toBe(false);
  });
  it("works with a solana Keypair secret (wallet-adapter format)", () => {
    const kp = Keypair.generate();
    const s = ed25519.sign(new TextEncoder().encode(message), kp.secretKey.slice(0, 32));
    expect(verifySiwsMessage({ message, signatureBase58: bs58.encode(s), publicKeyBase58: kp.publicKey.toBase58() })).toBe(true);
  });
});

describe("metadata", () => {
  it("dry-run uri is deterministic and does not hit the network", async () => {
    const i = { image: new Uint8Array([1, 2, 3]), mime: "image/png", name: "bias", symbol: "BIAS", description: "", dryRun: true };
    const a = await uploadMetadata(i);
    expect(a.metadataUri).toBe(dryRunMetadataUri(i));
    expect(dryRunMetadataUri({ ...i, symbol: "X" })).not.toBe(a.metadataUri);
  });
});

describe("hyperunit", () => {
  it("builds the legacy + new guardian payloads", () => {
    const p = unitPayloads("node-1", {
      destinationAddress: "0xabc",
      destinationChain: "hyperliquid",
      asset: "sol",
      address: "So1",
      sourceChain: "solana",
    });
    expect(p[0]).toBe("node-1:0xabc-hyperliquid-sol-So1-solana-deposit");
  });
  it("junk signatures verify 0", async () => {
    expect(
      await verifyUnitSignatures("mainnet", { "unit-node": btoa("x".repeat(64)) }, {
        destinationAddress: "0xabc",
        destinationChain: "hyperliquid",
        asset: "sol",
        address: "So1",
        sourceChain: "solana",
      }),
    ).toBe(0);
  });
  it("pending operation states", () => {
    expect(isUnitOperationPending({ state: "waitForSrcTxFinalization" })).toBe(true);
    expect(isUnitOperationPending({ state: "done" })).toBe(false);
  });
  it("rejects bad addresses before any request", () => {
    expect(() => hyperunitDepositAddress("testnet", "nope")).toThrow();
  });
});
