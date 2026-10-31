import type { Metadata } from "next";
import { RULES, DISCLAIMER } from "@bias/shared";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "docs", description: "how bias works: markets, guardrails, fee split, bridge, custody, voting, risks." };

export default async function Docs() {
  const c = await getConfig();
  const pos = c.FEE_SPLIT_POSITION_BPS / 100;
  const lau = c.FEE_SPLIT_LAUNCHER_BPS / 100;
  const pla = c.FEE_SPLIT_PLATFORM_BPS / 100;
  const S = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <section id={id} className="panel scroll-mt-20 p-6">
      <h2 className="font-display mb-3 text-2xl">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted [&_b]:text-text">{children}</div>
    </section>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <nav className="hidden lg:block" aria-label="docs">
        <ul className="sticky top-20 space-y-1 text-sm text-muted">
          {[
            ["market", "a market"],
            ["guardrails", "guardrails"],
            ["fees", "fee split"],
            ["bridge", "bridge"],
            ["custody", "custody"],
            ["voting", "voting"],
            ["lifecycle", "lifecycle"],
            ["risks", "risks"],
            ["faq", "faq"],
          ].map(([id, l]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-text">
                {l}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-6">
        <h1 className="font-display text-4xl font-bold">how bias works</h1>
        <S id="market" title="a market = a coin + a position">
          <p>
            you launch a coin on <b>pump.fun</b> through bias and pick its <b>bias</b>: a single asset long/short (1–{Math.min(5, c.MAX_LEVERAGE)}×), a basket of 2–3 assets (≤4×), a
            pair trade (long A / short B, ≤3×) or a funding farm (short perp + spot long, 1×). baskets, pairs and farms need the desk tier.
          </p>
          <p>
            the coin&apos;s <b>creator is the market&apos;s own vault</b>, not you. creator fees are claimed automatically, split, and the position share is bridged to
            <b> hyperliquid</b> where the position lives in its own isolated account.
          </p>
          <p>
            realized profit is withdrawn back to solana, buys the coin on the market and <b>burns</b> it.
          </p>
        </S>
        <S id="guardrails" title="guardrails">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>max leverage</b>: single 5×, basket 4×, pair 3×, funding 1×. leverage is lowered automatically for assets where the stop would sit too close to
              liquidation.
            </li>
            <li>
              <b>stop-loss at entry</b>, on the exchange (native trigger order): max loss = {c.MAX_LOSS_MARGIN_PCT}% of margin → at 3× the stop is{" "}
              {(c.MAX_LOSS_MARGIN_PCT / 3).toFixed(1)}% away. it always fires at least 30% earlier than liquidation.
            </li>
            <li>
              <b>take-profit ladder</b>: +{RULES.TP_MARGIN_PCT.join("% / +")}% of margin, each closes 25%. after TP2 the stop moves to breakeven, after TP3 to the
              TP1 level; the last 25% runs.
            </li>
            <li>
              <b>liquidation guard</b>: every job run checks the gap to liquidation; if margin erodes it adds margin or cuts the position by{" "}
              {RULES.DELEVERAGE_FRACTION_PCT}%.
            </li>
            <li>
              <b>new fees</b> are added at most once an hour; stops and targets are re-placed from the new average entry.
            </li>
            <li>
              <b>limits</b>: ${c.MAX_NOTIONAL_PER_MARKET_USD.toLocaleString("en-US")} notional per market, ${c.MAX_TOTAL_NOTIONAL_USD.toLocaleString("en-US")} for
              the platform. above that, fees accumulate and the excess is bought back daily.
            </li>
            <li>
              <b>circuit breaker</b>: if all markets lose more than {c.GLOBAL_DRAWDOWN_HALT_PCT}% of equity in 24h, the platform goes close-only.
            </li>
            <li>each market has its own hyperliquid account with isolated margin. one market can&apos;t lose another&apos;s money.</li>
          </ul>
        </S>
        <S id="fees" title="fee split">
          <p>
            <b>{pos}%</b> → the position · <b>{lau}%</b> → whoever launched the market · <b>{pla}%</b> → buys back &amp; burns $BIAS.
          </p>
          <p>
            claims run when ≥ {c.MIN_CLAIM_SOL} SOL accrued (or daily). launcher and platform payouts are batched (≥ {c.MIN_PAYOUT_SOL} SOL or daily). launch fee:{" "}
            {c.LAUNCH_FEE_SOL} SOL, free for $BIAS trader tier and above.
          </p>
        </S>
        <S id="bridge" title="the bridge">
          <p>
            once the position share reaches {c.MIN_BRIDGE_SOL} SOL, it is bridged to hyperliquid via hyperunit (SOL arrives as spot SOL), sold for USDC and moved to
            the perp account. profits travel back the same way: USDC → SOL on hyperliquid spot → hyperunit → the market&apos;s vault → buyback. bridge and network
            fees are paid from the market&apos;s own fees.
          </p>
        </S>
        <S id="custody" title="custody — read this">
          <p>
            bias is <b>custodial</b>. vault and hyperliquid keys are derived from a master seed held in github actions secrets; the website never sees a seed. trading
            uses a separate agent key that <b>can trade but cannot withdraw</b>. withdrawals only go to the market&apos;s own vault or to configured platform addresses.
            all addresses are public on <a href="/proof">/proof</a>.
          </p>
        </S>
        <S id="voting" title="community bias">
          <p>
            on community markets holders vote <b>long / short / flat</b> every utc day (for pairs: A/B, B/A, flat). a vote is a signed message, not a transaction.
            weight = √balance, max 10% of the round per wallet. quorum: ≥ {RULES.VOTE_MIN_WALLETS} wallets and √({c.VOTE_QUORUM_SUPPLY_PCT}% of supply). the first job
            run after 00:00 utc applies the result: close, then reopen the other way (or stay flat). at most one flip per 24h.
          </p>
        </S>
        <S id="lifecycle" title="lifecycle">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>waiting for fees</b> → <b>live</b> → after a stop-loss <b>cooldown</b> ({RULES.COOLDOWN_HOURS}h) → re-entry with fresh fees.
            </li>
            <li>
              <b>stopped</b>: {RULES.MAX_CONSECUTIVE_STOPS} stops in a row, or {RULES.STOPPED_AFTER_COOLDOWN_DAYS} days in cooldown without fees.{" "}
              <b>dead</b>: {RULES.DEAD_AFTER_NO_FEES_DAYS} days without fees while the position is not in profit. both go to the graveyard; what&apos;s left is
              withdrawn, bought back and burned.
            </li>
          </ul>
        </S>
        <S id="risks" title="risks">
          <p className="text-text">{DISCLAIMER}</p>
          <p>
            stops are trigger-market orders: in a fast market they can fill worse than the trigger. bridges can be slow. hyperliquid, hyperunit, pump.fun and
            solana are third-party systems. smart contracts and exchanges can fail. buybacks happen only if there is profit — nothing is guaranteed.
          </p>
        </S>
        <S id="faq" title="faq">
          <p>
            <b>can I withdraw the position?</b> no. the position belongs to the market. you earn {lau}% of fees as the launcher.
          </p>
          <p>
            <b>what if the market loses?</b> the stop closes it at ≈ −{c.MAX_LOSS_MARGIN_PCT}% of margin, it cools down, then re-enters with new fees.
          </p>
          <p>
            <b>is trading live on mainnet?</b> hyperliquid network: <b>{c.HL_NETWORK}</b>. until mainnet trading is switched on, fees accumulate in the vaults and
            nothing is lost.
          </p>
        </S>
      </div>
    </div>
  );
}
