# bias — every coin has a bias.

Launch a coin on **pump.fun**, pick a position. The coin's creator fees fund a leveraged position on **Hyperliquid**; realized profit buys the coin back and burns it. Stops included.

**Live:** https://biasonsol.fun (also https://bias.michaelworkarb.workers.dev) (Cloudflare Workers free plan · Hyperliquid **testnet**)

- max 5× (pairs 3×, funding 1×), a stop-loss on the exchange from the first second, a take-profit ladder, a liquidation guard, cooldown & re-entry
- fees split **70 / 20 / 10** — position / launcher / $BIAS buyback
- strategies: single, basket, pair, funding farm · optional daily holder vote (long / short / flat)
- `/proof` with every address, transaction and a reconciliation · `/graveyard` for stopped markets

## Layout

| path | what |
|---|---|
| `apps/web` | Next.js 15 (App Router) + Tailwind 4 → Cloudflare Worker via OpenNext; SQLite in a Durable Object |
| `packages/engine` | the market brain: risk guardrails, strategies, `decide()`, voting, tiers, reconciliation, exchange simulator — pure functions, fully tested |
| `packages/hl` | Hyperliquid client (agent trading, triggers, isolated margin, transfers) |
| `packages/chain` | Solana: pump.fun create (creator = market vault), claim, buy, burn, Hyperunit bridge, SIWS |
| `packages/keys` | deterministic key derivation (vaults, HL accounts, agents) |
| `packages/db` | Drizzle schema, migrations, repo; backends: Durable Object, HTTP (jobs), node:sqlite |
| `packages/shared` | config, types, zod schemas |
| `jobs/` | `tick.ts` (trading, agent key), `buyback.ts` (money flows, master key), `reconcile.ts`, `provision.ts` |
| `twitter/`, `launch/` | launch-day content, generated images, $BIAS coin data |

## Commands

```bash
pnpm install
pnpm dev               # http://localhost:3000 (local SQLite in apps/web/.data)
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e          # Playwright: DRY_RUN launch with a mock wallet → feed → vote
pnpm deploy            # Cloudflare (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
pnpm twitter:images    # regenerate twitter/images + launch/coin-1000.png
```

Read next: [SETUP.md](SETUP.md) (keys & secrets) · [DEPLOY.md](DEPLOY.md) · [DECISIONS.md](DECISIONS.md) · [REPORT.md](REPORT.md) (status + mainnet checklist).

> positions are leveraged and can lose everything. vaults are operated by the platform. memecoins are extremely risky. nothing here is financial advice.
