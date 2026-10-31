import Decimal from "decimal.js";
import { HlInfo, HlTrader, HlTreasury, type HlNetwork } from "@bias/hl";
import { hlAgentAccount, hlMasterAccount } from "@bias/keys";
import type { Action, AssetInfo } from "@bias/engine";
import type { Market } from "@bias/db";
import type { ExecResult, HlTreasuryOps, Venue, VenueState } from "./venue";

type Hex = `0x${string}`;

function toVenueState(s: Awaited<ReturnType<HlInfo["accountState"]>>): VenueState {
  return {
    account: {
      accountValue: s.accountValue,
      withdrawable: s.withdrawable,
      spot: Object.fromEntries(Object.entries(s.spot).map(([k, v]) => [k, v.total])),
    },
    legs: s.legs
      .filter((l) => !new Decimal(l.szi).isZero())
      .map((l) => ({
        asset: l.asset,
        szi: l.szi,
        entryPx: l.entryPx,
        leverage: l.leverage,
        liquidationPx: l.liquidationPx,
        unrealizedPnl: l.unrealizedPnl,
        marginUsed: l.marginUsed,
      })),
    triggers: s.triggers.map((t) => ({ oid: t.oid, asset: t.asset, tpsl: t.tpsl, triggerPx: t.triggerPx, sz: t.sz, isBuy: t.isBuy })),
  };
}

/** Real Hyperliquid venue. Trades with the AGENT key (cannot withdraw). */
export class HlVenue implements Venue {
  readonly info: HlInfo;
  private traders = new Map<string, HlTrader>();
  constructor(
    readonly network: HlNetwork,
    private agentSeed: string,
    private slippageBps: number,
  ) {
    this.info = new HlInfo(network);
  }

  private trader(m: Market): HlTrader {
    let t = this.traders.get(m.id);
    if (!t) {
      const agent = hlAgentAccount(this.agentSeed, m.idx);
      if (agent.address.toLowerCase() !== m.hlAgent.toLowerCase()) throw new Error(`agent key mismatch for ${m.id}`);
      t = new HlTrader({ network: this.network, agentPrivateKey: agent.privateKey as Hex, accountAddress: m.hlAccount as Hex, info: this.info });
      this.traders.set(m.id, t);
    }
    return t;
  }

  marks() {
    return this.info.allMids();
  }

  async assets(): Promise<Record<string, AssetInfo>> {
    const meta = await this.info.perpMeta();
    return Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { szDecimals: v.szDecimals, maxLeverage: v.maxLeverage }]));
  }

  async spotInfo() {
    const [pairs, mids] = await Promise.all([this.info.spotPairs(), this.info.allMids()]);
    const assets: Record<string, AssetInfo> = {};
    const marks: Record<string, string> = {};
    for (const [token, p] of Object.entries(pairs)) {
      assets[token] = { szDecimals: p.szDecimals, maxLeverage: 1 };
      const mid = mids[p.pairName];
      if (mid) marks[token] = mid;
    }
    return { assets, marks };
  }

  async state(m: Market): Promise<VenueState> {
    return toVenueState(await this.info.accountState(m.hlAccount));
  }

  fills(m: Market, sinceMs: number) {
    return this.info.fills(m.hlAccount, sinceMs);
  }

  async fundingWindows(asset: string, now: number): Promise<number[]> {
    const h = await this.info.fundingHistory(asset, now - 16 * 3_600_000);
    const w = (from: number, to: number) => {
      const xs = h.filter((x) => x.time >= from && x.time < to).map((x) => Number(x.fundingRate));
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    };
    return [w(now - 8 * 3_600_000, now + 1), w(now - 16 * 3_600_000, now - 8 * 3_600_000)];
  }

  async execute(m: Market, a: Action): Promise<ExecResult> {
    const t = this.trader(m);
    switch (a.kind) {
      case "set_leverage":
        await t.setIsolatedLeverage(a.asset, a.leverage);
        return { ok: true, note: `${a.asset} isolated ${a.leverage}×` };
      case "order": {
        const r = await t.marketOrder({ asset: a.asset, isBuy: a.isBuy, sz: a.sz, reduceOnly: a.reduceOnly, markPx: a.markPx, slippageBps: this.slippageBps });
        return { ok: r.status !== "unfilled", note: `${a.reason} ${a.isBuy ? "buy" : "sell"} ${r.filledSz}/${a.sz} ${a.asset} @ ${r.avgPx ?? "—"}`, filledSz: r.filledSz };
      }
      case "spot_order": {
        const r = await t.spotMarketOrder({ token: a.token, isBuy: a.isBuy, sz: a.sz, markPx: a.markPx, slippageBps: this.slippageBps });
        return { ok: new Decimal(r.filledSz).gt(0), note: `spot ${a.isBuy ? "buy" : "sell"} ${r.filledSz} ${a.token}`, filledSz: r.filledSz };
      }
      case "replace_triggers": {
        // place the new set first, then cancel the old: the leg is never without a stop
        const oids = await t.placeTriggers(a.asset, a.place.map((p) => ({ tpsl: p.tpsl, isBuy: p.isBuy, sz: p.sz, triggerPx: p.triggerPx })));
        if (a.cancelOids.length) await t.cancel(a.asset, a.cancelOids).catch(() => undefined);
        return {
          ok: true,
          note: `${a.asset}: ${a.place.map((p) => `${p.label}@${Number(p.triggerPx).toPrecision(6)}`).join(" ")}`,
          placed: a.place.map((p, i) => ({ oid: oids[i]!, asset: a.asset, label: p.label, tpsl: p.tpsl, triggerPx: p.triggerPx, sz: p.sz })),
        };
      }
      case "cancel_triggers":
        await t.cancel(a.asset, a.oids).catch(() => undefined);
        return { ok: true, note: `cancelled ${a.oids.length} trigger(s) on ${a.asset}` };
      case "add_margin":
        await t.addIsolatedMargin(a.asset, a.usd, a.isLong);
        return { ok: true, note: `${a.asset}: +$${a.usd} margin` };
      default:
        return { ok: true, note: "" };
    }
  }
}

/** Master-key operations (buyback workflow only). The master signs for its own account. */
export class HlMasterOps implements HlTreasuryOps {
  readonly info: HlInfo;
  constructor(
    readonly network: HlNetwork,
    private masterSeed: string,
    private slippageBps: number,
  ) {
    this.info = new HlInfo(network);
  }
  private keys(m: Market) {
    const k = hlMasterAccount(this.masterSeed, m.idx);
    if (k.address.toLowerCase() !== m.hlAccount.toLowerCase()) throw new Error(`master key mismatch for ${m.id}`);
    return k;
  }
  private trader(m: Market) {
    const k = this.keys(m);
    return new HlTrader({ network: this.network, agentPrivateKey: k.privateKey as Hex, accountAddress: k.address as Hex, info: this.info });
  }
  private treasury(m: Market) {
    return new HlTreasury({ network: this.network, masterPrivateKey: this.keys(m).privateKey as Hex, info: this.info });
  }
  exists(m: Market) {
    return this.info.userExists(m.hlAccount);
  }
  async state(m: Market) {
    return toVenueState(await this.info.accountState(m.hlAccount));
  }
  private async spotMark(token: string) {
    const [p, mids] = await Promise.all([this.info.spotPair(token), this.info.allMids()]);
    const mid = mids[p.pairName];
    if (!mid) throw new Error(`no spot mid for ${token}`);
    return mid;
  }
  async sellSpot(m: Market, token: string, sz: string) {
    const mark = await this.spotMark(token);
    const r = await this.trader(m).spotMarketOrder({ token, isBuy: false, sz, markPx: mark, slippageBps: this.slippageBps });
    return { usdc: new Decimal(r.filledSz).mul(r.avgPx ?? mark).toFixed(6) };
  }
  async buySpot(m: Market, token: string, usd: string) {
    const mark = await this.spotMark(token);
    const pair = await this.info.spotPair(token);
    const sz = new Decimal(usd).div(mark).mul(1 - this.slippageBps / 10_000).toDecimalPlaces(pair.szDecimals, Decimal.ROUND_DOWN);
    const r = await this.trader(m).spotMarketOrder({ token, isBuy: true, sz: sz.toString(), markPx: mark, slippageBps: this.slippageBps });
    return { sz: r.filledSz };
  }
  usdTransfer(m: Market, usd: string, toPerp: boolean) {
    return this.treasury(m).usdClassTransfer(usd, toPerp);
  }
  approveAgent(m: Market) {
    return this.treasury(m).approveAgent(m.hlAgent as Hex, `bias-${m.idx}`);
  }
  spotSend(m: Market, destination: string, token: string, amount: string) {
    return this.treasury(m).spotSend(destination, token, amount);
  }
}
