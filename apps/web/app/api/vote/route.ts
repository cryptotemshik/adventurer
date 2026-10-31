import { z } from "zod";
import { getMarket, upsertVote } from "@bias/db";
import { roundId } from "@bias/engine";
import { getDb } from "@/lib/db";
import { fail, handle, ok, HttpError } from "@/lib/http";
import { verifySigned } from "@/lib/auth";
import { walletTokenBalance } from "@/lib/solana";

const Body = z.object({
  mint: z.string().max(64),
  choice: z.enum(["long", "short", "flat"]),
  wallet: z.string().max(64),
  message: z.string().max(2000),
  signature: z.string().max(200),
});

/** A vote is a signature, not a transaction. Weight = sqrt(balance), checked at vote time and at tally time. */
export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  const db = await getDb();
  const m = await getMarket(db, b.mint);
  if (!m || !m.community || !m.mint) return fail(404, "not a community market");
  if (["stopped", "dead", "pending_launch"].includes(m.status)) return fail(400, "voting is closed for this market");
  const round = roundId(Date.now());
  if (!b.message.includes(`vote ${b.choice} on market ${m.mint} for round ${round}.`)) throw new HttpError(400, "message does not match this vote");
  await verifySigned(req, b.message, b.signature, b.wallet);
  const balance = await walletTokenBalance(b.wallet, m.mint);
  if (balance <= 0n) return fail(403, `you need to hold $${m.ticker} to vote`);
  await upsertVote(db, { marketId: m.id, round, wallet: b.wallet, choice: b.choice, balance: balance.toString(), signature: b.signature, at: Date.now() });
  return ok({ ok: true, round, choice: b.choice });
});
