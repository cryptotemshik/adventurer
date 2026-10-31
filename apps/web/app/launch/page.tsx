import type { Metadata } from "next";
import { getConfig, siteUrl } from "@/lib/config";
import { perpAssets } from "@/lib/hl-public";
import { LaunchForm } from "./LaunchForm";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Launch a market", description: "Launch a coin on pump.fun with a leveraged position on Hyperliquid." };
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
      <PageTitle title="Launch a market" sub="A coin on pump.fun and a position on Hyperliquid. Max 5×, stop-loss placed at entry, take-profits fund buybacks." />
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
