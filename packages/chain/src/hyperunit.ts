/**
 * Hyperunit (Unit) bridge: native SOL on Solana ⇄ USOL spot on Hyperliquid.
 * Docs: https://docs.hyperunit.xyz/developers/api — `GET /gen/:src/:dst/:asset/:dst_addr`.
 *  - deposit:  /gen/solana/hyperliquid/sol/{hlAddress}  → a Solana address; SOL sent there is credited as USOL
 *    to {hlAddress} on Hyperliquid spot (ETA ~1m, fee ≈ 0.0134 SOL).
 *  - withdraw: /gen/hyperliquid/solana/sol/{solAddress} → a Hyperliquid address; USOL `spotSend` there is paid
 *    out as SOL to {solAddress} (ETA ~4m, fee ≈ 0.000008 SOL).
 * Minimum: 0.12 SOL each way (below it the transfer is NOT processed). Testnet Unit pairs HL testnet with
 * Solana devnet.
 *
 * Guardian signatures: every /gen response carries P-256 signatures from 3 guardians. We check them with the
 * algorithm and public keys published in the docs; as of 2026-10-31 the testnet responses verify 0/3 against the
 * published keys/payload format, so the check is reported (`verifiedSignatures`) and only enforced when
 * `requireGuardians` is set. The jobs MUST pin the first address generated for each market (DB) and refuse to
 * send to a different one — Unit addresses are deterministic per destination, so a change means tampering.
 */
export type HlNetwork = "testnet" | "mainnet";

export const HYPERUNIT_API: Record<HlNetwork, string> = {
  mainnet: "https://api.hyperunit.xyz",
  testnet: "https://api.hyperunit-testnet.xyz",
};
/** 0.12 SOL (docs, "Minimum Amount"). */
export const HYPERUNIT_MIN_SOL_DEPOSIT = 120_000_000n;
export const HYPERUNIT_MIN_SOL_WITHDRAW = 120_000_000n;
/** Spot token name of bridged SOL on Hyperliquid (mainnet spot pair @156 USOL/USDC). */
export const HL_SOL_TOKEN = "USOL";

const GUARDIANS: Record<HlNetwork, { nodeId: string; publicKey: string }[]> = {
  testnet: [
    {
      nodeId: "node-1",
      publicKey:
        "04bab844e8620c4a1ec304df6284cd6fdffcde79b3330a7bffb1e4cecfee72d02a7c1f3a4415b253dc8d6ca2146db170e1617605cc8a4160f539890b8a24712152",
    },
    {
      nodeId: "hl-node-testnet",
      publicKey:
        "04502d20a0d8d8aaea9395eb46d50ad2d8278c1b3a3bcdc200d531253612be23f5f2e9709bf3a3a50d1447281fa81aca0bf2ac2a6a3cb8a12978381d73c24bb2d9",
    },
    {
      nodeId: "field-node",
      publicKey:
        "04e674a796ff01d6b74f4ee4079640729797538cdb4926ec333ce1bd18414ef7f22c1a142fd76dca120614045273f30338cd07d79bc99872c76151756aaec0f8e8",
    },
  ],
  mainnet: [
    {
      nodeId: "unit-node",
      publicKey:
        "04dc6f89f921dc816aa69b687be1fcc3cc1d48912629abc2c9964e807422e1047e0435cb5ba0fa53cb9a57a9c610b4e872a0a2caedda78c4f85ebafcca93524061",
    },
    {
      nodeId: "hl-node",
      publicKey:
        "048633ea6ab7e40cdacf37d1340057e84bb9810de0687af78d031e9b07b65ad4ab379180ab55075f5c2ebb96dab30d2c2fab49d5635845327b6a3c27d20ba4755b",
    },
    {
      nodeId: "field-node",
      publicKey:
        "04ae2ab20787f816ea5d13f36c4c4f7e196e29e867086f3ce818abb73077a237f841b33ada5be71b83f4af29f333dedc5411ca4016bd52ab657db2896ef374ce99",
    },
  ],
};
const THRESHOLD = 2;

interface GenResponse {
  address?: string;
  signatures?: Record<string, string>;
  status?: string;
  error?: string;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface UnitProposal {
  destinationAddress: string;
  destinationChain: string;
  asset: string;
  address: string;
  sourceChain: string;
}

export function unitPayloads(nodeId: string, p: UnitProposal): string[] {
  return [
    `${nodeId}:${[p.destinationAddress, p.destinationChain, p.asset, p.address, p.sourceChain, "deposit"].join("-")}`,
    `${nodeId}:${["user", p.sourceChain, p.destinationChain, p.destinationAddress, p.address].join("-")}`,
  ];
}

/** Count guardian signatures that verify (ECDSA P-256 / SHA-256 via WebCrypto). */
export async function verifyUnitSignatures(
  network: HlNetwork,
  signatures: Record<string, string>,
  proposal: UnitProposal,
): Promise<number> {
  let ok = 0;
  for (const g of GUARDIANS[network]) {
    const sig = signatures[g.nodeId];
    if (!sig) continue;
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        hexToBytes(g.publicKey) as BufferSource,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      const sigBytes = b64ToBytes(sig);
      if (sigBytes.length !== 64) continue;
      for (const payload of unitPayloads(g.nodeId, proposal)) {
        const valid = await crypto.subtle.verify(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          key,
          sigBytes as BufferSource,
          new TextEncoder().encode(payload) as BufferSource,
        );
        if (valid) {
          ok++;
          break;
        }
      }
    } catch {
      /* not verified */
    }
  }
  return ok;
}

export interface UnitAddress {
  address: string;
  verifiedSignatures: number;
  signatures: Record<string, string>;
}

export async function hyperunitGenerate(
  network: HlNetwork,
  src: string,
  dst: string,
  asset: string,
  dstAddr: string,
  requireGuardians = false,
): Promise<UnitAddress> {
  const res = await fetch(`${HYPERUNIT_API[network]}/gen/${src}/${dst}/${asset}/${dstAddr}`, {
    headers: { accept: "application/json" },
  });
  const text = await res.text();
  let body: GenResponse;
  try {
    body = JSON.parse(text) as GenResponse;
  } catch {
    throw new Error(`hyperunit ${network} /gen returned non-JSON (HTTP ${res.status}); possibly blocked by WAF`);
  }
  if (!res.ok || body.status !== "OK" || !body.address) {
    throw new Error(`hyperunit /gen failed: ${body.error ?? res.status}`);
  }
  const verified = await verifyUnitSignatures(network, body.signatures ?? {}, {
    destinationAddress: dstAddr,
    destinationChain: dst,
    asset,
    address: body.address,
    sourceChain: src,
  });
  if (requireGuardians && verified < THRESHOLD) {
    throw new Error(`hyperunit address ${body.address} failed guardian verification (${verified}/${THRESHOLD})`);
  }
  return { address: body.address, verifiedSignatures: verified, signatures: body.signatures ?? {} };
}

/** Solana address: SOL sent here is credited to `hlAddress` as USOL on Hyperliquid spot. */
export function hyperunitDepositAddress(network: HlNetwork, hlAddress: string): Promise<string> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(hlAddress)) throw new Error("invalid hyperliquid address");
  return hyperunitGenerate(network, "solana", "hyperliquid", "sol", hlAddress).then((r) => r.address);
}

/** Hyperliquid address: USOL spot-sent here is paid out as SOL to `solAddress`. */
export function hyperunitWithdrawAddress(network: HlNetwork, solAddress: string): Promise<string> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solAddress)) throw new Error("invalid solana address");
  return hyperunitGenerate(network, "hyperliquid", "solana", "sol", solAddress).then((r) => r.address);
}

export interface UnitOperation {
  operationId?: string;
  sourceChain?: string;
  destinationChain?: string;
  sourceAddress?: string;
  destinationAddress?: string;
  sourceAmount?: string;
  asset?: string;
  state?: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  opCreatedAt?: string;
  [k: string]: unknown;
}

/** Operations (deposits/withdrawals in flight or done) for an address on either side. */
/** Valid Solana address for a deposit (base58, 32–44 chars). */
export function isSolanaAddress(a: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
}

export async function hyperunitOperations(
  network: HlNetwork,
  address: string,
): Promise<{ addresses: unknown[]; operations: UnitOperation[] }> {
  const res = await fetch(`${HYPERUNIT_API[network]}/operations/${address}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`hyperunit /operations HTTP ${res.status}`);
  const body = (await res.json()) as { addresses?: unknown[]; operations?: UnitOperation[] };
  return { addresses: body.addresses ?? [], operations: body.operations ?? [] };
}

/** Current Solana deposit/withdraw fees in lamports (from /v2/estimate-fees). */
export async function hyperunitSolFees(
  network: HlNetwork,
): Promise<{ depositFee: bigint; withdrawalFee: bigint; depositEta: string; withdrawalEta: string }> {
  const res = await fetch(`${HYPERUNIT_API[network]}/v2/estimate-fees`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`hyperunit /v2/estimate-fees HTTP ${res.status}`);
  const body = (await res.json()) as {
    solana?: { depositFee?: number; withdrawalFee?: number; depositEta?: string; withdrawalEta?: string };
  };
  const s = body.solana ?? {};
  return {
    depositFee: BigInt(Math.ceil(s.depositFee ?? 0)),
    withdrawalFee: BigInt(Math.ceil(s.withdrawalFee ?? 0)),
    depositEta: s.depositEta ?? "?",
    withdrawalEta: s.withdrawalEta ?? "?",
  };
}

/** Pending (not yet credited) deposit operations. States per Unit docs end in "done"/"failure". */
export function isUnitOperationPending(op: UnitOperation): boolean {
  const s = String(op.state ?? "").toLowerCase();
  return s !== "done" && s !== "failure" && s !== "";
}
