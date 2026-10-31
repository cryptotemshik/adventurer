import { Decimal, type TriggerKind } from "@bias/shared";
import { decide, legSide } from "./decide";
import { accountFills, type FillLike } from "./accounting";
import { maintenanceFraction } from "./risk";
import type { Action, AssetInfo, GlobalState, LegState, MarketState, StatusPatch, TriggerState } from "./types";

/**
 * Deterministic in-memory model of a Hyperliquid isolated-margin account, used by scenario tests
 * and DRY_RUN end-to-end runs. Native triggers fire on every price update — just like the exchange,
 * which protects positions between job runs.
 */
interface SimPos {
  szi: Decimal;
  entry: Decimal;
  leverage: number;
  margin: Decimal;
}

interface SimTrigger extends TriggerState {
  label: TriggerKind;
}

const D = (v: Decimal.Value) => new Decimal(v);

export class SimExchange {
  collateral: Decimal;
  spot: Record<string, Decimal> = {};
  pos: Record<string, SimPos> = {};
  lev: Record<string, number> = {};
  triggers: SimTrigger[] = [];
  marks: Record<string, Decimal> = {};
  spotMarks: Record<string, Decimal> = {};
  fills: FillLike[] = [];
  liquidations: string[] = [];
  private oid = 1;
  private tid = 1;
  now = 0;

  constructor(
    collateralUsd: Decimal.Value,
    public assets: Record<string, AssetInfo>,
    public takerFeeBps = 4.5,
  ) {
    this.collateral = D(collateralUsd);
  }

  liqPx(asset: string): Decimal | null {
    const p = this.pos[asset];
    if (!p || p.szi.isZero()) return null;
    const side = p.szi.gt(0) ? 1 : -1;
    const mmf = maintenanceFraction(this.assets[asset]?.maxLeverage ?? 10);
    const abs = p.szi.abs();
    const avail = p.margin.sub(abs.mul(p.entry).mul(mmf));
    return p.entry.sub(D(side).mul(avail).div(abs).div(D(1).sub(D(mmf).mul(side))));
  }

  private fill(asset: string, isBuy: boolean, sz: Decimal, px: Decimal, label?: TriggerKind, oid?: number) {
    const p = this.pos[asset] ?? { szi: D(0), entry: px, leverage: this.lev[asset] ?? 1, margin: D(0) };
    const signed = isBuy ? sz : sz.neg();
    const fee = sz.mul(px).mul(this.takerFeeBps).div(10_000);
    let closedPnl = D(0);
    let dir: string;
    if (p.szi.isZero() || p.szi.gt(0) === isBuy) {
      // open / add
      const newSz = p.szi.add(signed);
      const notionalAdd = sz.mul(px);
      const marginAdd = notionalAdd.div(this.lev[asset] ?? p.leverage);
      if (marginAdd.add(fee).gt(this.collateral)) throw new Error(`insufficient collateral for ${asset}`);
      p.entry = p.szi.isZero() ? px : p.entry.mul(p.szi.abs()).add(notionalAdd).div(newSz.abs());
      p.szi = newSz;
      p.leverage = this.lev[asset] ?? p.leverage;
      p.margin = p.margin.add(marginAdd);
      this.collateral = this.collateral.sub(marginAdd);
      dir = isBuy ? "Open Long" : "Open Short";
    } else {
      // reduce / close
      const closeSz = Decimal.min(sz, p.szi.abs());
      const side = p.szi.gt(0) ? 1 : -1;
      closedPnl = px.sub(p.entry).mul(closeSz).mul(side);
      const frac = closeSz.div(p.szi.abs());
      const marginRel = p.margin.mul(frac);
      p.margin = p.margin.sub(marginRel);
      p.szi = p.szi.add(isBuy ? closeSz : closeSz.neg());
      this.collateral = this.collateral.add(marginRel).add(closedPnl);
      dir = side > 0 ? "Close Long" : "Close Short";
    }
    this.collateral = this.collateral.sub(fee);
    this.pos[asset] = p;
    if (p.szi.isZero()) {
      delete this.pos[asset];
      this.triggers = this.triggers.filter((t) => t.asset !== asset);
    }
    this.fills.push({
      oid: oid ?? this.oid++,
      asset,
      sz: sz.toString(),
      px: px.toString(),
      closedPnl: closedPnl.toString(),
      fee: fee.toString(),
      dir,
      time: this.now,
      tid: this.tid++,
    });
    void label;
  }

  /** Move a price; fire triggers, then liquidations. */
  setPrice(asset: string, px: Decimal.Value) {
    const p = D(px);
    this.marks[asset] = p;
    for (const t of [...this.triggers].filter((x) => x.asset === asset)) {
      const pos = this.pos[asset];
      if (!pos) break;
      const long = pos.szi.gt(0);
      const tpx = D(t.triggerPx);
      const hit =
        t.tpsl === "sl" ? (long ? p.lte(tpx) : p.gte(tpx)) : long ? p.gte(tpx) : p.lte(tpx);
      if (!hit) continue;
      this.triggers = this.triggers.filter((x) => x.oid !== t.oid);
      const sz = Decimal.min(D(t.sz), pos.szi.abs());
      this.fill(asset, t.isBuy, sz, tpx, t.label, t.oid);
    }
    const liq = this.liqPx(asset);
    const pos = this.pos[asset];
    if (pos && liq) {
      const long = pos.szi.gt(0);
      if (long ? p.lte(liq) : p.gte(liq)) {
        this.liquidations.push(asset);
        const lost = pos.margin;
        void lost;
        this.fills.push({ oid: this.oid++, asset, sz: pos.szi.abs().toString(), px: liq.toString(), closedPnl: pos.margin.neg().toString(), fee: "0", dir: "Liquidated Isolated", time: this.now, tid: this.tid++ });
        delete this.pos[asset];
        this.triggers = this.triggers.filter((t) => t.asset !== asset);
      }
    }
  }

  apply(a: Action, labels: Record<number, { asset: string; label: TriggerKind }>) {
    switch (a.kind) {
      case "set_leverage":
        this.lev[a.asset] = a.leverage;
        break;
      case "order": {
        const px = this.marks[a.asset] ?? D(a.markPx);
        let sz = D(a.sz);
        if (a.reduceOnly) sz = Decimal.min(sz, this.pos[a.asset]?.szi.abs() ?? D(0));
        if (sz.gt(0)) this.fill(a.asset, a.isBuy, sz, px);
        break;
      }
      case "spot_order": {
        const px = this.spotMarks[a.token] ?? D(a.markPx);
        const sz = D(a.sz);
        const usdc = this.spot.USDC ?? D(0);
        if (a.isBuy) {
          this.spot.USDC = usdc.sub(sz.mul(px));
          this.spot[a.token] = (this.spot[a.token] ?? D(0)).add(sz);
        } else {
          this.spot.USDC = usdc.add(sz.mul(px));
          this.spot[a.token] = (this.spot[a.token] ?? D(0)).sub(sz);
        }
        break;
      }
      case "replace_triggers": {
        for (const t of a.place) {
          const oid = this.oid++;
          this.triggers.push({ oid, asset: a.asset, tpsl: t.tpsl, triggerPx: t.triggerPx, sz: t.sz, isBuy: t.isBuy, label: t.label });
          labels[oid] = { asset: a.asset, label: t.label };
        }
        this.triggers = this.triggers.filter((t) => !a.cancelOids.includes(t.oid));
        break;
      }
      case "cancel_triggers":
        this.triggers = this.triggers.filter((t) => !a.oids.includes(t.oid));
        break;
      case "add_margin": {
        const usd = D(a.usd);
        const p = this.pos[a.asset];
        if (p && this.collateral.gte(usd)) {
          p.margin = p.margin.add(usd);
          this.collateral = this.collateral.sub(usd);
        }
        break;
      }
      default:
        break;
    }
  }

  legs(): LegState[] {
    return Object.entries(this.pos).map(([asset, p]) => {
      const mark = this.marks[asset] ?? p.entry;
      return {
        asset,
        szi: p.szi.toString(),
        entryPx: p.entry.toString(),
        leverage: p.leverage,
        liquidationPx: this.liqPx(asset)?.toString() ?? null,
        unrealizedPnl: mark.sub(p.entry).mul(p.szi).toString(),
        marginUsed: p.margin.toString(),
      };
    });
  }

  accountValue(): Decimal {
    return this.legs().reduce((a, l) => a.add(l.marginUsed).add(l.unrealizedPnl), this.collateral);
  }
}

export interface SimMarket {
  state: MarketState;
  ex: SimExchange;
  labels: Record<number, { asset: string; label: TriggerKind }>;
  fillCursor: number;
  events: { type: string; message: string; at: number }[];
  profitQueue: Decimal;
}

export function applyPatch(m: MarketState, status: MarketState["status"], p: StatusPatch = {}) {
  m.status = status;
  if (p.direction !== undefined) m.direction = p.direction;
  if (p.cooldownUntil !== undefined) m.cooldownUntil = p.cooldownUntil;
  if (p.consecutiveStops !== undefined) m.consecutiveStops = p.consecutiveStops;
  if (p.stoppedAt !== undefined) m.stoppedAt = p.stoppedAt;
  if (p.lastFlipAt !== undefined) m.lastFlipAt = p.lastFlipAt;
  if (p.lastAddAt !== undefined) m.lastAddAt = p.lastAddAt;
  if (p.tpStages !== undefined) m.tpStages = { ...p.tpStages };
}

/** One job tick against the simulated exchange: accounting → up to 3 decide/execute passes. */
export function simTick(sim: SimMarket, g: GlobalState, now: number): Action[] {
  const m = sim.state;
  sim.ex.now = now;
  m.now = now;
  const newFills = sim.ex.fills.slice(sim.fillCursor);
  sim.fillCursor = sim.ex.fills.length;
  const openAfter = new Set(sim.ex.legs().map((l) => l.asset));
  const acc = accountFills(newFills, sim.labels, m.tpStages, openAfter);
  m.tpStages = acc.tpStages;
  m.closed = acc.closed;
  sim.profitQueue = sim.profitQueue.add(acc.profit);
  for (const h of acc.tpHits) sim.events.push({ type: "tp_hit", message: `${h.asset} TP${h.stage}`, at: now });
  const all: Action[] = [];
  for (let pass = 0; pass < 3; pass++) {
    m.legs = sim.ex.legs();
    m.triggers = sim.ex.triggers.map(({ label: _l, ...t }) => t);
    m.marks = Object.fromEntries(Object.entries(sim.ex.marks).map(([k, v]) => [k, v.toString()]));
    m.spotMarks = Object.fromEntries(Object.entries(sim.ex.spotMarks).map(([k, v]) => [k, v.toString()]));
    m.account = {
      accountValue: sim.ex.accountValue().toString(),
      withdrawable: sim.ex.collateral.toString(),
      spot: Object.fromEntries(Object.entries(sim.ex.spot).map(([k, v]) => [k, v.toString()])),
    };
    m.reservedUsd = sim.profitQueue.toString();
    const { actions } = decide(m, g);
    if (!actions.length) break;
    all.push(...actions);
    for (const a of actions) {
      if (a.kind === "set_status") applyPatch(m, a.status, a.patch);
      else if (a.kind === "event") sim.events.push({ type: a.type, message: a.message, at: now });
      else sim.ex.apply(a, sim.labels);
    }
    m.closed = [];
    if (!actions.some((a) => a.kind === "order" || a.kind === "spot_order" || a.kind === "set_status")) break;
  }
  return all;
}

export function newSimMarket(state: MarketState, ex: SimExchange): SimMarket {
  return { state, ex, labels: {}, fillCursor: 0, events: [], profitQueue: D(0) };
}

export { legSide };
