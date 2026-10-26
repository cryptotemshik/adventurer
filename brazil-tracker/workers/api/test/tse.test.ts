import { describe, expect, it } from 'vitest';
import { getSp, getStates, getSummary, NoDataError, type DocReader } from '../src/engine';
import { buildSummary, parseUnified, unifiedPath, type TseConfig } from '../src/tse';
import partial from '../../../fixtures/tse/br-c0001-e006258-u.partial.json';
import round1 from '../../../fixtures/tse/br-c0001-e006257-u.final-round1.json';
import replay from '../../../fixtures/replay.json';

const cfg: TseConfig = {
  baseUrl: 'https://resultados.tse.jus.br/oficial',
  cycle: 'ele2026',
  election: '6258',
  office: '1',
  lulaNumber: '13',
  flavioNumber: '22',
};
const meta = { fetchedAt: '2026-10-25T23:53:00.000Z', stale: false, ageSeconds: 0, sourceUrl: 'x' };

describe('paths (verified against the TSE app, see docs/verification-log.md)', () => {
  it('builds unified file paths', () => {
    expect(unifiedPath(cfg, 'br')).toBe('ele2026/6258/dados/br/br-c0001-e006258-u.json');
    expect(unifiedPath(cfg, 'SP')).toBe('ele2026/6258/dados/sp/sp-c0001-e006258-u.json');
    expect(unifiedPath(cfg, 'sp', '71072')).toBe('ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json');
  });
});

describe('parseUnified + buildSummary', () => {
  it('parses a live partial second-round file', () => {
    const c = parseUnified(partial, cfg);
    expect(c.lula).toBe(50706005);
    expect(c.flavio).toBe(48190618);
    expect(c.countedPct).toBeCloseTo(80.017, 3);
    expect(c.final).toBe(false);
    expect(c.sourceUpdatedAt).toBe('2026-10-25T20:52:44-03:00');
    const s = buildSummary(c, meta);
    expect(s.candidates.lula.pct).toBe(51.27);
    expect(s.candidates.flavio.pct).toBe(48.73);
    expect(s.marginVotes).toBe(50706005 - 48190618);
    expect(s.leader).toBe('lula');
    expect(s.marginPp).toBe(2.54);
    expect(s.complete).toBe(false);
    expect(s.winner).toBeNull();
    expect(s.breakEven.lulaNeedsPctOfRemaining).toBeCloseTo(((0.5 - 0.80017145787 * 0.51271725426) / (1 - 0.80017145787)) * 100, 1);
    expect(s.remainingValidVotesEst).toBeGreaterThan(0);
    // All numbers are numbers.
    for (const v of [s.countedPct, s.validVotes, s.electorate, s.candidates.lula.votes]) expect(typeof v).toBe('number');
  });

  it('recognises a finished count (round-1 final file: tf=s, and=f)', () => {
    // Round 1 had other candidates; Lula (13) and Flavio (22) are still found.
    const c = parseUnified(round1, cfg);
    expect(c.final).toBe(true);
    const s = buildSummary(c, meta);
    expect(s.complete).toBe(true);
    expect(s.breakEven).toEqual({ lulaNeedsPctOfRemaining: null, flavioNeedsPctOfRemaining: null });
    expect(s.remainingValidVotesEst).toBe(0);
  });

  it("treats md='e' (observed live at 98.76%) as mathematically defined, leader as winner", () => {
    const doc = JSON.parse(JSON.stringify(partial));
    doc.md = 'e';
    const s = buildSummary(parseUnified(doc, cfg), meta);
    expect(s.mathematicallyDefined).toBe(true);
    expect(s.complete).toBe(false);
    expect(s.winner).toBe('lula');
    doc.md = 'n';
    expect(buildSummary(parseUnified(doc, cfg), meta).winner).toBeNull();
  });

  it('all sections counted reads as complete even before TSE sets tf', () => {
    const doc = JSON.parse(JSON.stringify(partial));
    doc.s.st = doc.s.ts;
    doc.s.pstn = '100';
    const s = buildSummary(parseUnified(doc, cfg), meta);
    expect(s.complete).toBe(true);
    expect(s.breakEven.lulaNeedsPctOfRemaining).toBeNull();
    expect(s.winner).toBe('lula');
  });

  it('rejects unexpected documents', () => {
    expect(() => parseUnified({}, cfg)).toThrow();
    expect(() => parseUnified({ s: {}, v: {}, carg: [] }, cfg)).toThrow(/candidates/);
  });
});

const frames = (replay as any).frames as { files: Record<string, unknown> }[];
const frameReader = (files: Record<string, unknown>, opts: { stale?: boolean; drop?: string[] } = {}): DocReader => ({
  now: () => 1_800_000_000_000,
  get: async (p) => {
    const doc = opts.drop?.some((d) => p.includes(d)) ? null : (files[p] ?? null);
    return { doc, fetchedAt: 1_800_000_000_000 - 5_000, stale: !!opts.stale || !doc, ...(opts.stale ? { error: 'down' } : {}) };
  },
});

describe('engine over recorded fixtures', () => {
  const files = frames[0].files;

  it('builds all 28 rows of /api/states (27 UFs + abroad)', async () => {
    const r = await getStates(frameReader(files), cfg);
    expect(r.states).toHaveLength(28);
    expect(r.missing).toEqual([]);
    const sp = r.states.find((s) => s.uf === 'SP')!;
    expect(sp.lula.votes + sp.flavio.votes).toBeGreaterThan(0);
    expect(sp.flavioMinusLulaVotes).toBe(sp.flavio.votes - sp.lula.votes);
  });

  it('São Paulo regions add up: state = capital + Grande SP + interior', async () => {
    const r = await getSp(frameReader(files), cfg);
    const by = Object.fromEntries(r.regions.map((x) => [x.key, x]));
    expect(Object.keys(by)).toEqual(['state', 'capital', 'grande_sp', 'interior']);
    for (const k of ['lula', 'flavio'] as const) {
      expect(by.capital[k].votes + by.grande_sp[k].votes + by.interior[k].votes).toBe(by.state[k].votes);
    }
  });

  it('marks missing states and keeps the rest', async () => {
    const r = await getStates(frameReader(files, { drop: ['/rj/'] }), cfg);
    expect(r.missing).toEqual(['RJ']);
    expect(r.states).toHaveLength(27);
    expect(r.stale).toBe(true);
  });

  it('drops Grande SP / interior when an RMSP municipality is missing', async () => {
    const r = await getSp(frameReader(files, { drop: ['sp70572'] }), cfg);
    expect(r.regions.map((x) => x.key)).toEqual(['state', 'capital']);
    expect(r.stale).toBe(true);
  });

  it('passes stale/error through when the source is down but an old copy exists', async () => {
    const s = await getSummary(frameReader(files, { stale: true }), cfg);
    expect(s.stale).toBe(true);
    expect(s.error).toBe('down');
    expect(s.ageSeconds).toBe(5);
  });

  it('throws NoDataError when there is no copy at all', async () => {
    await expect(getSummary(frameReader({}), cfg)).rejects.toBeInstanceOf(NoDataError);
  });

  it('synthetic final frame reads as complete with a winner', async () => {
    const last = frames.at(-1)!;
    const s = await getSummary(frameReader(last.files), cfg);
    expect(s.complete).toBe(true);
    expect(s.winner).toBe(s.leader);
  });
});
