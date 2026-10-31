/**
 * Deterministic key derivation for BIAS markets.
 *
 * - Solana vault:      MASTER_SEED  m/44'/501'/i'/0'   (SLIP-0010 ed25519, Phantom-compatible)
 * - HL master account: MASTER_SEED  m/44'/60'/0'/0/i   (BIP-32 secp256k1) — owns funds, can withdraw
 * - HL agent (API):    AGENT_SEED   m/44'/60'/0'/0/i   (BIP-32 secp256k1) — can trade, cannot withdraw
 *
 * Only public addresses are ever stored in the DB. Private keys are derived on demand inside jobs.
 */
import { generateMnemonic as genMnemonic, mnemonicToSeedSync, validateMnemonic as valMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey as Bip32 } from "@scure/bip32";
import { HDKey as Slip10 } from "micro-key-producer/slip10.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import bs58 from "bs58";
import { privateKeyToAddress } from "viem/accounts";

export type Hex = `0x${string}`;

export interface SolanaKeypair {
  /** base58 public key */
  publicKey: string;
  /** 64 bytes: 32-byte seed || 32-byte public key (web3.js `Keypair.fromSecretKey` format) */
  secretKey: Uint8Array;
}

export interface EvmAccount {
  address: Hex;
  privateKey: Hex;
}

export interface MarketAddresses {
  index: number;
  solVault: string;
  hlAccount: Hex;
  hlAgent: Hex;
}

const seedCache = new Map<string, Uint8Array>();

function normalize(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
}

function seedOf(mnemonic: string): Uint8Array {
  const m = normalize(mnemonic);
  let seed = seedCache.get(m);
  if (!seed) {
    if (!valMnemonic(m, wordlist)) throw new Error("invalid BIP-39 mnemonic");
    seed = mnemonicToSeedSync(m);
    seedCache.set(m, seed);
  }
  return seed;
}

function assertIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error(`invalid market index: ${index}`);
  }
}

export function validateMnemonic(mnemonic: string): boolean {
  return valMnemonic(normalize(mnemonic), wordlist);
}

/** 24 words (256 bits) by default. Run offline only. */
export function generateMnemonic(strength: 128 | 256 = 256): string {
  return genMnemonic(wordlist, strength);
}

export function solanaVaultPath(index: number): string {
  return `m/44'/501'/${index}'/0'`;
}

export function evmPath(index: number): string {
  return `m/44'/60'/0'/0/${index}`;
}

export function solanaVaultKeypair(mnemonic: string, index: number): SolanaKeypair {
  assertIndex(index);
  const node = Slip10.fromMasterSeed(seedOf(mnemonic)).derive(solanaVaultPath(index));
  const pub = node.publicKeyRaw;
  const secretKey = new Uint8Array(64);
  secretKey.set(node.privateKey, 0);
  secretKey.set(pub, 32);
  return { publicKey: bs58.encode(pub), secretKey };
}

function evmAccount(mnemonic: string, index: number): EvmAccount {
  assertIndex(index);
  const node = Bip32.fromMasterSeed(seedOf(mnemonic)).derive(evmPath(index));
  if (!node.privateKey) throw new Error("derivation produced no private key");
  const privateKey = `0x${bytesToHex(node.privateKey)}` as Hex;
  return { address: privateKeyToAddress(privateKey), privateKey };
}

/** HL master account for market `index` (from MASTER_SEED). Owns funds, can withdraw. */
export function hlMasterAccount(masterMnemonic: string, index: number): EvmAccount {
  return evmAccount(masterMnemonic, index);
}

/** HL agent (API wallet) for market `index` (from AGENT_SEED). Can trade, cannot withdraw. */
export function hlAgentAccount(agentMnemonic: string, index: number): EvmAccount {
  return evmAccount(agentMnemonic, index);
}

/** Public addresses only — safe to persist and publish on /proof. */
export function marketAddresses(masterMnemonic: string, agentMnemonic: string, index: number): MarketAddresses {
  return {
    index,
    solVault: solanaVaultKeypair(masterMnemonic, index).publicKey,
    hlAccount: hlMasterAccount(masterMnemonic, index).address,
    hlAgent: hlAgentAccount(agentMnemonic, index).address,
  };
}
