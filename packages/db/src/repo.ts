import { and, asc, desc, eq, gt, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./driver";
import * as t from "./schema";

export type Market = typeof t.markets.$inferSelect;
export type NewMarket = typeof t.markets.$inferInsert;
export type EventRow = typeof t.events.$inferSelect;
export type LedgerRow = typeof t.ledger.$inferSelect;

const now = () => Date.now();

// ---------------- settings ----------------
export async function getSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.select().from(t.settings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export async function setSetting(db: Db, key: string, value: string) {
  await db
    .insert(t.settings)
    .values({ key, value, updatedAt: now() })
    .onConflictDoUpdate({ target: t.settings.key, set: { value, updatedAt: now() } });
}

// ---------------- markets ----------------
export type MarketSort = "newest" | "mcap" | "pnl" | "largest" | "burned" | "tp";
export interface MarketFilter {
  sort?: MarketSort;
  strategy?: string;
  asset?: string;
  side?: string;
  community?: boolean;
  bonding?: "bonding" | "graduated";
  status?: string[];
  q?: string;
  includeHidden?: boolean;
  includePending?: boolean;
  /** undefined = both, true = only demo, false = only real */
  demo?: boolean;
  limit?: number;
  offset?: number;
}

const num = (c: SQL | typeof t.markets.equityUsd) => sql`CAST(${c} AS REAL)`;

export async function listMarkets(db: Db, f: MarketFilter = {}): Promise<Market[]> {
  const where: SQL[] = [];
  if (!f.includeHidden) where.push(eq(t.markets.hidden, false));
  if (!f.includePending) where.push(sql`${t.markets.status} != 'pending_launch'`);
  if (f.status?.length) where.push(inArray(t.markets.status, f.status));
  if (f.demo !== undefined) where.push(eq(t.markets.demo, f.demo));
  if (f.strategy) where.push(sql`json_extract(${t.markets.strategy}, '$.type') = ${f.strategy}`);
  if (f.asset) where.push(sql`${t.markets.strategy} LIKE ${`%"${f.asset}"%`}`);
  if (f.side) where.push(eq(t.markets.direction, f.side));
  if (f.community !== undefined) where.push(eq(t.markets.community, f.community));
  if (f.bonding === "bonding") where.push(eq(t.markets.graduated, false));
  if (f.bonding === "graduated") where.push(eq(t.markets.graduated, true));
  if (f.q) {
    const q = `%${f.q.replace(/^\$/, "").toLowerCase()}%`;
    const w = or(sql`lower(${t.markets.name}) LIKE ${q}`, sql`lower(${t.markets.ticker}) LIKE ${q}`, sql`${t.markets.mint} LIKE ${q}`);
    if (w) where.push(w);
  }
  const order = (() => {
    switch (f.sort) {
      case "mcap":
        return [desc(t.markets.mcapUsd)];
      case "pnl":
        return [desc(sql`CAST(${t.markets.realizedPnlUsd} AS REAL) + CAST(${t.markets.upnlUsd} AS REAL)`)];
      case "largest":
        return [desc(num(t.markets.equityUsd))];
      case "burned":
        return [desc(num(sql`${t.markets.boughtBackLamports}`))];
      case "tp":
        return [asc(sql`coalesce(${t.markets.closestTp}, 1e9)`)];
      default:
        return [desc(t.markets.createdAt)];
    }
  })();
  return db
    .select()
    .from(t.markets)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...order)
    .limit(Math.min(f.limit ?? 60, 500))
    .offset(f.offset ?? 0);
}

export async function getMarket(db: Db, idOrMint: string): Promise<Market | undefined> {
  const rows = await db
    .select()
    .from(t.markets)
    .where(or(eq(t.markets.id, idOrMint), eq(t.markets.mint, idOrMint)))
    .limit(1);
  return rows[0];
}

export async function insertMarket(db: Db, m: NewMarket) {
  await db.insert(t.markets).values(m);
}

export async function updateMarket(db: Db, id: string, patch: Partial<NewMarket>) {
  if (!Object.keys(patch).length) return;
  await db.update(t.markets).set(patch).where(eq(t.markets.id, id));
}

export async function activeMarkets(db: Db): Promise<Market[]> {
  return db
    .select()
    .from(t.markets)
    .where(and(sql`${t.markets.status} NOT IN ('pending_launch')`, eq(t.markets.demo, false)))
    .orderBy(asc(t.markets.idx));
}

export async function getPosition(db: Db, marketId: string) {
  const r = await db.select().from(t.positions).where(eq(t.positions.marketId, marketId)).limit(1);
  return r[0];
}

export async function upsertPosition(db: Db, p: typeof t.positions.$inferInsert) {
  await db
    .insert(t.positions)
    .values(p)
    .onConflictDoUpdate({ target: t.positions.marketId, set: { legs: p.legs, triggers: p.triggers, marks: p.marks, updatedAt: p.updatedAt } });
}

// ---------------- events / ledger ----------------
export async function addEvent(db: Db, e: Omit<typeof t.events.$inferInsert, "at"> & { at?: number }) {
  await db.insert(t.events).values({ ...e, at: e.at ?? now() });
}

export async function listEvents(
  db: Db,
  o: { marketId?: string; types?: string[]; limit?: number; before?: number } = {},
): Promise<(EventRow & { ticker: string | null; mint: string | null; image: string | null; demo: boolean })[]> {
  const where: SQL[] = [];
  if (o.marketId) where.push(eq(t.events.marketId, o.marketId));
  if (o.types?.length) where.push(inArray(t.events.type, o.types));
  if (o.before) where.push(lt(t.events.id, o.before));
  where.push(or(sql`${t.markets.hidden} IS NULL`, eq(t.markets.hidden, false))!);
  const rows = await db
    .select({ e: t.events, ticker: t.markets.ticker, mint: t.markets.mint, image: t.markets.image, demo: t.markets.demo })
    .from(t.events)
    .leftJoin(t.markets, eq(t.events.marketId, t.markets.id))
    .where(and(...where))
    .orderBy(desc(t.events.id))
    .limit(Math.min(o.limit ?? 50, 1000));
  return rows.map((r) => ({ ...r.e, ticker: r.ticker, mint: r.mint, image: r.image, demo: !!r.demo }));
}

/** Idempotent ledger write: (opId, type) is unique, so a retried step never double-counts. */
export async function addLedger(db: Db, l: Omit<typeof t.ledger.$inferInsert, "at"> & { at?: number }) {
  await db.insert(t.ledger).values({ ...l, at: l.at ?? now() }).onConflictDoNothing();
}

export async function ledgerSums(db: Db, marketId?: string): Promise<Record<string, bigint>> {
  const rows = await db
    .select({ type: t.ledger.type, asset: t.ledger.asset, amounts: sql<string>`group_concat(${t.ledger.amount}, ',')` })
    .from(t.ledger)
    .where(marketId ? eq(t.ledger.marketId, marketId) : undefined)
    .groupBy(t.ledger.type, t.ledger.asset);
  const out: Record<string, bigint> = {};
  for (const r of rows) {
    // exact bigint sum (SQLite SUM would go through 64-bit ints/floats)
    const sum = (r.amounts ?? "").split(",").filter(Boolean).reduce((a, b) => a + BigInt(b), 0n);
    out[`${r.type}:${r.asset}`] = sum;
  }
  return out;
}

export async function listLedger(db: Db, marketId?: string, limit = 5000) {
  return db
    .select()
    .from(t.ledger)
    .where(marketId ? eq(t.ledger.marketId, marketId) : undefined)
    .orderBy(desc(t.ledger.id))
    .limit(limit);
}

// ---------------- operations (idempotency) ----------------
export type Operation = typeof t.operations.$inferSelect;

/** Returns the existing op if one with this id exists, otherwise records a new pending op. */
export async function beginOp(db: Db, id: string, type: string, marketId: string | null, payload: unknown = {}): Promise<Operation> {
  await db
    .insert(t.operations)
    .values({ id, type, marketId, status: "pending", payload: JSON.stringify(payload), createdAt: now(), updatedAt: now() })
    .onConflictDoNothing();
  const r = await db.select().from(t.operations).where(eq(t.operations.id, id)).limit(1);
  return r[0]!;
}

export async function updateOp(db: Db, id: string, patch: { status?: string; txids?: string[]; error?: string | null; payload?: unknown }) {
  const set: Partial<typeof t.operations.$inferInsert> = { updatedAt: now() };
  if (patch.status) set.status = patch.status;
  if (patch.txids) set.txids = JSON.stringify(patch.txids);
  if (patch.error !== undefined) set.error = patch.error;
  if (patch.payload !== undefined) set.payload = JSON.stringify(patch.payload);
  await db
    .update(t.operations)
    .set({ ...set, attempts: sql`${t.operations.attempts} + 1` })
    .where(eq(t.operations.id, id));
}

export async function pendingOps(db: Db, types?: string[]) {
  return db
    .select()
    .from(t.operations)
    .where(and(inArray(t.operations.status, ["pending", "in_transit"]), types ? inArray(t.operations.type, types) : undefined))
    .orderBy(asc(t.operations.createdAt));
}

// ---------------- locks (replaces Postgres advisory locks) ----------------
export async function acquireLock(db: Db, name: string, holder: string, ttlMs: number): Promise<boolean> {
  const n = now();
  await db.delete(t.locks).where(and(eq(t.locks.name, name), lt(t.locks.expiresAt, n)));
  await db.insert(t.locks).values({ name, holder, expiresAt: n + ttlMs }).onConflictDoNothing();
  const r = await db.select().from(t.locks).where(eq(t.locks.name, name)).limit(1);
  return r[0]?.holder === holder;
}
export async function releaseLock(db: Db, name: string, holder: string) {
  await db.delete(t.locks).where(and(eq(t.locks.name, name), eq(t.locks.holder, holder)));
}

// ---------------- address pool ----------------
export async function takeAddress(db: Db) {
  const rows = await db.all<{ idx: number; sol_vault: string; hl_account: string; hl_agent: string }>(
    sql`UPDATE address_pool SET used = 1 WHERE idx = (SELECT idx FROM address_pool WHERE used = 0 AND hl_agent != '' AND sol_vault != '' ORDER BY idx LIMIT 1) RETURNING idx, sol_vault, hl_account, hl_agent`,
  );
  const r = rows[0] as unknown;
  if (!r) return null;
  const a = Array.isArray(r) ? r : Object.values(r as object);
  return { idx: Number(a[0]), solVault: String(a[1]), hlAccount: String(a[2]), hlAgent: String(a[3]) };
}
export async function poolStats(db: Db) {
  const r = await db
    .select({ free: sql<number>`sum(case when used = 0 and hl_agent != '' and sol_vault != '' then 1 else 0 end)`, unused: sql<number>`sum(case when used = 0 then 1 else 0 end)`, total: sql<number>`count(*)`, maxIdx: sql<number>`max(idx)` })
    .from(t.addressPool);
  return { free: Number(r[0]?.free ?? 0), unused: Number(r[0]?.unused ?? 0), total: Number(r[0]?.total ?? 0), maxIdx: r[0]?.maxIdx === null ? -1 : Number(r[0]?.maxIdx ?? -1) };
}
/** Rows created by the master side (vault + HL account) that still need the agent address from the agent side. */
export async function poolMissingAgents(db: Db, limit = 200) {
  return db.select().from(t.addressPool).where(eq(t.addressPool.hlAgent, "")).orderBy(asc(t.addressPool.idx)).limit(limit);
}
export async function setPoolAgent(db: Db, idx: number, hlAgent: string) {
  await db.update(t.addressPool).set({ hlAgent }).where(eq(t.addressPool.idx, idx));
}

export async function addPoolAddresses(db: Db, rows: { idx: number; solVault: string; hlAccount: string; hlAgent: string }[]) {
  // Durable Object SQLite allows at most 100 bound parameters per statement → 6 columns × 15 rows
  for (let i = 0; i < rows.length; i += 15) {
    const chunk = rows.slice(i, i + 15);
    await db.insert(t.addressPool).values(chunk.map((r) => ({ ...r, createdAt: now() }))).onConflictDoNothing();
  }
}

// ---------------- auth ----------------
export async function createNonce(db: Db, nonce: string) {
  await db.insert(t.nonces).values({ nonce, createdAt: now() });
  await db.delete(t.nonces).where(lt(t.nonces.createdAt, now() - 3_600_000));
}
/** Consume a nonce once; valid for 10 minutes. */
export async function consumeNonce(db: Db, nonce: string): Promise<boolean> {
  const r = await db
    .update(t.nonces)
    .set({ usedAt: now() })
    .where(and(eq(t.nonces.nonce, nonce), sql`${t.nonces.usedAt} IS NULL`, gt(t.nonces.createdAt, now() - 600_000)))
    .returning({ nonce: t.nonces.nonce });
  return r.length === 1;
}
export async function createSession(db: Db, id: string, wallet: string, ttlMs: number) {
  await db.insert(t.sessions).values({ id, wallet, createdAt: now(), expiresAt: now() + ttlMs });
}
export async function getSession(db: Db, id: string) {
  const r = await db.select().from(t.sessions).where(and(eq(t.sessions.id, id), gt(t.sessions.expiresAt, now()))).limit(1);
  return r[0];
}
export async function deleteSession(db: Db, id: string) {
  await db.delete(t.sessions).where(eq(t.sessions.id, id));
}

/** Fixed-window rate limit. Returns true when allowed. */
export async function rateLimit(db: Db, key: string, limit: number, windowMs: number): Promise<boolean> {
  const n = now();
  const r = await db.select().from(t.rateLimits).where(eq(t.rateLimits.key, key)).limit(1);
  const row = r[0];
  if (!row || n - row.windowStart >= windowMs) {
    await db
      .insert(t.rateLimits)
      .values({ key, count: 1, windowStart: n })
      .onConflictDoUpdate({ target: t.rateLimits.key, set: { count: 1, windowStart: n } });
    return true;
  }
  if (row.count >= limit) return false;
  await db.update(t.rateLimits).set({ count: row.count + 1 }).where(eq(t.rateLimits.key, key));
  return true;
}

// ---------------- pending launches ----------------
export async function insertPending(db: Db, p: typeof t.pendingLaunches.$inferInsert) {
  await db.insert(t.pendingLaunches).values(p);
}
export async function getPending(db: Db, id: string) {
  const r = await db.select().from(t.pendingLaunches).where(eq(t.pendingLaunches.id, id)).limit(1);
  return r[0];
}
export async function updatePending(db: Db, id: string, patch: Partial<typeof t.pendingLaunches.$inferInsert>) {
  await db.update(t.pendingLaunches).set(patch).where(eq(t.pendingLaunches.id, id));
}
export async function unconfirmedPending(db: Db) {
  return db
    .select()
    .from(t.pendingLaunches)
    .where(and(inArray(t.pendingLaunches.status, ["prepared", "sent"]), gt(t.pendingLaunches.createdAt, now() - 86_400_000)));
}

// ---------------- votes ----------------
export async function upsertVote(db: Db, v: typeof t.votes.$inferInsert) {
  await db
    .insert(t.votes)
    .values(v)
    .onConflictDoUpdate({
      target: [t.votes.marketId, t.votes.round, t.votes.wallet],
      set: { choice: v.choice, balance: v.balance, signature: v.signature, at: v.at },
    });
}
export async function listVotes(db: Db, marketId: string, round: string) {
  return db.select().from(t.votes).where(and(eq(t.votes.marketId, marketId), eq(t.votes.round, round)));
}
export async function upsertRound(db: Db, r: typeof t.voteRounds.$inferInsert) {
  await db
    .insert(t.voteRounds)
    .values(r)
    .onConflictDoUpdate({
      target: [t.voteRounds.marketId, t.voteRounds.round],
      set: {
        status: r.status,
        longW: r.longW,
        shortW: r.shortW,
        flatW: r.flatW,
        wallets: r.wallets,
        quorum: r.quorum,
        winner: r.winner,
        applied: r.applied,
        finalizedAt: r.finalizedAt,
      },
    });
}
export async function listRounds(db: Db, marketId: string, limit = 30) {
  return db.select().from(t.voteRounds).where(eq(t.voteRounds.marketId, marketId)).orderBy(desc(t.voteRounds.round)).limit(limit);
}

// ---------------- misc ----------------
export async function payRespects(db: Db, key: string, marketId: string, wallet: string): Promise<boolean> {
  const r = await db.insert(t.respectsPaid).values({ key, marketId, wallet, at: now() }).onConflictDoNothing().returning({ key: t.respectsPaid.key });
  if (!r.length) return false;
  await db.update(t.markets).set({ respects: sql`${t.markets.respects} + 1` }).where(eq(t.markets.id, marketId));
  return true;
}

export async function addAlert(db: Db, level: "info" | "warn" | "critical", message: string, marketId: string | null = null) {
  await db.insert(t.alerts).values({ level, message, marketId, at: now() });
}
export async function listAlerts(db: Db, openOnly = true, limit = 100) {
  return db
    .select()
    .from(t.alerts)
    .where(openOnly ? eq(t.alerts.resolved, false) : undefined)
    .orderBy(desc(t.alerts.id))
    .limit(limit);
}
export async function resolveAlert(db: Db, id: number) {
  await db.update(t.alerts).set({ resolved: true }).where(eq(t.alerts.id, id));
}
export async function logAdmin(db: Db, wallet: string, action: string, payload: unknown) {
  await db.insert(t.adminLog).values({ wallet, action, payload: JSON.stringify(payload), at: now() });
}
export async function listAdminLog(db: Db, limit = 100) {
  return db.select().from(t.adminLog).orderBy(desc(t.adminLog.id)).limit(limit);
}

export async function startJob(db: Db, job: string): Promise<number> {
  const r = await db.insert(t.jobRuns).values({ job, startedAt: now() }).returning({ id: t.jobRuns.id });
  return r[0]!.id;
}
export async function finishJob(db: Db, id: number, ok: boolean, summary: string, error?: string) {
  await db.update(t.jobRuns).set({ finishedAt: now(), ok, summary, error: error ?? null }).where(eq(t.jobRuns.id, id));
}
export async function lastJobs(db: Db, limit = 20) {
  return db.select().from(t.jobRuns).orderBy(desc(t.jobRuns.id)).limit(limit);
}

export async function addEquitySnapshot(db: Db, marketId: string, equityUsd: string, upnlUsd: string, at = now()) {
  await db.insert(t.equitySnapshots).values({ marketId, at, equityUsd, upnlUsd }).onConflictDoNothing();
}
export async function equitySeries(db: Db, marketId: string, sinceMs = 0) {
  return db
    .select()
    .from(t.equitySnapshots)
    .where(and(eq(t.equitySnapshots.marketId, marketId), gt(t.equitySnapshots.at, sinceMs)))
    .orderBy(asc(t.equitySnapshots.at))
    .limit(5000);
}

export async function getStat(db: Db, key: string) {
  const r = await db.select().from(t.platformStats).where(eq(t.platformStats.key, key)).limit(1);
  return r[0]?.value;
}
export async function setStat(db: Db, key: string, value: string) {
  await db
    .insert(t.platformStats)
    .values({ key, value, at: now() })
    .onConflictDoUpdate({ target: t.platformStats.key, set: { value, at: now() } });
}

export async function getCachedBalance(db: Db, wallet: string, mint: string, maxAgeMs: number) {
  const r = await db
    .select()
    .from(t.balanceCache)
    .where(and(eq(t.balanceCache.wallet, wallet), eq(t.balanceCache.mint, mint), gt(t.balanceCache.at, now() - maxAgeMs)))
    .limit(1);
  return r[0] ? BigInt(r[0].balance) : null;
}
export async function setCachedBalance(db: Db, wallet: string, mint: string, balance: bigint) {
  await db
    .insert(t.balanceCache)
    .values({ wallet, mint, balance: balance.toString(), at: now() })
    .onConflictDoUpdate({ target: [t.balanceCache.wallet, t.balanceCache.mint], set: { balance: balance.toString(), at: now() } });
}
