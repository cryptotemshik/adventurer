import "server-only";
import { equitySeries, getMarket, getPosition, listEvents, listRounds, listVotes } from "@bias/db";
import { roundId, tallyVotes } from "@bias/engine";
import { getDb } from "./db";
import { safeJson, toView } from "./view";
import { repriceLegs, withLive } from "./live";
import { allMids } from "./hl-public";
import { getConfig } from "./config";
import { tokenSupply } from "./solana";

export async function getDetail(id: string) {
  const db = await getDb();
  const m = await getMarket(db, id);
  if (!m || m.status === "pending_launch") return null;
  const [pos, events, equity, rounds] = await Promise.all([
    getPosition(db, m.id),
    listEvents(db, { marketId: m.id, limit: 200 }),
    equitySeries(db, m.id),
    m.community ? listRounds(db, m.id, 14) : Promise.resolve([]),
  ]);
  let vote = null;
  if (m.community && m.mint && !["stopped", "dead"].includes(m.status)) {
    const cfg = await getConfig();
    const round = roundId(Date.now());
    const votes = await listVotes(db, m.id, round);
    let supply = 1_000_000_000_000_000n;
    try {
      supply = (await tokenSupply(m.mint)).amount;
    } catch {}
    const t = tallyVotes(
      votes.map((v) => ({ wallet: v.wallet, choice: v.choice as "long", balance: BigInt(v.balance) })),
      supply,
      cfg.VOTE_QUORUM_SUPPLY_PCT,
    );
    vote = { round, endsAt: Date.parse(`${round}T00:00:00Z`) + 86_400_000, tally: t, votes: votes.length };
  }
  const market = m.demo ? (await withLive([m]))[0]! : toView(m);
  let legs = safeJson<Parameters<typeof repriceLegs>[0]>(pos?.legs, []);
  let marks = safeJson<Record<string, string>>(pos?.marks, {});
  const series = equity.map((e) => ({ t: e.at, v: Number(e.equityUsd) }));
  if (m.demo && legs.length) {
    try {
      const mids = await allMids();
      legs = repriceLegs(legs, mids);
      marks = Object.fromEntries(legs.map((l) => [l.asset, mids[l.asset] ?? l.entryPx]));
      series.push({ t: Date.now(), v: market.equityUsd });
    } catch {}
  }
  return {
    market,
    position: pos ? { legs, triggers: safeJson(pos.triggers, []), marks, updatedAt: pos.updatedAt } : null,
    events,
    equity: series,
    rounds,
    vote,
    network: process.env.HL_NETWORK ?? "testnet",
  };
}
