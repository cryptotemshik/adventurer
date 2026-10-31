import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { D } from "./format";
import { wrap } from "./errors";
import {
  parseAccountState,
  parseFills,
  parsePerpMeta,
  parseSpotPairs,
  type RawClearinghouse,
  type RawFill,
  type RawOpenOrder,
} from "./parse";
import type { HlAccountState, HlAssetMeta, HlFill, HlNetwork, HlSpotPair, Hex } from "./types";

const META_TTL_MS = 10 * 60_000;

export function makeTransport(network: HlNetwork): HttpTransport {
  return new HttpTransport({ isTestnet: network === "testnet", timeout: 15_000 });
}

/** Read-only Hyperliquid Info API wrapper (public, no keys). */
export class HlInfo {
  readonly client: InfoClient;
  private perpCache?: { at: number; p: Promise<Record<string, HlAssetMeta>> };
  private spotCache?: { at: number; p: Promise<Record<string, HlSpotPair>> };

  constructor(readonly network: HlNetwork) {
    this.client = new InfoClient({ transport: makeTransport(network) });
  }

  allMids(): Promise<Record<string, string>> {
    return wrap("allMids", undefined, async () => (await this.client.allMids()) as Record<string, string>);
  }

  perpMeta(): Promise<Record<string, HlAssetMeta>> {
    const now = Date.now();
    if (!this.perpCache || now - this.perpCache.at > META_TTL_MS) {
      const p = wrap("meta", undefined, async () => parsePerpMeta(await this.client.meta()));
      p.catch(() => (this.perpCache = undefined));
      this.perpCache = { at: now, p };
    }
    return this.perpCache.p;
  }

  async asset(name: string): Promise<HlAssetMeta> {
    const meta = (await this.perpMeta())[name];
    if (!meta) throw new Error(`unknown Hyperliquid perp asset: ${name}`);
    return meta;
  }

  spotPairs(): Promise<Record<string, HlSpotPair>> {
    const now = Date.now();
    if (!this.spotCache || now - this.spotCache.at > META_TTL_MS) {
      const p = wrap("spotMeta", undefined, async () => parseSpotPairs(await this.client.spotMeta()));
      p.catch(() => (this.spotCache = undefined));
      this.spotCache = { at: now, p };
    }
    return this.spotCache.p;
  }

  async spotPair(token: string): Promise<HlSpotPair> {
    const pair = (await this.spotPairs())[token];
    if (!pair) throw new Error(`no USDC spot pair for token: ${token}`);
    return pair;
  }

  async accountState(user: string): Promise<HlAccountState> {
    const u = user as Hex;
    return wrap("accountState", undefined, async () => {
      const [ch, orders, spot] = await Promise.all([
        this.client.clearinghouseState({ user: u }),
        this.client.frontendOpenOrders({ user: u }),
        this.client.spotClearinghouseState({ user: u }),
      ]);
      return parseAccountState(ch as unknown as RawClearinghouse, orders as RawOpenOrder[], spot);
    });
  }

  async fills(user: string, sinceMs: number): Promise<HlFill[]> {
    return wrap("fills", undefined, async () => {
      const f = await this.client.userFillsByTime({ user: user as Hex, startTime: sinceMs });
      return parseFills(f as RawFill[]);
    });
  }

  async fundingHistory(asset: string, startMs: number): Promise<{ time: number; fundingRate: string }[]> {
    return wrap("fundingHistory", asset, async () => {
      const h = await this.client.fundingHistory({ coin: asset, startTime: startMs });
      return h.map((x) => ({ time: x.time, fundingRate: x.fundingRate }));
    });
  }

  /** Open interest in USD per perp (OI × mark). Not money accounting — used for allowlist ranking. */
  async openInterestUsd(): Promise<Record<string, number>> {
    return wrap("metaAndAssetCtxs", undefined, async () => {
      const [meta, ctxs] = await this.client.metaAndAssetCtxs();
      const out: Record<string, number> = {};
      meta.universe.forEach((u, i) => {
        const c = ctxs[i];
        if (!c || u.isDelisted) return;
        out[u.name] = new D(c.openInterest).mul(c.markPx ?? "0").toNumber();
      });
      return out;
    });
  }

  /** False until the address has interacted with Hyperliquid (e.g. first deposit). */
  async userExists(user: string): Promise<boolean> {
    return wrap("userRole", undefined, async () => {
      const r = await this.client.userRole({ user: user as Hex });
      return r.role !== "missing";
    });
  }
}
