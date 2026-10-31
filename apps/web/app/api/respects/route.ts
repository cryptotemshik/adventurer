import { z } from "zod";
import { getMarket, payRespects } from "@bias/db";
import { respectsKey } from "@bias/engine";
import { getDb } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";
import { requireWallet } from "@/lib/auth";

export const POST = handle(async (req: Request) => {
  const wallet = await requireWallet();
  const { mint } = z.object({ mint: z.string().max(64) }).parse(await req.json());
  const db = await getDb();
  const m = await getMarket(db, mint);
  if (!m || !["stopped", "dead"].includes(m.status)) return fail(404, "no such grave");
  const paid = await payRespects(db, respectsKey(wallet, m.id, Date.now()), m.id, wallet);
  if (!paid) return fail(429, "you already paid respects today. come back tomorrow.");
  return ok({ ok: true, respects: m.respects + 1 });
});
