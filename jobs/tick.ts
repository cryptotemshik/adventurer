/**
 * TRADING job (GitHub Actions `tick.yml`, every 30 min). Holds ONLY the AGENT_SEED: it can trade on
 * Hyperliquid but cannot withdraw. Money movement lives in buyback.ts (MASTER_SEED).
 */
import Decimal from "decimal.js";
import { hlAgentAccount } from "@bias/keys";
import {
  activeMarkets,
  addEvent,
  getMarket,
  getStat,
  listLedger,
  poolMissingAgents,
  setPoolAgent,
  setStat,
  unconfirmedPending,
  updateMarket,
  updatePending,
} from "@bias/db";
import { strategyLabel, type Strategy } from "@bias/shared";
import { makeEnv, requireSecret, type JobEnv } from "./lib/env";
import { runJob } from "./lib/run";
import { HlVenue } from "./lib/hl-venue";
import { checkBreaker, tradeMarket, type TradeCtx } from "./lib/trade";
import { finalizeRounds } from "./lib/votes";
import { reconcileOne } from "./lib/reconcile";
import { readonlyOps } from "./lib/readonly";

async function pickUpLaunches(env: JobEnv, ro: ReturnType<typeof readonlyOps>) {
  for (const p of await unconfirmedPending(env.db)) {
    if (!p.signature || p.signature.startsWith("sim:")) continue;
    const m = await getMarket(env.db, p.marketId);
    if (!m || m.status !== "pending_launch") continue;
    const v = await ro.verifyLaunchTx({
      connection: ro.connection,
      signature: p.signature,
      user: p.wallet,
      mint: p.mint,
      vault: m.solVault,
      treasury: env.cfg.TREASURY_PUBKEY || null,
      launchFeeLamports: BigInt(p.launchFeeLamports),
    });
    if (v.ok) {
      await updateMarket(env.db, m.id, { status: "waiting_for_fees", launchSig: p.signature, lastFeeAt: env.now() });
      await updatePending(env.db, p.id, { status: "confirmed" });
      await addEvent(env.db, { marketId: m.id, type: "launch", message: `launched $${m.ticker} on pump.fun. bias: ${strategyLabel(JSON.parse(m.strategy) as Strategy)}`, txid: p.signature, chain: "sol" });
    }
  }
}

async function main() {
  const env = await makeEnv();
  const agentSeed = requireSecret("AGENT_SEED");
  await runJob(env, "tick", 170_000, async (deadline) => {
    const ro = readonlyOps(env.network);
    // the agent side of address provisioning (public addresses only)
    for (const row of await poolMissingAgents(env.db)) await setPoolAgent(env.db, row.idx, hlAgentAccount(agentSeed, row.idx).address);
    await pickUpLaunches(env, ro).catch((e) => env.log("launch pickup failed", e));

    const venue = new HlVenue(env.network, agentSeed, env.cfg.MAX_SLIPPAGE_BPS);
    const [marks, assets, spot] = await Promise.all([venue.marks(), venue.assets(), venue.spotInfo()]);
    const markets = (await activeMarkets(env.db)).filter((m) => m.status !== "pending_launch");
    let total = markets.reduce((a, m) => a.add(m.notionalUsd), new Decimal(0));
    const ctx: TradeCtx = {
      env,
      venue,
      marks,
      assets,
      spot,
      global: {
        tradingMode: env.cfg.TRADING_MODE,
        totalNotionalUsd: total.toString(),
        maxNotionalPerMarketUsd: env.cfg.MAX_NOTIONAL_PER_MARKET_USD,
        maxTotalNotionalUsd: env.cfg.MAX_TOTAL_NOTIONAL_USD,
        maxLeverage: env.cfg.MAX_LEVERAGE,
        maxLossMarginPct: env.cfg.MAX_LOSS_MARGIN_PCT,
        slippageBps: env.cfg.MAX_SLIPPAGE_BPS,
      },
    };
    let traded = 0;
    let equity = new Decimal(0);
    for (const m0 of markets) {
      if (Date.now() > deadline) break;
      try {
        await finalizeRounds(env, m0, ro.supply, ro.balanceOf).catch((e) => env.log(m0.id, "vote tally failed", e.message));
        const m = (await getMarket(env.db, m0.id))!;
        if (!m.agentApproved) continue; // HL account not funded yet
        const before = new Decimal(m.notionalUsd);
        ctx.global.totalNotionalUsd = total.toString();
        const r = await tradeMarket(ctx, m);
        total = total.sub(before).add(r.notionalUsd);
        equity = equity.add(r.equityUsd);
        traded++;
      } catch (e) {
        env.log(m0.id, "trade failed", e);
      }
    }
    // circuit breaker: hourly equity history in platform_stats
    const hist = JSON.parse((await getStat(env.db, "equity_hist")) ?? "[]") as [number, string][];
    const now = env.now();
    hist.push([now, equity.toFixed(2)]);
    const kept = hist.filter(([t]) => t > now - 26 * 3_600_000);
    await setStat(env.db, "equity_hist", JSON.stringify(kept));
    const past = kept.find(([t]) => t >= now - 24 * 3_600_000);
    if (past) {
      const ledger = (await listLedger(env.db, undefined, 5000)).filter((l) => l.at > past[0]);
      const flows = ledger.reduce((a, l) => (l.type === "deposit" && l.asset === "USD" ? a.add(new Decimal(l.amount).div(1e6)) : l.type === "withdraw" ? a.sub(new Decimal(l.amount).div(1e6)) : a), new Decimal(0));
      await checkBreaker(env, equity, new Decimal(past[1]), flows);
    }
    // reconciliation (read-only)
    for (const m of markets) {
      if (Date.now() > deadline + 30_000) break;
      await reconcileOne(env, (await getMarket(env.db, m.id))!, ro, ro).catch((e) => env.log(m.id, "reconcile failed", e.message));
    }
    return `${traded}/${markets.length} markets traded · equity $${equity.toFixed(2)} · notional $${total.toFixed(0)}`;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
