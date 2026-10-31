import { z } from "zod";
import { StrategySchema } from "@bias/shared";
import { minCollateralUsd, previewStrategy, previewText, validateStrategy, allowedStrategies } from "@bias/engine";
import { handle, ok } from "@/lib/http";
import { getConfig } from "@/lib/config";
import { perpAssets } from "@/lib/hl-public";
import { currentWallet } from "@/lib/auth";
import { walletTier } from "@/lib/solana";

const Body = z.object({ strategy: StrategySchema, community: z.boolean().default(false) });

/** Live guardrail preview — computed server-side with the same engine code the job uses. */
export const POST = handle(async (req: Request) => {
  const { strategy, community } = Body.parse(await req.json());
  const cfg = await getConfig();
  const assets = await perpAssets();
  const { tier } = await walletTier(await currentWallet());
  const errors = validateStrategy(strategy, {
    allowlist: cfg.allowlist.filter((a) => assets[a]),
    maxLeverage: cfg.MAX_LEVERAGE,
    community,
    tierAllowsAdvanced: allowedStrategies(tier).includes(strategy.type),
  });
  const legs = errors.length ? [] : previewStrategy(strategy, assets, cfg.MAX_LOSS_MARGIN_PCT);
  return ok({
    errors,
    tier,
    legs: legs.map((l) => ({ ...l, text: previewText(l) })),
    minCollateralUsd: errors.length ? null : minCollateralUsd(strategy, assets, cfg.MAX_LOSS_MARGIN_PCT),
  });
});

export const GET = handle(async () => {
  const cfg = await getConfig();
  const assets = await perpAssets();
  return ok({ allowlist: cfg.allowlist.filter((a) => assets[a]), maxLeverage: cfg.MAX_LEVERAGE }, { cache: 60 });
});
