import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { nodeDb } from "@bias/db/node";
import { addLedger, getMarket, insertMarket, ledgerSums, listEvents, upsertVote, listRounds } from "@bias/db";
import { loadConfig } from "@bias/shared";
import { runFlows, platformBuyback, type FlowCtx } from "./lib/flows";
import { tradeMarket, type TradeCtx } from "./lib/trade";
import { finalizeRounds } from "./lib/votes";
import { reconcileOne } from "./lib/reconcile";
import { SimChain, SimHl, SimVenue, SimWorld } from "./lib/sim";
import type { JobEnv } from "./lib/env";

const ASSETS = { SOL: { szDecimals: 2, maxLeverage: 20 }, BTC: { szDecimals: 5, maxLeverage: 40 } };
const H = 3_600_000;

async function setup(strategy: object, opts: { community?: boolean } = {}) {
  const db = nodeDb();
  const w = new SimWorld(ASSETS);
  const cfg = loadConfig({ DRY_RUN: "true", BIAS_MINT: "BiasMint1111111111111111111111111111111111" });
  const env: JobEnv = { cfg, db, network: "testnet", dryRun: true, now: () => w.now, log: (...a) => process.env.E2E_LOG && console.log(...a) };
  const vaults: Record<number, string> = { 0: "vault0", 2_000_000_000: "platformVault" };
  const chain = new SimChain(w, (i) => vaults[i]!);
  const hl = new SimHl(w);
  const venue = new SimVenue(w);
  await insertMarket(db, {
    id: "m0",
    idx: 0,
    mint: "Mint0000000000000000000000000000000000pump",
    name: "long boi",
    ticker: "LONGBOI",
    launcher: "launcher",
    payoutWallet: "payoutWallet",
    solVault: "vault0",
    hlAccount: "0xhl0",
    hlAgent: "0xagent0",
    strategy: JSON.stringify(strategy),
    community: !!opts.community,
    status: "waiting_for_fees",
    direction: "long",
    createdAt: w.now,
    lastFeeAt: w.now,
  });
  await addLedger(db, { marketId: "m0", type: "deposit", asset: "SOL_RENT", amount: "3000000", opId: "launch:m0" });
  const flow: FlowCtx = { env, chain, hl, platformVault: "platformVault", bridgeEnabled: true };
  const trade = async () => {
    const m = (await getMarket(db, "m0"))!;
    const ctx: TradeCtx = {
      env,
      venue,
      marks: await venue.marks(),
      assets: ASSETS,
      spot: await venue.spotInfo(),
      global: { tradingMode: "normal", totalNotionalUsd: "0", maxNotionalPerMarketUsd: 25_000, maxTotalNotionalUsd: 250_000, maxLeverage: 5, maxLossMarginPct: 50, slippageBps: 50 },
    };
    return tradeMarket(ctx, m);
  };
  const flows = async () => runFlows(flow, (await getMarket(db, "m0"))!);
  return { db, w, env, chain, hl, venue, flow, trade, flows };
}

describe("DRY_RUN end-to-end: fees → position → TP → withdraw → buyback → burn", () => {
  it("runs the whole loop with exact accounting", async () => {
    const t = await setup({ type: "single", asset: "SOL", side: "long", leverage: 5 });
    t.w.exchange({ hlAccount: "0xhl0" } as never); // create account model
    t.w.setPrice("SOL", 150);
    t.w.claimableFees.set("vault0", 5_000_000_000n); // 5 SOL of creator fees
    t.w.vaults.set("vault0", 3_000_000n); // vault gas float from the launch tx

    // 1. flows: claim → split → payout → bridge → arrival → agent approval
    await t.flows();
    let m = (await getMarket(t.db, "m0"))!;
    expect(m.feesClaimed).toBe("5000000000");
    expect(m.feesPosition).toBe("3500000000");
    expect(m.feesLauncher).toBe("1000000000");
    expect(m.feesPlatform).toBe("500000000");
    expect(t.w.vaults.get("payoutWallet")).toBe(1_000_000_000n);
    expect(t.w.vaults.get("platformVault")).toBe(500_000_000n);
    expect(m.agentApproved).toBe(true);
    expect(Number(m.depositedUsd)).toBeGreaterThan(500);

    // 2. trade: open with SL + TP ladder on the exchange
    await t.trade();
    m = (await getMarket(t.db, "m0"))!;
    expect(m.status).toBe("live");
    const ex = t.w.exchange(m);
    expect(ex.legs()).toHaveLength(1);
    expect(ex.triggers.map((x) => x.label).sort()).toEqual(["sl", "tp1", "tp2", "tp3"]);

    // 3. price runs through TP1 and TP2 between job runs (native triggers fire)
    t.w.now += H;
    t.w.setPrice("SOL", 166);
    await t.trade();
    m = (await getMarket(t.db, "m0"))!;
    expect(JSON.parse(m.tpStages).SOL).toBe(2);
    expect(Number(m.profitQueueUsd)).toBeGreaterThan(15);
    const ev = await listEvents(t.db, { marketId: "m0", types: ["tp_hit"] });
    expect(ev.length).toBe(2);

    // 4. flows: withdraw profit → SOL lands in the vault → buy back → burn
    t.w.now += H;
    await t.flows();
    m = (await getMarket(t.db, "m0"))!;
    expect(Number(m.profitTakenUsd)).toBeGreaterThan(15);
    expect(Number(m.profitQueueUsd)).toBe(0);
    expect(BigInt(m.boughtBackLamports)).toBeGreaterThan(0n);
    expect(BigInt(m.burnedTokens)).toBeGreaterThan(0n);
    const burns = await listEvents(t.db, { marketId: "m0", types: ["buyback", "burn"] });
    expect(burns.length).toBe(2);

    // 5. platform share buys back $BIAS
    const p = await platformBuyback(t.flow, 2_000_000_000);
    expect(p).toMatch(/platform burned/);

    // 6. reconciliation: the split identity holds exactly; vault ledger matches the vault
    const lines = await reconcileOne(t.env, (await getMarket(t.db, "m0"))!, t.chain, t.hl);
    expect(lines.find((l) => l.key === "split")!.ok).toBe(true);
    expect(lines.find((l) => l.key === "vault")!.ok).toBe(true);
    const sums = await ledgerSums(t.db, "m0");
    expect(sums["claim:SOL"]).toBe(sums["split_launcher:SOL"]! + sums["split_platform:SOL"]! + sums["split_position:SOL"]!);
  });

  it("stop-loss in a crash: SL fires on the exchange, market cools down, no liquidation", async () => {
    const t = await setup({ type: "single", asset: "SOL", side: "long", leverage: 5 });
    t.w.exchange({ hlAccount: "0xhl0" } as never);
    t.w.setPrice("SOL", 150);
    t.w.claimableFees.set("vault0", 2_000_000_000n);
    t.w.vaults.set("vault0", 3_000_000n);
    await t.flows();
    await t.trade();
    for (let i = 1; i <= 40; i++) {
      t.w.now += 15 * 60_000;
      t.w.setPrice("SOL", 150 * (1 - i / 100));
      if (i % 2 === 0) await t.trade();
    }
    const m = (await getMarket(t.db, "m0"))!;
    expect(t.w.exchange(m).liquidations).toEqual([]);
    expect(m.status).toBe("cooldown");
    expect((await listEvents(t.db, { marketId: "m0", types: ["sl_hit"] })).length).toBe(1);
  });

  it("community vote: quorum flips the direction once, applied by the job", async () => {
    const t = await setup({ type: "single", asset: "SOL", side: "long", leverage: 3 }, { community: true });
    t.w.exchange({ hlAccount: "0xhl0" } as never);
    t.w.setPrice("SOL", 150);
    t.w.claimableFees.set("vault0", 2_000_000_000n);
    t.w.vaults.set("vault0", 3_000_000n);
    await t.flows();
    await t.trade();
    const round = new Date(t.w.now).toISOString().slice(0, 10);
    for (let i = 0; i < 6; i++) {
      await upsertVote(t.db, { marketId: "m0", round, wallet: `w${i}`, choice: "short", balance: (20_000_000n * 1_000_000n).toString(), signature: "s", at: t.w.now });
    }
    t.w.now += 24 * H; // next UTC day
    const res = await finalizeRounds(t.env, (await getMarket(t.db, "m0"))!, (mint) => t.chain.supply(mint));
    expect(res).toBe("short");
    await t.trade();
    await t.trade();
    const m = (await getMarket(t.db, "m0"))!;
    expect(m.direction).toBe("short");
    expect(Number(t.w.exchange(m).legs()[0]!.szi)).toBeLessThan(0);
    expect((await listRounds(t.db, "m0"))[0]!.applied).toBe(true);
  });

  it("funding farm pipeline keeps half the collateral in spot", async () => {
    const t = await setup({ type: "funding", asset: "SOL" });
    const ex = t.w.exchange({ hlAccount: "0xhl0" } as never);
    t.w.setPrice("SOL", 150);
    ex.spotMarks.USOL = new Decimal(150);
    t.w.claimableFees.set("vault0", 2_000_000_000n);
    t.w.vaults.set("vault0", 3_000_000n);
    await t.flows();
    expect(ex.spot.USDC!.toNumber()).toBeGreaterThan(100);
    expect(ex.collateral.toNumber()).toBeGreaterThan(100);
  });
});
