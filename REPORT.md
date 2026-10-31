# REPORT

**Live site:** https://bias.michaelworkarb.workers.dev (Cloudflare Worker `bias`, free plan, Hyperliquid **testnet**).
Every page returns 200. The database (SQLite in a Durable Object) is live. Lighthouse on `/`: performance 91, accessibility 100, best practices 100, SEO 100.

**Launches are open:** seeds were generated and 50 market addresses (vault + HL account + agent) are in the production address pool. `TREASURY_PUBKEY` is the platform vault `5dLSe3mUrMsekYFq4BjJTjW9rzb7zQwVvu1Rm5PVpWU7`.

**Still needed from you:** paste the values from `.bias-secrets.txt` (repo root, git-ignored) into GitHub so the `tick` / `buyback` workflows run; the agent has no GitHub secrets API. Until then, creator fees stay safely in each market vault.

## What was built

| # | Phase | Status |
|---|---|---|
| 0 | pnpm monorepo, ESLint, Prettier, CI, `.env.example`, DB schema + migrations, design tokens, layout, wallet + SIWS | ✅ (Drizzle + Durable Object SQLite instead of Prisma + Postgres, see DECISIONS) |
| 1 | `packages/engine`: strategies, guardrails, sizing, `decide()`, exchange simulator, scenario tests | ✅ includes "−40% on 5× → SL, not liquidation" |
| 2 | `packages/keys` + `packages/hl`: key derivation, agent approval, orders, SL/TP triggers, isolated margin, spot↔perp transfers, spotSend | ✅ unit tests. The testnet integration test exists but is **skipped** (no funded testnet key in this environment) |
| 3 | `packages/chain`: pump.fun create with creator = vault, claim, split, transfers, Hyperunit bridge, buys, burn, DRY_RUN | ✅ create and claim pass mainnet `simulateTransaction` |
| 4 | `jobs/tick.ts`, `jobs/buyback.ts`, `jobs/reconcile.ts`, workflows, idempotency (`operations` + unique ledger op ids), lock table | ✅ end-to-end test: fees → position → TP → withdraw → buyback → burn (simulated venue and chain) |
| 5 | UI: markets, launch with live guardrail preview, market page with chart lines (entry, SL, TP1–3, liq), activity, OG images | ✅ deployed |
| 6 | Basket, pair and funding-farm strategies in engine and execution | ✅ tested, including funding flip and rebalance |
| 7 | Community bias: rounds, sqrt weights, 10% cap, quorum, apply in job, 24h flip limit | ✅ tested ("no quorum → no change", "flip ≤ 1 per 24h") |
| 8 | `/proof` (reconciliation, JSON export), `/graveyard` (tombstones, epitaphs, pay respects) | ✅ a >1% mismatch in a test fixture turns the line red |
| 9 | $BIAS: flagship market, platform buyback, tiers and strategy gating, `/bias` | ✅ tiers tested |
| 10 | Admin, kill switches, circuit breaker, alerts, `/docs`, `/explore` + CSV, SEO, a11y | ✅ circuit-breaker test switches to close_only |
| 11 | `twitter/` and `launch/` with generated images | ✅ every PNG is the exact size, checked by tests |
| 12 | Playwright e2e (DRY_RUN launch with a mock wallet → market in the feed → vote), docs | ✅ |

**Checks:** `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test` 107 passed, 4 skipped (network/testnet-key gated) · `pnpm test:e2e` 2 passed · `scripts/check-no-secrets.mjs` finds no seeds in the client bundle or the worker.

## Stubbed, unverified, or limited

- **Hyperliquid testnet trading has never run with real funds.** No funded testnet key was available. Run `HL_TESTNET_PRIVATE_KEY=… pnpm vitest run packages/hl` before trusting it.
- **No automatic bridge on testnet.** Hyperunit testnet connects HL testnet to Solana *devnet*, so mainnet creator fees cannot reach HL testnet. With `HL_NETWORK=testnet`:
  - fees are claimed, split, paid out and stay in the vault;
  - to test trading, fund a market's HL testnet account with faucet USDC;
  - the next `buyback` run then approves the agent and `tick` trades.
  `FORCE_BRIDGE=1` overrides this; only use it with mainnet.
- **Hyperunit mainnet** `/gen` returned 403 from this container (Cloudflare WAF). Verify it from a GitHub Actions run. Guardian signatures are checked but not enforced; bridge addresses are pinned per market and a change halts that market.
- **pump.fun IPFS upload** (`/api/ipfs`) has not been exercised live; DRY_RUN uses a fake URI. Test one real launch with a small dev buy.
- **Dev buy** goes in a second transaction (create + buy is 1270 bytes, over the 1232 limit). Create the lookup table (`createLaunchLookupTable`) and set `LAUNCH_LOOKUP_TABLE` to make it atomic.
- **DRY_RUN launch simulation** reports `AccountNotFound` when the signer has no SOL. Set `DRY_RUN_PAYER` to a funded address.
- **Funding windows** are the average of HL hourly funding over the last two 8-hour windows.
- **Launch fee is 0 until `TREASURY_PUBKEY` is set.**
- **Fill matching:** trigger fills are matched to TP/SL by order id. If the job crashes between placing triggers and saving them, the next tick re-syncs the triggers, but that one fill is labelled "other".

## What you must do (keys and settings)

Follow [SETUP.md](SETUP.md):
1. Generate `MASTER_SEED` and `AGENT_SEED` offline.
2. Add GitHub environment `production` (branch `dapp` only) with `MASTER_SEED`, `AGENT_SEED`, `JOB_TOKEN`, `SOLANA_RPC`.
3. Add repository variables `BIAS_DB_URL`, `HL_NETWORK`, `TREASURY_PUBKEY`, `BIAS_MINT`.
4. Rotate `JOB_TOKEN` on the worker (`wrangler secret put JOB_TOKEN`) and use the same value in GitHub.
5. Set `ADMIN_WALLETS` (your wallet) and `TREASURY_PUBKEY` in `apps/web/wrangler.jsonc`, then `pnpm deploy`.
6. Run the `buyback` workflow, then the `tick` workflow, to fill the address pool. Launches then open.
7. Launch $BIAS from `/launch` with the flagship box ticked (admin only), following `launch/coin.md`.

How to deploy: [DEPLOY.md](DEPLOY.md).

## Security checklist before `HL_NETWORK=mainnet`

- [ ] Seeds were generated offline, backed up twice on paper, and exist only in GitHub `production` secrets restricted to `dapp`.
- [ ] `pnpm tsx jobs/provision.ts 0 3` matches `/proof` addresses; vault #0 imports into Phantom.
- [ ] `node scripts/check-no-secrets.mjs` passes on the deployed build; no seed in the Cloudflare vars or secrets (`wrangler secret list`).
- [ ] `JOB_TOKEN` rotated and ≥ 32 bytes; `/api/internal/sql` returns 401 without it.
- [ ] Full end-to-end run on HL testnet with a funded test account: open → SL and TP visible on the exchange → TP fill → profit queue → withdraw path (testnet).
- [ ] **For every allowlisted asset:** open a minimum-size position on testnet and confirm the SL trigger appears and sits before the liquidation price (`/t/<mint>` chart shows SL above liq for longs).
- [ ] Hyperunit mainnet deposit and withdraw tested with 0.15 SOL from a GitHub Actions runner (WAF check); pinned addresses recorded.
- [ ] First week limits: `MAX_NOTIONAL_PER_MARKET_USD=2000`, `MAX_TOTAL_NOTIONAL_USD=20000` (set in `/admin`).
- [ ] `/proof` reconciliation is green for every market after a day of runs; alerts in `/admin` reviewed.
- [ ] Kill switches tested: `close_only`, then `halted`, then back to `normal` from `/admin`.
- [ ] One real launch with a 0.01 SOL dev buy: creator = vault on pump.fun, launch fee arrived, market went to `waiting_for_fees`.
- [ ] `ADMIN_WALLETS` contains only hardware-backed wallets.
- [ ] Switch to mainnet with the repo variable `HL_NETWORK=mainnet` and the worker var `HL_NETWORK`, then run `tick` manually once and watch it.

> positions are leveraged and can lose everything. vaults are operated by the platform. memecoins are extremely risky. nothing here is financial advice.
