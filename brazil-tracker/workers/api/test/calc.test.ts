import { describe, expect, it } from 'vitest';
import { breakEven, num, priceChange, remainingValidVotes, tseDateTime } from '../src/calc';

describe('breakEven (SPEC §6)', () => {
  it('matches the reference example c=0.4387, f=0.5014', () => {
    const r = breakEven(0.4387, 0.5014);
    expect(r.lulaNeedsPctOfRemaining).toBeCloseTo(50.11, 2);
    expect(r.flavioNeedsPctOfRemaining).toBeCloseTo(49.89, 2);
  });

  it('the two needs always add up to 100% of the remainder', () => {
    for (const [c, f] of [[0.1, 0.3], [0.5, 0.5], [0.95, 0.48], [0.999, 0.6]]) {
      const r = breakEven(c, f);
      expect(r.lulaNeedsPctOfRemaining! + r.flavioNeedsPctOfRemaining!).toBeCloseTo(100, 6);
    }
  });

  it('nothing counted means 50% each', () => {
    expect(breakEven(0, 0.7)).toEqual({ lulaNeedsPctOfRemaining: 50, flavioNeedsPctOfRemaining: 50 });
  });

  it('is hidden (null) when everything is counted', () => {
    expect(breakEven(1, 0.49)).toEqual({ lulaNeedsPctOfRemaining: null, flavioNeedsPctOfRemaining: null });
    expect(breakEven(1.01, 0.49).lulaNeedsPctOfRemaining).toBeNull();
  });

  it('can go above 100% (unreachable) and below 0% (already secured)', () => {
    const r = breakEven(0.98, 0.45);
    expect(r.flavioNeedsPctOfRemaining!).toBeGreaterThan(100);
    expect(r.lulaNeedsPctOfRemaining!).toBeLessThan(0);
  });
});

describe('helpers', () => {
  it('parses TSE comma decimals and integer strings', () => {
    expect(num('48,728274574')).toBeCloseTo(48.728274574, 9);
    expect(num('158745502')).toBe(158745502);
    expect(num('')).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num(12.5)).toBe(12.5);
  });

  it('converts TSE Brasília date/time to ISO with offset', () => {
    expect(tseDateTime('25/10/2026', '20:39:00')).toBe('2026-10-25T20:39:00-03:00');
    expect(tseDateTime('', '20:39:00')).toBeNull();
    expect(tseDateTime(undefined, undefined)).toBeNull();
  });

  it('estimates remaining valid votes from the counted ratio', () => {
    expect(remainingValidVotes(1000, 800, 640)).toBe(160);
    expect(remainingValidVotes(1000, 0, 0)).toBeNull();
    expect(remainingValidVotes(1000, 1000, 800)).toBe(0);
  });

  it('computes price change vs the nearest point within tolerance', () => {
    const now = 1_000_000_000;
    const pts = [
      { t: now - 60 * 60_000, px: 40 },
      { t: now - 15 * 60_000, px: 42 },
      { t: now - 5 * 60_000 - 10_000, px: 41 },
    ];
    expect(priceChange(pts, 39, now, 5)).toEqual({ abs: -2, pct: -4.88, from: 41 });
    expect(priceChange(pts, 39, now, 60)).toEqual({ abs: -1, pct: -2.5, from: 40 });
    expect(priceChange(pts, 39, now, 30)).toBeNull();
  });
});
