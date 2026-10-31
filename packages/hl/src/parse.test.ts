import { describe, expect, it } from "vitest";
import {
  parseAccountState,
  parseFills,
  parseMarketOrderStatus,
  parsePerpMeta,
  parseSpotPairs,
} from "./parse";
import { hlExplorerAddressUrl, hlExplorerTxUrl } from "./explorer";

describe("parsePerpMeta", () => {
  it("maps names to asset ids by universe index and skips delisted", () => {
    const m = parsePerpMeta({
      universe: [
        { name: "BTC", szDecimals: 5, maxLeverage: 40 },
        { name: "OLD", szDecimals: 1, maxLeverage: 3, isDelisted: true },
        { name: "ETH", szDecimals: 4, maxLeverage: 25, onlyIsolated: true },
      ],
    });
    expect(m.BTC).toEqual({ name: "BTC", assetId: 0, szDecimals: 5, maxLeverage: 40, onlyIsolated: false });
    expect(m.ETH?.assetId).toBe(2);
    expect(m.ETH?.onlyIsolated).toBe(true);
    expect(m.OLD).toBeUndefined();
  });
});

describe("parseSpotPairs", () => {
  const tokens = [
    { name: "USDC", szDecimals: 8, weiDecimals: 8, index: 0, tokenId: "0xusdc", isCanonical: true },
    { name: "HYPE", szDecimals: 2, weiDecimals: 8, index: 150, tokenId: "0xhype", isCanonical: false },
    { name: "USOL", szDecimals: 3, weiDecimals: 9, index: 254, tokenId: "0xusol", isCanonical: false },
    { name: "FOO", szDecimals: 0, weiDecimals: 5, index: 9, tokenId: "0xfoo" },
  ];
  it("only takes USDC-quoted pairs and computes 10000+index", () => {
    const p = parseSpotPairs({
      tokens,
      universe: [
        { tokens: [150, 0], name: "@107", index: 107 },
        { tokens: [254, 0], name: "@156", index: 156 },
        { tokens: [9, 150], name: "@3", index: 3 },
      ],
    });
    expect(p.HYPE).toMatchObject({ pairName: "@107", assetId: 10107, szDecimals: 2, tokenId: "0xhype" });
    expect(p.USOL).toMatchObject({ pairName: "@156", assetId: 10156, weiDecimals: 9 });
    expect(p.FOO).toBeUndefined();
  });
  it("prefers canonical, then lowest index, for duplicate base tokens", () => {
    const p = parseSpotPairs({
      tokens,
      universe: [
        { tokens: [150, 0], name: "@200", index: 200 },
        { tokens: [150, 0], name: "@50", index: 50 },
      ],
    });
    expect(p.HYPE?.pairName).toBe("@50");
    const q = parseSpotPairs({
      tokens,
      universe: [
        { tokens: [150, 0], name: "@50", index: 50 },
        { tokens: [150, 0], name: "@300", index: 300, isCanonical: true },
      ],
    });
    expect(q.HYPE?.pairName).toBe("@300");
  });
});

describe("parseAccountState", () => {
  it("maps positions, trigger orders and spot balances", () => {
    const s = parseAccountState(
      {
        marginSummary: { accountValue: "105.5", totalNtlPos: "300", totalMarginUsed: "100" },
        withdrawable: "5.5",
        assetPositions: [
          {
            position: {
              coin: "ETH",
              szi: "0.1",
              leverage: { type: "isolated", value: 3 },
              entryPx: "3000",
              positionValue: "300",
              unrealizedPnl: "0.5",
              liquidationPx: "2050.1",
              marginUsed: "100.5",
              cumFunding: { sinceOpen: "0.01" },
            },
          },
          {
            position: {
              coin: "BTC",
              szi: "0.0",
              leverage: { type: "cross", value: 5 },
              entryPx: "0",
              positionValue: "0",
              unrealizedPnl: "0",
              liquidationPx: null,
              marginUsed: "0",
              cumFunding: { sinceOpen: "0" },
            },
          },
        ],
      },
      [
        { coin: "ETH", side: "A", sz: "0.1", oid: 11, isTrigger: true, triggerPx: "2500", reduceOnly: true, orderType: "Stop Market" },
        { coin: "ETH", side: "A", sz: "0.025", oid: 12, isTrigger: true, triggerPx: "3250", reduceOnly: true, orderType: "Take Profit Market" },
        { coin: "ETH", side: "B", sz: "1", oid: 13, isTrigger: false, triggerPx: "0", reduceOnly: false, orderType: "Limit" },
      ],
      { balances: [{ coin: "USDC", total: "10", hold: "0" }] },
    );
    expect(s.legs).toHaveLength(1);
    expect(s.legs[0]).toMatchObject({ asset: "ETH", szi: "0.1", isolated: true, leverage: 3, cumFunding: "0.01" });
    expect(s.triggers).toEqual([
      { oid: 11, asset: "ETH", isBuy: false, sz: "0.1", triggerPx: "2500", tpsl: "sl", reduceOnly: true },
      { oid: 12, asset: "ETH", isBuy: false, sz: "0.025", triggerPx: "3250", tpsl: "tp", reduceOnly: true },
    ]);
    expect(s.spot.USDC).toEqual({ total: "10", hold: "0" });
    expect(s.withdrawable).toBe("5.5");
  });
});

describe("parseFills", () => {
  it("sorts by time then tid", () => {
    const base = { px: "1", sz: "1", side: "B" as const, closedPnl: "0", fee: "0", dir: "Open Long", hash: "0x", oid: 1, coin: "ETH" };
    const f = parseFills([
      { ...base, time: 2, tid: 1 },
      { ...base, time: 1, tid: 5 },
      { ...base, time: 1, tid: 2 },
    ]);
    expect(f.map((x) => x.tid)).toEqual([2, 5, 1]);
    expect(f[0]?.asset).toBe("ETH");
  });
});

describe("parseMarketOrderStatus", () => {
  it("handles filled, partial, resting, string and error statuses", () => {
    expect(parseMarketOrderStatus({ filled: { totalSz: "0.1", avgPx: "3000", oid: 7 } }, "0.1")).toEqual({
      oid: 7,
      filledSz: "0.1",
      avgPx: "3000",
      status: "filled",
    });
    expect(parseMarketOrderStatus({ filled: { totalSz: "0.05", avgPx: "3000", oid: 7 } }, "0.1").status).toBe("partial");
    expect(parseMarketOrderStatus({ resting: { oid: 9 } }, "1")).toMatchObject({ oid: 9, status: "resting" });
    expect(parseMarketOrderStatus("waitingForFill", "1").status).toBe("waitingForFill");
    expect(() => parseMarketOrderStatus({ error: "Insufficient margin" }, "1")).toThrow("Insufficient margin");
  });
});

describe("explorer urls", () => {
  it("points to the right network", () => {
    expect(hlExplorerAddressUrl("mainnet", "0xabc")).toBe("https://app.hyperliquid.xyz/explorer/address/0xabc");
    expect(hlExplorerTxUrl("testnet", "0xdef")).toBe("https://app.hyperliquid-testnet.xyz/explorer/tx/0xdef");
  });
});
