import { describe, expect, it } from 'vitest';
import { evaluateAlerts, initialAlertState } from '../src/alerts';
import { HyperliquidSource, parseHyperliquidCtx } from '../src/price';
import { buildPrice } from '../src/pricebuild';
import type { Summary } from '../src/types';
import hl from '../../../fixtures/hl-metaAndAssetCtxs-xyz.json';

describe('Hyperliquid parsing', () => {
  it('reads mark/oracle for xyz:EWZ from metaAndAssetCtxs', () => {
    const q = parseHyperliquidCtx(hl, 'xyz:EWZ');
    expect(q.markPx).toBe(40.456);
    expect(q.oraclePx).toBe(41.1);
    expect(q.delayed).toBe(false);
  });

  it('fails loudly for unknown symbols and bad shapes', () => {
    expect(() => parseHyperliquidCtx(hl, 'xyz:NOPE')).toThrow(/not listed/);
    expect(() => parseHyperliquidCtx({}, 'xyz:EWZ')).toThrow(/shape/);
  });

  it('derives the dex from the symbol and posts it', async () => {
    const src = new HyperliquidSource('xyz:EWZ');
    expect(src.dex).toBe('xyz');
    let body: any;
    const fake = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(hl));
    }) as unknown as typeof fetch;
    await src.quote(fake);
    expect(body).toEqual({ type: 'metaAndAssetCtxs', dex: 'xyz' });
  });

  it('surfaces HTTP errors', async () => {
    const src = new HyperliquidSource('xyz:EWZ');
    const fake = (async () => new Response('x', { status: 502 })) as unknown as typeof fetch;
    await expect(src.quote(fake)).rejects.toThrow(/502/);
  });
});

describe('buildPrice', () => {
  const now = Date.parse('2026-10-26T00:10:00Z');
  const quote = { markPx: 34, oraclePx: 34.5, midPx: 34, prevDayPx: 45, fundingRate: 0, delayed: false, note: null };
  const source = { name: 'hyperliquid', symbol: 'xyz:EWZ', historyBasis: 'x' };
  const candles = Array.from({ length: 121 }, (_, i) => ({ t: now - (121 - i) * 60_000, close: 40 }));

  it('prefers own mark history, fills gaps from candles', () => {
    const marks = [{ t: now - 5 * 60_000, mark: 35 }];
    const p = buildPrice({ source, quote, quoteAt: now, candles, marks, markLastChangedAt: now - 120_000, now, stale: false });
    expect(p.changeBasis).toBe('mark-history');
    expect(p.change.m5).toEqual({ abs: -1, pct: -2.86, from: 35 });
    expect(p.change.m60?.from).toBe(40);
    expect(p.markUnchangedSeconds).toBe(120);
    expect(p.history.length).toBeLessThanOrEqual(121);
  });

  it('falls back to candles on a cold start', () => {
    const p = buildPrice({ source, quote, quoteAt: now - 7000, candles, marks: [], markLastChangedAt: null, now, stale: true, error: 'down' });
    expect(p.changeBasis).toBe('candles');
    expect(p.stale).toBe(true);
    expect(p.ageSeconds).toBe(7);
    expect(p.markUnchangedSeconds).toBeNull();
  });
});

function summary(over: Partial<Summary> & { lulaPct?: number }): Summary {
  const lulaPct = over.lulaPct ?? 51;
  return {
    fetchedAt: '',
    sourceUpdatedAt: 't1',
    generatedAt: null,
    stale: false,
    ageSeconds: 0,
    countedPct: 90,
    sections: { total: 1, counted: 1 },
    complete: false,
    mathematicallyDefined: false,
    winner: null,
    candidates: { lula: { votes: lulaPct * 1000, pct: lulaPct }, flavio: { votes: (100 - lulaPct) * 1000, pct: 100 - lulaPct } },
    marginVotes: Math.abs(2 * lulaPct - 100) * 1000,
    marginPp: Math.abs(2 * lulaPct - 100),
    leader: lulaPct > 50 ? 'lula' : lulaPct < 50 ? 'flavio' : 'tie',
    breakEven: { lulaNeedsPctOfRemaining: 0, flavioNeedsPctOfRemaining: 0 },
    electorate: 0,
    electorateCounted: 0,
    turnoutPct: null,
    validVotes: 0,
    blankVotes: 0,
    nullVotes: 0,
    remainingValidVotesEst: null,
    sourceUrl: '',
    ...over,
  };
}

describe('alerts', () => {
  const opts = { thresholdsPp: [0.5, 0.2, 0.1], staleAfterMs: 180_000, hysteresisPp: 0.05 };

  it('first observation sends nothing, leader change sends once', () => {
    let st = initialAlertState();
    let r = evaluateAlerts(st, summary({ lulaPct: 52 }), 0, opts);
    expect(r.messages).toEqual([]);
    st = r.next;
    r = evaluateAlerts(st, summary({ lulaPct: 48, sourceUpdatedAt: 't2' }), 1000, opts);
    expect(r.messages.some((m) => m.startsWith('Смена лидера: впереди Флавио'))).toBe(true);
    r = evaluateAlerts(r.next, summary({ lulaPct: 48, sourceUpdatedAt: 't3' }), 2000, opts);
    expect(r.messages).toEqual([]);
  });

  it('margin thresholds fire once each, with hysteresis', () => {
    let st = evaluateAlerts(initialAlertState(), summary({ lulaPct: 51 }), 0, opts).next;
    let r = evaluateAlerts(st, summary({ lulaPct: 50.2 }), 1, opts); // margin 0.4
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatch(/меньше 0.5 п.п./);
    r = evaluateAlerts(r.next, summary({ lulaPct: 50.04 }), 2, opts); // 0.08: crosses 0.2 and 0.1
    expect(r.messages).toHaveLength(2);
    r = evaluateAlerts(r.next, summary({ lulaPct: 50.04 }), 3, opts);
    expect(r.messages).toHaveLength(0);
    r = evaluateAlerts(r.next, summary({ lulaPct: 50.2 }), 4, opts); // 0.4 > 0.1+0.05, 0.2+0.05 → re-arm
    expect(r.next.thresholdsHit).toEqual([0.5]);
  });

  it('mathematically defined fires once', () => {
    const st = evaluateAlerts(initialAlertState(), summary({}), 0, opts).next;
    const r = evaluateAlerts(st, summary({ mathematicallyDefined: true, winner: 'lula' }), 1, opts);
    expect(r.messages.join()).toMatch(/математически определён: Лула/);
    expect(evaluateAlerts(r.next, summary({ mathematicallyDefined: true, winner: 'lula' }), 2, opts).messages).toEqual([]);
  });

  it('completion fires once', () => {
    const st = evaluateAlerts(initialAlertState(), summary({}), 0, opts).next;
    const r = evaluateAlerts(st, summary({ complete: true, winner: 'lula' }), 1, opts);
    expect(r.messages.join()).toMatch(/Подсчёт завершён. Избран: Лула/);
    expect(evaluateAlerts(r.next, summary({ complete: true, winner: 'lula' }), 2, opts).messages).toEqual([]);
  });

  it('data stop after 3 minutes, then recovery', () => {
    let r = evaluateAlerts(initialAlertState(), summary({ sourceUpdatedAt: 'a' }), 0, opts);
    r = evaluateAlerts(r.next, summary({ sourceUpdatedAt: 'a' }), 120_000, opts);
    expect(r.messages).toEqual([]);
    r = evaluateAlerts(r.next, null, 181_000, opts);
    expect(r.messages[0]).toMatch(/не обновлялись 3 мин \(источник недоступен\)/);
    r = evaluateAlerts(r.next, null, 240_000, opts);
    expect(r.messages).toEqual([]);
    r = evaluateAlerts(r.next, summary({ sourceUpdatedAt: 'b' }), 250_000, opts);
    expect(r.messages[0]).toMatch(/снова обновляются/);
  });
});
