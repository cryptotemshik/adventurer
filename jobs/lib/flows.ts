import Decimal from "decimal.js";
import { bridgeAmount, shouldClaim, shouldPayout, splitFees } from "@bias/engine";
import {
  addAlert,
  addEvent,
  addLedger,
  beginOp,
  getSettings,
  pendingOps,
  setSetting,
  updateMarket,
  updateOp,
  type Market,
} from "@bias/db";
import { lamportsToSol, microToUsd, solToLamports, usdToMicro } from "@bias/shared";
import type { JobEnv } from "./env";
import type { ChainOps, HlTreasuryOps } from "./venue";

/** Lamports kept in each vault for claim / transfer fees (never bridged or spent on buybacks). */
export const VAULT_FLOAT = 3_000_000n;
const HL_SOL = "USOL";

export interface FlowCtx {
  env: JobEnv;
  chain: ChainOps;
  hl: HlTreasuryOps;
  platformVault: string;
  /** allow bridging to Hyperliquid (Hyperunit pairs HL testnet with Solana devnet, so mainnet SOL can't reach HL testnet) */
  bridgeEnabled: boolean;
}

const big = (s: string | null | undefined) => BigInt(s || "0");
const hourBucket = (t: number) => Math.floor(t / 3_600_000);

/** Pin bridge addresses per market: if Hyperunit ever returns a different one, refuse and alert. */
async function pinned(f: FlowCtx, key: string, fresh: () => Promise<string>, m: Market): Promise<string | null> {
  const s = await getSettings(f.env.db);
  const addr = await fresh();
  const prev = s[key];
  if (!prev) {
    await setSetting(f.env.db, key, addr);
    return addr;
  }
  if (prev !== addr) {
    await addAlert(f.env.db, "critical", `${m.ticker}: hyperunit address changed (${key}). bridging halted for this market.`, m.id);
    return null;
  }
  return addr;
}

/** claim → split 70/20/10 → batched payouts. */
export async function claimAndSplit(f: FlowCtx, m: Market): Promise<Partial<Market>> {
  const { env } = f;
  const now = env.now();
  const patch: Partial<Market> = {};
  if (!m.mint || m.status === "pending_launch") return patch;
  const claimable = await f.chain.claimable(m);
  if (shouldClaim(claimable, env.cfg.MIN_CLAIM_SOL, m.lastClaimAt, now)) {
    const opId = `claim:${m.id}:${hourBucket(now)}`;
    const op = await beginOp(env.db, opId, "claim", m.id, { claimable: claimable.toString() });
    if (op.status !== "done") {
      const r = await f.chain.claim(m);
      if (r.lamports > 0n) {
        const s = splitFees(r.lamports, { position: env.cfg.FEE_SPLIT_POSITION_BPS, launcher: env.cfg.FEE_SPLIT_LAUNCHER_BPS, platform: env.cfg.FEE_SPLIT_PLATFORM_BPS });
        const txid = r.sig ?? `sim:${opId}`;
        await addLedger(env.db, { marketId: m.id, type: "claim", asset: "SOL", amount: r.lamports.toString(), txid, opId });
        await addLedger(env.db, { marketId: m.id, type: "split_launcher", asset: "SOL", amount: s.launcher.toString(), txid, opId });
        await addLedger(env.db, { marketId: m.id, type: "split_platform", asset: "SOL", amount: s.platform.toString(), txid, opId });
        await addLedger(env.db, { marketId: m.id, type: "split_position", asset: "SOL", amount: s.position.toString(), txid, opId });
        Object.assign(patch, {
          feesClaimed: (big(m.feesClaimed) + r.lamports).toString(),
          feesLauncher: (big(m.feesLauncher) + s.launcher).toString(),
          feesPlatform: (big(m.feesPlatform) + s.platform).toString(),
          feesPosition: (big(m.feesPosition) + s.position).toString(),
          owedLauncher: (big(m.owedLauncher) + s.launcher).toString(),
          owedPlatform: (big(m.owedPlatform) + s.platform).toString(),
          pipelineLamports: (big(m.pipelineLamports) + s.position).toString(),
          lastClaimAt: now,
          lastFeeAt: now,
        });
        await addEvent(env.db, {
          marketId: m.id,
          type: "claim",
          message: `claimed ${lamportsToSol(r.lamports)} SOL creator fees → ${lamportsToSol(s.position)} position · ${lamportsToSol(s.launcher)} launcher · ${lamportsToSol(s.platform)} $BIAS`,
          txid: r.sig,
          chain: "sol",
          amount: r.lamports.toString(),
        });
      } else patch.lastClaimAt = now;
      await updateOp(env.db, opId, { status: "done", txids: r.sig ? [r.sig] : [] });
    }
  }
  // batched payouts to the launcher and the platform vault
  const owedL = big(patch.owedLauncher ?? m.owedLauncher);
  const owedP = big(patch.owedPlatform ?? m.owedPlatform);
  if (shouldPayout(owedL + owedP, env.cfg.MIN_PAYOUT_SOL, m.lastPayoutAt, now)) {
    const opId = `payout:${m.id}:${hourBucket(now)}`;
    const op = await beginOp(env.db, opId, "payout", m.id, { owedL: owedL.toString(), owedP: owedP.toString() });
    if (op.status !== "done") {
      const outs = [
        { to: m.payoutWallet, lamports: owedL },
        { to: f.platformVault, lamports: owedP },
      ].filter((o) => o.lamports > 0n);
      const sig = await f.chain.payout(m.idx, outs);
      const txid = sig ?? `sim:${opId}`;
      if (owedL > 0n) await addLedger(env.db, { marketId: m.id, type: "payout_launcher", asset: "SOL", amount: owedL.toString(), txid, opId });
      if (owedP > 0n) await addLedger(env.db, { marketId: m.id, type: "payout_platform", asset: "SOL", amount: owedP.toString(), txid, opId });
      await updateOp(env.db, opId, { status: "done", txids: sig ? [sig] : [] });
      Object.assign(patch, { owedLauncher: "0", owedPlatform: "0", lastPayoutAt: now });
      await addEvent(env.db, { marketId: m.id, type: "payout", message: `paid ${lamportsToSol(owedL)} SOL to the launcher and ${lamportsToSol(owedP)} SOL to the $BIAS buyback`, txid: sig, chain: "sol" });
    }
  }
  return patch;
}

/** Bridge the position pipeline to Hyperliquid via Hyperunit. */
export async function bridgeIn(f: FlowCtx, m: Market): Promise<Partial<Market>> {
  const { env } = f;
  if (!f.bridgeEnabled || ["stopped", "dead", "pending_launch"].includes(m.status)) return {};
  const pipeline = big(m.pipelineLamports);
  const amount = bridgeAmount(pipeline, env.cfg.MIN_BRIDGE_SOL);
  if (amount <= 0n) return {};
  const owed = big(m.owedLauncher) + big(m.owedPlatform);
  const bal = await f.chain.vaultBalance(m.solVault);
  const spendable = bal - owed - VAULT_FLOAT;
  const send = amount < spendable ? amount : spendable;
  if (send < solToLamports(env.cfg.MIN_BRIDGE_SOL)) return {};
  const dep = await pinned(f, `unit_dep:${m.id}`, () => f.chain.depositAddress(m), m);
  if (!dep) return {};
  const opId = `bridge:${m.id}:${hourBucket(env.now())}`;
  const op = await beginOp(env.db, opId, "bridge_in", m.id, { lamports: send.toString(), to: dep });
  if (op.status === "done" || op.status === "in_transit") return {};
  const sig = await f.chain.send(m.idx, dep, send);
  await addLedger(env.db, { marketId: m.id, type: "bridge_in", asset: "SOL", amount: send.toString(), txid: sig ?? `sim:${opId}`, opId });
  await updateOp(env.db, opId, { status: "in_transit", txids: sig ? [sig] : [] });
  await addEvent(env.db, { marketId: m.id, type: "bridge_in", message: `bridging ${lamportsToSol(send)} SOL to hyperliquid (hyperunit)`, txid: sig, chain: "sol", amount: send.toString() });
  return { pipelineLamports: (pipeline - send).toString(), inTransitLamports: (big(m.inTransitLamports) + send).toString() };
}

/** SOL that arrived on HL spot → USDC → perp (funding farms keep half in spot for the long leg). Approves the agent once the account exists. */
export async function settleArrivals(f: FlowCtx, m: Market): Promise<Partial<Market>> {
  const { env } = f;
  const patch: Partial<Market> = {};
  if (!(await f.hl.exists(m))) return patch;
  if (!m.agentApproved) {
    await f.hl.approveAgent(m);
    patch.agentApproved = true;
    await addEvent(env.db, { marketId: m.id, type: "bridge_arrived", message: "hyperliquid account active; trade-only agent approved", chain: "hl" });
  }
  const st = await f.hl.state(m);
  const sol = new Decimal(st.account.spot[HL_SOL] ?? 0);
  const strategy = JSON.parse(m.strategy) as { type: string };
  if (sol.gt("0.01")) {
    const { usdc } = await f.hl.sellSpot(m, HL_SOL, sol.toDecimalPlaces(2, Decimal.ROUND_DOWN).toString());
    const toPerp = strategy.type === "funding" ? new Decimal(usdc).div(2) : new Decimal(usdc);
    if (toPerp.gt(1)) await f.hl.usdTransfer(m, toPerp.toFixed(2), true);
    const opId = `arrive:${m.id}:${hourBucket(env.now())}`;
    await addLedger(env.db, { marketId: m.id, type: "deposit", asset: "USD", amount: usdToMicro(usdc).toString(), opId });
    for (const op of await pendingOps(env.db, ["bridge_in"])) if (op.marketId === m.id) await updateOp(env.db, op.id, { status: "done" });
    Object.assign(patch, { inTransitLamports: "0", depositedUsd: new Decimal(m.depositedUsd).add(usdc).toFixed(6) });
    await addEvent(env.db, { marketId: m.id, type: "bridge_arrived", message: `${sol.toFixed(3)} SOL arrived on hyperliquid → $${Number(usdc).toFixed(2)} USDC collateral`, chain: "hl" });
  }
  return patch;
}

/** Withdraw the profit queue (or everything, for graveyard markets) back to the vault as SOL. */
export async function withdrawProfit(f: FlowCtx, m: Market): Promise<Partial<Market>> {
  const { env } = f;
  if (!m.agentApproved || !f.bridgeEnabled) return {};
  const terminal = m.status === "stopped" || m.status === "dead";
  const st = await f.hl.state(m);
  if (terminal && st.legs.length) return {}; // the trading job closes positions first
  const withdrawable = new Decimal(st.account.withdrawable);
  let amount = terminal ? withdrawable.add(st.account.spot.USDC ?? 0) : Decimal.min(new Decimal(m.profitQueueUsd), withdrawable);
  // positions over the notional cap: the excess reserve is bought back once a day
  if (!terminal && Number(m.notionalUsd) >= env.cfg.MAX_NOTIONAL_PER_MARKET_USD * 0.98 && hourBucket(env.now()) % 24 === 0) {
    amount = Decimal.max(amount, withdrawable.mul(0.9));
  }
  if (amount.lt(env.cfg.MIN_BUYBACK_USD)) return {};
  const opId = `withdraw:${m.id}:${hourBucket(env.now())}`;
  const op = await beginOp(env.db, opId, "withdraw", m.id, { usd: amount.toFixed(2) });
  if (op.status !== "pending") return {};
  const dest = await pinned(f, `unit_wd:${m.id}`, () => f.chain.withdrawAddress(m), m);
  if (!dest) return {};
  const perpPart = Decimal.min(amount, withdrawable);
  if (perpPart.gt(0)) await f.hl.usdTransfer(m, perpPart.toFixed(2), false);
  const { sz } = await f.hl.buySpot(m, HL_SOL, amount.toFixed(2));
  await f.hl.spotSend(m, dest, HL_SOL, sz);
  const expected = solToLamports(new Decimal(sz).mul(0.995).toFixed(9));
  await addLedger(env.db, { marketId: m.id, type: "withdraw", asset: "USD", amount: usdToMicro(amount.toFixed(6)).toString(), opId });
  await updateOp(env.db, opId, { status: "in_transit", payload: { usd: amount.toFixed(2), expectedLamports: expected.toString(), vaultBefore: (await f.chain.vaultBalance(m.solVault)).toString() } });
  await addEvent(env.db, { marketId: m.id, type: "withdraw", message: `withdrew $${amount.toFixed(2)} profit → ${sz} SOL on its way to the vault`, chain: "hl" });
  const left = Decimal.max(new Decimal(m.profitQueueUsd).sub(amount), 0);
  return { profitQueueUsd: left.toFixed(6), profitTakenUsd: new Decimal(m.profitTakenUsd).add(amount).toFixed(6) };
}

/** When withdrawn SOL has landed in the vault: buy the market's coin and burn it. */
export async function buybackArrived(f: FlowCtx, m: Market): Promise<Partial<Market>> {
  const { env } = f;
  if (!m.mint) return {};
  const ops = (await pendingOps(env.db, ["withdraw"])).filter((o) => o.marketId === m.id && o.status === "in_transit");
  if (!ops.length) return {};
  const bal = await f.chain.vaultBalance(m.solVault);
  const reserved = big(m.pipelineLamports) + big(m.owedLauncher) + big(m.owedPlatform) + VAULT_FLOAT;
  let free = bal - reserved;
  const patch: Partial<Market> = {};
  for (const op of ops) {
    const p = JSON.parse(op.payload) as { expectedLamports: string };
    const exp = BigInt(p.expectedLamports);
    if (free < (exp * 9n) / 10n) continue; // not arrived yet
    // spend everything that is free: the arrival plus any rounding dust (recorded as arrived so the vault ledger balances)
    const spend = free;
    await addLedger(env.db, { marketId: m.id, type: "withdraw_arrived", asset: "SOL", amount: spend.toString(), opId: op.id });
    const r = await f.chain.buyAndBurn(m.idx, m.mint, spend);
    await addLedger(env.db, { marketId: m.id, type: "buyback", asset: "SOL", amount: spend.toString(), txid: r.buySig ?? `sim:${op.id}`, opId: op.id });
    await addLedger(env.db, { marketId: m.id, type: "burn", asset: "TOKEN", amount: r.tokens.toString(), txid: r.burnSig ?? `sim:${op.id}`, opId: op.id });
    await updateOp(env.db, op.id, { status: "done", txids: [r.buySig, r.burnSig].filter(Boolean) as string[] });
    const burned = big(patch.burnedTokens ?? m.burnedTokens) + r.tokens;
    let supply = 0n;
    try {
      supply = await f.chain.supply(m.mint);
    } catch {}
    Object.assign(patch, {
      boughtBackLamports: (big(patch.boughtBackLamports ?? m.boughtBackLamports) + spend).toString(),
      burnedTokens: burned.toString(),
      burnedPct: supply > 0n ? Number((burned * 1_000_000n) / (supply + burned)) / 10_000 : 0,
    });
    await addEvent(env.db, { marketId: m.id, type: "buyback", message: `bought back $${m.ticker} with ${lamportsToSol(spend)} SOL`, txid: r.buySig, chain: "sol", amount: spend.toString() });
    await addEvent(env.db, { marketId: m.id, type: "burn", message: `burned ${(Number(r.tokens) / 1e6).toLocaleString("en-US")} $${m.ticker} 🔥`, txid: r.burnSig, chain: "sol", amount: r.tokens.toString() });
    free -= spend;
  }
  return patch;
}

/** Graveyard markets: whatever SOL is left in the vault (pipeline included) is bought back and burned. */
export async function burnLeftovers(f: FlowCtx, m: Market): Promise<Partial<Market>> {
  if (!["stopped", "dead"].includes(m.status) || !m.mint) return {};
  const bal = await f.chain.vaultBalance(m.solVault);
  const free = bal - big(m.owedLauncher) - big(m.owedPlatform) - VAULT_FLOAT;
  if (free < 10_000_000n) return {};
  const opId = `leftover:${m.id}:${hourBucket(f.env.now())}`;
  const op = await beginOp(f.env.db, opId, "leftover", m.id, { lamports: free.toString() });
  if (op.status === "done") return {};
  const r = await f.chain.buyAndBurn(m.idx, m.mint, free);
  await addLedger(f.env.db, { marketId: m.id, type: "buyback", asset: "SOL", amount: free.toString(), txid: r.buySig ?? `sim:${opId}`, opId });
  await addLedger(f.env.db, { marketId: m.id, type: "burn", asset: "TOKEN", amount: r.tokens.toString(), txid: r.burnSig ?? `sim:${opId}`, opId });
  await updateOp(f.env.db, opId, { status: "done" });
  await addEvent(f.env.db, { marketId: m.id, type: "burn", message: `final buyback: ${lamportsToSol(free)} SOL of leftovers burned 🔥`, txid: r.burnSig, chain: "sol" });
  return {
    pipelineLamports: "0",
    boughtBackLamports: (big(m.boughtBackLamports) + free).toString(),
    burnedTokens: (big(m.burnedTokens) + r.tokens).toString(),
  };
}

/** Platform vault: 10% shares + launch fees → buy $BIAS → burn. */
export async function platformBuyback(f: FlowCtx, platformIndex: number): Promise<string> {
  const { env } = f;
  const mint = env.cfg.BIAS_MINT;
  if (!mint) return "no BIAS_MINT yet";
  const bal = await f.chain.vaultBalance(f.platformVault);
  const free = bal - VAULT_FLOAT;
  if (free < solToLamports("0.05")) return `platform vault ${lamportsToSol(bal)} SOL (below threshold)`;
  const opId = `platform:${hourBucket(env.now())}`;
  const op = await beginOp(env.db, opId, "platform_buyback", null, { lamports: free.toString() });
  if (op.status === "done") return "already done this hour";
  const r = await f.chain.buyAndBurn(platformIndex, mint, free);
  await addLedger(env.db, { marketId: "platform", type: "buyback", asset: "SOL", amount: free.toString(), txid: r.buySig ?? `sim:${opId}`, opId });
  await addLedger(env.db, { marketId: "platform", type: "burn", asset: "TOKEN", amount: r.tokens.toString(), txid: r.burnSig ?? `sim:${opId}`, opId });
  await updateOp(env.db, opId, { status: "done" });
  await addEvent(env.db, { marketId: "platform", type: "buyback", message: `platform bought back $BIAS with ${lamportsToSol(free)} SOL`, txid: r.buySig, chain: "sol" });
  await addEvent(env.db, { marketId: "platform", type: "burn", message: `burned ${(Number(r.tokens) / 1e6).toLocaleString("en-US")} $BIAS 🔥`, txid: r.burnSig, chain: "sol" });
  return `platform burned with ${lamportsToSol(free)} SOL`;
}

/** Refresh the coin side of the UI snapshot (price, mcap, bonding progress). */
export async function coinSnapshot(f: FlowCtx, m: Market): Promise<Partial<Market>> {
  if (!m.mint) return {};
  const c = await f.chain.coin(m.mint).catch(() => null);
  if (!c) return {};
  return { priceUsd: c.priceUsd, mcapUsd: c.mcapUsd, bondingProgress: c.progress, graduated: c.graduated };
}

export async function runFlows(f: FlowCtx, m: Market): Promise<Market> {
  let cur = m;
  const steps = [claimAndSplit, bridgeIn, settleArrivals, withdrawProfit, buybackArrived, burnLeftovers, coinSnapshot];
  for (const step of steps) {
    try {
      const patch = await step(f, cur);
      if (Object.keys(patch).length) {
        await updateMarket(f.env.db, m.id, patch);
        cur = { ...cur, ...patch };
      }
    } catch (e) {
      f.env.log(m.id, step.name, "failed:", (e as Error).message);
      await addAlert(f.env.db, "warn", `${m.ticker}: ${step.name} failed: ${(e as Error).message}`.slice(0, 400), m.id);
    }
  }
  return cur;
}

export { microToUsd };
