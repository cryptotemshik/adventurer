# $BIAS — pump.fun launch sheet

$BIAS is the flagship market. It is launched **through BIAS itself** (`/launch`, flagship flag) so that the pump.fun
creator is the flagship market's Solana vault and its creator fees enter the same 70 / 20 / 10 pipeline as every other market.

## Coin (pump.fun)

| Field | Value |
|---|---|
| **Name** | `bias` |
| **Ticker** | `BIAS` |
| **Description** | `every coin has a bias. $BIAS is the flagship market: its creator fees fund a leveraged position on hyperliquid, profit buys back & burns $BIAS. 10% of fees from every market burns $BIAS too. stops included. biasonsol.fun` |
| **Image** | `launch/coin-1000.png` (1000×1000, same artwork as the X avatar) |
| **X** | `https://x.com/biasdotfun` |
| **Telegram** | — |
| **Website** | `https://biasonsol.fun` |
| **Dev buy** | optional, ≤ `MAX_DEV_BUY_SOL` |

Description length: well under the 500-char limit.

## Flagship strategy (default)

| | |
|---|---|
| **Type** | Basket |
| **Side** | LONG |
| **Legs** | BTC 40% · SOL 30% · HYPE 30% (`weightBps` 4000 / 3000 / 3000) |
| **Leverage** | 3× (basket cap is 4×) |
| **Community bias** | **ON** — holders vote long / short / flat once per UTC day |
| **Flagship** | `flagship=true` |
| **Launcher payout (20%)** | `TREASURY_PUBKEY` → also used to buy back & burn $BIAS (configurable) |

Badge text / `<FLAGSHIP_STRATEGY>` for tweet #5: `BTC 40% / SOL 30% / HYPE 30% LONG 3× (holders vote daily)`.

As JSON (what `/launch` submits):

```json
{
  "type": "basket",
  "side": "long",
  "leverage": 3,
  "legs": [
    { "asset": "BTC", "weightBps": 4000 },
    { "asset": "SOL", "weightBps": 3000 },
    { "asset": "HYPE", "weightBps": 3000 }
  ]
}
```

## Checklist (launch day)

1. Launch $BIAS **through BIAS** (`/launch` as an admin wallet, flagship flag on) so that creator = the flagship vault.
   Sign with the admin wallet; wait for `/api/launch/confirm` to mark the market `waiting_for_fees`.
2. Copy the CA → set `BIAS_MINT` in the web environment (Cloudflare) **and** in GitHub Actions Secrets → redeploy.
3. Check `/bias` (flagship card, platform buybacks counter, tiers) and `/proof` (vault + HL account listed).
4. Publish tweet #5 (`twitter/content-plan.md`), pin it, then #6 as a reply five minutes later.
5. Turn on mainnet trading (`HL_NETWORK=mainnet`) **only** after the checklist in `REPORT.md`. Until then fees keep
   accumulating in the vault — nothing is lost.
