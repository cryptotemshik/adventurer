import type { Metadata } from "next";
import { getConfig, siteUrl } from "@/lib/config";
import { perpAssets } from "@/lib/hl-public";
import { LaunchForm } from "./LaunchForm";

export const metadata: Metadata = { title: "launch a market", description: "launch a coin on pump.fun with a leveraged bias on hyperliquid. stops included." };
export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  const cfg = await getConfig();
  let assets: Record<string, unknown> = {};
  try {
    assets = await perpAssets();
  } catch {}
  const allowlist = cfg.allowlist.filter((a) => !Object.keys(assets).length || assets[a]);
  return (
    <>
      <h1 className="font-display mb-1 text-3xl font-bold">launch a market</h1>
      <p className="mb-6 text-sm text-muted">a coin on pump.fun + a position on hyperliquid. max 5×, stop-loss set at entry, take-profits pay for buybacks.</p>
      <LaunchForm
        allowlist={allowlist}
        launchFeeSol={cfg.TREASURY_PUBKEY ? cfg.LAUNCH_FEE_SOL : "0"}
        maxDevBuy={cfg.MAX_DEV_BUY_SOL}
        vaultRentSol={cfg.VAULT_RENT_SOL}
        launchesEnabled={cfg.LAUNCHES_ENABLED}
        siteUrl={siteUrl()}
        split={{ position: cfg.FEE_SPLIT_POSITION_BPS, launcher: cfg.FEE_SPLIT_LAUNCHER_BPS, platform: cfg.FEE_SPLIT_PLATFORM_BPS }}
      />
    </>
  );
}
