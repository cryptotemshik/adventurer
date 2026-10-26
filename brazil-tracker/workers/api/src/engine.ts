// Builds API responses from TSE documents. Shared by the live Durable Object and the replay mode.
import { round } from './calc';
import {
  buildSummary,
  fileUrl,
  GRANDE_SP_WITHOUT_CAPITAL,
  parseUnified,
  SP_CAPITAL,
  spRegions,
  stateRow,
  unifiedPath,
  UFS,
  type Counts,
  type TseConfig,
} from './tse';
import type { SpResponse, StateRow, StatesResponse, Summary } from './types';

export interface DocResult {
  doc: unknown | null;
  /** epoch ms of the last successful fetch */
  fetchedAt: number | null;
  /** true when the last attempt failed and `doc` is an older copy (or null) */
  stale: boolean;
  error?: string;
}

export interface DocReader {
  now(): number;
  get(path: string, ttlMs: number): Promise<DocResult>;
}

export const TTL = {
  summary: 10_000,
  states: 15_000,
  sp: 30_000,
};

const iso = (ms: number) => new Date(ms).toISOString();
const age = (now: number, at: number | null) => (at === null ? 0 : Math.max(0, Math.round((now - at) / 1000)));

/** Runs async jobs with bounded concurrency, preserving order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export class NoDataError extends Error {}

function parsed(r: DocResult, cfg: TseConfig): Counts | null {
  if (!r.doc) return null;
  return parseUnified(r.doc, cfg);
}

export async function getSummary(reader: DocReader, cfg: TseConfig): Promise<Summary> {
  const path = unifiedPath(cfg, 'br');
  const r = await reader.get(path, TTL.summary);
  const c = parsed(r, cfg);
  if (!c) throw new NoDataError(r.error ?? 'TSE summary unavailable');
  const now = reader.now();
  return buildSummary(c, {
    fetchedAt: iso(r.fetchedAt ?? now),
    stale: r.stale,
    ageSeconds: age(now, r.fetchedAt),
    error: r.error,
    sourceUrl: fileUrl(cfg, path),
  });
}

export async function getStates(reader: DocReader, cfg: TseConfig): Promise<StatesResponse> {
  const results = await pool(UFS, 6, async (uf) => ({ uf, r: await reader.get(unifiedPath(cfg, uf), TTL.states) }));
  const now = reader.now();
  const states: StateRow[] = [];
  const missing: string[] = [];
  let oldest: number | null = null;
  let stale = false;
  const errors = new Set<string>();
  for (const { uf, r } of results) {
    let c: Counts | null = null;
    try {
      c = parsed(r, cfg);
    } catch (e) {
      errors.add(String((e as Error).message));
    }
    if (!c) {
      missing.push(uf.toUpperCase());
      if (r.error) errors.add(r.error);
      stale = true;
      continue;
    }
    if (r.stale) stale = true;
    if (r.error) errors.add(r.error);
    if (r.fetchedAt !== null && (oldest === null || r.fetchedAt < oldest)) oldest = r.fetchedAt;
    states.push(stateRow(uf, c, r.stale));
  }
  if (!states.length) throw new NoDataError([...errors][0] ?? 'TSE states unavailable');
  return {
    fetchedAt: iso(oldest ?? now),
    stale,
    ageSeconds: age(now, oldest),
    ...(errors.size ? { error: [...errors].join('; ') } : {}),
    states,
    missing,
  };
}

export async function getSp(reader: DocReader, cfg: TseConfig): Promise<SpResponse> {
  const paths = [unifiedPath(cfg, 'sp'), unifiedPath(cfg, 'sp', SP_CAPITAL), ...GRANDE_SP_WITHOUT_CAPITAL.map((m) => unifiedPath(cfg, 'sp', m))];
  const results = await pool(paths, 6, (p) => reader.get(p, TTL.sp));
  const now = reader.now();
  const missing: string[] = [];
  let stale = false;
  let oldest: number | null = null;
  const errors = new Set<string>();
  const counts = results.map((r, i) => {
    if (r.stale) stale = true;
    if (r.error) errors.add(r.error);
    if (r.fetchedAt !== null && (oldest === null || r.fetchedAt < oldest)) oldest = r.fetchedAt;
    try {
      const c = parsed(r, cfg);
      if (!c) missing.push(paths[i]);
      return c;
    } catch (e) {
      errors.add(String((e as Error).message));
      missing.push(paths[i]);
      return null;
    }
  });
  const [state, capital, ...others] = counts;
  if (!state || !capital) throw new NoDataError([...errors][0] ?? 'TSE São Paulo data unavailable');
  const present = others.filter((c): c is Counts => !!c);
  return {
    fetchedAt: iso(oldest ?? now),
    stale: stale || missing.length > 0,
    ageSeconds: age(now, oldest),
    ...(errors.size ? { error: [...errors].join('; ') } : {}),
    regions: spRegions(state, capital, present, GRANDE_SP_WITHOUT_CAPITAL.length),
    missing,
  };
}

export function historyPoint(s: Summary, t: number) {
  return {
    t: iso(t),
    sourceUpdatedAt: s.sourceUpdatedAt,
    countedPct: s.countedPct,
    lulaPct: s.candidates.lula.pct,
    flavioPct: s.candidates.flavio.pct,
    marginVotes: s.candidates.lula.votes - s.candidates.flavio.votes,
    marginPp: round(s.candidates.lula.pct - s.candidates.flavio.pct, 2),
    leader: s.leader,
  };
}
