import Decimal from "decimal.js";
import {
  accountFills,
  applyPatch,
  circuitBreaker,
  decide,
  legSide,
  riskMeter,
  triggerLevels,
  type Action,
  type GlobalState,
  type MarketState,
} from "@bias/engine";
import {
  addAlert,
  addEquitySnapshot,
  addEvent,
  addLedger,
  getPosition,
  listRounds,
  setSetting,
  updateMarket,
  upsertPosition,
  upsertRound,
  type Market,
} from "@bias/db";
import { usdToMicro, type Direction, type MarketStatus, type Strategy, type TriggerKind } from "@bias/shared";
import type { JobEnv } from "./env";
import type { Venue, VenueState } from "./venue";

interface StoredTrigger {
  oid: number;
  asset: string;
  label: TriggerKind;
  tpsl: "tp" | "sl";
  triggerPx: string;
  sz: string;
}

const j = <T>(s: string | null | undefined, f: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : f;
  } catch {
    return f;
  }
};

export function toMarketState(m: Market, v: VenueState, ctx: {
  now: number;
  marks: Record<string, string>;
  assets: MarketState["assets"];
  spotAssets?: MarketState["spotAssets"];
  spotMarks?: Record<string, string>;
  fundingWindows?: number[];
  vote?: MarketState["vote"];
}): MarketState {
  return {
    id: m.id,
    strategy: JSON.parse(m.strategy) as Strategy,
    status: m.status as MarketStatus,
    direction: m.direction as Direction,
    community: m.community,
    paused: m.paused,
    now: ctx.now,
    createdAt: m.createdAt,
    lastFeeAt: m.lastFeeAt,
    lastAddAt: m.lastAddAt,
    lastFlipAt: m.lastFlipAt,
    stoppedAt: m.stoppedAt,
    cooldownUntil: m.cooldownUntil,
    consecutiveStops: m.consecutiveStops,
    tpStages: j<Record<string, number>>(m.tpStages, {}),
    account: v.account,
    legs: v.legs,
    triggers: v.triggers,
    marks: ctx.marks,
    spotMarks: ctx.spotMarks,
    assets: ctx.assets,
    spotAssets: ctx.spotAssets,
    fundingWindows: ctx.fundingWindows,
    vote: ctx.vote ?? null,
    closed: [],
    reservedUsd: m.profitQueueUsd,
  };
}

/** Pending, quorate, unapplied vote result for a community market (latest finalized round). */
export async function pendingVote(env: JobEnv, m: Market): Promise<{ direction: Direction; round: string } | null> {
  if (!m.community) return null;
  const rounds = await listRounds(env.db, m.id, 3);
  const r = rounds.find((x) => x.status === "final" && !x.applied);
  if (!r) return null;
  if (!r.quorum || !r.winner || r.winner === m.direction) {
    await upsertRound(env.db, { ...r, applied: true });
    return null;
  }
  return { direction: r.winner as Direction, round: r.round };
}

export interface TradeCtx {
  env: JobEnv;
  venue: Venue;
  global: GlobalState;
  marks: Record<string, string>;
  assets: MarketState["assets"];
  spot: { assets: MarketState["assets"]; marks: Record<string, string> };
}

/** One trading pass for one market: accounting → decide/execute (≤3 passes) → verify stops → persist. */
export async function tradeMarket(t: TradeCtx, m: Market): Promise<{ notionalUsd: Decimal; equityUsd: Decimal; actions: number }> {
  const { env, venue } = t;
  const now = env.now();
  const strategy = JSON.parse(m.strategy) as Strategy;
  const pos = await getPosition(env.db, m.id);
  const stored = j<StoredTrigger[]>(pos?.triggers, []);
  const labels: Record<number, { asset: string; label: TriggerKind }> = Object.fromEntries(stored.map((s) => [s.oid, { asset: s.asset, label: s.label }]));

  let v = await venue.state(m);
  // ---- accounting from fills since the last processed fill ----
  const since = (m.lastFillAt ?? m.createdAt) + 1;
  const fills = await venue.fills(m, since);
  const openAfter = new Set(v.legs.map((l) => l.asset));
  const acc = accountFills(fills, labels, j(m.tpStages, {}), openAfter);
  const lastFillAt = fills.reduce((a, f) => Math.max(a, f.time), m.lastFillAt ?? 0);
  const maxTid = fills.reduce((a, f) => Math.max(a, f.tid), 0);
  if (fills.length) {
    await addLedger(env.db, { marketId: m.id, type: "realized_pnl", asset: "USD", amount: usdToMicro(acc.realizedPnl.toFixed(6)).toString(), opId: `fills:${m.id}:${maxTid}` });
    await addLedger(env.db, { marketId: m.id, type: "trade_fee", asset: "USD", amount: usdToMicro(acc.fees.toFixed(6)).toString(), opId: `fills:${m.id}:${maxTid}` });
    for (const h of acc.tpHits) await addEvent(env.db, { marketId: m.id, type: "tp_hit", message: `TP${h.stage} hit on ${h.asset}. profit queued for buyback 🔥`, chain: "hl" });
  }

  const fundingWindows = strategy.type === "funding" ? await venue.fundingWindows(strategy.asset, now) : undefined;
  const vote = await pendingVote(env, m);
  const state = toMarketState(m, v, { now, marks: t.marks, assets: t.assets, spotAssets: t.spot.assets, spotMarks: t.spot.marks, fundingWindows, vote });
  state.tpStages = acc.tpStages;
  state.closed = acc.closed;
  state.reservedUsd = new Decimal(m.profitQueueUsd).add(acc.profit).toString();

  let triggers = stored.filter((s) => v.triggers.some((x) => x.oid === s.oid));
  const executed: Action[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const { actions, notes } = decide(state, t.global);
    if (notes.length && pass === 0) env.log(m.id, notes.join("; "));
    if (!actions.length) break;
    for (const a of actions) {
      if (a.kind === "set_status") {
        applyPatch(state, a.status, a.patch);
        continue;
      }
      if (a.kind === "event") {
        await addEvent(env.db, { marketId: m.id, type: a.type, message: a.message, chain: "hl" });
        continue;
      }
      if (a.kind === "alert") {
        await addAlert(env.db, "warn", `${m.ticker}: ${a.message}`, m.id);
        continue;
      }
      try {
        const r = await venue.execute(m, a);
        executed.push(a);
        if (r.placed) {
          const cancelled = a.kind === "replace_triggers" ? new Set(a.cancelOids) : new Set<number>();
          triggers = [...triggers.filter((x) => !cancelled.has(x.oid)), ...r.placed];
        }
        if (a.kind === "order" && ["open", "add", "close", "reduce", "flip", "stop"].includes(a.reason) && r.note) {
          await addEvent(env.db, { marketId: m.id, type: a.reason === "stop" ? "close" : (a.reason as "open"), message: r.note, chain: "hl" });
        }
        if (!r.ok) env.log(m.id, "not filled:", r.note);
      } catch (e) {
        env.log(m.id, "execute failed", a.kind, (e as Error).message);
        await addAlert(env.db, "warn", `${m.ticker}: ${a.kind} failed: ${(e as Error).message}`.slice(0, 400), m.id);
      }
    }
    state.closed = [];
    state.vote = state.direction === vote?.direction ? null : state.vote;
    v = await venue.state(m);
    state.legs = v.legs;
    state.triggers = v.triggers;
    state.account = v.account;
    if (!actions.some((a) => a.kind === "order" || a.kind === "spot_order" || a.kind === "set_status" || a.kind === "replace_triggers")) break;
  }

  // ---- safety: every open leg must have a stop on the exchange ----
  const missingSl = v.legs.filter((l) => !v.triggers.some((x) => x.asset === l.asset && x.tpsl === "sl"));
  if (missingSl.length) {
    await updateMarket(env.db, m.id, { paused: true });
    await addAlert(env.db, "critical", `${m.ticker}: no stop-loss on ${missingSl.map((l) => l.asset).join(", ")} after retries — market set to close-only`, m.id);
  }
  if (vote && state.direction === vote.direction) {
    const rounds = await listRounds(env.db, m.id, 3);
    const r = rounds.find((x) => x.round === vote.round);
    if (r) await upsertRound(env.db, { ...r, applied: true });
  }

  // ---- snapshot for the UI ----
  const upnl = v.legs.reduce((a, l) => a.add(l.unrealizedPnl), new Decimal(0));
  const notional = v.legs.reduce((a, l) => a.add(new Decimal(l.szi).abs().mul(t.marks[l.asset] ?? l.entryPx)), new Decimal(0));
  const spotUsd = Object.entries(v.account.spot).reduce((a, [tok, bal]) => {
    if (tok === "USDC") return a.add(bal);
    const mk = t.spot.marks[tok];
    return mk ? a.add(new Decimal(bal).mul(mk)) : a;
  }, new Decimal(0));
  const equity = new Decimal(v.account.accountValue).add(spotUsd);
  let toSl: number | null = null;
  let toLiq: number | null = null;
  let closestTp: number | null = null;
  for (const l of v.legs) {
    const mark = t.marks[l.asset];
    if (!mark) continue;
    const side = legSide(l);
    const lv = triggerLevels(l.entryPx, side, l.leverage, state.tpStages[l.asset] ?? 0, t.global.maxLossMarginPct);
    const r = riskMeter(mark, side, lv.sl, l.liquidationPx);
    toSl = toSl === null ? r.toSl : Math.min(toSl, r.toSl);
    if (r.toLiq !== null) toLiq = toLiq === null ? r.toLiq : Math.min(toLiq, r.toLiq);
    const nextTp = lv.tps[state.tpStages[l.asset] ?? 0];
    if (nextTp) {
      const d = Math.abs(nextTp.sub(mark).div(mark).toNumber());
      closestTp = closestTp === null ? d : Math.min(closestTp, d);
    }
  }
  const ended = (state.status === "stopped" || state.status === "dead") && !["stopped", "dead"].includes(m.status);
  await updateMarket(env.db, m.id, {
    status: state.status,
    direction: state.direction,
    tpStages: JSON.stringify(state.tpStages),
    consecutiveStops: state.consecutiveStops,
    cooldownUntil: state.cooldownUntil,
    stoppedAt: state.stoppedAt,
    lastFlipAt: state.lastFlipAt,
    lastAddAt: state.lastAddAt,
    lastFillAt: lastFillAt || m.lastFillAt,
    profitQueueUsd: new Decimal(m.profitQueueUsd).add(acc.profit).toFixed(6),
    realizedPnlUsd: new Decimal(m.realizedPnlUsd).add(acc.realizedPnl).sub(acc.fees).toFixed(6),
    equityUsd: equity.toFixed(6),
    upnlUsd: upnl.toFixed(6),
    notionalUsd: notional.toFixed(2),
    riskToSl: toSl,
    riskToLiq: toLiq,
    closestTp,
    snapshotAt: now,
    ...(ended ? { endedAt: now, endReason: fills.some((f) => /liquidat/i.test(f.dir)) ? "liquidated" : state.status } : {}),
  });
  await upsertPosition(env.db, { marketId: m.id, legs: JSON.stringify(v.legs), triggers: JSON.stringify(triggers), marks: JSON.stringify(Object.fromEntries(v.legs.map((l) => [l.asset, t.marks[l.asset] ?? l.entryPx]))), updatedAt: now });
  await addEquitySnapshot(env.db, m.id, equity.toFixed(6), upnl.toFixed(6), now);
  return { notionalUsd: notional, equityUsd: equity, actions: executed.length };
}

/** 24h circuit breaker over all markets; trips TRADING_MODE=close_only. */
export async function checkBreaker(env: JobEnv, equityNow: Decimal, equity24hAgo: Decimal, netFlows24h: Decimal): Promise<boolean> {
  const r = circuitBreaker({ equityNow, equity24hAgo, netFlows24h }, env.cfg.GLOBAL_DRAWDOWN_HALT_PCT);
  if (r.trip && env.cfg.TRADING_MODE === "normal") {
    await setSetting(env.db, "TRADING_MODE", "close_only");
    await addAlert(env.db, "critical", `circuit breaker: ${r.drawdownPct.toFixed(1)}% loss in 24h → TRADING_MODE=close_only`);
    await addEvent(env.db, { marketId: null, type: "alert", message: `circuit breaker tripped (${r.drawdownPct.toFixed(1)}% in 24h). platform is close-only.` });
    return true;
  }
  return false;
}
