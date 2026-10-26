// Global singleton Durable Object: the only place that talks to TSE and the price venue.
// Every edge request ends up here, so upstream load is bounded by TTLs no matter how many clients
// or Cloudflare locations there are (SPEC §11, acceptance 2).
import { DurableObject } from 'cloudflare:workers';
import { evaluateAlerts, initialAlertState, sendTelegram, type AlertState } from './alerts';
import { getSp, getStates, getSummary, historyPoint, NoDataError, TTL, type DocReader, type DocResult } from './engine';
import { tseConfig, USER_AGENT, type Env } from './env';
import { makePriceSource, type Candle, type PriceQuote, type PriceSource } from './price';
import { buildPrice, type MarkPoint } from './pricebuild';
import { fileUrl } from './tse';
import type { HealthResponse, HistoryPoint, SourceHealth, Summary } from './types';
import seed from '../../../fixtures/history-seed.json';

interface DocEntry {
  doc: unknown | null;
  fetchedAt: number | null;
  lastAttemptAt: number;
  error?: string;
}

const PRICE_TTL = 5_000;
const CANDLE_TTL = 60_000;
const MARK_SAMPLE_MS = 15_000;
const MARK_KEEP_MS = 3 * 3600_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export class Tracker extends DurableObject<Env> {
  private docs = new Map<string, DocEntry>();
  private inflight = new Map<string, Promise<DocResult>>();
  private health: Record<string, SourceHealth> = {};
  private priceSource: PriceSource;
  private quote: { q: PriceQuote; at: number } | null = null;
  private quoteErr: string | undefined;
  private quoteAttemptAt = 0;
  private quoteInflight: Promise<void> | null = null;
  private candles: { c: Candle[]; at: number } | null = null;
  private candlesInflight: Promise<void> | null = null;
  private markLastChangedAt: number | null = null;
  private lastSummaryKey: string | null = null;
  private readonly startedAt = new Date().toISOString();
  private alertInfo: { lastSentAt: string | null; lastMessage: string | null } = { lastSentAt: null, lastMessage: null };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.priceSource = makePriceSource(env.PRICE_SOURCE, env.PRICE_SYMBOL);
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec(`CREATE TABLE IF NOT EXISTS history (t INTEGER PRIMARY KEY, source_ts TEXT, data TEXT NOT NULL)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS marks (t INTEGER PRIMARY KEY, mark REAL NOT NULL, oracle REAL)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
      const n = sql.exec(`SELECT COUNT(*) AS n FROM history`).one().n as number;
      if (n === 0 && (seed as any).election === tseConfig(env).election) {
        for (const p of (seed as any).points as HistoryPoint[]) {
          sql.exec(`INSERT OR IGNORE INTO history (t, source_ts, data) VALUES (?, ?, ?)`, Date.parse(p.t), p.sourceUpdatedAt, JSON.stringify(p));
        }
      }
      const last = sql.exec(`SELECT source_ts FROM history ORDER BY t DESC LIMIT 1`).toArray()[0];
      this.lastSummaryKey = (last?.source_ts as string) ?? null;
    });
  }

  private now() {
    return Date.now();
  }

  private src(name: string): SourceHealth {
    return (this.health[name] ??= { lastSuccessAt: null, lastErrorAt: null, lastError: null, ageSeconds: null, upstreamRequests: 0 });
  }

  // ---------- TSE documents with TTL, single-flight and last-good fallback ----------

  private reader(): DocReader {
    return { now: () => this.now(), get: (path, ttl) => this.getDoc(path, ttl) };
  }

  private async getDoc(path: string, ttlMs: number): Promise<DocResult> {
    const now = this.now();
    const e = this.docs.get(path);
    // Fresh enough, or failed recently (back off for one TTL instead of hammering a failing source).
    if (e && now - e.lastAttemptAt < ttlMs) return { doc: e.doc, fetchedAt: e.fetchedAt, stale: !!e.error, error: e.error };
    const running = this.inflight.get(path);
    if (running) return running;
    const p = this.fetchDoc(path, e).finally(() => this.inflight.delete(path));
    this.inflight.set(path, p);
    return p;
  }

  private async fetchDoc(path: string, prev: DocEntry | undefined): Promise<DocResult> {
    const cfg = tseConfig(this.env);
    const url = fileUrl(cfg, path);
    const h = this.src('tse');
    const started = this.now();
    h.upstreamRequests++;
    console.log(JSON.stringify({ upstream: 'tse', path, at: new Date(started).toISOString() }));
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, cf: { cacheTtl: 10, cacheEverything: true } });
      if (!res.ok) throw new Error(`TSE HTTP ${res.status} for ${path.split('/').pop()}`);
      const doc = await res.json();
      this.docs.set(path, { doc, fetchedAt: started, lastAttemptAt: started });
      h.lastSuccessAt = new Date(started).toISOString();
      return { doc, fetchedAt: started, stale: false };
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      this.docs.set(path, { doc: prev?.doc ?? null, fetchedAt: prev?.fetchedAt ?? null, lastAttemptAt: started, error: msg });
      h.lastErrorAt = new Date(started).toISOString();
      h.lastError = msg;
      return { doc: prev?.doc ?? null, fetchedAt: prev?.fetchedAt ?? null, stale: true, error: msg };
    }
  }

  /** Builds a response; on success persists it, on failure falls back to the persisted copy marked stale. */
  private async withLastGood<T extends { stale: boolean; ageSeconds: number; fetchedAt: string; error?: string }>(
    key: string,
    build: () => Promise<T>,
    changeKey: (v: T) => string,
  ): Promise<T | null> {
    try {
      const v = await build();
      const ck = changeKey(v);
      const prev = this.ctx.storage.sql.exec(`SELECT v FROM kv WHERE k = ?`, `ck:${key}`).toArray()[0];
      if (!v.stale && prev?.v !== ck) {
        this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?), (?, ?)`, `last:${key}`, JSON.stringify(v), `ck:${key}`, ck);
      }
      return v;
    } catch (err) {
      if (!(err instanceof NoDataError)) console.error(key, err);
      const row = this.ctx.storage.sql.exec(`SELECT v FROM kv WHERE k = ?`, `last:${key}`).toArray()[0];
      if (!row) return null;
      const v = JSON.parse(row.v as string) as T;
      v.stale = true;
      v.ageSeconds = Math.max(0, Math.round((this.now() - Date.parse(v.fetchedAt)) / 1000));
      v.error = String((err as Error).message ?? err);
      return v;
    }
  }

  async summary(): Promise<Summary | null> {
    const cfg = tseConfig(this.env);
    const s = await this.withLastGood('summary', () => getSummary(this.reader(), cfg), (v) => `${v.sourceUpdatedAt}|${v.countedPct}|${v.marginVotes}`);
    if (s && !s.stale) this.recordHistory(s);
    return s;
  }

  private recordHistory(s: Summary) {
    const key = `${s.sourceUpdatedAt}|${s.countedPct}|${s.marginVotes}`;
    if (key === this.lastSummaryKey) return;
    this.lastSummaryKey = key;
    const t = s.sourceUpdatedAt ? Date.parse(s.sourceUpdatedAt) : this.now();
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO history (t, source_ts, data) VALUES (?, ?, ?)`, t, key, JSON.stringify(historyPoint(s, t)));
  }

  // ---------- Price ----------

  private async refreshQuote() {
    const now = this.now();
    if (now - this.quoteAttemptAt < PRICE_TTL) return;
    if (this.quoteInflight) return this.quoteInflight;
    this.quoteAttemptAt = now;
    const h = this.src('price');
    h.upstreamRequests++;
    this.quoteInflight = (async () => {
      try {
        const q = await this.priceSource.quote(fetch);
        if (this.quote && q.markPx !== this.quote.q.markPx) this.markLastChangedAt = now;
        this.quote = { q, at: now };
        this.quoteErr = undefined;
        h.lastSuccessAt = new Date(now).toISOString();
        this.sampleMark(q, now);
      } catch (err) {
        this.quoteErr = String((err as Error).message ?? err);
        h.lastErrorAt = new Date(now).toISOString();
        h.lastError = this.quoteErr;
      }
    })().finally(() => (this.quoteInflight = null));
    return this.quoteInflight;
  }

  private sampleMark(q: PriceQuote, now: number) {
    if (q.markPx === null) return;
    const sql = this.ctx.storage.sql;
    const last = sql.exec(`SELECT t, mark FROM marks ORDER BY t DESC LIMIT 1`).toArray()[0];
    if (this.markLastChangedAt === null) {
      // Cold start: recover "last change" from stored samples.
      const diff = sql.exec(`SELECT t FROM marks WHERE mark != ? ORDER BY t DESC LIMIT 1`, q.markPx).toArray()[0];
      const first = sql.exec(`SELECT t FROM marks WHERE mark = ? AND t > ? ORDER BY t ASC LIMIT 1`, q.markPx, (diff?.t as number) ?? 0).toArray()[0];
      this.markLastChangedAt = diff ? ((first?.t as number) ?? now) : null;
    }
    if (last && now - (last.t as number) < MARK_SAMPLE_MS) return;
    sql.exec(`INSERT OR REPLACE INTO marks (t, mark, oracle) VALUES (?, ?, ?)`, now, q.markPx, q.oraclePx);
    sql.exec(`DELETE FROM marks WHERE t < ?`, now - MARK_KEEP_MS);
  }

  private async refreshCandles() {
    const now = this.now();
    if (this.candles && now - this.candles.at < CANDLE_TTL) return;
    if (this.candlesInflight) return this.candlesInflight;
    this.candlesInflight = (async () => {
      try {
        this.src('price').upstreamRequests++;
        const c = await this.priceSource.candles(fetch, 125, now);
        this.candles = { c, at: now };
      } catch (err) {
        console.error('candles', err);
        if (this.candles) this.candles.at = now; // back off
      }
    })().finally(() => (this.candlesInflight = null));
    return this.candlesInflight;
  }

  async price() {
    await Promise.all([this.refreshQuote(), this.refreshCandles()]);
    const now = this.now();
    if (!this.quote) {
      const row = this.ctx.storage.sql.exec(`SELECT v FROM kv WHERE k = 'last:price'`).toArray()[0];
      if (!row) return null;
      const v = JSON.parse(row.v as string);
      return { ...v, stale: true, error: this.quoteErr, ageSeconds: Math.round((now - Date.parse(v.fetchedAt)) / 1000) };
    }
    const marks = this.ctx.storage.sql
      .exec(`SELECT t, mark FROM marks WHERE t >= ? ORDER BY t`, now - 2 * 3600_000 - 120_000)
      .toArray()
      .map((r) => ({ t: r.t as number, mark: r.mark as number })) as MarkPoint[];
    const v = buildPrice({
      source: this.priceSource,
      quote: this.quote.q,
      quoteAt: this.quote.at,
      candles: this.candles?.c ?? [],
      marks,
      markLastChangedAt: this.markLastChangedAt,
      now,
      stale: !!this.quoteErr,
      error: this.quoteErr,
    });
    // Persist roughly once a minute for cold-start fallback.
    const lastSaved = this.ctx.storage.sql.exec(`SELECT v FROM kv WHERE k = 'ts:price'`).toArray()[0];
    if (!lastSaved || now - Number(lastSaved.v) > 60_000) {
      this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('last:price', ?), ('ts:price', ?)`, JSON.stringify(v), String(now));
    }
    return v;
  }

  // ---------- Alerts (cron) ----------

  async cron() {
    const s = await this.summary();
    await this.refreshQuote();
    const sql = this.ctx.storage.sql;
    const row = sql.exec(`SELECT v FROM kv WHERE k = 'alerts'`).toArray()[0];
    const prev: AlertState = row ? JSON.parse(row.v as string) : initialAlertState();
    const thresholds = (this.env.ALERT_THRESHOLDS_PP ?? '0.5,0.2,0.1').split(',').map(Number).filter((n) => n > 0);
    const { messages, next } = evaluateAlerts(prev, s && !s.stale ? s : null, this.now(), { thresholdsPp: thresholds, staleAfterMs: 180_000, hysteresisPp: 0.05 });
    sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('alerts', ?)`, JSON.stringify(next));
    const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = this.env;
    for (const m of messages) {
      console.log(JSON.stringify({ alert: m, telegram: !!(token && chat) }));
      if (token && chat) {
        try {
          await sendTelegram(fetch, token, chat, m);
          this.alertInfo = { lastSentAt: new Date().toISOString(), lastMessage: m };
        } catch (err) {
          console.error('telegram', err);
        }
      }
    }
    return { messages };
  }

  history(): HistoryPoint[] {
    return this.ctx.storage.sql
      .exec(`SELECT data FROM history ORDER BY t`)
      .toArray()
      .map((r) => JSON.parse(r.data as string));
  }

  healthReport(): HealthResponse {
    const now = this.now();
    for (const h of Object.values(this.health)) h.ageSeconds = h.lastSuccessAt ? Math.round((now - Date.parse(h.lastSuccessAt)) / 1000) : null;
    return {
      now: new Date(now).toISOString(),
      version: this.env.BUILD_VERSION ?? 'dev',
      replay: false,
      instanceStartedAt: this.startedAt,
      priceSource: this.priceSource.name,
      priceSymbol: this.priceSource.symbol,
      tseBaseUrl: tseConfig(this.env).baseUrl,
      sources: { tse: this.src('tse'), price: this.src('price') },
      alerts: { enabled: !!(this.env.TELEGRAM_BOT_TOKEN && this.env.TELEGRAM_CHAT_ID), ...this.alertInfo },
    };
  }

  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    const cfg = tseConfig(this.env);
    const unavailable = (what: string) => json({ error: `${what}: источник недоступен и сохранённых данных нет`, stale: true }, 503);
    switch (pathname) {
      case '/api/summary':
        return (await this.summary().then((v) => v && json(v))) ?? unavailable('TSE');
      case '/api/states': {
        const v = await this.withLastGood('states', () => getStates(this.reader(), cfg), (x) => x.states.map((s) => s.sourceUpdatedAt).join());
        return v ? json(v) : unavailable('TSE');
      }
      case '/api/sp': {
        const v = await this.withLastGood('sp', () => getSp(this.reader(), cfg), (x) => x.regions.map((r) => `${r.countedPct}:${r.flavioMinusLulaVotes}`).join());
        return v ? json(v) : unavailable('TSE');
      }
      case '/api/price': {
        const v = await this.price();
        return v ? json(v) : unavailable('Цена');
      }
      case '/api/history': {
        await this.summary();
        return json({ fetchedAt: new Date().toISOString(), stale: false, ageSeconds: 0, points: this.history() });
      }
      case '/api/health':
        return json(this.healthReport());
      case '/cron':
        return json(await this.cron());
      default:
        return json({ error: 'not found' }, 404);
    }
  }
}

export { TTL };
