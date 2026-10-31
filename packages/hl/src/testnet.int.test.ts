/**
 * Hyperliquid TESTNET integration test. Skipped unless HL_TESTNET_PRIVATE_KEY is set.
 * The key must belong to a testnet account with ≥ $30 USDC in its perp balance
 * (faucet: https://app.hyperliquid-testnet.xyz/drip). The key is used both as account and as signer
 * (a master key may trade for itself, exactly like an approved agent).
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAddress } from "viem/accounts";
import { HlInfo } from "./info";
import { HlTrader } from "./trader";
import { D, roundSize } from "./format";
import type { Hex } from "./types";

const PK = process.env.HL_TESTNET_PRIVATE_KEY as Hex | undefined;

describe.skipIf(!PK)("hyperliquid testnet: open → SL/TP → close", () => {
  it("runs the full lifecycle on ETH at 3× isolated", async () => {
    const info = new HlInfo("testnet");
    const account = privateKeyToAddress(PK!);
    const trader = new HlTrader({ network: "testnet", agentPrivateKey: PK!, accountAddress: account, info });

    const before = await info.accountState(account);
    expect(Number(before.withdrawable)).toBeGreaterThan(15);

    const eth = await info.asset("ETH");
    const mids = await info.allMids();
    const mark = mids.ETH!;
    await trader.setIsolatedLeverage("ETH", 3);

    // ~$12 notional
    const sz = roundSize(new D(12).div(mark).toString(), eth.szDecimals);
    const sizeNum = new D(sz).gt(0) ? sz : new D(1).div(new D(10).pow(eth.szDecimals)).toString();
    const open = await trader.marketOrder({ asset: "ETH", isBuy: true, sz: sizeNum, reduceOnly: false, markPx: mark, slippageBps: 50 });
    expect(["filled", "partial"]).toContain(open.status);
    const filled = open.filledSz;

    const entry = new D(open.avgPx!);
    const oids = await trader.placeTriggers("ETH", [
      { tpsl: "sl", isBuy: false, sz: filled, triggerPx: entry.mul(1 - 0.5 / 3).toString() },
      { tpsl: "tp", isBuy: false, sz: filled, triggerPx: entry.mul(1 + 0.25 / 3).toString() },
    ]);
    expect(oids).toHaveLength(2);

    const mid = await info.accountState(account);
    const leg = mid.legs.find((l) => l.asset === "ETH");
    expect(leg?.isolated).toBe(true);
    expect(leg?.leverage).toBe(3);
    const trig = mid.triggers.filter((t) => oids.includes(t.oid));
    expect(trig.map((t) => t.tpsl).sort()).toEqual(["sl", "tp"]);

    await trader.cancel("ETH", oids);
    const close = await trader.marketOrder({
      asset: "ETH",
      isBuy: false,
      sz: leg!.szi,
      reduceOnly: true,
      markPx: (await info.allMids()).ETH!,
      slippageBps: 100,
    });
    expect(["filled", "partial"]).toContain(close.status);

    const after = await info.accountState(account);
    expect(after.legs.find((l) => l.asset === "ETH")).toBeUndefined();
    expect(after.triggers.filter((t) => oids.includes(t.oid))).toHaveLength(0);
  }, 60_000);
});
