// Shapes of /api/* responses. Kept in sync with docs/api.md.
// All numbers are numbers, percentages are in "percent" units (50.69), times are ISO 8601 with offset.

export type CandidateKey = 'lula' | 'flavio';
export type Leader = CandidateKey | 'tie';

export interface CandidateResult {
  votes: number;
  pct: number;
}

export interface Freshness {
  fetchedAt: string;
  stale: boolean;
  ageSeconds: number;
  error?: string;
}

export interface Summary extends Freshness {
  sourceUpdatedAt: string | null;
  generatedAt: string | null;
  countedPct: number;
  sections: { total: number; counted: number };
  complete: boolean;
  mathematicallyDefined: boolean;
  winner: CandidateKey | null;
  candidates: Record<CandidateKey, CandidateResult>;
  marginVotes: number;
  marginPp: number;
  leader: Leader;
  breakEven: { lulaNeedsPctOfRemaining: number | null; flavioNeedsPctOfRemaining: number | null };
  electorate: number;
  electorateCounted: number;
  turnoutPct: number | null;
  validVotes: number;
  blankVotes: number;
  nullVotes: number;
  remainingValidVotesEst: number | null;
  sourceUrl: string;
}

export interface RegionRow {
  countedPct: number;
  validVotes: number;
  electorate: number;
  electorateCounted: number;
  lula: CandidateResult;
  flavio: CandidateResult;
  leader: Leader;
  marginVotes: number;
  flavioMinusLulaVotes: number;
  remainingValidVotesEst: number | null;
  complete: boolean;
  sourceUpdatedAt: string | null;
}

export interface StateRow extends RegionRow {
  uf: string;
  name: string;
  stale: boolean;
}

export interface StatesResponse extends Freshness {
  states: StateRow[];
  missing: string[];
}

export interface SpRegion extends RegionRow {
  key: 'state' | 'capital' | 'grande_sp' | 'interior';
  name: string;
  municipalities: number;
}

export interface SpResponse extends Freshness {
  regions: SpRegion[];
  missing: string[];
}

export interface PricePoint {
  t: string;
  px: number;
}

export interface PriceChange {
  abs: number;
  pct: number;
  from: number;
}

export interface PriceResponse extends Freshness {
  source: string;
  symbol: string;
  delayed: boolean;
  note: string | null;
  markPx: number | null;
  oraclePx: number | null;
  midPx: number | null;
  prevDayPx: number | null;
  fundingRate: number | null;
  change: { m5: PriceChange | null; m15: PriceChange | null; m60: PriceChange | null };
  changeBasis: 'mark-history' | 'candles' | 'none';
  markLastChangedAt: string | null;
  markUnchangedSeconds: number | null;
  history: PricePoint[];
  historyBasis: string;
}

export interface HistoryPoint {
  t: string;
  sourceUpdatedAt: string | null;
  countedPct: number;
  lulaPct: number;
  flavioPct: number;
  marginVotes: number;
  marginPp: number;
  leader: Leader;
}

export interface HistoryResponse extends Freshness {
  points: HistoryPoint[];
}

export interface SourceHealth {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  ageSeconds: number | null;
  upstreamRequests: number;
}

export interface HealthResponse {
  now: string;
  version: string;
  replay: boolean;
  priceSource: string;
  priceSymbol: string;
  tseBaseUrl: string;
  sources: Record<string, SourceHealth>;
  alerts: { enabled: boolean; lastSentAt: string | null; lastMessage: string | null };
}
