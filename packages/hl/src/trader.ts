import { ExchangeClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { D, roundPrice, roundSize, slippagePrice, usdToNtli } from "./format";
import { HlError, isNoFillError, wrap } from "./errors";
import { HlInfo, makeTransport } from "./info";
import { parseMarketOrderStatus, type RawOrderStatus } from "./parse";
import type { HlNetwork, Hex, MarketOrderResult } from "./types";

/** Max slippage applied to the limit price of trigger *market* orders once triggered. */
export const TRIGGER_SLIPPAGE_BPS = 1000;

export interface TriggerSpec {
  tpsl: "tp" | "sl";
  isBuy: boolean;
  sz: string;
  triggerPx: string;
}

/**
 * Trading client. Signs with the market's AGENT (API wallet) key, acting for `accountAddress`.
 * Agents can trade but cannot withdraw or transfer.
 */
export class HlTrader {
  readonly exchange: ExchangeClient;
  readonly info: HlInfo;
  readonly accountAddress: Hex;
  readonly agentAddress: Hex;

  constructor(opts: { network: HlNetwork; agentPrivateKey: Hex; accountAddress: Hex; info?: HlInfo }) {
    const wallet = privateKeyToAccount(opts.agentPrivateKey);
    this.agentAddress = wallet.address;
    this.accountAddress = opts.accountAddress;
    this.info = opts.info ?? new HlInfo(opts.network);
    this.exchange = new ExchangeClient({ transport: makeTransport(opts.network), wallet });
  }

  async setIsolatedLeverage(asset: string, leverage: number): Promise<void> {
    const meta = await this.info.asset(asset);
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > meta.maxLeverage) {
      throw new HlError(`invalid leverage ${leverage} (max ${meta.maxLeverage})`, { action: "updateLeverage", asset });
    }
    await wrap("updateLeverage", asset, () =>
      this.exchange.updateLeverage({ asset: meta.assetId, isCross: false, leverage }),
    );
  }

  /** IOC limit at mark ± slippage. A no-liquidity IOC returns status "unfilled" instead of throwing. */
  async marketOrder(o: {
    asset: string;
    isBuy: boolean;
    sz: string;
    reduceOnly: boolean;
    markPx: string;
    slippageBps: number;
  }): Promise<MarketOrderResult> {
    const meta = await this.info.asset(o.asset);
    const sz = roundSize(o.sz, meta.szDecimals);
    if (new D(sz).isZero()) throw new HlError(`size ${o.sz} rounds to zero`, { action: "order", asset: o.asset });
    const p = slippagePrice(o.markPx, o.isBuy, o.slippageBps, meta.szDecimals);
    return this.submitIoc(meta.assetId, o.asset, o.isBuy, sz, p, o.reduceOnly);
  }

  async spotMarketOrder(o: {
    token: string;
    isBuy: boolean;
    sz: string;
    markPx: string;
    slippageBps: number;
  }): Promise<{ filledSz: string; avgPx: string | null }> {
    const pair = await this.info.spotPair(o.token);
    const sz = roundSize(o.sz, pair.szDecimals);
    if (new D(sz).isZero()) throw new HlError(`size ${o.sz} rounds to zero`, { action: "spotOrder", asset: o.token });
    const p = slippagePrice(o.markPx, o.isBuy, o.slippageBps, pair.szDecimals, true);
    const r = await this.submitIoc(pair.assetId, o.token, o.isBuy, sz, p, false);
    return { filledSz: r.filledSz, avgPx: r.avgPx };
  }

  private async submitIoc(
    assetId: number,
    label: string,
    isBuy: boolean,
    sz: string,
    p: string,
    reduceOnly: boolean,
  ): Promise<MarketOrderResult> {
    try {
      const res = await this.exchange.order({
        orders: [{ a: assetId, b: isBuy, p, s: sz, r: reduceOnly, t: { limit: { tif: "Ioc" } } }],
        grouping: "na",
      });
      return parseMarketOrderStatus(res.response.data.statuses[0] as RawOrderStatus, sz);
    } catch (e) {
      if (isNoFillError(e)) return { oid: null, filledSz: "0", avgPx: null, status: "unfilled" };
      const msg = e instanceof Error ? e.message : String(e);
      throw new HlError(msg, { action: "order", asset: label, response: (e as { response?: unknown }).response }, { cause: e });
    }
  }

  /** Reduce-only trigger-market orders (SL/TP). Returns the oids of the placed orders, in input order. */
  async placeTriggers(asset: string, orders: TriggerSpec[]): Promise<number[]> {
    if (orders.length === 0) return [];
    const meta = await this.info.asset(asset);
    const wire = orders.map((o) => {
      const s = roundSize(o.sz, meta.szDecimals);
      if (new D(s).isZero()) throw new HlError(`trigger size ${o.sz} rounds to zero`, { action: "trigger", asset });
      const triggerPx = roundPrice(o.triggerPx, meta.szDecimals);
      return {
        a: meta.assetId,
        b: o.isBuy,
        p: slippagePrice(triggerPx, o.isBuy, TRIGGER_SLIPPAGE_BPS, meta.szDecimals),
        s,
        r: true,
        t: { trigger: { isMarket: true, triggerPx, tpsl: o.tpsl } },
      };
    });
    const res = await wrap("trigger", asset, () => this.exchange.order({ orders: wire, grouping: "na" }));
    const statuses = res.response.data.statuses as RawOrderStatus[];
    const oids: (number | null)[] = statuses.map((s) =>
      typeof s === "object" && s && "resting" in s ? s.resting.oid : typeof s === "object" && s && "filled" in s ? s.filled.oid : null,
    );
    if (oids.some((x) => x === null)) {
      // Some HL versions answer "waitingForTrigger" without an oid — resolve from open orders.
      const state = await this.info.accountState(this.accountAddress);
      wire.forEach((w, i) => {
        if (oids[i] !== null) return;
        const match = state.triggers.find(
          (t) =>
            t.asset === asset &&
            t.isBuy === w.b &&
            t.tpsl === w.t.trigger.tpsl &&
            new D(t.triggerPx).eq(w.t.trigger.triggerPx) &&
            new D(t.sz).eq(w.s) &&
            !oids.includes(t.oid),
        );
        oids[i] = match ? match.oid : null;
      });
    }
    if (oids.some((x) => x === null)) {
      throw new HlError("trigger placed but oid could not be resolved", { action: "trigger", asset, response: res });
    }
    return oids as number[];
  }

  async cancel(asset: string, oids: number[]): Promise<void> {
    if (oids.length === 0) return;
    const meta = await this.info.asset(asset);
    await wrap("cancel", asset, () => this.exchange.cancel({ cancels: oids.map((o) => ({ a: meta.assetId, o })) }));
  }

  /** Add (positive) or remove (negative) isolated margin, in USD. */
  async addIsolatedMargin(asset: string, usd: string, isLong: boolean): Promise<void> {
    const meta = await this.info.asset(asset);
    const ntli = usdToNtli(usd);
    if (ntli === 0) return;
    await wrap("updateIsolatedMargin", asset, () =>
      this.exchange.updateIsolatedMargin({ asset: meta.assetId, isBuy: isLong, ntli }),
    );
  }
}
