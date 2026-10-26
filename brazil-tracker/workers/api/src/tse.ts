// TSE result files: paths and parsing. Schema notes: docs/tse-schema.md.
import { breakEven, num, remainingValidVotes, round, tseDateTime } from './calc';
import type { CandidateKey, Leader, RegionRow, SpRegion, StateRow, Summary } from './types';

export interface TseConfig {
  baseUrl: string; // https://resultados.tse.jus.br/oficial
  cycle: string; // ele2026
  election: string; // 6258
  office: string; // 1 = Presidente
  lulaNumber: string; // 13
  flavioNumber: string; // 22
}

const pad = (v: string, n: number) => v.padStart(n, '0');

/** Unified result file (-u.json) for an abrangência: br, a UF, or a UF + municipality code. */
export function unifiedPath(cfg: TseConfig, uf: string, municipality = ''): string {
  const u = uf.toLowerCase();
  const mu = municipality ? pad(municipality, 5) : '';
  return `${cfg.cycle}/${cfg.election}/dados/${u}/${u}${mu}-c${pad(cfg.office, 4)}-e${pad(cfg.election, 6)}-u.json`;
}

export function fileUrl(cfg: TseConfig, path: string): string {
  return `${cfg.baseUrl.replace(/\/$/, '')}/${path}`;
}

export const STATES: Record<string, string> = {
  ac: 'Акри', al: 'Алагоас', ap: 'Амапа', am: 'Амазонас', ba: 'Баия', ce: 'Сеара', df: 'Федеральный округ',
  es: 'Эспириту-Санту', go: 'Гояс', ma: 'Мараньян', mt: 'Мату-Гросу', ms: 'Мату-Гросу-ду-Сул', mg: 'Минас-Жерайс',
  pa: 'Пара', pb: 'Параиба', pr: 'Парана', pe: 'Пернамбуку', pi: 'Пиауи', rj: 'Рио-де-Жанейро',
  rn: 'Риу-Гранди-ду-Норти', rs: 'Риу-Гранди-ду-Сул', ro: 'Рондония', rr: 'Рорайма', sc: 'Санта-Катарина',
  sp: 'Сан-Паулу', se: 'Сержипи', to: 'Токантинс', zz: 'Зарубежье',
};
export const UFS = Object.keys(STATES);

/**
 * Região Metropolitana de São Paulo (39 municipalities incl. the capital), TSE municipality codes,
 * resolved from IBGE codes via mun-e006258-cm.json. "Grande SP" on the page = RMSP without the capital
 * (the usual Capital / Grande SP / Interior split of Brazilian media).
 */
export const SP_CAPITAL = '71072';
export const GRANDE_SP = [
  '61778', '62138', '62316', '62812', '62855', '63134', '63614', '63770', '64017', '64033', '64157', '64270', '64297',
  '64670', '64777', '65455', '65510', '65633', '66010', '66257', '66710', '66893', '67130', '67890', '68837', '68977',
  '69671', '69833', '70017', '70378', '70475', '70572', '70750', '70777', '61905', '71072', '71510', '71579', '72737',
];
export const GRANDE_SP_WITHOUT_CAPITAL = GRANDE_SP.filter((c) => c !== SP_CAPITAL);

export class TseParseError extends Error {}

/** Raw counts extracted from one -u.json file. */
export interface Counts {
  sourceUpdatedAt: string | null;
  generatedAt: string | null;
  sectionsTotal: number;
  sectionsCounted: number;
  countedPct: number;
  electorate: number;
  electorateCounted: number;
  turnout: number;
  validVotes: number;
  blankVotes: number;
  nullVotes: number;
  lula: number;
  flavio: number;
  lulaPct: number | null;
  flavioPct: number | null;
  final: boolean;
  mathematicallyDefined: boolean;
  elected: CandidateKey | null;
}

interface RawCand { n?: string; vap?: string; pvapn?: string; pvap?: string; e?: string }

function* candidates(doc: any): Generator<RawCand> {
  const carg = Array.isArray(doc?.carg) ? doc.carg : [];
  for (const c of carg) {
    for (const agr of c?.agr ?? []) for (const par of agr?.par ?? []) for (const cand of par?.cand ?? []) yield cand;
  }
}

export function parseUnified(doc: any, cfg: Pick<TseConfig, 'lulaNumber' | 'flavioNumber'>): Counts {
  if (!doc || typeof doc !== 'object' || !doc.s || !doc.v) throw new TseParseError('unexpected TSE document shape');
  let lula: RawCand | undefined;
  let flavio: RawCand | undefined;
  for (const c of candidates(doc)) {
    if (c.n === cfg.lulaNumber) lula = c;
    else if (c.n === cfg.flavioNumber) flavio = c;
  }
  if (!lula || !flavio) throw new TseParseError('candidates not found in TSE document');
  const pct = (c: RawCand) => (c.pvapn ?? c.pvap) !== undefined ? num(c.pvapn ?? c.pvap) : null;
  const sectionsTotal = num(doc.s.ts);
  const sectionsCounted = num(doc.s.st);
  const countedPct = doc.s.pstn !== undefined ? num(doc.s.pstn) : sectionsTotal ? (sectionsCounted / sectionsTotal) * 100 : 0;
  const final = doc.tf === 's' || doc.and === 'f';
  const elected: CandidateKey | null = lula.e === 's' ? 'lula' : flavio.e === 's' ? 'flavio' : null;
  return {
    sourceUpdatedAt: tseDateTime(doc.dt, doc.ht),
    generatedAt: tseDateTime(doc.dg, doc.hg),
    sectionsTotal,
    sectionsCounted,
    countedPct,
    electorate: num(doc.e?.te),
    electorateCounted: num(doc.e?.est),
    turnout: num(doc.e?.c),
    validVotes: num(doc.v.vv),
    blankVotes: num(doc.v.vb),
    nullVotes: num(doc.v.tvn ?? doc.v.vn),
    lula: num(lula.vap),
    flavio: num(flavio.vap),
    lulaPct: pct(lula),
    flavioPct: pct(flavio),
    final,
    // md: 'n' while open; observed 'e' at 98.76% on 25.10.2026 (TSE "matematicamente definido").
    mathematicallyDefined: typeof doc.md === 'string' && doc.md !== '' && doc.md !== 'n',
    elected,
  };
}

/** Adds up several regions (e.g. municipalities of Grande SP). Percentages are recomputed. */
export function sumCounts(list: Counts[]): Counts {
  const s = (k: keyof Counts) => list.reduce((a, c) => a + (c[k] as number), 0);
  const sectionsTotal = s('sectionsTotal');
  const sectionsCounted = s('sectionsCounted');
  const times = list.map((c) => c.sourceUpdatedAt).filter((x): x is string => !!x).sort();
  return {
    sourceUpdatedAt: times.at(-1) ?? null,
    generatedAt: null,
    sectionsTotal,
    sectionsCounted,
    countedPct: sectionsTotal ? (sectionsCounted / sectionsTotal) * 100 : 0,
    electorate: s('electorate'),
    electorateCounted: s('electorateCounted'),
    turnout: s('turnout'),
    validVotes: s('validVotes'),
    blankVotes: s('blankVotes'),
    nullVotes: s('nullVotes'),
    lula: s('lula'),
    flavio: s('flavio'),
    lulaPct: null,
    flavioPct: null,
    final: list.length > 0 && list.every((c) => c.final),
    mathematicallyDefined: false,
    elected: null,
  };
}

/** a - b, used for "interior" = state minus Grande SP. */
export function subtractCounts(a: Counts, b: Counts): Counts {
  const d = (k: keyof Counts) => (a[k] as number) - (b[k] as number);
  const sectionsTotal = d('sectionsTotal');
  const sectionsCounted = d('sectionsCounted');
  return {
    ...a,
    generatedAt: null,
    sectionsTotal,
    sectionsCounted,
    countedPct: sectionsTotal ? (sectionsCounted / sectionsTotal) * 100 : 0,
    electorate: d('electorate'),
    electorateCounted: d('electorateCounted'),
    turnout: d('turnout'),
    validVotes: d('validVotes'),
    blankVotes: d('blankVotes'),
    nullVotes: d('nullVotes'),
    lula: d('lula'),
    flavio: d('flavio'),
    lulaPct: null,
    flavioPct: null,
    final: a.final && b.final,
    mathematicallyDefined: false,
    elected: null,
  };
}

function shares(c: Counts): { lula: number; flavio: number } {
  const two = c.lula + c.flavio;
  if (c.lulaPct !== null && c.flavioPct !== null && two > 0) return { lula: c.lulaPct, flavio: c.flavioPct };
  if (!two) return { lula: 0, flavio: 0 };
  return { lula: (c.lula / two) * 100, flavio: (c.flavio / two) * 100 };
}

function leaderOf(c: Counts): Leader {
  return c.lula > c.flavio ? 'lula' : c.flavio > c.lula ? 'flavio' : 'tie';
}

export function regionRow(c: Counts): RegionRow {
  const sh = shares(c);
  return {
    countedPct: round(c.countedPct, 2),
    validVotes: c.validVotes,
    electorate: c.electorate,
    electorateCounted: c.electorateCounted,
    lula: { votes: c.lula, pct: round(sh.lula, 2) },
    flavio: { votes: c.flavio, pct: round(sh.flavio, 2) },
    leader: leaderOf(c),
    marginVotes: Math.abs(c.lula - c.flavio),
    flavioMinusLulaVotes: c.flavio - c.lula,
    remainingValidVotesEst: c.final ? 0 : remainingValidVotes(c.electorate, c.electorateCounted, c.validVotes),
    complete: c.final || c.countedPct >= 100,
    sourceUpdatedAt: c.sourceUpdatedAt,
  };
}

export function buildSummary(c: Counts, meta: { fetchedAt: string; stale: boolean; ageSeconds: number; error?: string; sourceUrl: string }): Summary {
  const sh = shares(c);
  const complete = c.final;
  const counted = Math.min(1, c.countedPct / 100);
  const be = complete ? { lulaNeedsPctOfRemaining: null, flavioNeedsPctOfRemaining: null } : breakEven(counted, sh.flavio / 100);
  return {
    fetchedAt: meta.fetchedAt,
    sourceUpdatedAt: c.sourceUpdatedAt,
    generatedAt: c.generatedAt,
    stale: meta.stale,
    ageSeconds: meta.ageSeconds,
    ...(meta.error ? { error: meta.error } : {}),
    countedPct: round(c.countedPct, 2),
    sections: { total: c.sectionsTotal, counted: c.sectionsCounted },
    complete,
    mathematicallyDefined: c.mathematicallyDefined,
    // Candidate flag e='s' is authoritative; when TSE only says "mathematically defined" the leader is the one.
    winner: c.elected ?? (complete || c.mathematicallyDefined ? (c.lula > c.flavio ? 'lula' : c.flavio > c.lula ? 'flavio' : null) : null),
    candidates: { lula: { votes: c.lula, pct: round(sh.lula, 2) }, flavio: { votes: c.flavio, pct: round(sh.flavio, 2) } },
    marginVotes: Math.abs(c.lula - c.flavio),
    marginPp: round(Math.abs(sh.lula - sh.flavio), 2),
    leader: leaderOf(c),
    breakEven: be,
    electorate: c.electorate,
    electorateCounted: c.electorateCounted,
    turnoutPct: c.electorateCounted ? round((c.turnout / c.electorateCounted) * 100, 2) : null,
    validVotes: c.validVotes,
    blankVotes: c.blankVotes,
    nullVotes: c.nullVotes,
    remainingValidVotesEst: complete ? 0 : remainingValidVotes(c.electorate, c.electorateCounted, c.validVotes),
    sourceUrl: meta.sourceUrl,
  };
}

export function stateRow(uf: string, c: Counts, stale: boolean): StateRow {
  return { uf: uf.toUpperCase(), name: STATES[uf] ?? uf.toUpperCase(), stale, ...regionRow(c) };
}

export function spRegions(state: Counts, capital: Counts, others: Counts[], othersExpected: number): SpRegion[] {
  const regions: SpRegion[] = [
    { key: 'state', name: 'Штат Сан-Паулу', municipalities: 645, ...regionRow(state) },
    { key: 'capital', name: 'Столица (город Сан-Паулу)', municipalities: 1, ...regionRow(capital) },
  ];
  // Grande SP and interior only make sense when every RMSP municipality is present.
  if (others.length === othersExpected) {
    const gsp = sumCounts(others);
    const rmsp = sumCounts([capital, ...others]);
    regions.push({ key: 'grande_sp', name: 'Большой Сан-Паулу (без столицы)', municipalities: others.length, ...regionRow(gsp) });
    regions.push({ key: 'interior', name: 'Интерьор (вне RMSP)', municipalities: 645 - others.length - 1, ...regionRow(subtractCounts(state, rmsp)) });
  }
  return regions;
}
