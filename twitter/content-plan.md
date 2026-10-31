# Content plan — launch day (Sat 31.10.2026)

Countdown starts 12:53 CET. **T0 = 21:00 CET / 20:00 UTC / 16:00 New York.**
Tone: dry trader humour, lowercase, short. All tweets in English. Replace `<CA>`, `<...>` before posting.
Times below: CET · UTC · NY.

---

## Before launch — 4 tweets

### #1 — T−7h — teaser
**14:00 CET · 13:00 UTC · 09:00 NY**

```
every coin has a bias.

soon it gets a position.
```

**Image:** `images/tweet-01.png` — dark chart grid, a single neon candle in the centre, under it in monospace `BIAS: pending`.
**Notes:** no links, no ticker.

---

### #2 — T−5h — the idea
**16:00 CET · 15:00 UTC · 11:00 NY**

```
launch a coin on pump.fun.
pick a bias: long or short, 1–5×.
creator fees fund the position on hyperliquid.
profit buys the coin back and burns it.

your chart, backed by a trade.
```

**Image:** `images/tweet-02.png` — loop diagram: coin → `fees` → position `HYPE LONG 3×` → `profit` → `buyback 🔥` → back to the coin. Neon arrows.
**Notes:** reply to yourself right after posting:

```
70% to the position. 20% to whoever launched it. 10% burns $BIAS. details at launch.
```

---

### #3 — T−3h — guardrails
**18:00 CET · 17:00 UTC · 13:00 NY**

```
we looked at perp launchpads and found a graveyard of −100%.

so every market here ships with:
• max 5× leverage
• a stop-loss set at launch
• a take-profit ladder that pays for buybacks
• auto-deleverage before liquidation
• every address public and verifiable
```

**Image:** `images/tweet-03.png` — market card `$EXAMPLE · SOL LONG 3×` with a chart: entry, SL, TP1–3, liq lines, and the risk meter `distance to SL 11% · to liq 19%`.
**Notes:** the main "trust" tweet — can be pinned temporarily (until #4).

---

### #4 — T−1h — countdown
**20:00 CET · 19:00 UTC · 15:00 NY**

```
1 hour.

happy halloween. the scariest costume in crypto is a 20× long with no stop.
```

**Image:** `images/tweet-04.png` — jack-o'-lantern whose carved face is a red down candle; caption `costume: 20× · no stop`.
**Notes:** pin temporarily (until #5).

---

## Launch and after — 5 tweets

### #5 — T0 — LAUNCH (pin)
**21:00 CET · 20:00 UTC · 16:00 NY**

```
$BIAS is live, and it's the first market.

its bias: <FLAGSHIP_STRATEGY>
fees → position. profit → buyback & burn.

CA: <CA>
launch yours: biasonsol.fun
```

`<FLAGSHIP_STRATEGY>` default: `BTC 40% / SOL 30% / HYPE 30% LONG 3× (holders vote daily)` — must match `launch/coin.md` and the deployed market.

**Image:** `images/tweet-05.png` — poster: big $BIAS market card with the strategy badge and an empty equity curve "day 0"; on top `EVERY COIN HAS A BIAS.`. The CA is **not** on the image.
**Notes:** publish only after the coin is created, the CA is verified and the site is redeployed with `BIAS_MINT`. Pin.

Fallback text if the site is not ready:

```
$BIAS is live. CA: <CA>

the market page and launches open in a few hours. pick your bias.
```

---

### #6 — T0+5 min (reply to #5) — fee split and $BIAS
**21:05 CET · 20:05 UTC · 16:05 NY**

```
how fees split on every market:

70% → the position
20% → whoever launched it
10% → buys back & burns $BIAS

hold $BIAS: free launches, baskets, pair trades & funding farms.
every claim, trade and burn: biasonsol.fun/proof
```

**Image:** `images/tweet-06.png` — neon donut 70 / 20 / 10, labels `position · launcher · $BIAS burn`.
**Notes:** check tier thresholds and percentages against `.env` (`FEE_SPLIT_*_BPS`, `TIER_*`).

---

### #7 — T+1h — holder voting
**22:00 CET · 21:00 UTC · 17:00 NY**

```
on community markets, holders vote the bias every day.

long. short. flat.
a vote is a signature, not a transaction. it costs nothing.

$BIAS's first vote closes at 00:00 utc.
```

**Image:** `images/tweet-07.png` — voting UI: three horizontal bars long / short / flat with (mock) percentages and a countdown to the end of the round.
**Notes:** 00:00 UTC = 01:00 CET (Sun) = 20:00 NY (Sat). The image timer (02:59:41) matches posting at 21:00 UTC.

---

### #8 — T+3h — first hours
**Sun 00:00 CET · Sat 23:00 UTC · Sat 19:00 NY**

```
first 3 hours:

<N> markets launched
<X> SOL in fees routed to positions
most popular bias: <ASSET> <SIDE>

live feed: biasonsol.fun/activity
```

**Image:** `images/tweet-08.png` — 3×3 grid of market cards with made-up tickers and different strategies (mock data). If possible, replace with a real screenshot of `/`.
**Notes:** numbers from `/admin`. If a number is embarrassing, post it anyway — the proof page shows it.

---

### #9 — T+6h — proof and graveyard
**Sun 03:00 CET · Sun 02:00 UTC · Sat 22:00 NY**

```
don't trust the dashboard.

every vault on solana, every account on hyperliquid, every claim, trade, buyback and burn, linked on one page.
biasonsol.fun/proof

(there's also a graveyard. we'd like it to stay empty.)
```

**Image:** `images/tweet-09.png` — left: a fragment of the proof page (addresses, reconciliation with green checks); right: a lone tombstone `R.I.P. · here lies nobody (yet)`.
**Notes:** can quote-tweet #3.

---

## Unnumbered (when it happens)

- **first TP hit** — `first take-profit on $<TICKER>. +<X>% on margin. that profit is now in the buyback queue.` + OG card of `/t/<mint>`.
- **first buyback & burn** — `first burn. $<TICKER> bought back <X> SOL worth and burned it. tx: <solscan link>` + OG card.
