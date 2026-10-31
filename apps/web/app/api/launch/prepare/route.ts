import { Keypair, PublicKey } from "@solana/web3.js";
import { LaunchInputSchema, containsBlockedWord, solToLamports, lamportsToSol } from "@bias/shared";
import { validateStrategy, allowedStrategies, launchFeeLamports, initialDirection, tierAtLeast } from "@bias/engine";
import { insertMarket, insertPending, listMarkets, rateLimit, takeAddress } from "@bias/db";
import { buildLaunchTx, uploadMetadata, fetchLookupTable } from "@bias/chain/launch";
import { getDb } from "@/lib/db";
import { getConfig, siteUrl } from "@/lib/config";
import { fail, handle, HttpError, ok } from "@/lib/http";
import { isAdmin, randomId, requireWallet } from "@/lib/auth";
import { connection, walletTier } from "@/lib/solana";
import { perpAssets } from "@/lib/hl-public";
import { sniffImage, toBase64 } from "@/lib/launch";

export const POST = handle(async (req: Request) => {
  const wallet = await requireWallet();
  const cfg = await getConfig();
  if (!cfg.LAUNCHES_ENABLED) return fail(503, "launches are paused");
  const db = await getDb();

  const form = await req.formData();
  const raw = JSON.parse(String(form.get("data") ?? "{}"));
  const input = LaunchInputSchema.parse(raw);
  const file = form.get("image");
  if (!(file instanceof Blob)) throw new HttpError(400, "image is required");
  const image = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(image, file.type);

  const bad = containsBlockedWord(input.name, input.ticker, input.description);
  if (bad) throw new HttpError(400, "name, ticker or description contains a blocked word");
  if (solToLamports(input.devBuySol) > solToLamports(cfg.MAX_DEV_BUY_SOL)) throw new HttpError(400, `dev buy max is ${cfg.MAX_DEV_BUY_SOL} SOL`);
  const admin = await isAdmin(wallet);
  if (input.flagship && !admin) throw new HttpError(403, "only admins can launch the flagship market");

  const { tier } = await walletTier(wallet);
  const assets = await perpAssets();
  const errors = validateStrategy(input.strategy, {
    allowlist: cfg.allowlist.filter((a) => assets[a]),
    maxLeverage: cfg.MAX_LEVERAGE,
    community: input.community,
    tierAllowsAdvanced: admin || allowedStrategies(tier).includes(input.strategy.type),
  });
  if (errors.length) return fail(400, errors[0]!, { errors });

  const live = await listMarkets(db, { limit: 500, includeHidden: true });
  const totalNotional = live.reduce((a, m) => a + Number(m.notionalUsd), 0);
  if (totalNotional >= cfg.MAX_TOTAL_NOTIONAL_USD) return fail(503, "platform notional limit reached; launches resume when capacity frees up");

  if (!admin && !(await rateLimit(db, `launch:${wallet}`, 1, cfg.LAUNCH_COOLDOWN_MIN * 60_000))) {
    return fail(429, `one launch per wallet every ${cfg.LAUNCH_COOLDOWN_MIN} minutes`);
  }

  const addr = await takeAddress(db);
  if (!addr) return fail(503, "launch capacity is being provisioned. try again in a few minutes.");

  const mint = Keypair.generate();
  const mintAddr = mint.publicKey.toBase58();
  const marketUrl = `${siteUrl()}/t/${mintAddr}`;
  const meta = await uploadMetadata({
    image,
    mime,
    name: input.name,
    symbol: input.ticker,
    description: input.description,
    twitter: input.twitter || undefined,
    telegram: input.telegram || undefined,
    website: marketUrl,
    dryRun: cfg.DRY_RUN,
  });

  const treasury = cfg.TREASURY_PUBKEY ? new PublicKey(cfg.TREASURY_PUBKEY) : null;
  const fee = treasury ? launchFeeLamports(tier, solToLamports(cfg.LAUNCH_FEE_SOL)) : 0n;
  const rent = solToLamports(cfg.VAULT_RENT_SOL);
  const devBuy = solToLamports(input.devBuySol);
  const conn = connection();
  const lut = process.env.LAUNCH_LOOKUP_TABLE ? await fetchLookupTable(conn, new PublicKey(process.env.LAUNCH_LOOKUP_TABLE)).catch(() => null) : null;
  const payer = cfg.DRY_RUN && cfg.DRY_RUN_PAYER ? new PublicKey(cfg.DRY_RUN_PAYER) : new PublicKey(wallet);
  const built = await buildLaunchTx({
    connection: conn,
    user: payer,
    mint,
    vault: new PublicKey(addr.solVault),
    treasury,
    name: input.name,
    symbol: input.ticker,
    uri: meta.metadataUri,
    devBuyLamports: devBuy,
    launchFeeLamports: fee,
    vaultRentLamports: rent,
    maxPriorityMicroLamports: cfg.MAX_PRIORITY_MICROLAMPORTS,
    lookupTable: lut,
  });

  const marketId = `m${addr.idx}`;
  const now = Date.now();
  await insertMarket(db, {
    id: marketId,
    idx: addr.idx,
    mint: mintAddr,
    name: input.name,
    ticker: input.ticker,
    description: input.description,
    image: meta.imageUri ?? "",
    metadataUri: meta.metadataUri,
    socials: JSON.stringify({ twitter: input.twitter || undefined, telegram: input.telegram || undefined, website: input.website || undefined }),
    launcher: wallet,
    payoutWallet: input.flagship && cfg.TREASURY_PUBKEY ? cfg.TREASURY_PUBKEY : input.payoutWallet,
    solVault: addr.solVault,
    hlAccount: addr.hlAccount,
    hlAgent: addr.hlAgent,
    strategy: JSON.stringify(input.strategy),
    community: input.community,
    flagship: input.flagship,
    deskBadge: tierAtLeast(tier, "desk") && !!cfg.BIAS_MINT,
    status: "pending_launch",
    direction: initialDirection(input.strategy),
    createdAt: now,
  });
  const pendingId = randomId(12);
  await insertPending(db, {
    id: pendingId,
    marketId,
    wallet,
    mint: mintAddr,
    launchFeeLamports: fee.toString(),
    input: JSON.stringify({ ...input, tier }),
    expiresAt: now + 120_000,
    createdAt: now,
  });

  const networkFee = 5_000n * 2n + BigInt(Math.ceil((built.computeUnits * built.priorityMicroLamports) / 1e6));
  const total = networkFee + fee + rent + devBuy + 22_000_000n; // + ~0.022 SOL mint/curve account rent (paid to pump accounts)
  return ok({
    pendingId,
    mint: mintAddr,
    vault: addr.solVault,
    hlAccount: addr.hlAccount,
    tx: toBase64(built.tx.serialize()),
    buyTx: built.buyTx ? toBase64(built.buyTx.serialize()) : null,
    lastValidBlockHeight: built.lastValidBlockHeight,
    dryRun: cfg.DRY_RUN,
    summary: {
      networkFeeSol: lamportsToSol(networkFee),
      accountRentSol: "0.022",
      launchFeeSol: lamportsToSol(fee),
      devBuySol: lamportsToSol(devBuy),
      vaultRentSol: lamportsToSol(rent),
      totalSol: lamportsToSol(total),
    },
  });
});
