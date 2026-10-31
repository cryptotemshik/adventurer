import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** All money columns are integer base units stored as TEXT (bigint-safe): lamports, micro-USD, raw token units. */
export const markets = sqliteTable(
  "markets",
  {
    id: text("id").primaryKey(),
    idx: integer("idx").notNull(),
    mint: text("mint"),
    name: text("name").notNull(),
    ticker: text("ticker").notNull(),
    description: text("description").notNull().default(""),
    image: text("image").notNull().default(""),
    metadataUri: text("metadata_uri").notNull().default(""),
    socials: text("socials").notNull().default("{}"),
    launcher: text("launcher").notNull(),
    payoutWallet: text("payout_wallet").notNull(),
    solVault: text("sol_vault").notNull(),
    hlAccount: text("hl_account").notNull(),
    hlAgent: text("hl_agent").notNull(),
    agentApproved: integer("agent_approved", { mode: "boolean" }).notNull().default(false),
    strategy: text("strategy").notNull(),
    community: integer("community", { mode: "boolean" }).notNull().default(false),
    flagship: integer("flagship", { mode: "boolean" }).notNull().default(false),
    deskBadge: integer("desk_badge", { mode: "boolean" }).notNull().default(false),
    featuredUntil: integer("featured_until"),
    status: text("status").notNull().default("pending_launch"),
    direction: text("direction").notNull().default("long"),
    paused: integer("paused", { mode: "boolean" }).notNull().default(false),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    tpStages: text("tp_stages").notNull().default("{}"),
    consecutiveStops: integer("consecutive_stops").notNull().default(0),
    cooldownUntil: integer("cooldown_until"),
    stoppedAt: integer("stopped_at"),
    lastFlipAt: integer("last_flip_at"),
    lastAddAt: integer("last_add_at"),
    lastFeeAt: integer("last_fee_at"),
    lastClaimAt: integer("last_claim_at"),
    lastPayoutAt: integer("last_payout_at"),
    lastFillAt: integer("last_fill_at"),
    endedAt: integer("ended_at"),
    endReason: text("end_reason"),
    launchSig: text("launch_sig"),
    createdAt: integer("created_at").notNull(),
    // ---- snapshot cache for the UI (written by jobs) ----
    equityUsd: text("equity_usd").notNull().default("0"),
    upnlUsd: text("upnl_usd").notNull().default("0"),
    notionalUsd: text("notional_usd").notNull().default("0"),
    realizedPnlUsd: text("realized_pnl_usd").notNull().default("0"),
    profitTakenUsd: text("profit_taken_usd").notNull().default("0"),
    profitQueueUsd: text("profit_queue_usd").notNull().default("0"),
    depositedUsd: text("deposited_usd").notNull().default("0"),
    feesClaimed: text("fees_claimed").notNull().default("0"),
    feesLauncher: text("fees_launcher").notNull().default("0"),
    feesPlatform: text("fees_platform").notNull().default("0"),
    feesPosition: text("fees_position").notNull().default("0"),
    pipelineLamports: text("pipeline_lamports").notNull().default("0"),
    owedLauncher: text("owed_launcher").notNull().default("0"),
    owedPlatform: text("owed_platform").notNull().default("0"),
    inTransitLamports: text("in_transit_lamports").notNull().default("0"),
    boughtBackLamports: text("bought_back_lamports").notNull().default("0"),
    burnedTokens: text("burned_tokens").notNull().default("0"),
    burnedPct: real("burned_pct").notNull().default(0),
    mcapUsd: real("mcap_usd").notNull().default(0),
    priceUsd: real("price_usd").notNull().default(0),
    bondingProgress: real("bonding_progress").notNull().default(0),
    graduated: integer("graduated", { mode: "boolean" }).notNull().default(false),
    riskToSl: real("risk_to_sl"),
    riskToLiq: real("risk_to_liq"),
    closestTp: real("closest_tp"),
    respects: integer("respects").notNull().default(0),
    reconOk: integer("recon_ok", { mode: "boolean" }).notNull().default(true),
    reconJson: text("recon_json").notNull().default("[]"),
    snapshotAt: integer("snapshot_at"),
  },
  (t) => [
    uniqueIndex("markets_idx").on(t.idx),
    uniqueIndex("markets_mint").on(t.mint),
    index("markets_status").on(t.status),
    index("markets_created").on(t.createdAt),
  ],
);

export const positions = sqliteTable("positions", {
  marketId: text("market_id").primaryKey(),
  /** JSON: LegState[] */
  legs: text("legs").notNull().default("[]"),
  /** JSON: { oid, asset, label, tpsl, triggerPx, sz }[] — trigger orders we placed */
  triggers: text("triggers").notNull().default("[]"),
  /** JSON: { [asset]: mark } at snapshot time */
  marks: text("marks").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});

export const ledger = sqliteTable(
  "ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: text("market_id").notNull(),
    type: text("type").notNull(),
    amount: text("amount").notNull(),
    asset: text("asset").notNull(),
    txid: text("txid"),
    opId: text("op_id"),
    note: text("note"),
    at: integer("at").notNull(),
  },
  (t) => [index("ledger_market").on(t.marketId, t.type), uniqueIndex("ledger_op").on(t.opId, t.type)],
);

export const operations = sqliteTable(
  "operations",
  {
    id: text("id").primaryKey(),
    marketId: text("market_id"),
    type: text("type").notNull(),
    status: text("status").notNull(),
    txids: text("txids").notNull().default("[]"),
    payload: text("payload").notNull().default("{}"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("operations_status").on(t.status, t.type)],
);

export const equitySnapshots = sqliteTable(
  "equity_snapshots",
  {
    marketId: text("market_id").notNull(),
    at: integer("at").notNull(),
    equityUsd: text("equity_usd").notNull(),
    upnlUsd: text("upnl_usd").notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.at] })],
);

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: text("market_id"),
    type: text("type").notNull(),
    message: text("message").notNull(),
    txid: text("txid"),
    chain: text("chain"),
    amount: text("amount"),
    at: integer("at").notNull(),
  },
  (t) => [index("events_market").on(t.marketId, t.at), index("events_at").on(t.at), index("events_type").on(t.type)],
);

export const voteRounds = sqliteTable(
  "vote_rounds",
  {
    marketId: text("market_id").notNull(),
    round: text("round").notNull(),
    status: text("status").notNull().default("open"),
    longW: real("long_w").notNull().default(0),
    shortW: real("short_w").notNull().default(0),
    flatW: real("flat_w").notNull().default(0),
    wallets: integer("wallets").notNull().default(0),
    quorum: integer("quorum", { mode: "boolean" }).notNull().default(false),
    winner: text("winner"),
    applied: integer("applied", { mode: "boolean" }).notNull().default(false),
    finalizedAt: integer("finalized_at"),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.round] })],
);

export const votes = sqliteTable(
  "votes",
  {
    marketId: text("market_id").notNull(),
    round: text("round").notNull(),
    wallet: text("wallet").notNull(),
    choice: text("choice").notNull(),
    balance: text("balance").notNull(),
    signature: text("signature").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.round, t.wallet] })],
);

export const pendingLaunches = sqliteTable("pending_launches", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull(),
  wallet: text("wallet").notNull(),
  mint: text("mint").notNull(),
  launchFeeLamports: text("launch_fee_lamports").notNull(),
  input: text("input").notNull(),
  signature: text("signature"),
  status: text("status").notNull().default("prepared"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Pre-provisioned public addresses (seeds never leave GitHub Actions). */
export const addressPool = sqliteTable("address_pool", {
  idx: integer("idx").primaryKey(),
  solVault: text("sol_vault").notNull(),
  hlAccount: text("hl_account").notNull(),
  hlAgent: text("hl_agent").notNull(),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const tierCache = sqliteTable("tier_cache", {
  wallet: text("wallet").primaryKey(),
  balance: text("balance").notNull(),
  tier: text("tier").notNull(),
  at: integer("at").notNull(),
});

export const balanceCache = sqliteTable(
  "balance_cache",
  {
    wallet: text("wallet").notNull(),
    mint: text("mint").notNull(),
    balance: text("balance").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.wallet, t.mint] })],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  wallet: text("wallet").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const nonces = sqliteTable("nonces", {
  nonce: text("nonce").primaryKey(),
  createdAt: integer("created_at").notNull(),
  usedAt: integer("used_at"),
});

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: integer("window_start").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const alerts = sqliteTable(
  "alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: text("market_id"),
    level: text("level").notNull(),
    message: text("message").notNull(),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    at: integer("at").notNull(),
  },
  (t) => [index("alerts_open").on(t.resolved, t.at)],
);

export const adminLog = sqliteTable("admin_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  wallet: text("wallet").notNull(),
  action: text("action").notNull(),
  payload: text("payload").notNull().default("{}"),
  at: integer("at").notNull(),
});

export const respectsPaid = sqliteTable("respects_paid", {
  key: text("key").primaryKey(),
  marketId: text("market_id").notNull(),
  wallet: text("wallet").notNull(),
  at: integer("at").notNull(),
});

export const locks = sqliteTable("locks", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    job: text("job").notNull(),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
    ok: integer("ok", { mode: "boolean" }),
    summary: text("summary").notNull().default(""),
    error: text("error"),
  },
  (t) => [index("job_runs_job").on(t.job, t.startedAt)],
);

export const platformStats = sqliteTable("platform_stats", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  at: integer("at").notNull(),
});
