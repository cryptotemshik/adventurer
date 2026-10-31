import { base58 } from "@bias/shared";
import { createNonce } from "@bias/db";
import { voteMessage } from "@bias/engine";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { expectedDomain, randomId, siwsMessage } from "@/lib/auth";

const Q = z.object({
  wallet: base58,
  purpose: z.enum(["signin", "vote"]).default("signin"),
  mint: z.string().max(64).optional(),
  choice: z.enum(["long", "short", "flat"]).optional(),
  round: z.string().max(16).optional(),
});

/** Returns the exact message the wallet should sign (SIWS for sign-in, or a vote message). */
export const GET = handle(async (req: Request) => {
  const q = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const nonce = randomId(16);
  await createNonce(await getDb(), nonce);
  const domain = expectedDomain(req);
  if (q.purpose === "vote") {
    if (!q.mint || !q.choice || !q.round) return ok({ error: "mint, choice and round required" }, { status: 400 });
    return ok({ message: voteMessage({ domain, wallet: q.wallet, mint: q.mint, round: q.round, choice: q.choice, nonce }) });
  }
  return ok({ message: siwsMessage({ domain, wallet: q.wallet, nonce, issuedAt: new Date().toISOString() }) });
});
