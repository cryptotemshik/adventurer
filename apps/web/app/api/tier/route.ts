import { base58 } from "@bias/shared";
import { tierPerks } from "@bias/engine";
import { handle, ok, fail } from "@/lib/http";
import { walletTier } from "@/lib/solana";

export const GET = handle(async (req: Request) => {
  const w = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!base58.safeParse(w).success) return fail(400, "bad wallet");
  const t = await walletTier(w);
  return ok({ ...t, perks: tierPerks(t.tier) }, { cache: 30 });
});
