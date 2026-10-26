import { priceChange } from './calc';
import type { Candle, PriceQuote, PriceSource } from './price';
import type { PriceResponse } from './types';

export interface MarkPoint {
  t: number;
  mark: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Assembles /api/price from a quote, ~1m candles and our own mark history. */
export function buildPrice(args: {
  source: Pick<PriceSource, 'name' | 'symbol' | 'historyBasis'>;
  quote: PriceQuote;
  quoteAt: number;
  candles: Candle[];
  marks: MarkPoint[];
  markLastChangedAt: number | null;
  now: number;
  stale: boolean;
  error?: string;
}): PriceResponse {
  const { quote, candles, marks, now } = args;
  const mark = quote.markPx;
  let change: PriceResponse['change'] = { m5: null, m15: null, m60: null };
  let basis: PriceResponse['changeBasis'] = 'none';
  if (mark !== null) {
    const markPts = marks.map((m) => ({ t: m.t, px: m.mark }));
    const fromMarks = { m5: priceChange(markPts, mark, now, 5), m15: priceChange(markPts, mark, now, 15), m60: priceChange(markPts, mark, now, 60) };
    if (fromMarks.m5 || fromMarks.m15 || fromMarks.m60) {
      change = fromMarks;
      basis = 'mark-history';
    }
    // Fill gaps (e.g. right after a cold start) from candles; candle t is the minute open, use close time.
    const candlePts = candles.map((c) => ({ t: c.t + 60_000, px: c.close }));
    const fromCandles = { m5: priceChange(candlePts, mark, now, 5), m15: priceChange(candlePts, mark, now, 15), m60: priceChange(candlePts, mark, now, 60) };
    if (basis === 'none' && (fromCandles.m5 || fromCandles.m15 || fromCandles.m60)) {
      change = fromCandles;
      basis = 'candles';
    } else if (basis === 'mark-history') {
      change = { m5: change.m5 ?? fromCandles.m5, m15: change.m15 ?? fromCandles.m15, m60: change.m60 ?? fromCandles.m60 };
    }
  }
  const since = now - 2 * 3600_000;
  const history = candles.filter((c) => c.t >= since).map((c) => ({ t: iso(c.t), px: c.close }));
  return {
    fetchedAt: iso(args.quoteAt),
    stale: args.stale,
    ageSeconds: Math.max(0, Math.round((now - args.quoteAt) / 1000)),
    ...(args.error ? { error: args.error } : {}),
    source: args.source.name,
    symbol: args.source.symbol,
    delayed: quote.delayed,
    note: quote.note,
    markPx: quote.markPx,
    oraclePx: quote.oraclePx,
    midPx: quote.midPx,
    prevDayPx: quote.prevDayPx,
    fundingRate: quote.fundingRate,
    change,
    changeBasis: basis,
    markLastChangedAt: args.markLastChangedAt !== null ? iso(args.markLastChangedAt) : null,
    markUnchangedSeconds: args.markLastChangedAt !== null ? Math.max(0, Math.round((now - args.markLastChangedAt) / 1000)) : null,
    history,
    historyBasis: args.source.historyBasis,
  };
}
