import { describe, expect, it } from "vitest";
import { nodeDb } from "./node";
import * as r from "./repo";

const market = (id: string, idx: number, extra: Partial<r.NewMarket> = {}): r.NewMarket => ({
  id,
  idx,
  mint: `${id}mint`,
  name: id,
  ticker: id.toUpperCase(),
  launcher: "L",
  payoutWallet: "P",
  solVault: `V${idx}`,
  hlAccount: `0x${idx}`,
  hlAgent: `0xa${idx}`,
  strategy: JSON.stringify({ type: "single", asset: "SOL", side: "long", leverage: 3 }),
  status: "waiting_for_fees",
  createdAt: Date.now() + idx,
  ...extra,
});

describe("db repo (node:sqlite)", () => {
  it("markets, sorting and filters", async () => {
    const db = nodeDb();
    await r.insertMarket(db, market("a", 0, { equityUsd: "10", mcapUsd: 5 }));
    await r.insertMarket(db, market("b", 1, { equityUsd: "100", mcapUsd: 1, community: true }));
    await r.insertMarket(db, market("c", 2, { status: "pending_launch" }));
    expect((await r.listMarkets(db)).map((m) => m.id)).toEqual(["b", "a"]);
    expect((await r.listMarkets(db, { sort: "mcap" })).map((m) => m.id)).toEqual(["a", "b"]);
    expect((await r.listMarkets(db, { sort: "largest" })).map((m) => m.id)).toEqual(["b", "a"]);
    expect((await r.listMarkets(db, { community: true })).map((m) => m.id)).toEqual(["b"]);
    expect((await r.listMarkets(db, { q: "$A" })).map((m) => m.id)).toEqual(["a"]);
    expect((await r.listMarkets(db, { strategy: "single", asset: "SOL" })).length).toBe(2);
    expect((await r.getMarket(db, "amint"))?.id).toBe("a");
  });

  it("ledger is idempotent and sums exactly", async () => {
    const db = nodeDb();
    await r.addLedger(db, { marketId: "a", type: "claim", amount: "9007199254740993", asset: "SOL", opId: "op1" });
    await r.addLedger(db, { marketId: "a", type: "claim", amount: "9007199254740993", asset: "SOL", opId: "op1" });
    await r.addLedger(db, { marketId: "a", type: "claim", amount: "7", asset: "SOL", opId: "op2" });
    const s = await r.ledgerSums(db, "a");
    expect(s["claim:SOL"]).toBe(9007199254741000n);
  });

  it("operations, locks, pool, nonces, rate limits, votes, respects", async () => {
    const db = nodeDb();
    const op = await r.beginOp(db, "claim:a:1", "claim", "a");
    expect(op.status).toBe("pending");
    await r.updateOp(db, "claim:a:1", { status: "done", txids: ["sig"] });
    expect((await r.beginOp(db, "claim:a:1", "claim", "a")).status).toBe("done");

    expect(await r.acquireLock(db, "tick", "h1", 60_000)).toBe(true);
    expect(await r.acquireLock(db, "tick", "h2", 60_000)).toBe(false);
    await r.releaseLock(db, "tick", "h1");
    expect(await r.acquireLock(db, "tick", "h2", 60_000)).toBe(true);

    await r.addPoolAddresses(db, [
      { idx: 0, solVault: "s0", hlAccount: "h0", hlAgent: "g0" },
      { idx: 1, solVault: "s1", hlAccount: "h1", hlAgent: "g1" },
    ]);
    expect((await r.takeAddress(db))?.idx).toBe(0);
    expect((await r.takeAddress(db))?.solVault).toBe("s1");
    expect(await r.takeAddress(db)).toBeNull();
    expect(await r.poolStats(db)).toEqual({ free: 0, unused: 0, total: 2, maxIdx: 1 });

    await r.createNonce(db, "n1");
    expect(await r.consumeNonce(db, "n1")).toBe(true);
    expect(await r.consumeNonce(db, "n1")).toBe(false);

    expect(await r.rateLimit(db, "k", 1, 60_000)).toBe(true);
    expect(await r.rateLimit(db, "k", 1, 60_000)).toBe(false);

    await r.upsertVote(db, { marketId: "a", round: "d", wallet: "w", choice: "long", balance: "1", signature: "s", at: 1 });
    await r.upsertVote(db, { marketId: "a", round: "d", wallet: "w", choice: "short", balance: "1", signature: "s", at: 2 });
    const v = await r.listVotes(db, "a", "d");
    expect(v).toHaveLength(1);
    expect(v[0]!.choice).toBe("short");

    await r.insertMarket(db, market("a", 0));
    expect(await r.payRespects(db, "a:w:d", "a", "w")).toBe(true);
    expect(await r.payRespects(db, "a:w:d", "a", "w")).toBe(false);
    expect((await r.getMarket(db, "a"))?.respects).toBe(1);
  });

  it("events join market info", async () => {
    const db = nodeDb();
    await r.insertMarket(db, market("a", 0));
    await r.addEvent(db, { marketId: "a", type: "claim", message: "claimed", txid: "x", chain: "sol" });
    await r.addEvent(db, { marketId: "a", type: "burn", message: "burned" });
    const e = await r.listEvents(db, { types: ["burn"] });
    expect(e).toHaveLength(1);
    expect(e[0]!.ticker).toBe("A");
  });
});
