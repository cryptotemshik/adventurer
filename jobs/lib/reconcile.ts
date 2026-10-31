import { addAlert, ledgerSums, updateMarket, type Market } from "@bias/db";
import { reconcileMarket, type LedgerSums, type ReconLine } from "@bias/engine";
import type { JobEnv } from "./env";
import type { ChainOps, HlTreasuryOps } from "./venue";
import Decimal from "decimal.js";

export function toLedgerSums(s: Record<string, bigint>): LedgerSums {
  const g = (k: string) => s[k] ?? 0n;
  return {
    claim: g("claim:SOL"),
    split_launcher: g("split_launcher:SOL"),
    split_platform: g("split_platform:SOL"),
    split_position: g("split_position:SOL"),
    payout_launcher: g("payout_launcher:SOL"),
    payout_platform: g("payout_platform:SOL"),
    bridge_in: g("bridge_in:SOL"),
    buyback_sol: g("buyback:SOL"),
    withdraw_arrived_sol: g("withdraw_arrived:SOL"),
    rent_in: g("deposit:SOL_RENT"),
    tx_fees: g("tx_fee:SOL"),
    deposit_usd: g("deposit:USD"),
    realized_pnl_usd: g("realized_pnl:USD"),
    trade_fee_usd: g("trade_fee:USD"),
    funding_usd: g("funding:USD"),
    withdraw_usd: g("withdraw:USD"),
  };
}

/** Reconcile one market against chain balances; mismatches > 1% turn red on /proof and raise an alert. */
export async function reconcileOne(env: JobEnv, m: Market, chain: Pick<ChainOps, "vaultBalance">, hl?: Pick<HlTreasuryOps, "state" | "exists">): Promise<ReconLine[]> {
  const sums = toLedgerSums(await ledgerSums(env.db, m.id));
  const vault = await chain.vaultBalance(m.solVault);
  let accountValue = "0";
  let upnl = "0";
  if (hl && (await hl.exists(m).catch(() => false))) {
    const st = await hl.state(m);
    const spotUsdc = st.account.spot.USDC ?? "0";
    accountValue = new Decimal(st.account.accountValue).add(spotUsdc).toString();
    upnl = st.legs.reduce((a, l) => a.add(l.unrealizedPnl), new Decimal(0)).toString();
  }
  const lines = reconcileMarket(sums, { vaultLamports: vault, hlAccountValueUsd: accountValue, hlUnrealizedUsd: upnl, inTransitLamports: BigInt(m.inTransitLamports) });
  // the HL line only means something once money has been deposited
  const effective = lines.filter((l) => l.key !== "hl" || sums.deposit_usd > 0n);
  const ok = effective.every((l) => l.ok);
  await updateMarket(env.db, m.id, { reconOk: ok, reconJson: JSON.stringify(effective) });
  if (!ok && m.reconOk) {
    const bad = effective.filter((l) => !l.ok).map((l) => `${l.label}: expected ${l.expected}, actual ${l.actual}`);
    await addAlert(env.db, "critical", `${m.ticker}: reconciliation mismatch — ${bad.join("; ")}`.slice(0, 500), m.id);
  }
  return effective;
}
