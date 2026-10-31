# SETUP — keys, secrets, first run

The site is already deployed. What is missing is **custody**: the seeds that own market vaults and Hyperliquid accounts. Only you should create them.

## 1. Generate two seeds offline

On an offline machine (or at least a clean one), in a checkout of this repo:

```bash
pnpm install
pnpm tsx jobs/gen-seed.ts   # → MASTER_SEED (24 words)
pnpm tsx jobs/gen-seed.ts   # → AGENT_SEED  (24 words)
```

- `MASTER_SEED` owns every market's Solana vault (`m/44'/501'/i'/0'`) and Hyperliquid account (`m/44'/60'/0'/0/i`). It can withdraw.
- `AGENT_SEED` derives each market's Hyperliquid **agent** (API wallet) at `m/44'/60'/0'/0/i`. It can trade, not withdraw.
- Back both up on paper (two copies, two places). Never paste them into Cloudflare, a chat or a ticket.

Check the addresses (and note the **platform vault**):

```bash
MASTER_SEED="…" AGENT_SEED="…" pnpm tsx jobs/provision.ts 0 3
```

The vault of market #0 imports into Phantom with the master seed (account index 0) — a good sanity check.

## 2. GitHub (repo → Settings)

1. **Environments → New environment `production`** → *Deployment branches*: selected branches → `dapp` only.
2. Environment **secrets** (`production`):
   - `MASTER_SEED` — used only by `.github/workflows/buyback.yml`
   - `AGENT_SEED` — used only by `.github/workflows/tick.yml`
   - `JOB_TOKEN` — 64 hex chars, the same value as the Cloudflare secret (step 3)
   - `SOLANA_RPC` — Helius free RPC URL
3. Repository **secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (for `deploy.yml`).
4. Repository **variables**: `BIAS_DB_URL=https://biasonsol.fun/api/internal/sql`, `HL_NETWORK=testnet`, `TREASURY_PUBKEY=<platform vault from step 1>`, `BIAS_MINT` (empty until launch), `DRY_RUN=false`.

Secrets are not readable from a public repo's logs or forks.

## 3. Cloudflare (worker `bias`)

```bash
cd apps/web
openssl rand -hex 32 | tee /dev/tty | npx wrangler secret put JOB_TOKEN     # copy the same value into GitHub
echo "<helius url>" | npx wrangler secret put SOLANA_RPC
```

Edit `apps/web/wrangler.jsonc` → `vars`: `ADMIN_WALLETS` (your wallet), `TREASURY_PUBKEY`, later `BIAS_MINT`, then `pnpm deploy`.
A `JOB_TOKEN` is already set on the deployed worker; replace it with your own as above.

## 4. First run

1. Actions → **buyback** → *Run workflow*: creates 50 market addresses (vault + HL account) in the pool.
2. Actions → **tick** → *Run workflow*: adds the agent addresses. Launches are now possible (`/admin` shows `address pool: 50/50 free`).
3. Launch $BIAS: see `launch/coin.md`.

## Local development

```bash
pnpm dev                                   # SQLite at apps/web/.data/bias.db
# fill the local address pool with the public test mnemonic (NEVER for real funds):
TEST="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
MASTER_SEED="$TEST" AGENT_SEED="$TEST" BIAS_SQLITE_PATH=apps/web/.data/bias.db pnpm tsx jobs/provision.ts 0 10 --insert
```

`DRY_RUN=true` builds and simulates Solana transactions without sending them.
