import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import {
  generateMnemonic,
  hlAgentAccount,
  hlMasterAccount,
  marketAddresses,
  solanaVaultKeypair,
  validateMnemonic,
} from "./index";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const AGENT_MNEMONIC = "legal winner thank year wave sausage worth useful legal winner thank yellow";

describe("keys", () => {
  it("derives the well-known EVM vector at m/44'/60'/0'/0/0", () => {
    expect(hlMasterAccount(TEST_MNEMONIC, 0).address).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
  });

  it("derives the well-known Solana (Phantom) vector at m/44'/501'/0'/0'", () => {
    expect(solanaVaultKeypair(TEST_MNEMONIC, 0).publicKey).toBe("HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
  });

  it("produces a valid 64-byte web3.js secret key whose tail is the public key", () => {
    const kp = solanaVaultKeypair(TEST_MNEMONIC, 3);
    expect(kp.secretKey.length).toBe(64);
    const pub = ed25519.getPublicKey(kp.secretKey.slice(0, 32));
    expect(Buffer.from(kp.secretKey.slice(32))).toEqual(Buffer.from(pub));
    expect(bs58.encode(pub)).toBe(kp.publicKey);
  });

  it("is deterministic and distinct per index", () => {
    const a = marketAddresses(TEST_MNEMONIC, AGENT_MNEMONIC, 7);
    const b = marketAddresses(TEST_MNEMONIC, AGENT_MNEMONIC, 7);
    const c = marketAddresses(TEST_MNEMONIC, AGENT_MNEMONIC, 8);
    expect(a).toEqual(b);
    expect(a.solVault).not.toBe(c.solVault);
    expect(a.hlAccount).not.toBe(c.hlAccount);
    expect(a.hlAgent).not.toBe(c.hlAgent);
  });

  it("agent and master keys come from different seeds", () => {
    expect(hlAgentAccount(AGENT_MNEMONIC, 0).address).not.toBe(hlMasterAccount(TEST_MNEMONIC, 0).address);
    expect(hlAgentAccount(TEST_MNEMONIC, 0).address).toBe(hlMasterAccount(TEST_MNEMONIC, 0).address);
  });

  it("validates and generates mnemonics; rejects garbage and bad indices", () => {
    expect(validateMnemonic(TEST_MNEMONIC)).toBe(true);
    expect(validateMnemonic("abandon abandon abandon")).toBe(false);
    const m = generateMnemonic();
    expect(m.split(" ").length).toBe(24);
    expect(validateMnemonic(m)).toBe(true);
    expect(() => solanaVaultKeypair("not a mnemonic", 0)).toThrow(/mnemonic/);
    expect(() => hlMasterAccount(TEST_MNEMONIC, -1)).toThrow(/index/);
  });
});
