import { describe, expect, it } from "vitest";
import { Decimal, type Strategy } from "@bias/shared";
import {
  accountFills,
  circuitBreaker,
  decide,
  epitaph,
  expectedTriggers,
  liquidationDistance,
  minCollateralUsd,
  newSimMarket,
  previewStrategy,
  previewText,
  reconcileMarket,
  safeLeverage,
  simTick,
  SimExchange,
  splitFees,
  stopDistance,
  tallyVotes,
  tierFor,
  allowedStrategies,
  launchFeeLamports,
  triggerLevels,
  validateStrategy,
  shouldClaim,
  shouldPayout,
  bridgeAmount,
  fundingDirection,
  type GlobalState,
  type MarketState,
  type AssetInfo,
} from "./index";

const ASSETS: Record<string, AssetInfo> = {
  BTC: { szDecimals: 5, maxLeverage: 40 },
  ETH: { szDecimals: 4, maxLeverage: 25 },
  SOL: { szDecimals: 2, maxLeverage: 20 },
  HYPE: { szDecimals: 2, maxLeverage: 10 },
  VVV: { szDecimals: 2, maxLeverage: 3 },
};

const G: GlobalState = {
  tradingMode: "normal",
  totalNotionalUsd: "0",
  maxNotionalPerMarketUsd: 25_000,
  maxTotalNotionalUsd: 250_000,
  maxLeverage: 5,
  maxLossMarginPct: 50,
  slippageBps: 50,
};

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 31, 20);

function market(strategy: Strategy, over: Partial<MarketState> = {}): MarketState {
  return {
    id: "m1",
    strategy,
    status: "waiting_for_fees",
    direction: strategy.type === "single" || strategy.type === "basket" ? strategy.side : "long",
    community: false,
    paused: false,
    now: T0,
    createdAt: T0,
    lastFeeAt: T0,
    lastAddAt: null,
    lastFlipAt: null,
    stoppedAt: null,
    cooldownUntil: null,
    consecutiveStops: 0,
    tpStages: {},
    account: { accountValue: "0", withdrawable: "0", spot: {} },
    legs: [],
    triggers: [],
    marks: {},
    assets: ASSETS,
    ...over,
  };
}

function sim(strategy: Strategy, collateral: number, prices: Record<string, number>, over: Partial<MarketState> = {}) {
  const ex = new SimExchange(collateral, ASSETS);
  for (const [a, p] of Object.entries(prices)) ex.setPrice(a, p);
  return newSimMarket(market(strategy, over), ex);
}

describe("risk guardrails", () => {
  it("stop distance = 50% margin / leverage", () => {
    expect(stopDistance(3)).toBeCloseTo(0.1667, 3);
    expect(stopDistance(5)).toBeCloseTo(0.1, 6);
  });

  it("SL always sits ≥30% before liquidation", () => {
    for (const [asset, info] of Object.entries(ASSETS)) {
      for (const L of [1, 2, 3, 4, 5]) {
        const safe = safeLeverage(L, info);
        if (safe > 1) {
          expect(stopDistance(safe)).toBeLessThanOrEqual(0.7 * liquidationDistance(safe, info.maxLeverage, "long") + 1e-12);
          expect(stopDistance(safe)).toBeLessThanOrEqual(0.7 * liquidationDistance(safe, info.maxLeverage, "short") + 1e-12);
        }
        expect(safe).toBeLessThanOrEqual(L);
        void asset;
      }
    }
  });

  it("reduces leverage on low max-leverage assets", () => {
    expect(safeLeverage(3, ASSETS.VVV!)).toBeLessThan(3);
    expect(safeLeverage(5, ASSETS.BTC!)).toBe(5);
  });

  it("trigger ladder and trailing stop", () => {
    const l0 = triggerLevels(100, "long", 4, 0);
    expect(l0.sl.toNumber()).toBeCloseTo(87.5);
    expect(l0.tps.map((x) => x.toNumber())).toEqual([106.25, 112.5, 125]);
    expect(triggerLevels(100, "long", 4, 2).sl.toNumber()).toBe(100);
    expect(triggerLevels(100, "long", 4, 3).sl.toNumber()).toBe(106.25);
    const s = triggerLevels(100, "short", 5, 0);
    expect(s.sl.toNumber()).toBeCloseTo(110);
    expect(s.tps[0].toNumber()).toBeCloseTo(95);
  });

  it("preview text", () => {
    const p = previewStrategy({ type: "single", asset: "HYPE", side: "long", leverage: 3 }, ASSETS);
    expect(previewText(p[0]!)).toMatch(/^SL at −16\.7% price move · liquidation ≈ −\d+% · TP ladder \+8% \/ \+17% \/ \+33%$/);
  });

  it("validates strategies", () => {
    const o = { allowlist: ["BTC", "ETH", "SOL", "HYPE"], maxLeverage: 5, community: false, tierAllowsAdvanced: false };
    expect(validateStrategy({ type: "single", asset: "BTC", side: "long", leverage: 5 }, o)).toEqual([]);
    expect(validateStrategy({ type: "single", asset: "BTC", side: "long", leverage: 6 }, o).length).toBe(1);
    expect(validateStrategy({ type: "single", asset: "DOGE", side: "long", leverage: 2 }, o)[0]).toMatch(/allowlist/);
    expect(validateStrategy({ type: "pair", long: "BTC", short: "ETH", leverage: 2 }, o)[0]).toMatch(/desk/);
    const desk = { ...o, tierAllowsAdvanced: true };
    expect(validateStrategy({ type: "pair", long: "BTC", short: "ETH", leverage: 4 }, desk)[0]).toMatch(/3×/);
    expect(validateStrategy({ type: "basket", side: "long", leverage: 3, legs: [{ asset: "BTC", weightBps: 4000 }, { asset: "SOL", weightBps: 3000 }] }, desk)[0]).toMatch(/100%/);
    expect(validateStrategy({ type: "funding", asset: "HYPE" }, { ...desk, community: true })[0]).toMatch(/community/);
  });

  it("min collateral to open", () => {
    expect(minCollateralUsd({ type: "single", asset: "SOL", side: "long", leverage: 5 }, ASSETS)).toBeLessThan(5);
    expect(minCollateralUsd({ type: "basket", side: "long", leverage: 3, legs: [{ asset: "BTC", weightBps: 4000 }, { asset: "SOL", weightBps: 3000 }, { asset: "HYPE", weightBps: 3000 }] }, ASSETS)).toBeGreaterThan(13);
  });
});

describe("decide(): single market lifecycle", () => {
  it("waits for fees when collateral is too small", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 5 }, 1, { SOL: 200 });
    simTick(s, G, T0);
    expect(s.state.status).toBe("waiting_for_fees");
    expect(s.ex.legs()).toHaveLength(0);
  });

  it("opens with SL + 3 TPs on the exchange", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 5 }, 100, { SOL: 200 });
    simTick(s, G, T0);
    expect(s.state.status).toBe("live");
    const legs = s.ex.legs();
    expect(legs).toHaveLength(1);
    expect(Number(legs[0]!.szi)).toBeCloseTo((98 * 5) / 200, 1);
    const kinds = s.ex.triggers.map((t) => t.label).sort();
    expect(kinds).toEqual(["sl", "tp1", "tp2", "tp3"]);
    const sl = s.ex.triggers.find((t) => t.label === "sl")!;
    expect(Number(sl.triggerPx)).toBeCloseTo(180, 1);
  });

  it("SCENARIO: −40% on a 5× long → stop-loss, never liquidation", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 5 }, 100, { SOL: 200 });
    simTick(s, G, T0);
    let t = T0;
    for (let i = 1; i <= 40; i++) {
      t += 15 * 60_000;
      s.ex.setPrice("SOL", 200 * (1 - i / 100));
      simTick(s, G, t);
    }
    expect(s.ex.liquidations).toEqual([]);
    expect(s.events.some((e) => e.type === "sl_hit")).toBe(true);
    expect(s.state.status).toBe("cooldown");
    expect(s.state.consecutiveStops).toBe(1);
    // loss ≈ 50% of margin (+fees)
    expect(s.ex.collateral.toNumber()).toBeGreaterThan(45);
    expect(s.ex.collateral.toNumber()).toBeLessThan(55);
  });

  it("SCENARIO: gap through the stop between ticks still beats liquidation (job closes)", () => {
    const s = sim({ type: "single", asset: "BTC", side: "short", leverage: 5 }, 200, { BTC: 100_000 });
    simTick(s, G, T0);
    // remove triggers to emulate an exchange-side failure, then gap up 12%
    s.ex.triggers = [];
    s.ex.setPrice("BTC", 112_000);
    simTick(s, G, T0 + H);
    expect(s.ex.liquidations).toEqual([]);
    expect(s.ex.legs()).toHaveLength(0);
  });

  it("TP ladder: stages advance, SL trails to breakeven then TP1", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 5 }, 100, { SOL: 100 });
    simTick(s, G, T0);
    s.ex.setPrice("SOL", 105.5); // tp1 at +5%
    simTick(s, G, T0 + H);
    expect(s.state.tpStages.SOL).toBe(1);
    // freed margin was redeployed (DCA), so read the live TP2 level
    const tp2 = Number(s.ex.triggers.find((t) => t.label === "tp2")!.triggerPx);
    s.ex.setPrice("SOL", tp2 + 0.1);
    simTick(s, G, T0 + 2 * H);
    expect(s.state.tpStages.SOL).toBe(2);
    const sl = s.ex.triggers.find((t) => t.label === "sl")!;
    expect(Number(sl.triggerPx)).toBeCloseTo(Number(s.ex.legs()[0]!.entryPx), 3);
    const tp3 = Number(s.ex.triggers.find((t) => t.label === "tp3")!.triggerPx);
    s.ex.setPrice("SOL", tp3 + 0.1);
    simTick(s, G, T0 + 3 * H);
    expect(s.state.tpStages.SOL).toBe(3);
    const sl3 = s.ex.triggers.find((t) => t.label === "sl")!;
    expect(Number(sl3.triggerPx)).toBeGreaterThan(Number(s.ex.legs()[0]!.entryPx));
    expect(s.profitQueue.toNumber()).toBeGreaterThan(0);
    // retrace hits the trailing stop in profit → not a loss stop
    const trail = Number(sl3.triggerPx);
    s.ex.setPrice("SOL", trail - 0.5);
    simTick(s, G, T0 + 4 * H);
    expect(s.state.status).not.toBe("cooldown");
    expect(s.state.consecutiveStops).toBe(0);
  });

  it("profit queue is not redeployed", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 5 }, 100, { SOL: 100 });
    simTick(s, G, T0);
    s.ex.setPrice("SOL", 105.5);
    simTick(s, G, T0 + 2 * H);
    const before = Number(s.ex.legs()[0]!.szi);
    simTick(s, G, T0 + 4 * H);
    expect(Number(s.ex.legs()[0]!.szi)).toBeCloseTo(before, 6);
  });

  it("cooldown → re-entry after 12h; 3 stops in a row → stopped", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 5 }, 300, { SOL: 100 });
    let t = T0;
    for (let round = 1; round <= 3; round++) {
      simTick(s, G, t);
      expect(s.state.status).toBe("live");
      s.ex.setPrice("SOL", 85);
      t += H;
      simTick(s, G, t);
      if (round < 3) {
        expect(s.state.status).toBe("cooldown");
        s.ex.setPrice("SOL", 100);
        t += 6 * H;
        simTick(s, G, t);
        expect(s.state.status).toBe("cooldown");
        t += 7 * H;
        s.state.lastFeeAt = t;
        simTick(s, G, t); // cooldown over → waiting
      }
    }
    expect(s.state.status).toBe("stopped");
    expect(s.ex.liquidations).toEqual([]);
  });

  it("DCA: adds at most once per hour and re-syncs triggers", () => {
    const s = sim({ type: "single", asset: "ETH", side: "long", leverage: 3 }, 100, { ETH: 2000 });
    simTick(s, G, T0);
    const sz1 = Number(s.ex.legs()[0]!.szi);
    s.ex.collateral = s.ex.collateral.add(100); // new fees bridged in
    simTick(s, G, T0 + 30 * 60_000);
    expect(Number(s.ex.legs()[0]!.szi)).toBeCloseTo(sz1, 6);
    simTick(s, G, T0 + 61 * 60_000);
    const sz2 = Number(s.ex.legs()[0]!.szi);
    expect(sz2).toBeGreaterThan(sz1 * 1.8);
    const sl = s.ex.triggers.find((t) => t.label === "sl")!;
    expect(Number(sl.sz)).toBeCloseTo(sz2, 3);
  });

  it("liquidation guard adds margin or deleverages", () => {
    const st = market({ type: "single", asset: "SOL", side: "long", leverage: 5 }, {
      status: "live",
      legs: [{ asset: "SOL", szi: "10", entryPx: "100", leverage: 5, liquidationPx: "97", unrealizedPnl: "-50", marginUsed: "200" }],
      marks: { SOL: "95" },
      account: { accountValue: "150", withdrawable: "0", spot: {} },
      lastAddAt: T0,
    });
    const d = decide(st, G);
    expect(d.actions.some((a) => a.kind === "order" && a.reason === "deleverage")).toBe(true);
    const st2 = { ...st, account: { accountValue: "1000", withdrawable: "500", spot: {} } };
    expect(decide(st2, G).actions.some((a) => a.kind === "add_margin")).toBe(true);
  });

  it("respects notional caps", () => {
    const s = sim({ type: "single", asset: "BTC", side: "long", leverage: 5 }, 100_000, { BTC: 100_000 });
    simTick(s, { ...G, maxNotionalPerMarketUsd: 2000 }, T0);
    const n = Number(s.ex.legs()[0]!.szi) * 100_000;
    expect(n).toBeLessThanOrEqual(2000);
    expect(n).toBeGreaterThan(1900);
  });

  it("close_only: never opens; halted: does nothing", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 5 }, 100, { SOL: 200 });
    simTick(s, { ...G, tradingMode: "close_only" }, T0);
    expect(s.ex.legs()).toHaveLength(0);
    simTick(s, { ...G, tradingMode: "halted" }, T0);
    expect(s.ex.legs()).toHaveLength(0);
  });

  it("dead after 14 days without fees and non-positive pnl", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 2 }, 100, { SOL: 100 });
    simTick(s, G, T0);
    s.ex.setPrice("SOL", 99);
    simTick(s, G, T0 + 15 * 24 * H);
    expect(s.state.status).toBe("dead");
    expect(s.ex.legs()).toHaveLength(0);
  });
});

describe("strategies", () => {
  it("basket opens weighted legs, each with its own SL/TP", () => {
    const strat: Strategy = { type: "basket", side: "long", leverage: 3, legs: [{ asset: "BTC", weightBps: 4000 }, { asset: "SOL", weightBps: 3000 }, { asset: "HYPE", weightBps: 3000 }] };
    const s = sim(strat, 300, { BTC: 100_000, SOL: 200, HYPE: 40 });
    simTick(s, G, T0);
    const legs = s.ex.legs();
    expect(legs.map((l) => l.asset).sort()).toEqual(["BTC", "HYPE", "SOL"]);
    const btcN = Number(legs.find((l) => l.asset === "BTC")!.szi) * 100_000;
    const solN = Number(legs.find((l) => l.asset === "SOL")!.szi) * 200;
    expect(btcN / solN).toBeCloseTo(4 / 3, 1);
    expect(s.ex.triggers.filter((t) => t.label === "sl")).toHaveLength(3);
  });

  it("pair: long A / short B equal notional; vote flips the legs", () => {
    const s = sim({ type: "pair", long: "SOL", short: "ETH", leverage: 3 }, 200, { SOL: 200, ETH: 2000 }, { community: true });
    simTick(s, G, T0);
    let legs = s.ex.legs();
    expect(Number(legs.find((l) => l.asset === "SOL")!.szi)).toBeGreaterThan(0);
    expect(Number(legs.find((l) => l.asset === "ETH")!.szi)).toBeLessThan(0);
    s.state.vote = { direction: "short", round: "2026-11-01" };
    simTick(s, G, T0 + 5 * H);
    expect(s.state.direction).toBe("short");
    simTick(s, G, T0 + 5 * H + 60_000);
    legs = s.ex.legs();
    expect(Number(legs.find((l) => l.asset === "SOL")!.szi)).toBeLessThan(0);
    expect(Number(legs.find((l) => l.asset === "ETH")!.szi)).toBeGreaterThan(0);
  });

  it("pair: one leg stopped → whole market stops and cools down", () => {
    const s = sim({ type: "pair", long: "SOL", short: "ETH", leverage: 3 }, 200, { SOL: 200, ETH: 2000 });
    simTick(s, G, T0);
    s.ex.setPrice("SOL", 160);
    simTick(s, G, T0 + H);
    expect(s.state.status).toBe("cooldown");
    expect(s.ex.legs()).toHaveLength(0);
  });

  it("funding farm: short perp + spot long, flat after two negative windows, back on after two positive", () => {
    const s = sim({ type: "funding", asset: "HYPE" }, 100, { HYPE: 40 }, { spotAssets: { HYPE: { szDecimals: 2, maxLeverage: 1 } } });
    s.ex.spot.USDC = new Decimal(100);
    s.ex.spotMarks.HYPE = new Decimal(40);
    s.state.fundingWindows = [0.0001, 0.0001];
    simTick(s, G, T0);
    expect(s.state.status).toBe("live");
    const perp = s.ex.legs()[0]!;
    expect(Number(perp.szi)).toBeLessThan(0);
    expect(s.ex.spot.HYPE!.toNumber()).toBeCloseTo(-Number(perp.szi), 6);
    expect(s.ex.triggers.map((t) => t.label)).toEqual(["sl"]);
    s.state.fundingWindows = [-0.0001, 0.0001];
    simTick(s, G, T0 + 8 * H);
    expect(s.state.status).toBe("live");
    s.state.fundingWindows = [-0.0001, -0.0002];
    simTick(s, G, T0 + 16 * H);
    expect(s.state.status).toBe("flat");
    expect(s.ex.legs()).toHaveLength(0);
    expect(s.ex.spot.HYPE!.toNumber()).toBeCloseTo(0, 6);
    s.state.fundingWindows = [0.0002, 0.0001];
    simTick(s, G, T0 + 24 * H);
    simTick(s, G, T0 + 24 * H + 60_000);
    expect(s.state.status).toBe("live");
  });

  it("funding direction helper", () => {
    expect(fundingDirection("long", [-1, -1])).toBe("flat");
    expect(fundingDirection("flat", [1, 1])).toBe("long");
    expect(fundingDirection("flat", [1, -1])).toBe("flat");
  });
});

describe("community bias", () => {
  const votes = (n: number, choice: "long" | "short" | "flat", bal = 1_000_000n * 10n ** 6n) =>
    Array.from({ length: n }, (_, i) => ({ wallet: `${choice}${i}`, choice, balance: bal }));
  const SUPPLY = 1_000_000_000n * 10n ** 6n;

  it("no quorum with < 5 wallets → no winner", () => {
    const t = tallyVotes(votes(4, "short", 50_000_000n * 10n ** 6n), SUPPLY, 1);
    expect(t.quorum).toBe(false);
    expect(t.winner).toBeNull();
  });

  it("no quorum with too little weight", () => {
    const t = tallyVotes(votes(6, "short", 1000n), SUPPLY, 1);
    expect(t.quorum).toBe(false);
  });

  it("quorum + majority → winner; whale capped at 10%", () => {
    const whale = { wallet: "whale", choice: "long" as const, balance: 400_000_000n * 10n ** 6n };
    const t = tallyVotes([...votes(10, "short"), whale], SUPPLY, 1);
    expect(t.quorum).toBe(true);
    expect(t.winner).toBe("short");
  });

  it("without quorum the market direction does not change", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 3 }, 100, { SOL: 100 }, { community: true });
    simTick(s, G, T0);
    const t = tallyVotes(votes(3, "short"), SUPPLY, 1);
    s.state.vote = t.winner ? { direction: t.winner, round: "r" } : null;
    simTick(s, G, T0 + 25 * H);
    expect(s.state.direction).toBe("long");
  });

  it("flip at most once per 24h", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 3 }, 100, { SOL: 100 }, { community: true });
    simTick(s, G, T0);
    s.state.vote = { direction: "short", round: "d1" };
    simTick(s, G, T0 + H);
    expect(s.state.direction).toBe("short");
    s.state.vote = { direction: "long", round: "d2" };
    simTick(s, G, T0 + 10 * H);
    expect(s.state.direction).toBe("short");
    simTick(s, G, T0 + 26 * H);
    expect(s.state.direction).toBe("long");
  });

  it("vote flat closes the position", () => {
    const s = sim({ type: "single", asset: "SOL", side: "long", leverage: 3 }, 100, { SOL: 100 }, { community: true });
    simTick(s, G, T0);
    s.state.vote = { direction: "flat", round: "d1" };
    simTick(s, G, T0 + H);
    expect(s.state.status).toBe("flat");
    expect(s.ex.legs()).toHaveLength(0);
  });
});

describe("fees, tiers, reconcile, breaker, graveyard", () => {
  it("70/20/10 split is exact", () => {
    const s = splitFees(1_000_000_001n, { position: 7000, launcher: 2000, platform: 1000 });
    expect(s.launcher).toBe(200_000_000n);
    expect(s.platform).toBe(100_000_000n);
    expect(s.position + s.launcher + s.platform).toBe(1_000_000_001n);
  });

  it("claim / payout / bridge thresholds", () => {
    expect(shouldClaim(10_000_000n, "0.02", T0 - H, T0)).toBe(false);
    expect(shouldClaim(10_000_000n, "0.02", T0 - 25 * H, T0)).toBe(true);
    expect(shouldClaim(20_000_000n, "0.02", null, T0)).toBe(true);
    expect(shouldPayout(60_000_000n, "0.05", T0, T0)).toBe(true);
    expect(shouldPayout(10_000_000n, "0.05", T0 - H, T0)).toBe(false);
    expect(bridgeAmount(200_000_000n, "0.25")).toBe(0n);
    expect(bridgeAmount(300_000_000n, "0.25")).toBe(295_000_000n);
  });

  it("tiers", () => {
    const th = { trader: 50_000, desk: 500_000, fund: 2_000_000 };
    expect(tierFor(10, th)).toBe("none");
    expect(tierFor(50_000, th)).toBe("trader");
    expect(tierFor(600_000, th)).toBe("desk");
    expect(tierFor(3_000_000, th)).toBe("fund");
    expect(tierFor(0, th, false)).toBe("desk");
    expect(allowedStrategies("trader")).toEqual(["single"]);
    expect(allowedStrategies("desk")).toContain("funding");
    expect(launchFeeLamports("none", 20_000_000n)).toBe(20_000_000n);
    expect(launchFeeLamports("trader", 20_000_000n)).toBe(0n);
  });

  it("reconciliation flags a >1% mismatch red", () => {
    const sums = {
      claim: 1_000_000_000n,
      split_launcher: 200_000_000n,
      split_platform: 100_000_000n,
      split_position: 700_000_000n,
      payout_launcher: 200_000_000n,
      payout_platform: 100_000_000n,
      bridge_in: 600_000_000n,
      buyback_sol: 0n,
      withdraw_arrived_sol: 0n,
      rent_in: 3_000_000n,
      tx_fees: 0n,
      deposit_usd: 120_000_000n,
      realized_pnl_usd: 10_000_000n,
      trade_fee_usd: 0n,
      funding_usd: 0n,
      withdraw_usd: 0n,
    };
    const good = reconcileMarket(sums, { vaultLamports: 103_000_000n, hlAccountValueUsd: "135", hlUnrealizedUsd: "5", inTransitLamports: 0n });
    expect(good.every((l) => l.ok)).toBe(true);
    const bad = reconcileMarket({ ...sums, split_position: 650_000_000n }, { vaultLamports: 50_000_000n, hlAccountValueUsd: "100", hlUnrealizedUsd: "0", inTransitLamports: 0n });
    expect(bad.find((l) => l.key === "split")!.ok).toBe(false);
    expect(bad.find((l) => l.key === "vault")!.ok).toBe(false);
    expect(bad.find((l) => l.key === "hl")!.ok).toBe(false);
  });

  it("circuit breaker trips at >20% 24h trading loss, ignoring withdrawals", () => {
    expect(circuitBreaker({ equityNow: 75, equity24hAgo: 100, netFlows24h: 0 }, 20).trip).toBe(true);
    expect(circuitBreaker({ equityNow: 75, equity24hAgo: 100, netFlows24h: -20 }, 20).trip).toBe(false);
    expect(circuitBreaker({ equityNow: 0, equity24hAgo: 0, netFlows24h: 0 }, 20).trip).toBe(false);
  });

  it("epitaphs are deterministic", () => {
    expect(epitaph("X", "mint1")).toBe(epitaph("X", "mint1"));
    expect(epitaph("X", "mint1")).toContain("$X");
  });

  it("accountFills: tp labels advance stages and fill the profit queue; sl marks a stop", () => {
    const labels = { 10: { asset: "SOL", label: "tp1" as const }, 11: { asset: "SOL", label: "sl" as const } };
    const r = accountFills(
      [
        { oid: 10, asset: "SOL", sz: "1", px: "105", closedPnl: "5", fee: "0.05", dir: "Close Long", time: 1, tid: 1 },
        { oid: 11, asset: "SOL", sz: "3", px: "90", closedPnl: "-30", fee: "0.1", dir: "Close Long", time: 2, tid: 2 },
      ],
      labels,
      {},
      new Set(),
    );
    expect(r.tpStages.SOL).toBe(1);
    expect(r.profit.toNumber()).toBeCloseTo(4.95);
    expect(r.closed[0]!.reason).toBe("sl");
    expect(r.closed[0]!.stage).toBe(1);
  });

  it("expectedTriggers sizes", () => {
    const st = market({ type: "single", asset: "SOL", side: "long", leverage: 4 }, { tpStages: { SOL: 1 } });
    const tr = expectedTriggers(st, G, { asset: "SOL", szi: "3", entryPx: "100", leverage: 4, liquidationPx: "80", unrealizedPnl: "0", marginUsed: "75" });
    expect(tr.map((t) => t.label)).toEqual(["sl", "tp2", "tp3"]);
    expect(tr[1]!.sz).toBe("1.00");
  });
});
