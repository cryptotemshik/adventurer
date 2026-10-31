# DEPLOY — $0

Everything runs on free tiers:

| piece | where | cost |
|---|---|---|
| site + API + database | Cloudflare Worker `bias` (Workers Free) + SQLite Durable Object `BiasDb` | $0 |
| trading engine | GitHub Actions `tick.yml` every 15 min (public repo → unlimited minutes) + native Hyperliquid SL/TP triggers | $0 |
| money flows | GitHub Actions `buyback.yml` hourly | $0 |
| data | Hyperliquid Info API, DexScreener, Solana RPC (Helius free + public fallback) | $0 |
| images | pump.fun IPFS on launch; X images generated locally | $0 |

Network / bridge / Hyperliquid fees are paid from each market's own creator fees.

## Manual deploy

```bash
pnpm install
export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=…
pnpm deploy           # opennextjs-cloudflare build && wrangler deploy
node scripts/check-no-secrets.mjs
```

The worker bundle is ≈ 2.6 MB gzip (free limit: 3 MB). If it grows past the limit, drop `app/t/[mint]/opengraph-image.tsx` (the OG renderer is the biggest chunk) — pages fall back to `/og-default.png`.

## CI deploy

`.github/workflows/deploy.yml` deploys on every push to `dapp` once `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are repository secrets.

## Custom domain (optional, free)

Cloudflare dashboard → Workers → `bias` → Settings → Domains & Routes → add a domain on your Cloudflare zone. Then update `NEXT_PUBLIC_SITE_URL` in `wrangler.jsonc` and `BIAS_DB_URL` in GitHub variables.

## Backups

The Durable Object keeps 30 days of point-in-time recovery. For an off-site copy, `GET /api/proof` exports every market, ledger row and event as JSON.
