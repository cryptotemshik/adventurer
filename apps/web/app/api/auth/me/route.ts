import { handle, ok } from "@/lib/http";
import { currentWallet, isAdmin } from "@/lib/auth";
import { walletTier } from "@/lib/solana";

export const GET = handle(async () => {
  const wallet = await currentWallet();
  if (!wallet) return ok({ wallet: null });
  return ok({ wallet, ...(await walletTier(wallet)), admin: await isAdmin(wallet) });
});
