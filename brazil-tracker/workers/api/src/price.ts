// Price sources for the EWZ block. Selected by PRICE_SOURCE / PRICE_SYMBOL in wrangler.toml.

export interface PriceQuote {
  markPx: number | null;
  oraclePx: number | null;
  midPx: number | null;
  prevDayPx: number | null;
  fundingRate: number | null;
  delayed: boolean;
  note: string | null;
}

export interface Candle {
  t: number; // open time, epoch ms
  close: number;
}

export interface PriceSource {
  readonly name: string;
  readonly symbol: string;
  /** Short label for what the history line is made of. */
  readonly historyBasis: string;
  quote(fetcher: typeof fetch): Promise<PriceQuote>;
  /** ~1-minute closes for the last `minutes` minutes. */
  candles(fetcher: typeof fetch, minutes: number, now: number): Promise<Candle[]>;
}

const UA = { 'user-agent': 'brazil-tracker/1.0' };

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Hyperliquid perps, including HIP-3 builder-deployed DEXs. Symbol format "<dex>:<COIN>" (e.g. "xyz:EWZ")
 * or a plain coin for the main DEX. Info API: POST https://api.hyperliquid.xyz/info.
 */
export class HyperliquidSource implements PriceSource {
  readonly name = 'hyperliquid';
  readonly historyBasis = 'цены сделок, свечи 1 мин (Hyperliquid)';
  constructor(readonly symbol: string, private readonly apiUrl = 'https://api.hyperliquid.xyz/info') {}

  get dex(): string {
    const i = this.symbol.indexOf(':');
    return i > 0 ? this.symbol.slice(0, i) : '';
  }

  private async post(fetcher: typeof fetch, body: unknown): Promise<any> {
    const res = await fetcher(this.apiUrl, { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Hyperliquid HTTP ${res.status}`);
    return res.json();
  }

  async quote(fetcher: typeof fetch): Promise<PriceQuote> {
    const data = await this.post(fetcher, { type: 'metaAndAssetCtxs', ...(this.dex ? { dex: this.dex } : {}) });
    return parseHyperliquidCtx(data, this.symbol);
  }

  async candles(fetcher: typeof fetch, minutes: number, now: number): Promise<Candle[]> {
    const data = await this.post(fetcher, {
      type: 'candleSnapshot',
      req: { coin: this.symbol, interval: '1m', startTime: now - minutes * 60_000, endTime: now },
    });
    if (!Array.isArray(data)) throw new Error('Hyperliquid candles: unexpected shape');
    return data.map((c: any) => ({ t: Number(c.t), close: Number(c.c) })).filter((c) => Number.isFinite(c.t) && c.close > 0);
  }
}

export function parseHyperliquidCtx(data: any, symbol: string): PriceQuote {
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[0]?.universe) || !Array.isArray(data[1])) {
    throw new Error('Hyperliquid: unexpected metaAndAssetCtxs shape');
  }
  const idx = data[0].universe.findIndex((a: any) => a?.name === symbol);
  if (idx < 0) throw new Error(`Hyperliquid: symbol ${symbol} not listed`);
  const ctx = data[1][idx] ?? {};
  const markPx = toNum(ctx.markPx);
  if (markPx === null) throw new Error('Hyperliquid: markPx missing');
  return {
    markPx,
    oraclePx: toNum(ctx.oraclePx),
    midPx: toNum(ctx.midPx),
    prevDayPx: toNum(ctx.prevDayPx),
    fundingRate: toNum(ctx.funding),
    delayed: false,
    note: null,
  };
}

/**
 * Fallback: delayed public quote of the EWZ ETF itself (Yahoo Finance chart endpoint, unofficial).
 * Outside NYSE hours the price does not move; the UI says so.
 */
export class YahooSource implements PriceSource {
  readonly name = 'yahoo';
  readonly historyBasis = 'котировка ETF с задержкой, 5 мин (Yahoo Finance)';
  constructor(readonly symbol: string) {}

  private async chart(fetcher: typeof fetch, range: string, interval: string): Promise<any> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(this.symbol)}?range=${range}&interval=${interval}`;
    const res = await fetcher(url, { headers: UA });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json: any = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) throw new Error('Yahoo: unexpected shape');
    return r;
  }

  async quote(fetcher: typeof fetch): Promise<PriceQuote> {
    const r = await this.chart(fetcher, '1d', '5m');
    const px = toNum(r.meta?.regularMarketPrice);
    return {
      markPx: px,
      oraclePx: null,
      midPx: null,
      prevDayPx: toNum(r.meta?.chartPreviousClose ?? r.meta?.previousClose),
      fundingRate: null,
      delayed: true,
      note: 'Котировка ETF с задержкой; вне часов NYSE рынок закрыт и цена не меняется',
    };
  }

  async candles(fetcher: typeof fetch, minutes: number, now: number): Promise<Candle[]> {
    const r = await this.chart(fetcher, '5d', '5m');
    const ts: number[] = r.timestamp ?? [];
    const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    return ts
      .map((t, i) => ({ t: t * 1000, close: closes[i] ?? NaN }))
      .filter((c) => c.close > 0 && c.t >= now - minutes * 60_000);
  }
}

export function makePriceSource(name: string | undefined, symbol: string | undefined): PriceSource {
  switch ((name ?? 'hyperliquid').toLowerCase()) {
    case 'yahoo':
      return new YahooSource(symbol || 'EWZ');
    case 'hyperliquid':
    default:
      return new HyperliquidSource(symbol || 'xyz:EWZ');
  }
}
