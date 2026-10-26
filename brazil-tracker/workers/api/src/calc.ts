// Arithmetic from SPEC §6. Pure functions, covered by tests.

/** TSE numbers come as strings with a comma decimal separator ("48,728274574"). */
export function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || v.trim() === '') return 0;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Share of the remaining vote each candidate needs to reach 50% of valid votes.
 * c = counted share (0..1), f = Flavio's share of counted valid votes (0..1).
 * needF = (0.5 - c*f) / (1 - c), needL = (0.5 - c*(1-f)) / (1 - c).
 * Returns percentages, or nulls when everything is counted (c >= 1).
 * Values may fall outside 0..100: >100 means unreachable, <0 means already secured.
 */
export function breakEven(c: number, f: number): { lulaNeedsPctOfRemaining: number | null; flavioNeedsPctOfRemaining: number | null } {
  if (!(c < 1)) return { lulaNeedsPctOfRemaining: null, flavioNeedsPctOfRemaining: null };
  const cc = Math.max(0, c);
  const l = 1 - f;
  const needF = (0.5 - cc * f) / (1 - cc);
  const needL = (0.5 - cc * l) / (1 - cc);
  return { lulaNeedsPctOfRemaining: round(needL * 100, 2), flavioNeedsPctOfRemaining: round(needF * 100, 2) };
}

/**
 * Remaining valid votes estimate: assumes uncounted sections have the same valid-votes-per-elector
 * ratio as counted ones. Returns null when there is not enough data.
 */
export function remainingValidVotes(electorate: number, electorateCounted: number, validVotes: number): number | null {
  if (!(electorate > 0) || !(electorateCounted > 0) || !(validVotes > 0)) return null;
  const ratio = validVotes / electorateCounted;
  return Math.max(0, Math.round((electorate - electorateCounted) * ratio));
}

/** Converts TSE "dd/mm/yyyy" + "HH:MM:SS" (Brasília time, UTC-3) to ISO 8601. */
export function tseDateTime(d: unknown, h: unknown): string | null {
  if (typeof d !== 'string' || typeof h !== 'string') return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim());
  const t = /^(\d{2}):(\d{2}):(\d{2})$/.exec(h.trim());
  if (!m || !t) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${t[1]}:${t[2]}:${t[3]}-03:00`;
}

export interface PriceChangeInput {
  t: number; // epoch ms
  px: number;
}

/** Change of `current` vs the point nearest to (now - minutes). Requires a point within tolerance. */
export function priceChange(points: PriceChangeInput[], current: number, now: number, minutes: number, toleranceMs = 90_000) {
  const target = now - minutes * 60_000;
  let best: PriceChangeInput | null = null;
  for (const p of points) {
    if (!best || Math.abs(p.t - target) < Math.abs(best.t - target)) best = p;
  }
  if (!best || Math.abs(best.t - target) > toleranceMs || !(best.px > 0)) return null;
  const abs = current - best.px;
  return { abs: round(abs, 4), pct: round((abs / best.px) * 100, 2), from: best.px };
}
