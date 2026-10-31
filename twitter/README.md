# twitter/ — launch week on X

Account: **BIAS** (`@biasdotfun`, see [profile.md](profile.md)). Full copy, image briefs and notes: [content-plan.md](content-plan.md).

Countdown starts **Sat 31.10.2026 12:53 CET**. Launch **T0 = Sat 31.10.2026 21:00 CET = 20:00 UTC = 16:00 New York (EDT)**.
(Europe is already on winter time on 31.10; New York switches on 01.11, so NY is UTC−4 for the whole schedule.)

| # | When | CET | UTC | New York | Type | Image | Pin |
|---|------|-----|-----|----------|------|-------|-----|
| 1 | T−7h | Sat 14:00 | Sat 13:00 | Sat 09:00 | teaser | `images/tweet-01.png` | — |
| 2 | T−5h | Sat 16:00 | Sat 15:00 | Sat 11:00 | the idea (+ self-reply with the 70/20/10 split) | `images/tweet-02.png` | — |
| 3 | T−3h | Sat 18:00 | Sat 17:00 | Sat 13:00 | guardrails | `images/tweet-03.png` | optional, until #4 |
| 4 | T−1h | Sat 20:00 | Sat 19:00 | Sat 15:00 | countdown / halloween | `images/tweet-04.png` | until #5 |
| 5 | **T0** | **Sat 21:00** | **Sat 20:00** | **Sat 16:00** | **LAUNCH — $BIAS live** | `images/tweet-05.png` | **yes (permanent)** |
| 6 | T0+5m | Sat 21:05 | Sat 20:05 | Sat 16:05 | reply to #5: fee split & $BIAS | `images/tweet-06.png` | — |
| 7 | T+1h | Sat 22:00 | Sat 21:00 | Sat 17:00 | holder voting (first round closes 00:00 UTC = 01:00 CET) | `images/tweet-07.png` | — |
| 8 | T+3h | Sun 00:00 | Sat 23:00 | Sat 19:00 | first 3 hours (numbers from /admin) | `images/tweet-08.png` | — |
| 9 | T+6h | Sun 03:00 | Sun 02:00 | Sat 22:00 | proof & graveyard (may quote #3) | `images/tweet-09.png` | — |

Unnumbered, whenever it happens: first TP hit, first buyback & burn — use the market's OG card from `/t/[mint]`.

Profile assets: `images/avatar.png` (500×500), `images/banner.png` (1500×500).

## Before publishing

- Replace every `<CA>`, `<FLAGSHIP_STRATEGY>`, `<N>`, `<X>`, `<ASSET>`, `<SIDE>`.
- #5 goes out only after: $BIAS is created through `/launch` (flagship), CA copied into `BIAS_MINT`, site redeployed, `/bias` and `/proof` checked (see `../launch/coin.md`).
- Fee split and tier thresholds in #6 must match the deployed `.env`.

## Images

All images are generated from code (HTML/SVG templates in `src/`, fonts embedded from `src/fonts/`, OFL-licensed):

```bash
pnpm twitter:images            # all
pnpm twitter:images tweet-03   # one or more by id
```

The generator renders with the pre-installed Playwright Chromium, then checks each PNG header for the exact size
(1600×900 tweets, 1500×500 banner, 500×500 avatar, 1000×1000 coin) and that it is < 5 MB; it exits non-zero otherwise.
`twitter/images.test.ts` re-checks the committed files in `pnpm test`.

Mockups only use made-up tickers (`$EXAMPLE`, `$LONGBOI`, `$SHORTKING`, …) and fake addresses (`7xKX…demo`). No third-party logos.
