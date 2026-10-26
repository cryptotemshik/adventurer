// Replay mode (SPEC §11): serves recorded TSE/Hyperliquid snapshots from fixtures/replay.json
// through the same parsing code as the live path. Enabled with ?replay=1 or env REPLAY=1.
//   ?frame=N            pin a frame (default: advances every 15 s)
//   ?scenario=complete  last frame, counting finished
//   ?scenario=error     source "down": last data served as stale with an error
import { getSp, getStates, getSummary, historyPoint, type DocReader } from './engine';
import { tseConfig, type Env } from './env';
import { buildPrice } from './pricebuild';
import replay from '../../../fixtures/replay.json';

interface Frame {
  ts: string;
  files: Record<string, unknown>;
  price: { markPx: number | null; oraclePx: number | null; midPx: number | null; prevDayPx: number | null; fundingRate: number | null } | null;
  synthetic?: boolean;
}

const data = replay as unknown as { election: string; cycle: string; frames: Frame[] };
const STEP_MS = 15_000;

function pickFrame(url: URL, now: number): { index: number; scenario: string } {
  const scenario = url.searchParams.get('scenario') ?? '';
  const n = data.frames.length;
  if (scenario === 'complete') return { index: n - 1, scenario };
  const f = url.searchParams.get('frame');
  if (f !== null && /^\d+$/.test(f)) return { index: Math.min(n - 1, Number(f)), scenario };
  // Cycle through the non-synthetic frames.
  const live = data.frames.filter((x) => !x.synthetic).length || n;
  return { index: Math.floor(now / STEP_MS) % live, scenario };
}

export async function handleReplay(url: URL, env: Env): Promise<Response> {
  const now = Date.now();
  const { index, scenario } = pickFrame(url, now);
  const frame = data.frames[index];
  const error = scenario === 'error';
  const lagMs = error ? 7 * 60_000 : 2_000;
  const reader: DocReader = {
    now: () => now,
    get: async (path) => {
      const doc = frame.files[path] ?? null;
      return {
        doc,
        fetchedAt: now - lagMs,
        stale: error || !doc,
        ...(error ? { error: 'симуляция: TSE недоступен' } : !doc ? { error: `нет в фикстуре: ${path}` } : {}),
      };
    },
  };
  const cfg = { ...tseConfig(env), cycle: data.cycle, election: data.election };
  const ok = (v: unknown) =>
    new Response(JSON.stringify({ ...(v as object), replay: { frame: index, frames: data.frames.length, recordedAt: frame.ts, scenario: scenario || null } }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  try {
    switch (url.pathname) {
      case '/api/summary':
        return ok(await getSummary(reader, cfg));
      case '/api/states':
        return ok(await getStates(reader, cfg));
      case '/api/sp':
        return ok(await getSp(reader, cfg));
      case '/api/history': {
        const points = [];
        for (let i = 0; i <= index; i++) {
          if (data.frames[i].synthetic && i !== index) continue;
          const r: DocReader = { now: () => now, get: async (p) => ({ doc: data.frames[i].files[p] ?? null, fetchedAt: now, stale: false }) };
          try {
            const s = await getSummary(r, cfg);
            points.push(historyPoint(s, s.sourceUpdatedAt ? Date.parse(s.sourceUpdatedAt) : Date.parse(data.frames[i].ts)));
          } catch {}
        }
        return ok({ fetchedAt: new Date(now).toISOString(), stale: false, ageSeconds: 0, points });
      }
      case '/api/price': {
        // Candles are synthesized from the recorded marks, one per frame, ending "now".
        const marks = data.frames.slice(0, index + 1).map((f, i, arr) => ({ t: now - (arr.length - 1 - i) * 5 * 60_000, close: f.price?.markPx ?? 0 })).filter((c) => c.close > 0);
        const p = frame.price ?? { markPx: null, oraclePx: null, midPx: null, prevDayPx: null, fundingRate: null };
        return ok(
          buildPrice({
            source: { name: env.PRICE_SOURCE || 'hyperliquid', symbol: env.PRICE_SYMBOL || 'xyz:EWZ', historyBasis: 'replay: записанные mark-цены, шаг 5 мин' },
            quote: { ...p, delayed: false, note: 'Replay: записанные данные, не live' },
            quoteAt: now - lagMs,
            candles: marks.map((m) => ({ t: m.t - 60_000, close: m.close })),
            marks: [],
            markLastChangedAt: null,
            now,
            stale: error,
            ...(error ? { error: 'симуляция: биржа недоступна' } : {}),
          }),
        );
      }
      case '/api/health':
        return ok({ now: new Date(now).toISOString(), version: env.BUILD_VERSION ?? 'dev', replay: true, sources: {} });
      default:
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message), stale: true }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
}
