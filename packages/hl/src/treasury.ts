import { ExchangeClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { D } from "./format";
import { wrap } from "./errors";
import { HlInfo, makeTransport } from "./info";
import type { HlNetwork, Hex } from "./types";

/**
 * Money-moving client. Signs with the market's MASTER key (MASTER_SEED; buyback workflow only).
 * Used for: approving the trading agent, spot↔perp transfers, sending spot tokens to the
 * Hyperunit withdrawal address.
 */
export class HlTreasury {
  readonly exchange: ExchangeClient;
  readonly info: HlInfo;
  readonly address: Hex;

  constructor(opts: { network: HlNetwork; masterPrivateKey: Hex; info?: HlInfo }) {
    const wallet = privateKeyToAccount(opts.masterPrivateKey);
    this.address = wallet.address;
    this.info = opts.info ?? new HlInfo(opts.network);
    this.exchange = new ExchangeClient({ transport: makeTransport(opts.network), wallet });
  }

  /** Requires the account to exist on HL (i.e. after its first deposit). */
  async approveAgent(agentAddress: Hex, name: string): Promise<void> {
    await wrap("approveAgent", undefined, () =>
      this.exchange.approveAgent({ agentAddress, agentName: name.slice(0, 16) || null }),
    );
  }

  async usdClassTransfer(amountUsd: string, toPerp: boolean): Promise<void> {
    const amount = positive(amountUsd, 6);
    await wrap("usdClassTransfer", undefined, () => this.exchange.usdClassTransfer({ amount, toPerp }));
  }

  /** Send a spot token (by name, e.g. "USOL") — resolved to the `NAME:tokenId` wire format. */
  async spotSend(destination: string, token: string, amount: string): Promise<void> {
    const tokens = await this.info.spotPairs();
    let wireToken: string;
    let decimals: number;
    if (token === "USDC") {
      const meta = await this.info.client.spotMeta();
      const usdc = meta.tokens.find((t) => t.name === "USDC");
      if (!usdc) throw new Error("USDC token not found in spot meta");
      wireToken = `USDC:${usdc.tokenId}`;
      decimals = usdc.weiDecimals;
    } else {
      const pair = tokens[token];
      if (!pair) throw new Error(`unknown spot token: ${token}`);
      wireToken = `${pair.token}:${pair.tokenId}`;
      decimals = pair.weiDecimals;
    }
    const amt = positive(amount, decimals);
    await wrap("spotSend", token, () =>
      this.exchange.spotSend({ destination: destination as Hex, token: wireToken, amount: amt }),
    );
  }

  /** Bridge2 USDC withdrawal to Arbitrum. Not used by the default flow (Hyperunit is used for SOL). */
  async withdrawUsdc(destination: Hex, amountUsd: string): Promise<void> {
    const amount = positive(amountUsd, 6);
    await wrap("withdraw3", undefined, () => this.exchange.withdraw3({ destination, amount }));
  }
}

function positive(amount: string, decimals: number): string {
  const d = new D(amount).toDecimalPlaces(decimals, D.ROUND_DOWN);
  if (d.lte(0)) throw new Error(`amount must be positive: ${amount}`);
  return d.toFixed();
}
