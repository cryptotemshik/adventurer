import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { isAdmin, startSession, verifySigned } from "@/lib/auth";
import { walletTier } from "@/lib/solana";

const Body = z.object({ message: z.string().max(2000), signature: z.string().max(200), wallet: z.string().max(64) });

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  await verifySigned(req, b.message, b.signature, b.wallet);
  await startSession(b.wallet);
  const t = await walletTier(b.wallet);
  return ok({ wallet: b.wallet, ...t, admin: await isAdmin(b.wallet) });
});
