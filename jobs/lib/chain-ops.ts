import { Keypair, PublicKey } from "@solana/web3.js";
import {
  burnAllTokens,
  buyToken,
  claimCreatorFees,
  getBondingCurveState,
  getClaimableCreatorFees,
  getConnection,
  getSolBalance,
  getTokenSupply,
  hyperunitDepositAddress,
  hyperunitWithdrawAddress,
  transferSolBatch,
  type ChainCtx,
} from "@bias/chain";
import { solanaVaultKeypair } from "@bias/keys";
import type { Market } from "@bias/db";
import type { ChainOps } from "./venue";

/** Platform vault (receives the 10% share; buys & burns $BIAS). Hardened index far above market indices. */
export const PLATFORM_INDEX = 2_000_000_000;

export class SolanaOps implements ChainOps {
  readonly ctx: ChainCtx;
  constructor(
    private masterSeed: string,
    private network: "testnet" | "mainnet",
    dryRun: boolean,
    private slippageBps: number,
  ) {
    this.ctx = { connection: getConnection(process.env.SOLANA_RPC, process.env.SOLANA_RPC_FALLBACK), dryRun };
  }

  keypair(index: number): Keypair {
    const k = solanaVaultKeypair(this.masterSeed, index);
    return Keypair.fromSecretKey(k.secretKey);
  }
  private vault(m: Market): Keypair {
    const kp = this.keypair(m.idx);
    if (kp.publicKey.toBase58() !== m.solVault) throw new Error(`vault key mismatch for ${m.id}`);
    return kp;
  }

  async claimable(m: Market) {
    if (!m.mint) return 0n;
    const c = await getClaimableCreatorFees(this.ctx.connection, new PublicKey(m.solVault), [new PublicKey(m.mint)]);
    return c.total;
  }
  async claim(m: Market) {
    const r = await claimCreatorFees(this.ctx, this.vault(m), m.mint ? [new PublicKey(m.mint)] : []);
    return { sig: r.signature, lamports: r.lamports };
  }
  vaultBalance(address: string) {
    return getSolBalance(this.ctx.connection, new PublicKey(address));
  }
  async payout(index: number, outs: { to: string; lamports: bigint }[]) {
    const r = await transferSolBatch(this.ctx, this.keypair(index), outs.map((o) => ({ to: new PublicKey(o.to), lamports: o.lamports })));
    return r.signature;
  }
  depositAddress(m: Market) {
    return hyperunitDepositAddress(this.network, m.hlAccount);
  }
  withdrawAddress(m: Market) {
    return hyperunitWithdrawAddress(this.network, m.solVault);
  }
  async send(index: number, to: string, lamports: bigint) {
    const r = await transferSolBatch(this.ctx, this.keypair(index), [{ to: new PublicKey(to), lamports }]);
    return r.signature;
  }
  async buyAndBurn(index: number, mint: string, lamports: bigint) {
    const payer = this.keypair(index);
    const buy = await buyToken(this.ctx, payer, new PublicKey(mint), lamports, this.slippageBps);
    const burn = await burnAllTokens(this.ctx, payer, new PublicKey(mint));
    return { buySig: buy.signature, burnSig: burn.signature, tokens: burn.amount };
  }
  async supply(mint: string) {
    return (await getTokenSupply(this.ctx.connection, new PublicKey(mint))).amount;
  }
  async coin(mint: string) {
    const curve = await getBondingCurveState(this.ctx.connection, new PublicKey(mint)).catch(() => null);
    let priceUsd = 0;
    let mcapUsd = 0;
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
      const j = (await r.json()) as { priceUsd?: string; marketCap?: number; fdv?: number }[];
      if (j[0]) {
        priceUsd = Number(j[0].priceUsd ?? 0);
        mcapUsd = Number(j[0].marketCap ?? j[0].fdv ?? 0);
      }
    } catch {}
    return { priceUsd, mcapUsd, progress: curve?.progressPct ?? (curve?.complete ? 100 : 0), graduated: !!curve?.complete };
  }
}
