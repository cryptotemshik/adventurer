import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import { MIGRATIONS } from "./migrations";

export type Method = "run" | "all" | "values" | "get";
export interface SqlQuery {
  sql: string;
  params: unknown[];
  method: Method;
}
export interface SqlResult {
  rows: unknown[];
}
/** Minimal transport every backend implements: Durable Object SQLite, HTTP (jobs), node:sqlite (dev/tests). */
export interface SqlBackend {
  query(q: SqlQuery): Promise<SqlResult>;
  /** executed atomically */
  batch(qs: SqlQuery[]): Promise<SqlResult[]>;
}

export type Db = SqliteRemoteDatabase<typeof schema>;

export function createDb(backend: SqlBackend): Db {
  return drizzle(
    async (sql, params, method) => backend.query({ sql, params, method: method as Method }),
    async (queries) => backend.batch(queries.map((q) => ({ sql: q.sql, params: q.params, method: q.method as Method }))),
    { schema },
  );
}

/** Shape rows for drizzle's proxy contract from a raw array-of-arrays result. */
export function shapeRows(method: Method, rows: unknown[][]): SqlResult {
  if (method === "get") return { rows: (rows[0] ?? undefined) as unknown as unknown[] };
  if (method === "run") return { rows: [] };
  return { rows };
}

/** Synchronous SQL executor shared by the DO and node:sqlite backends. */
export interface SyncExec {
  exec(sql: string, params: unknown[]): unknown[][];
  transaction<T>(fn: () => T): T;
}

export function syncBackend(x: SyncExec): SqlBackend {
  const run = (q: SqlQuery) => shapeRows(q.method, x.exec(q.sql, normalizeParams(q.params)));
  return {
    query: async (q) => run(q),
    batch: async (qs) => x.transaction(() => qs.map(run)),
  };
}

export function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : typeof p === "bigint" ? p.toString() : p === undefined ? null : p));
}

/** Apply embedded migrations idempotently. */
export function migrateSync(x: SyncExec): string[] {
  x.exec("CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)", []);
  const done = new Set(x.exec("SELECT name FROM __migrations", []).map((r) => String(r[0])));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    x.transaction(() => {
      for (const s of m.statements) x.exec(s, []);
      x.exec("INSERT INTO __migrations (name, applied_at) VALUES (?, ?)", [m.name, Date.now()]);
    });
    applied.push(m.name);
  }
  return applied;
}

/** HTTP backend used by GitHub Actions jobs: talks to the worker's /api/internal/sql endpoint. */
export function httpBackend(url: string, token: string): SqlBackend {
  const post = async (body: unknown) => {
    let lastErr: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`db http ${r.status}: ${(await r.text()).slice(0, 300)}`);
        return (await r.json()) as unknown;
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, 500 * 2 ** i));
      }
    }
    throw lastErr;
  };
  return {
    query: async (q) => (await post({ queries: [q], batch: false })) as SqlResult,
    batch: async (qs) => (await post({ queries: qs, batch: true })) as SqlResult[],
  };
}
