import { Decimal, RULES, type Direction, type Side } from "@bias/shared";
import {
  legMarginRatio,
  liquidationGuard,
  safeLeverage,
  triggerLevels,
} from "./risk";
import { fallbackInfo, fundingSpotToken, roundSz, strategyLegs, type LegPlan } from "./strategy";
import type {
  Action,
  Decision,
  GlobalState,
  LegState,
  MarketState,
  PlannedTrigger,
  StatusPatch,
  TriggerState,
} from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const D = (v: Decimal.Value) => new Decimal(v);

export function legSide(leg: LegState): Side {
  return D(leg.szi).gte(0) ? "long" : "short";
}

function isOpen(leg: LegState): boolean {
  return !D(leg.szi).isZero();
}

function info(m: MarketState, asset: string) {
  return m.assets[asset] ?? fallbackInfo(asset);
}

function markOf(m: MarketState, asset: string): Decimal | null {
  const p = m.marks[asset];
  if (!p) return null;
  const d = D(p);
  return d.gt(0) ? d : null;
}

/** Leverage used for each planned leg (pairs/baskets share the lowest safe leverage). */
export function plannedLeverages(m: MarketState, g: GlobalState, legs: LegPlan[]): number[] {
  const typeCap = { single: 5, basket: 4, pair: 3, funding: 1 }[m.strategy.type];
  const levs = legs.map((l) =>
    safeLeverage(Math.min(l.requestedLeverage, typeCap, g.maxLeverage), info(m, l.asset), g.maxLossMarginPct, l.side),
  );
  if (m.strategy.type === "pair" || m.strategy.type === "basket") {
    const L = Math.min(...levs);
    return levs.map(() => L);
  }
  return levs;
}

function currentNotional(m: MarketState): Decimal {
  return m.legs.reduce((a, l) => {
    const mark = markOf(m, l.asset) ?? D(l.entryPx);
    return a.add(D(l.szi).abs().mul(mark));
  }, D(0));
}

/** Free perp collateral that can be deployed (withdrawable minus profit reserved for buybacks). */
export function freeCollateral(m: MarketState): Decimal {
  const f = D(m.account.withdrawable).sub(m.reservedUsd ?? 0);
  return f.gt(0) ? f : D(0);
}

/** Remaining notional capacity under per-market and global caps. */
export function notionalCapacity(m: MarketState, g: GlobalState): Decimal {
  const perMarket = D(g.maxNotionalPerMarketUsd).sub(currentNotional(m));
  const global = D(g.maxTotalNotionalUsd).sub(g.totalNotionalUsd);
  const cap = Decimal.min(perMarket, global);
  return cap.gt(0) ? cap : D(0);
}

/** Expected trigger set for one open leg. Funding-farm perp legs get only a stop-loss. */
export function expectedTriggers(m: MarketState, g: GlobalState, leg: LegState): PlannedTrigger[] {
  const side = legSide(leg);
  const abs = D(leg.szi).abs();
  const { szDecimals } = info(m, leg.asset);
  const stage = m.tpStages[leg.asset] ?? 0;
  const lv = triggerLevels(leg.entryPx, side, leg.leverage, stage, g.maxLossMarginPct);
  const closeIsBuy = side === "short";
  const out: PlannedTrigger[] = [
    { label: "sl", tpsl: "sl", isBuy: closeIsBuy, sz: abs.toFixed(szDecimals), triggerPx: lv.sl.toString() },
  ];
  if (m.strategy.type === "funding") return out;
  const remaining = [1, 2, 3].filter((k) => k > stage);
  if (remaining.length === 0) return out;
  // each remaining TP closes an equal slice, leaving one slice to run with the trailing stop
  const slice = roundSz(abs.div(remaining.length + 1), szDecimals);
  if (slice.lte(0)) return out;
  for (const k of remaining) {
    out.push({
      label: `tp${k}` as "tp1" | "tp2" | "tp3",
      tpsl: "tp",
      isBuy: closeIsBuy,
      sz: slice.toFixed(szDecimals),
      triggerPx: lv.tps[k - 1]!.toString(),
    });
  }
  return out;
}

function within(a: Decimal.Value, b: Decimal.Value, tol: number): boolean {
  const x = D(a);
  const y = D(b);
  if (y.isZero()) return x.isZero();
  return x.sub(y).abs().div(y.abs()).lte(tol);
}

/** True when the live trigger orders match the expected set (one SL + the remaining TPs). */
export function triggersMatch(expected: PlannedTrigger[], live: TriggerState[]): boolean {
  if (expected.length !== live.length) return false;
  const pool = [...live];
  for (const e of expected) {
    const i = pool.findIndex(
      (t) =>
        t.tpsl === e.tpsl &&
        t.isBuy === e.isBuy &&
        within(t.triggerPx, e.triggerPx, RULES.TRIGGER_PX_TOLERANCE) &&
        within(t.sz, e.sz, RULES.TRIGGER_SZ_TOLERANCE),
    );
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

function closeAll(m: MarketState, reason: "close" | "stop" | "flip"): Action[] {
  const actions: Action[] = [];
  for (const leg of m.legs.filter(isOpen)) {
    const oids = m.triggers.filter((t) => t.asset === leg.asset).map((t) => t.oid);
    if (oids.length) actions.push({ kind: "cancel_triggers", asset: leg.asset, oids });
    actions.push({
      kind: "order",
      asset: leg.asset,
      isBuy: legSide(leg) === "short",
      sz: D(leg.szi).abs().toString(),
      reduceOnly: true,
      reason,
      markPx: (markOf(m, leg.asset) ?? D(leg.entryPx)).toString(),
    });
  }
  // stray triggers on assets without a position
  const openAssets = new Set(m.legs.filter(isOpen).map((l) => l.asset));
  const stray = m.triggers.filter((t) => !openAssets.has(t.asset));
  for (const asset of new Set(stray.map((t) => t.asset))) {
    actions.push({ kind: "cancel_triggers", asset, oids: stray.filter((t) => t.asset === asset).map((t) => t.oid) });
  }
  // funding farm spot leg
  if (m.strategy.type === "funding") {
    const token = fundingSpotToken(m.strategy.asset);
    const bal = token ? D(m.account.spot[token] ?? 0) : D(0);
    const spotMark = token ? m.spotMarks?.[token] : undefined;
    const spotInfo = token ? m.spotAssets?.[token] : undefined;
    if (token && spotMark && bal.gt(0)) {
      const sz = roundSz(bal, spotInfo?.szDecimals ?? 2);
      if (sz.mul(spotMark).gte(RULES.MIN_ORDER_USD / 1.2)) {
        actions.push({ kind: "spot_order", token, isBuy: false, sz: sz.toString(), markPx: spotMark, reason });
      }
    }
  }
  return actions;
}

function hasExposure(m: MarketState): boolean {
  if (m.legs.some(isOpen)) return true;
  if (m.strategy.type === "funding") {
    const token = fundingSpotToken(m.strategy.asset);
    const bal = token ? D(m.account.spot[token] ?? 0) : D(0);
    const mark = token ? m.spotMarks?.[token] : undefined;
    return !!mark && bal.mul(mark).gte(RULES.MIN_ORDER_USD / 1.2);
  }
  return false;
}

const status = (s: MarketState["status"], reason: string, patch?: StatusPatch): Action => ({
  kind: "set_status",
  status: s,
  reason,
  patch,
});

/** Plan the opening orders for the current direction. Returns null when collateral is insufficient. */
export function planOpen(m: MarketState, g: GlobalState, budgetUsd?: Decimal): Action[] | null {
  if (m.strategy.type === "funding") return planFundingOpen(m, g);
  const legs = strategyLegs(m.strategy, m.direction);
  if (!legs.length) return null;
  const levs = plannedLeverages(m, g, legs);
  const free = budgetUsd ?? freeCollateral(m).mul(0.98);
  // total notional = margin budget × leverage, but legs may differ in leverage only for single (one leg)
  const L = levs[0] ?? 1;
  let notional = free.mul(L);
  notional = Decimal.min(notional, notionalCapacity(m, g));
  const actions: Action[] = [];
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i]!;
    const mark = markOf(m, l.asset);
    if (!mark) return null;
    const legNotional = notional.mul(l.weightBps).div(10_000);
    if (legNotional.lt(RULES.MIN_ORDER_USD)) return null;
    const sz = roundSz(legNotional.div(mark), info(m, l.asset).szDecimals);
    if (sz.lte(0) || sz.mul(mark).lt(RULES.MIN_ORDER_USD * 0.95)) return null;
    actions.push({ kind: "set_leverage", asset: l.asset, leverage: levs[i]! });
    actions.push({
      kind: "order",
      asset: l.asset,
      isBuy: l.side === "long",
      sz: sz.toString(),
      reduceOnly: false,
      reason: budgetUsd ? "add" : "open",
      markPx: mark.toString(),
    });
  }
  return actions;
}

function planFundingOpen(m: MarketState, g: GlobalState): Action[] | null {
  if (m.strategy.type !== "funding") return null;
  const asset = m.strategy.asset;
  const token = fundingSpotToken(asset);
  const mark = markOf(m, asset);
  const spotMark = token ? m.spotMarks?.[token] : undefined;
  if (!token || !mark || !spotMark) return null;
  const usdc = D(m.account.spot.USDC ?? 0).mul(0.98);
  const perpFree = freeCollateral(m).mul(0.98);
  const capUsd = notionalCapacity(m, g);
  const usd = Decimal.min(usdc, perpFree, capUsd);
  if (usd.lt(RULES.MIN_ORDER_USD)) return null;
  const dec = Math.min(info(m, asset).szDecimals, m.spotAssets?.[token]?.szDecimals ?? 2);
  const sz = roundSz(usd.div(Decimal.max(mark, spotMark)), dec);
  if (sz.mul(mark).lt(RULES.MIN_ORDER_USD * 0.95)) return null;
  return [
    { kind: "spot_order", token, isBuy: true, sz: sz.toString(), markPx: spotMark, reason: "open" },
    { kind: "set_leverage", asset, leverage: 1 },
    { kind: "order", asset, isBuy: false, sz: sz.toString(), reduceOnly: false, reason: "open", markPx: mark.toString() },
  ];
}

/** Funding farm direction from the last two 8h windows: both negative → flat, both positive → on. */
export function fundingDirection(current: Direction, windows: number[] | undefined): Direction {
  if (!windows || windows.length < 2) return current;
  const [a, b] = windows as [number, number];
  if (a < 0 && b < 0) return "flat";
  if (a > 0 && b > 0) return "long";
  return current;
}

/** Record a loss stop: cooldown for 12h, or stopped after 3 in a row. */
function stopOut(m: MarketState, A: Action[], message: string) {
  const n = m.consecutiveStops + 1;
  A.push({ kind: "event", type: "sl_hit", message });
  if (n >= RULES.MAX_CONSECUTIVE_STOPS) {
    A.push({ kind: "event", type: "stopped", message: `${n} stops in a row. market stopped.` });
    A.push(status("stopped", `${n} consecutive stop-losses`, { consecutiveStops: n, stoppedAt: m.now, tpStages: {} }));
  } else {
    A.push({ kind: "event", type: "cooldown", message: `cooldown for ${RULES.COOLDOWN_HOURS}h (${n}/${RULES.MAX_CONSECUTIVE_STOPS} stops)` });
    A.push(status("cooldown", "stop-loss", { consecutiveStops: n, stoppedAt: m.now, cooldownUntil: m.now + RULES.COOLDOWN_HOURS * HOUR, tpStages: {} }));
  }
}

/**
 * The heart of BIAS: given a market's full state, decide what to do right now.
 * Pure function. The executor runs the returned actions in order, re-reads state and calls decide()
 * again (up to a few passes) so triggers are always placed against real fills.
 */
export function decide(m: MarketState, g: GlobalState): Decision {
  const notes: string[] = [];
  const A: Action[] = [];
  const done = () => ({ actions: A, notes });

  if (g.tradingMode === "halted") {
    notes.push("trading halted");
    return done();
  }
  if (m.status === "pending_launch") return done();

  const exposure = hasExposure(m);
  const openLegs = m.legs.filter(isOpen);

  // terminal states: make sure nothing is left open
  if (m.status === "stopped" || m.status === "dead") {
    if (exposure) A.push(...closeAll(m, "close"));
    return done();
  }

  // ---- 1. stop detection (an SL fired while the leg was still at a loss stage) ----
  const stops = (m.closed ?? []).filter((c) => c.reason === "sl" && c.stage < 2);
  if (stops.length) {
    A.push(...closeAll(m, "stop"));
    stopOut(m, A, `stop-loss hit on ${stops.map((s) => s.asset).join(", ")}`);
    return done();
  }

  // all legs closed by take-profits / trailing stop in profit → back to waiting, stop streak resets
  if (m.status === "live" && !exposure) {
    const profitable = (m.closed ?? []).some((c) => c.reason !== "other" || D(c.pnl).gt(0));
    A.push(status("waiting_for_fees", "position fully closed", { tpStages: {}, consecutiveStops: profitable ? 0 : m.consecutiveStops }));
    return done();
  }

  // ---- 2. dead / stopped by inactivity ----
  const lastFee = m.lastFeeAt ?? m.createdAt;
  const upnl = openLegs.reduce((a, l) => a.add(l.unrealizedPnl), D(0));
  if (m.now - lastFee >= RULES.DEAD_AFTER_NO_FEES_DAYS * DAY && upnl.lte(0)) {
    if (exposure) A.push(...closeAll(m, "close"));
    A.push({ kind: "event", type: "dead", message: `${RULES.DEAD_AFTER_NO_FEES_DAYS} days without fees. market closed.` });
    A.push(status("dead", "no fees for 14 days", { tpStages: {} }));
    return done();
  }
  if (
    m.status === "cooldown" &&
    m.stoppedAt !== null &&
    m.now - m.stoppedAt >= RULES.STOPPED_AFTER_COOLDOWN_DAYS * DAY &&
    lastFee <= m.stoppedAt
  ) {
    if (exposure) A.push(...closeAll(m, "close"));
    A.push({ kind: "event", type: "stopped", message: "7 days in cooldown without fees. market stopped." });
    A.push(status("stopped", "cooldown without fees for 7 days", { tpStages: {} }));
    return done();
  }

  // ---- 3. direction: community vote / funding regime ----
  const direction = m.direction;
  if (m.strategy.type === "funding") {
    const next = fundingDirection(direction, m.fundingWindows);
    if (next !== direction) {
      A.push({
        kind: "event",
        type: next === "flat" ? "flat" : "open",
        message: next === "flat" ? "funding negative for two windows. farm goes flat." : "funding positive for two windows. farm back on.",
      });
      if (next === "flat") {
        A.push(...closeAll(m, "close"));
        A.push(status("flat", "negative funding", { direction: "flat", tpStages: {} }));
        return done();
      }
      A.push(status("waiting_for_fees", "positive funding", { direction: "long" }));
      return done();
    }
  } else if (m.community && m.vote && m.vote.direction !== direction) {
    const since = m.lastFlipAt === null ? Infinity : m.now - m.lastFlipAt;
    if (since >= RULES.FLIP_MIN_HOURS * HOUR) {
      A.push(...closeAll(m, "flip"));
      A.push({ kind: "event", type: "flip", message: `holders voted ${m.vote.direction} (round ${m.vote.round})` });
      const to = m.vote.direction === "flat" ? "flat" : "waiting_for_fees";
      A.push(status(to, "vote", { direction: m.vote.direction, lastFlipAt: m.now, tpStages: {} }));
      return done();
    }
    notes.push("vote result pending: last flip < 24h ago");
  }

  // ---- 4. cooldown ----
  if (m.status === "cooldown") {
    if (m.cooldownUntil !== null && m.now < m.cooldownUntil) {
      if (exposure) A.push(...closeAll(m, "close"));
      notes.push("cooling down");
      return done();
    }
    A.push(status("waiting_for_fees", "cooldown over", { cooldownUntil: null }));
    return done();
  }

  // ---- 5. flat ----
  if (direction === "flat") {
    if (exposure) A.push(...closeAll(m, "close"));
    if (m.status !== "flat") A.push(status("flat", "direction flat", { tpStages: {} }));
    return done();
  }
  if (m.status === "flat") {
    A.push(status("waiting_for_fees", "direction set", {}));
    return done();
  }

  const canOpen = g.tradingMode === "normal" && !m.paused;

  // ---- 6. no position: open when there is enough collateral ----
  if (!exposure) {
    if (!canOpen) {
      notes.push(m.paused ? "market paused (close-only)" : "platform close-only");
      return done();
    }
    const plan = planOpen(m, g);
    if (!plan) {
      if (m.status !== "waiting_for_fees") A.push(status("waiting_for_fees", "insufficient collateral"));
      notes.push("waiting for fees");
      return done();
    }
    A.push(...plan);
    A.push({ kind: "event", type: "open", message: "position opened" });
    A.push(status("live", "opened", { lastAddAt: m.now, tpStages: {} }));
    return done();
  }

  // ---- 7. manage live position ----
  if (m.status !== "live") A.push(status("live", "position open"));

  // funding farm: perp leg gone while spot remains (or vice versa) → treat as a stop
  if (m.strategy.type === "funding") {
    const token = fundingSpotToken(m.strategy.asset)!;
    const perp = openLegs.find((l) => l.asset === (m.strategy as { asset: string }).asset);
    const spotBal = D(m.account.spot[token] ?? 0);
    if (!perp || spotBal.isZero()) {
      A.push(...closeAll(m, "close"));
      A.push({ kind: "event", type: "close", message: "funding farm lost one leg; closing the other" });
      A.push(status("waiting_for_fees", "unhedged", { tpStages: {} }));
      return done();
    }
    const perpSz = D(perp.szi).abs();
    const imbalance = perpSz.sub(spotBal).abs().div(Decimal.max(perpSz, spotBal));
    if (imbalance.gt(RULES.FUNDING_REBALANCE_PCT / 100)) {
      const target = Decimal.min(perpSz, spotBal);
      const mark = markOf(m, perp.asset);
      const diff = roundSz(perpSz.sub(target), info(m, perp.asset).szDecimals);
      if (mark && diff.gt(0) && diff.mul(mark).gte(RULES.MIN_ORDER_USD / 1.2)) {
        A.push({ kind: "order", asset: perp.asset, isBuy: true, sz: diff.toString(), reduceOnly: true, reason: "rebalance", markPx: mark.toString() });
        return done();
      }
      const sdiff = roundSz(spotBal.sub(target), m.spotAssets?.[token]?.szDecimals ?? 2);
      const sm = m.spotMarks?.[token];
      if (sm && sdiff.gt(0) && sdiff.mul(sm).gte(RULES.MIN_ORDER_USD / 1.2)) {
        A.push({ kind: "spot_order", token, isBuy: false, sz: sdiff.toString(), markPx: sm, reason: "rebalance" });
        return done();
      }
    }
  }

  // combined stop for multi-leg strategies: total uPnL beyond max loss of total margin
  if (openLegs.length > 1) {
    const margin = openLegs.reduce((a, l) => a.add(D(l.szi).abs().mul(l.entryPx).div(l.leverage)), D(0));
    if (upnl.lt(margin.mul(-g.maxLossMarginPct).div(100))) {
      A.push(...closeAll(m, "stop"));
      stopOut(m, A, "combined stop: total loss reached the margin limit");
      return done();
    }
  }

  let changedSize = false;
  let guarded = false;
  const missed: string[] = [];
  for (const leg of openLegs) {
    const mark = markOf(m, leg.asset);
    if (!mark) {
      notes.push(`no mark for ${leg.asset}`);
      continue;
    }
    const side = legSide(leg);
    const stage = m.tpStages[leg.asset] ?? 0;
    const lv = triggerLevels(leg.entryPx, side, leg.leverage, stage, g.maxLossMarginPct);
    const base = triggerLevels(leg.entryPx, side, leg.leverage, 0, g.maxLossMarginPct);
    const ai = info(m, leg.asset);
    const verdict = liquidationGuard({
      side,
      entry: leg.entryPx,
      mark,
      slPx: base.sl,
      activeSlPx: lv.sl,
      liqPx: leg.liquidationPx,
      marginRatio: legMarginRatio(D(leg.szi).abs(), leg.entryPx, mark, leg.leverage, leg.unrealizedPnl, ai.maxLeverage),
    });
    if (verdict === "sl_missed") {
      // price is through the stop and the exchange trigger did not fire: the job closes it
      missed.push(leg.asset);
      continue;
    }
    if (verdict === "deleverage") {
      const initial = D(leg.szi).abs().mul(leg.entryPx).div(leg.leverage);
      const topUp = initial.mul(RULES.DELEVERAGE_FRACTION_PCT).div(100);
      if (freeCollateral(m).gte(topUp) && topUp.gte(1)) {
        A.push({ kind: "add_margin", asset: leg.asset, usd: topUp.toFixed(2), isLong: side === "long" });
        A.push({ kind: "event", type: "deleverage", message: `${leg.asset}: added $${topUp.toFixed(2)} margin (liquidation guard)` });
        guarded = true;
      } else {
        const cut = roundSz(D(leg.szi).abs().mul(RULES.DELEVERAGE_FRACTION_PCT).div(100), ai.szDecimals);
        if (cut.gt(0)) {
          A.push({ kind: "order", asset: leg.asset, isBuy: side === "short", sz: cut.toString(), reduceOnly: true, reason: "deleverage", markPx: mark.toString() });
          A.push({ kind: "event", type: "deleverage", message: `${leg.asset}: reduced position by ${RULES.DELEVERAGE_FRACTION_PCT}% (liquidation guard)` });
          changedSize = true;
        }
      }
    }
  }
  if (missed.length) {
    const lossStage = missed.some((a) => (m.tpStages[a] ?? 0) < 2);
    A.length = 0;
    A.push(...closeAll(m, "stop"));
    A.push({ kind: "alert", message: `${missed.join(", ")}: mark through stop-loss without a trigger fill; closed by the job` });
    if (lossStage) {
      stopOut(m, A, "stop-loss (closed by job)");
    } else {
      A.push(status("waiting_for_fees", "trailing stop (closed by job)", { tpStages: {}, consecutiveStops: 0 }));
    }
    return done();
  }
  if (changedSize) return done(); // triggers are re-synced on the next pass against the new size

  // ensure exchange-side SL/TP for every leg
  for (const leg of openLegs) {
    const expected = expectedTriggers(m, g, leg);
    const live = m.triggers.filter((t) => t.asset === leg.asset);
    if (!triggersMatch(expected, live)) {
      A.push({ kind: "replace_triggers", asset: leg.asset, cancelOids: live.map((t) => t.oid), place: expected });
    }
  }

  if (guarded) return done();

  // DCA: deploy new collateral at most once an hour
  if (canOpen && m.strategy.type !== "funding") {
    const lastAdd = m.lastAddAt ?? 0;
    if (m.now - lastAdd >= RULES.ADD_MIN_INTERVAL_MIN * 60_000) {
      const add = planOpen(m, g, freeCollateral(m).mul(0.98));
      if (add) {
        A.push(...add.filter((a) => a.kind === "order"));
        A.push({ kind: "event", type: "add", message: "new fees added to the position" });
        A.push(status("live", "add", { lastAddAt: m.now }));
      }
    }
  } else if (canOpen && m.strategy.type === "funding") {
    const lastAdd = m.lastAddAt ?? 0;
    if (m.now - lastAdd >= RULES.ADD_MIN_INTERVAL_MIN * 60_000) {
      const add = planFundingOpen(m, g);
      if (add) {
        A.push(...add.filter((a) => a.kind !== "set_leverage"));
        A.push({ kind: "event", type: "add", message: "new fees added to the farm" });
        A.push(status("live", "add", { lastAddAt: m.now }));
      }
    }
  }

  return done();
}
