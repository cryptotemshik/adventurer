/**
 * Seed clearly-labelled DEMO markets (demo=true) so the site isn't empty before real launches.
 * Positions are sized from live Hyperliquid mainnet prices; the web app re-prices them live.
 * Demo markets are skipped by every job and excluded from /proof and exports.
 *   pnpm tsx jobs/seed-demo.ts            (uses BIAS_DB_URL + JOB_TOKEN, or local SQLite)
 *   pnpm tsx jobs/seed-demo.ts --reset    (delete existing demo markets first)
 */
import Decimal from "decimal.js";
import { Keypair } from "@solana/web3.js";
import { addEquitySnapshot, addEvent, insertMarket, upsertPosition, upsertRound, upsertVote, type NewMarket } from "@bias/db";
import { liquidationDistance, triggerLevels, roundSz } from "@bias/engine";
import { strategyLabel, type Strategy } from "@bias/shared";
import { jobDb } from "./lib/env";

type Status = NewMarket["status"];
interface Spec {
  ticker: string;
  name: string;
  desc: string;
  strategy: Strategy;
  status: Status;
  community?: boolean;
  depositUsd: number;
  /** entry offset vs current price (e.g. -0.03 = entered 3% lower) */
  entryOffset: number;
  ageH: number;
  stage?: number;
  realizedUsd?: number;
  profitTakenUsd?: number;
  feesSol: number;
  boughtSol?: number;
  burnedPct?: number;
  mcap: number;
  progress: number;
  graduated?: boolean;
  direction?: "long" | "short" | "flat";
  stops?: number;
  colors: [string, string];
}

const SPECS: Spec[] = [
  { ticker: "LONGBOI", name: "long boi", desc: "hype, levered, patient.", strategy: { type: "single", asset: "HYPE", side: "long", leverage: 3 }, status: "live", community: true, depositUsd: 1840, entryOffset: -0.034, ageH: 61, stage: 1, realizedUsd: 118, profitTakenUsd: 118, feesSol: 14.2, boughtSol: 0.71, burnedPct: 0.42, mcap: 412_000, progress: 100, graduated: true, colors: ["#1fc77e", "#0b2a1d"] },
  { ticker: "SHORTKING", name: "short king", desc: "eth looked tired.", strategy: { type: "single", asset: "ETH", side: "short", leverage: 2 }, status: "live", depositUsd: 960, entryOffset: 0.021, ageH: 39, feesSol: 7.4, mcap: 188_000, progress: 81, colors: ["#f0465c", "#2a0f15"] },
  { ticker: "BSKT", name: "basket case", desc: "btc 40 / sol 30 / hype 30.", strategy: { type: "basket", side: "long", leverage: 3, legs: [{ asset: "BTC", weightBps: 4000 }, { asset: "SOL", weightBps: 3000 }, { asset: "HYPE", weightBps: 3000 }] }, status: "live", community: true, depositUsd: 3120, entryOffset: -0.012, ageH: 88, stage: 1, realizedUsd: 204, profitTakenUsd: 204, feesSol: 23.9, boughtSol: 1.22, burnedPct: 0.61, mcap: 655_000, progress: 100, graduated: true, colors: ["#e9c349", "#2a240d"] },
  { ticker: "SOLETH", name: "sol over eth", desc: "relative value, no opinion on the market.", strategy: { type: "pair", long: "SOL", short: "ETH", leverage: 2 }, status: "live", depositUsd: 740, entryOffset: -0.008, ageH: 27, feesSol: 5.6, mcap: 97_000, progress: 58, colors: ["#8a9099", "#16181c"] },
  { ticker: "FARMER", name: "farmer", desc: "short perp, long spot, collect funding.", strategy: { type: "funding", asset: "HYPE" }, status: "live", depositUsd: 1210, entryOffset: 0.004, ageH: 120, realizedUsd: 31, feesSol: 9.1, boughtSol: 0.14, burnedPct: 0.09, mcap: 241_000, progress: 100, graduated: true, colors: ["#9aa4b2", "#1b1f24"] },
  { ticker: "TENX", name: "ten x", desc: "btc, 4x, ladder doing its job.", strategy: { type: "single", asset: "BTC", side: "long", leverage: 4 }, status: "live", depositUsd: 2260, entryOffset: -0.041, ageH: 140, stage: 2, realizedUsd: 391, profitTakenUsd: 391, feesSol: 17.3, boughtSol: 2.35, burnedPct: 1.18, mcap: 530_000, progress: 100, graduated: true, colors: ["#e6e8eb", "#111316"] },
  { ticker: "COPE", name: "cope", desc: "sol 5x. it happens.", strategy: { type: "single", asset: "SOL", side: "long", leverage: 5 }, status: "cooldown", depositUsd: 410, entryOffset: 0, ageH: 52, realizedUsd: -205, feesSol: 3.9, mcap: 41_000, progress: 34, stops: 1, colors: ["#f0465c", "#16181c"] },
  { ticker: "FLATLINE", name: "flatline", desc: "holders voted to sit out.", strategy: { type: "single", asset: "BTC", side: "long", leverage: 2 }, status: "flat", community: true, direction: "flat", depositUsd: 620, entryOffset: 0, ageH: 75, realizedUsd: 22, profitTakenUsd: 22, feesSol: 4.8, boughtSol: 0.13, burnedPct: 0.07, mcap: 76_000, progress: 49, colors: ["#9aa4b2", "#0b0c0e"] },
  { ticker: "FRESH", name: "fresh", desc: "just launched.", strategy: { type: "single", asset: "SOL", side: "long", leverage: 3 }, status: "waiting_for_fees", depositUsd: 0, entryOffset: 0, ageH: 2, feesSol: 0.31, mcap: 9_800, progress: 6, colors: ["#1fc77e", "#111316"] },
  { ticker: "EARLY", name: "early", desc: "was early. was also wrong.", strategy: { type: "single", asset: "ETH", side: "long", leverage: 5 }, status: "stopped", depositUsd: 380, entryOffset: 0, ageH: 190, realizedUsd: -560, feesSol: 6.2, boughtSol: 0.4, burnedPct: 0.22, mcap: 12_000, progress: 21, stops: 3, colors: ["#f0465c", "#2a0f15"] },
  { ticker: "QUIET", name: "quiet", desc: "nobody traded it.", strategy: { type: "single", asset: "HYPE", side: "short", leverage: 2 }, status: "dead", depositUsd: 0, entryOffset: 0, ageH: 420, feesSol: 0.12, boughtSol: 0.08, burnedPct: 0.01, mcap: 3_100, progress: 3, colors: ["#8a9099", "#111316"] },
];

let seed = 7;
const rnd = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);

function svg(ticker: string, [fg, bg]: [string, string]): string {
  const t = ticker.slice(0, 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><rect x="0.5" y="0.5" width="63" height="63" fill="none" stroke="${fg}" stroke-opacity="0.35"/><text x="32" y="41" text-anchor="middle" font-family="Inter,Helvetica,Arial,sans-serif" font-size="24" font-weight="600" fill="${fg}">${t}</text></svg>\n`;
}

async function post(body: unknown) {
  const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

async function main() {
  const db = await jobDb();
  const mids = (await post({ type: "allMids" })) as Record<string, string>;
  const meta = (await post({ type: "meta" })) as { universe: { name: string; szDecimals: number; maxLeverage: number }[] };
  const info = Object.fromEntries(meta.universe.map((u) => [u.name, u]));
  if (process.argv.includes("--reset")) {
    for (const tbl of ["events", "positions", "equity_snapshots", "vote_rounds", "votes"]) {
      await db.run(`DELETE FROM ${tbl} WHERE market_id IN (SELECT id FROM markets WHERE demo = 1)`);
    }
    await db.run(`DELETE FROM markets WHERE demo = 1`);
  }
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync("apps/web/public/demo", { recursive: true });
  const now = Date.now();
  const H = 3_600_000;

  for (const [i, s] of SPECS.entries()) {
    writeFileSync(`apps/web/public/demo/${s.ticker.toLowerCase()}.svg`, svg(s.ticker, s.colors));
    const id = `demo-${s.ticker.toLowerCase()}`;
    const mint = Keypair.generate().publicKey.toBase58();
    const createdAt = now - s.ageH * H;
    const direction = s.direction ?? (s.strategy.type === "single" || s.strategy.type === "basket" ? s.strategy.side : "long");
    const lamports = (sol: number) => BigInt(Math.round(sol * 1e9)).toString();

    // ---- legs (live markets only) ----
    const legs: { asset: string; szi: string; entryPx: string; leverage: number; liquidationPx: string | null; unrealizedPnl: string; marginUsed: string }[] = [];
    const triggers: { oid: number; asset: string; label: string; tpsl: "tp" | "sl"; triggerPx: string; sz: string }[] = [];
    if (s.status === "live") {
      const plan: { asset: string; side: "long" | "short"; w: number; lev: number }[] =
        s.strategy.type === "single"
          ? [{ asset: s.strategy.asset, side: s.strategy.side, w: 1, lev: s.strategy.leverage }]
          : s.strategy.type === "basket"
            ? s.strategy.legs.map((l) => ({ asset: l.asset, side: (s.strategy as { side: "long" | "short" }).side, w: l.weightBps / 10_000, lev: (s.strategy as { leverage: number }).leverage }))
            : s.strategy.type === "pair"
              ? [
                  { asset: s.strategy.long, side: "long", w: 0.5, lev: s.strategy.leverage },
                  { asset: s.strategy.short, side: "short", w: 0.5, lev: s.strategy.leverage },
                ]
              : [{ asset: s.strategy.asset, side: "short", w: 1, lev: 1 }];
      const stageFrac = 1 - 0.25 * (s.stage ?? 0);
      for (const p of plan) {
        const mid = Number(mids[p.asset]);
        const a = info[p.asset]!;
        const off = p.side === "long" ? s.entryOffset : -s.entryOffset;
        const entry = new Decimal(mid * (1 + off + (rnd() - 0.5) * 0.004)).toSignificantDigits(5);
        const margin = s.depositUsd * 0.98 * p.w * (s.strategy.type === "funding" ? 0.5 : 1) * stageFrac;
        const sz = roundSz(new Decimal(margin * p.lev).div(entry), a.szDecimals);
        const dir = p.side === "long" ? 1 : -1;
        const liq = entry.mul(1 - dir * liquidationDistance(p.lev, a.maxLeverage, p.side)).toSignificantDigits(5);
        legs.push({
          asset: p.asset,
          szi: (dir * sz.toNumber()).toString(),
          entryPx: entry.toString(),
          leverage: p.lev,
          liquidationPx: s.strategy.type === "funding" ? null : liq.toString(),
          unrealizedPnl: "0",
          marginUsed: margin.toFixed(2),
        });
        const stage = s.stage ?? 0;
        const lv = triggerLevels(entry, p.side, p.lev, stage);
        const closeBuy = p.side === "short";
        void closeBuy;
        triggers.push({ oid: 900_000 + i * 10 + triggers.length, asset: p.asset, label: "sl", tpsl: "sl", triggerPx: lv.sl.toSignificantDigits(5).toString(), sz: sz.toString() });
        if (s.strategy.type !== "funding") {
          const remaining = [1, 2, 3].filter((k) => k > stage);
          for (const k of remaining) {
            triggers.push({ oid: 900_000 + i * 10 + triggers.length, asset: p.asset, label: `tp${k}`, tpsl: "tp", triggerPx: lv.tps[k - 1]!.toSignificantDigits(5).toString(), sz: roundSz(sz.div(remaining.length + 1), a.szDecimals).toString() });
          }
        }
      }
    }

    const fees = s.feesSol;
    const market: NewMarket = {
      id,
      idx: 1_000_000 + i,
      mint,
      name: s.name,
      ticker: s.ticker,
      description: s.desc,
      image: `/demo/${s.ticker.toLowerCase()}.svg`,
      launcher: Keypair.generate().publicKey.toBase58(),
      payoutWallet: Keypair.generate().publicKey.toBase58(),
      solVault: Keypair.generate().publicKey.toBase58(),
      hlAccount: `0x${Buffer.from(Keypair.generate().publicKey.toBytes()).toString("hex").slice(0, 40)}`,
      hlAgent: `0x${Buffer.from(Keypair.generate().publicKey.toBytes()).toString("hex").slice(0, 40)}`,
      agentApproved: true,
      strategy: JSON.stringify(s.strategy),
      community: !!s.community,
      demo: true,
      status: s.status,
      direction,
      tpStages: JSON.stringify(s.stage ? Object.fromEntries(legs.map((l) => [l.asset, s.stage])) : {}),
      consecutiveStops: s.stops ?? 0,
      cooldownUntil: s.status === "cooldown" ? now + 7 * H : null,
      stoppedAt: s.status === "cooldown" ? now - 5 * H : s.status === "stopped" ? now - 30 * H : null,
      lastFeeAt: now - Math.round(rnd() * 3 * H),
      endedAt: s.status === "stopped" || s.status === "dead" ? now - 26 * H : null,
      endReason: s.status === "stopped" || s.status === "dead" ? s.status : null,
      createdAt,
      depositedUsd: s.depositUsd.toFixed(2),
      realizedPnlUsd: (s.realizedUsd ?? 0).toFixed(2),
      profitTakenUsd: (s.profitTakenUsd ?? 0).toFixed(2),
      equityUsd: (s.status === "live" ? 0 : Math.max(0, s.depositUsd + (s.realizedUsd ?? 0) - (s.profitTakenUsd ?? 0))).toFixed(2),
      feesClaimed: lamports(fees),
      feesLauncher: lamports(fees * 0.2),
      feesPlatform: lamports(fees * 0.1),
      feesPosition: lamports(fees * 0.7),
      boughtBackLamports: lamports(s.boughtSol ?? 0),
      burnedTokens: BigInt(Math.round((s.burnedPct ?? 0) * 1e13)).toString(),
      burnedPct: s.burnedPct ?? 0,
      mcapUsd: s.mcap,
      priceUsd: s.mcap / 1e9,
      bondingProgress: s.progress,
      graduated: !!s.graduated,
      snapshotAt: now,
    };
    await insertMarket(db, market);
    if (legs.length) {
      await upsertPosition(db, { marketId: id, legs: JSON.stringify(legs), triggers: JSON.stringify(triggers), marks: "{}", updatedAt: now });
    }

    // ---- equity history (hourly random walk ending near the deposit + realized) ----
    if (s.depositUsd > 0) {
      const hours = Math.min(s.ageH, 160);
      let v = s.depositUsd * 0.35;
      const target = s.depositUsd + (s.realizedUsd ?? 0) - (s.profitTakenUsd ?? 0);
      for (let h = hours; h >= 1; h--) {
        const pull = (target - v) / Math.max(h, 4);
        v = Math.max(1, v + pull + (rnd() - 0.5) * s.depositUsd * 0.03);
        await addEquitySnapshot(db, id, v.toFixed(2), "0", now - h * H);
      }
    }

    // ---- events ----
    const ev = async (hAgo: number, type: string, message: string) => addEvent(db, { marketId: id, type, message, chain: "sol", at: now - hAgo * H });
    await ev(s.ageH, "launch", `launched $${s.ticker} on pump.fun. bias: ${strategyLabel(s.strategy)}`);
    const claims = Math.max(1, Math.min(6, Math.round(s.ageH / 20)));
    for (let c = 0; c < claims; c++) {
      const sol = fees / claims;
      await ev(s.ageH - 2 - c * (s.ageH / claims) * 0.9, "claim", `claimed ${sol.toFixed(3)} SOL creator fees → ${(sol * 0.7).toFixed(3)} position · ${(sol * 0.2).toFixed(3)} launcher · ${(sol * 0.1).toFixed(3)} $BIAS`);
    }
    if (s.depositUsd > 0) {
      await ev(s.ageH - 4, "bridge_arrived", `${(s.depositUsd / 150).toFixed(2)} SOL arrived on hyperliquid → $${s.depositUsd.toFixed(2)} USDC collateral`);
      await ev(s.ageH - 4.2, "open", `position opened: ${strategyLabel(s.strategy, direction)}`);
    }
    for (let k = 1; k <= (s.stage ?? 0); k++) await ev(s.ageH * (0.6 - k * 0.15), "tp_hit", `TP${k} hit. profit queued for buyback`);
    if (s.boughtSol) {
      await ev(s.ageH * 0.2, "withdraw", `withdrew $${(s.profitTakenUsd ?? 20).toFixed(2)} profit → SOL on its way to the vault`);
      await ev(s.ageH * 0.18, "buyback", `bought back $${s.ticker} with ${s.boughtSol.toFixed(3)} SOL`);
      await ev(s.ageH * 0.18, "burn", `burned ${(s.burnedPct ?? 0).toFixed(2)}% of $${s.ticker} supply`);
    }
    if (s.status === "cooldown") {
      await ev(5, "sl_hit", "stop-loss hit on SOL");
      await ev(5, "cooldown", "cooldown for 12h (1/3 stops)");
    }
    if (s.status === "flat") await ev(20, "flip", "holders voted flat");
    if (s.status === "stopped") {
      await ev(30, "sl_hit", "stop-loss hit on ETH");
      await ev(30, "stopped", "3 stops in a row. market stopped.");
    }
    if (s.status === "dead") await ev(26, "dead", "14 days without fees. market closed.");

    // ---- votes on community markets ----
    if (s.community && s.status !== "stopped") {
      const round = new Date(now).toISOString().slice(0, 10);
      const choices = s.status === "flat" ? ["flat", "flat", "long", "flat", "short", "flat", "long"] : ["long", "long", "short", "long", "flat", "long", "long", "short"];
      for (const [j, c] of choices.entries()) {
        await upsertVote(db, { marketId: id, round, wallet: Keypair.generate().publicKey.toBase58(), choice: c, balance: BigInt(Math.round((0.5 + rnd() * 8) * 1e12)).toString(), signature: "demo", at: now - j * 600_000 });
      }
      for (let d = 1; d <= 3; d++) {
        const r = new Date(now - d * 86_400_000).toISOString().slice(0, 10);
        await upsertRound(db, { marketId: id, round: r, status: "final", longW: 0, shortW: 0, flatW: 0, wallets: 6 + d, quorum: d !== 2, winner: d === 2 ? null : direction === "flat" && d === 1 ? "flat" : "long", applied: true, finalizedAt: now - d * 86_400_000 + H });
      }
    }
    console.log(`seeded ${id} (${s.status})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
