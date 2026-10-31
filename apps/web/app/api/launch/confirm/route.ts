import { z } from "zod";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { addEvent, addLedger, getMarket, getPending, updateMarket, updatePending } from "@bias/db";
import { verifyLaunchTx } from "@bias/chain/launch";
import { strategyLabel, solToLamports, type Strategy } from "@bias/shared";
import { tierAtLeast } from "@bias/engine";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { fail, handle, ok } from "@/lib/http";
import { requireWallet } from "@/lib/auth";
import { connection } from "@/lib/solana";
import { fromBase64 } from "@/lib/launch";

const Body = z.object({
  pendingId: z.string().max(64),
  signature: z.string().max(120).optional(),
  signedTx: z.string().max(20_000).optional(),
});

/** Server-side verification of the launch tx; only then does the market go live in the feed. */
export const POST = handle(async (req: Request) => {
  const wallet = await requireWallet();
  const b = Body.parse(await req.json());
  const db = await getDb();
  const cfg = await getConfig();
  const p = await getPending(db, b.pendingId);
  if (!p || p.wallet !== wallet) return fail(404, "unknown launch");
  const m = await getMarket(db, p.marketId);
  if (!m) return fail(404, "unknown market");
  if (p.status === "confirmed") return ok({ ok: true, mint: m.mint, market: m.id });

  let sig: string;
  if (cfg.DRY_RUN) {
    // DRY_RUN: never send. Simulate what the wallet signed (best effort) and record it.
    let sim = "not simulated";
    if (b.signedTx) {
      try {
        const tx = VersionedTransaction.deserialize(fromBase64(b.signedTx));
        const r = await connection().simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
        sim = r.value.err ? `simulation error: ${JSON.stringify(r.value.err)}` : `simulation ok (${r.value.unitsConsumed} CU)`;
      } catch (e) {
        sim = `simulation unavailable: ${(e as Error).message.slice(0, 120)}`;
      }
    }
    sig = `sim:${p.id}`;
    await addEvent(db, { marketId: m.id, type: "launch", message: `DRY_RUN launch — ${sim}`, chain: "sol" });
  } else {
    if (!b.signature) return fail(400, "signature required");
    if (Date.now() > p.expiresAt + 10 * 60_000 && p.status === "prepared") return fail(410, "launch expired; prepare again");
    await updatePending(db, p.id, { signature: b.signature, status: "sent" });
    const v = await verifyLaunchTx({
      connection: connection(),
      signature: b.signature,
      user: wallet,
      mint: p.mint,
      vault: m.solVault,
      treasury: cfg.TREASURY_PUBKEY || null,
      launchFeeLamports: BigInt(p.launchFeeLamports),
    });
    if (!v.ok) {
      if (/not found|not confirmed/i.test(v.reason ?? "")) return ok({ ok: false, pending: true, reason: v.reason }, { status: 202 });
      await updatePending(db, p.id, { status: "failed" });
      return fail(400, `launch verification failed: ${v.reason}`);
    }
    sig = b.signature;
    void PublicKey;
  }

  const input = JSON.parse(p.input) as { tier?: string; strategy: Strategy };
  const fund = input.tier ? tierAtLeast(input.tier as "fund", "fund") && !!cfg.BIAS_MINT : false;
  await updateMarket(db, m.id, {
    status: "waiting_for_fees",
    launchSig: sig,
    createdAt: Date.now(),
    lastFeeAt: Date.now(),
    featuredUntil: fund ? Date.now() + 86_400_000 : null,
  });
  await updatePending(db, p.id, { status: "confirmed", signature: sig });
  await addLedger(db, { marketId: m.id, type: "deposit", asset: "SOL_RENT", amount: solToLamports(cfg.VAULT_RENT_SOL).toString(), txid: sig, opId: `launch:${m.id}` });
  await addEvent(db, {
    marketId: m.id,
    type: "launch",
    message: `launched $${m.ticker} on pump.fun. bias: ${strategyLabel(input.strategy)}`,
    txid: sig.startsWith("sim:") ? null : sig,
    chain: "sol",
  });
  return ok({ ok: true, mint: m.mint, market: m.id });
});
