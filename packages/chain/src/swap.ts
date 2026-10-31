import { VersionedTransaction, type Keypair, type PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import type { ChainCtx, TxResult } from "./connection";
import { pump, pumpSwap } from "./sdk";
import { fetchRawCurve } from "./curve";
import { getMintProgram } from "./token";
import { ChainSimulationError, executeTx, sendAndConfirmRaw, simulate } from "./tx";

export const JUPITER_API = "https://lite-api.jup.ag/swap/v1";
export type BuyRoute = "bonding_curve" | "pumpswap" | "jupiter";

/** SOL budget passed to a "max cost" style buy so that cost × (1 + slippage) never exceeds `lamports`. */
export function solBudgetForMaxCost(lamports: bigint, slippageBps: number): bigint {
  return (lamports * 10_000n) / (10_000n + BigInt(slippageBps));
}

/**
 * Buy `mint` with `lamports` of SOL from `payer`:
 *  - bonding curve (pump program) while the curve is not complete;
 *  - PumpSwap canonical pool after graduation;
 *  - Jupiter (lite API) if PumpSwap fails (e.g. liquidity migrated elsewhere).
 */
export async function buyToken(
  ctx: ChainCtx,
  payer: Keypair,
  mint: PublicKey,
  lamports: bigint,
  slippageBps: number,
): Promise<TxResult & { route: BuyRoute }> {
  if (lamports <= 0n) throw new Error("buy amount must be > 0");
  const curve = await fetchRawCurve(ctx.connection, mint);
  if (curve && !curve.complete) {
    return { ...(await buyOnCurve(ctx, payer, mint, lamports, slippageBps)), route: "bonding_curve" };
  }
  try {
    return { ...(await buyOnPumpSwap(ctx, payer, mint, lamports, slippageBps)), route: "pumpswap" };
  } catch {
    return { ...(await buyOnJupiter(ctx, payer, mint, lamports, slippageBps)), route: "jupiter" };
  }
}

async function buyOnCurve(ctx: ChainCtx, payer: Keypair, mint: PublicKey, lamports: bigint, slippageBps: number) {
  const P = pump();
  const online = new P.OnlinePumpSdk(ctx.connection);
  const tokenProgram = await getMintProgram(ctx.connection, mint);
  const [global, feeConfig, state] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
    online.fetchBuyState(mint, payer.publicKey, tokenProgram),
  ]);
  const solAmount = new BN(solBudgetForMaxCost(lamports, slippageBps).toString());
  const amount = P.getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: state.bondingCurve.tokenTotalSupply,
    bondingCurve: state.bondingCurve,
    amount: solAmount,
    quoteMint: state.quoteMint,
  });
  const ixs = await P.PUMP_SDK.buyInstructions({
    global,
    bondingCurveAccountInfo: state.bondingCurveAccountInfo,
    bondingCurve: state.bondingCurve,
    associatedUserAccountInfo: state.associatedUserAccountInfo,
    mint,
    user: payer.publicKey,
    amount,
    solAmount,
    slippage: slippageBps / 100,
    tokenProgram,
  });
  return executeTx(ctx, payer, ixs);
}

async function buyOnPumpSwap(ctx: ChainCtx, payer: Keypair, mint: PublicKey, lamports: bigint, slippageBps: number) {
  const S = pumpSwap();
  const pool = S.canonicalPumpPoolPda(mint);
  const online = new S.OnlinePumpAmmSdk(ctx.connection);
  const state = await online.swapSolanaState(pool, payer.publicKey);
  const ixs = await S.PUMP_AMM_SDK.buyQuoteInput(
    state,
    new BN(solBudgetForMaxCost(lamports, slippageBps).toString()),
    slippageBps / 100,
  );
  return executeTx(ctx, payer, ixs);
}

async function buyOnJupiter(ctx: ChainCtx, payer: Keypair, mint: PublicKey, lamports: bigint, slippageBps: number) {
  const q = new URL(`${JUPITER_API}/quote`);
  q.searchParams.set("inputMint", NATIVE_MINT.toBase58());
  q.searchParams.set("outputMint", mint.toBase58());
  q.searchParams.set("amount", lamports.toString());
  q.searchParams.set("slippageBps", String(slippageBps));
  const quoteRes = await fetch(q);
  if (!quoteRes.ok) throw new Error(`jupiter quote HTTP ${quoteRes.status}`);
  const quote = await quoteRes.json();
  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: payer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 200_000, priorityLevel: "medium" } },
    }),
  });
  if (!swapRes.ok) throw new Error(`jupiter swap HTTP ${swapRes.status}`);
  const { swapTransaction, lastValidBlockHeight } = (await swapRes.json()) as {
    swapTransaction: string;
    lastValidBlockHeight: number;
  };
  const tx = VersionedTransaction.deserialize(base64ToBytes(swapTransaction));
  if (ctx.dryRun) {
    const sim = await simulate(ctx.connection, tx);
    if (sim.err) throw new ChainSimulationError(`jupiter simulation failed: ${JSON.stringify(sim.err)}`, sim.logs);
    return { signature: null, simulated: true, logs: sim.logs };
  }
  tx.sign([payer]);
  const signature = await sendAndConfirmRaw(ctx.connection, tx, lastValidBlockHeight);
  if (!signature) throw new Error("jupiter swap expired before confirmation");
  return { signature, simulated: false };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

