"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Strategy } from "@bias/shared";
import { useSession } from "@/components/Providers";
import { WalletButton } from "@/components/WalletButton";

type SType = Strategy["type"];
interface Preview {
  errors: string[];
  tier: string;
  legs: { asset: string; side: string; leverage: number; requestedLeverage: number; reduced: boolean; text: string }[];
  minCollateralUsd: number | null;
}
interface Prepared {
  pendingId: string;
  mint: string;
  vault: string;
  hlAccount: string;
  tx: string;
  buyTx: string | null;
  dryRun: boolean;
  summary: Record<string, string>;
}

const CAPS: Record<SType, number> = { single: 5, basket: 4, pair: 3, funding: 1 };
const FUNDING = ["HYPE", "BTC", "ETH", "SOL"];
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const tob64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

export function LaunchForm({ allowlist, launchFeeSol, maxDevBuy, vaultRentSol, launchesEnabled, siteUrl, split }: {
  allowlist: string[];
  launchFeeSol: string;
  maxDevBuy: string;
  vaultRentSol: string;
  launchesEnabled: boolean;
  siteUrl: string;
  split: { position: number; launcher: number; platform: number };
}) {
  const session = useSession();
  const { publicKey, signAllTransactions, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [devBuy, setDevBuy] = useState("0");

  const [type, setType] = useState<SType>("single");
  const [asset, setAsset] = useState("HYPE");
  const [side, setSide] = useState<"long" | "short">("long");
  const [lev, setLev] = useState(3);
  const [legs, setLegs] = useState([
    { asset: "BTC", weight: 40 },
    { asset: "SOL", weight: 30 },
    { asset: "HYPE", weight: 30 },
  ]);
  const [pairA, setPairA] = useState("SOL");
  const [pairB, setPairB] = useState("ETH");
  const [community, setCommunity] = useState(false);
  const [payout, setPayout] = useState("");
  const [flagship, setFlagship] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [step, setStep] = useState<"form" | "preparing" | "signing" | "confirming" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Prepared | null>(null);

  useEffect(() => {
    if (publicKey && !payout) setPayout(publicKey.toBase58());
  }, [publicKey, payout]);
  useEffect(() => {
    if (!image) return setImgUrl(null);
    const u = URL.createObjectURL(image);
    setImgUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);
  useEffect(() => {
    setLev((l) => Math.min(l, CAPS[type]));
    if (type === "funding") {
      setCommunity(false);
      if (!FUNDING.includes(asset)) setAsset("HYPE");
    }
  }, [type, asset]);

  const strategy: Strategy = useMemo(() => {
    switch (type) {
      case "single":
        return { type, asset, side, leverage: lev };
      case "basket":
        return { type, side, leverage: lev, legs: legs.map((l) => ({ asset: l.asset, weightBps: Math.round(l.weight * 100) })) };
      case "pair":
        return { type, long: pairA, short: pairB, leverage: lev };
      case "funding":
        return { type, asset };
    }
  }, [type, asset, side, lev, legs, pairA, pairB]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategy, community }) });
        const j = await r.json();
        if (r.ok) setPreview(j);
        else setPreview({ errors: j.issues ?? [j.error], tier: "none", legs: [], minCollateralUsd: null });
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [strategy, community, session.wallet]);

  const tierOk = preview?.tier === "desk" || preview?.tier === "fund" || session.admin;
  const feeWaived = ["trader", "desk", "fund"].includes(session.tier);
  const weightSum = legs.reduce((a, l) => a + l.weight, 0);
  const signedIn = !!session.wallet && publicKey?.toBase58() === session.wallet;
  const imageErr = image && (image.size > 4 * 1024 * 1024 ? "image must be ≤ 4 MB" : !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(image.type) ? "PNG, JPG, GIF or WebP" : null);
  const canLaunch = launchesEnabled && signedIn && name && ticker && image && !imageErr && preview && preview.errors.length === 0 && step === "form";

  async function launch() {
    setError(null);
    setStep("preparing");
    try {
      const fd = new FormData();
      fd.set(
        "data",
        JSON.stringify({ name, ticker, description, twitter, telegram, website, devBuySol: devBuy || "0", strategy, community, payoutWallet: payout, flagship }),
      );
      fd.set("image", image!);
      const r = await fetch("/api/launch/prepare", { method: "POST", body: fd });
      const p = (await r.json()) as Prepared & { error?: string };
      if (!r.ok) throw new Error(p.error ?? "prepare failed");
      setStep("signing");
      const txs = [VersionedTransaction.deserialize(b64(p.tx)), ...(p.buyTx ? [VersionedTransaction.deserialize(b64(p.buyTx))] : [])];
      let signed: VersionedTransaction[];
      if (signAllTransactions) signed = await signAllTransactions(txs);
      else if (signTransaction) signed = [await signTransaction(txs[0]!)];
      else throw new Error("this wallet cannot sign transactions");
      localStorage.setItem("bias:pending", JSON.stringify({ id: p.pendingId, at: Date.now() }));
      setStep("confirming");
      let body: Record<string, string>;
      if (p.dryRun) {
        body = { pendingId: p.pendingId, signedTx: tob64(signed[0]!.serialize()) };
      } else {
        const sig = await connection.sendRawTransaction(signed[0]!.serialize(), { skipPreflight: false, maxRetries: 3 });
        if (signed[1]) {
          await connection.confirmTransaction(sig, "confirmed").catch(() => null);
          await connection.sendRawTransaction(signed[1].serialize(), { skipPreflight: false, maxRetries: 3 }).catch(() => null);
        }
        body = { pendingId: p.pendingId, signature: sig };
      }
      for (let i = 0; i < 40; i++) {
        const c = await fetch("/api/launch/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = await c.json();
        if (c.ok && j.ok) {
          localStorage.removeItem("bias:pending");
          setDone(p);
          setStep("done");
          return;
        }
        if (c.status !== 202) throw new Error(j.error ?? "confirmation failed");
        await new Promise((res) => setTimeout(res, 3000));
      }
      throw new Error("still not confirmed. we'll keep checking — your market appears once the transaction lands.");
    } catch (e) {
      const msg = (e as Error).message;
      setError(/expired|blockhash/i.test(msg) ? "the transaction expired before it was sent. press launch again." : msg);
      setStep("form");
    }
  }

  if (step === "done" && done) {
    const url = `${siteUrl}/t/${done.mint}`;
    const share = `https://x.com/intent/tweet?text=${encodeURIComponent(
      `launched $${ticker.toUpperCase()}. its bias: ${preview?.legs.length ? strategyText(strategy) : ""}. fees fund the trade, profit burns the supply. ${url}`,
    )}`;
    return (
      <div className="panel mx-auto max-w-2xl p-6">
        <div className="text-xs uppercase tracking-widest text-long">market live{done.dryRun ? " (dry run)" : ""}</div>
        <h1 className="font-display mt-1 text-3xl">${ticker.toUpperCase()} has a bias.</h1>
        <dl className="num mt-5 space-y-2 text-sm">
          <Row k="CA" v={done.mint} />
          <Row k="solana vault" v={done.vault} />
          <Row k="hyperliquid account" v={done.hlAccount} />
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/t/${done.mint}`} className="btn btn-long">
            open market
          </Link>
          <a href={`https://pump.fun/coin/${done.mint}`} target="_blank" rel="noreferrer" className="btn">
            pump.fun
          </a>
          <a href={share} target="_blank" rel="noreferrer" className="btn">
            share on X
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <fieldset className="panel p-5">
          <legend className="font-display px-1 text-lg">1. the coin</legend>
          <p className="mb-4 text-xs text-muted">launched on pump.fun. creator fees go to this market&apos;s vault, not to a person.</p>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <label className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-bg text-center text-xs text-muted hover:border-[#3a404a]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {imgUrl ? <img src={imgUrl} alt="coin preview" className="h-full w-full object-cover" /> : <span>image<br />1000×1000<br />≤ 4 MB</span>}
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => setImage(e.target.files?.[0] ?? null)} aria-label="coin image" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="name" hint={`${name.length}/32`}>
                <input className="input" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="long boi" />
              </Field>
              <Field label="ticker" hint={`${ticker.length}/10`}>
                <input className="input num uppercase" maxLength={10} value={ticker} onChange={(e) => setTicker(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="LONGBOI" />
              </Field>
              <Field label="description" hint={`${description.length}/500`} className="sm:col-span-2">
                <textarea className="input min-h-20" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          </div>
          {imageErr && <p className="mt-2 text-xs text-short">{imageErr}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Field label="x (optional)">
              <input className="input" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/…" />
            </Field>
            <Field label="telegram (optional)">
              <input className="input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" />
            </Field>
            <Field label="website (optional)">
              <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label={`dev buy (≤ ${maxDevBuy} SOL)`}>
              <input className="input num" inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="panel p-5">
          <legend className="font-display px-1 text-lg">2. the bias</legend>
          <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="strategy type">
            {(["single", "basket", "pair", "funding"] as const).map((t) => {
              const locked = t !== "single" && !tierOk;
              return (
                <button key={t} role="tab" aria-selected={type === t} disabled={locked} title={locked ? "desk tier ($BIAS holders) unlocks this" : undefined} className={`btn ${type === t ? "border-long/50 text-long" : "text-muted"}`} onClick={() => setType(t)}>
                  {t === "funding" ? "funding farm" : t}
                  {locked && " 🔒"}
                </button>
              );
            })}
          </div>

          {type === "single" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <AssetSelect label="asset" value={asset} onChange={setAsset} list={allowlist} />
              <SideToggle side={side} setSide={setSide} />
              <LevSlider lev={lev} setLev={setLev} cap={CAPS.single} />
            </div>
          )}
          {type === "basket" && (
            <div className="space-y-3">
              {legs.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_auto] items-end gap-2">
                  <AssetSelect label={`asset ${i + 1}`} value={l.asset} onChange={(v) => setLegs(legs.map((x, j) => (j === i ? { ...x, asset: v } : x)))} list={allowlist} />
                  <Field label="weight %">
                    <input className="input num" type="number" min={5} max={95} value={l.weight} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} />
                  </Field>
                  <button className="btn" disabled={legs.length <= 2} onClick={() => setLegs(legs.filter((_, j) => j !== i))} aria-label="remove asset">
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button className="btn" disabled={legs.length >= 3} onClick={() => setLegs([...legs, { asset: "ETH", weight: 0 }])}>
                  + asset
                </button>
                <span className={`num text-xs ${weightSum === 100 ? "text-muted" : "text-short"}`}>weights: {weightSum}%</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SideToggle side={side} setSide={setSide} />
                <LevSlider lev={lev} setLev={setLev} cap={CAPS.basket} />
              </div>
            </div>
          )}
          {type === "pair" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <AssetSelect label="long" value={pairA} onChange={setPairA} list={allowlist} />
              <AssetSelect label="short" value={pairB} onChange={setPairB} list={allowlist} />
              <LevSlider lev={lev} setLev={setLev} cap={CAPS.pair} />
            </div>
          )}
          {type === "funding" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetSelect label="asset (needs HL spot)" value={asset} onChange={setAsset} list={FUNDING} />
              <p className="text-xs text-muted">short perp + spot long of the same size at 1×. collects funding. goes flat after two negative 8h windows, back on after two positive.</p>
            </div>
          )}

          <div className="mt-5 rounded-lg border border-line bg-bg p-4">
            <div className="mb-2 text-xs uppercase tracking-widest text-muted">guardrails preview</div>
            {preview?.errors.length ? (
              <ul className="space-y-1 text-sm text-short">
                {preview.errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            ) : (
              <ul className="num space-y-1.5 text-sm">
                {preview?.legs.map((l) => (
                  <li key={l.asset + l.side}>
                    <span className={l.side === "long" ? "text-long" : "text-short"}>
                      {l.asset} {l.side} {l.leverage}×
                    </span>
                    <span className="text-muted"> · {l.text}</span>
                    {l.reduced && <span className="text-accent"> · leverage reduced from {l.requestedLeverage}× so the stop fires well before liquidation</span>}
                  </li>
                ))}
                {preview?.minCollateralUsd != null && <li className="text-xs text-muted">opens once ≈ ${preview.minCollateralUsd.toFixed(0)} of fees reach the position. stop-loss and take-profits are set on the exchange at entry.</li>}
              </ul>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`flex items-start gap-3 rounded-lg border border-line p-3 ${type === "funding" ? "opacity-40" : ""}`}>
              <input type="checkbox" className="mt-1 accent-[var(--long)]" checked={community} disabled={type === "funding"} onChange={(e) => setCommunity(e.target.checked)} />
              <span>
                <span className="text-sm">🗳 community bias</span>
                <span className="block text-xs text-muted">holders vote long / short / flat once a day. a vote is a signature, not a transaction.</span>
              </span>
            </label>
            <Field label="payout wallet (your 20% of fees)">
              <input className="input num text-xs" value={payout} onChange={(e) => setPayout(e.target.value.trim())} placeholder="connect a wallet" />
            </Field>
          </div>
          {session.admin && (
            <label className="mt-3 flex items-center gap-2 text-sm text-accent">
              <input type="checkbox" checked={flagship} onChange={(e) => setFlagship(e.target.checked)} /> flagship ($BIAS) market — launcher share goes to the treasury
            </label>
          )}
        </fieldset>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="panel p-5">
          <h2 className="font-display text-lg">summary</h2>
          <dl className="num mt-3 space-y-1.5 text-sm">
            <Row k="network fees" v="≈ 0.0001 SOL" />
            <Row k="pump.fun account rent" v="≈ 0.022 SOL" />
            <Row k="bias launch fee" v={feeWaived ? "0 (holder)" : `${launchFeeSol} SOL`} />
            <Row k="vault gas float" v={`${vaultRentSol} SOL`} />
            <Row k="dev buy" v={`${devBuy || "0"} SOL`} />
            <div className="my-2 border-t border-line" />
            <Row
              k="total ≈"
              v={`${(0.0221 + (feeWaived ? 0 : Number(launchFeeSol)) + Number(vaultRentSol) + Number(devBuy || 0)).toFixed(4)} SOL`}
            />
          </dl>
        </div>
        <div className="panel p-5">
          <h2 className="font-display text-lg">how fees split</h2>
          <div className="mt-3 flex h-2 overflow-hidden rounded">
            <div className="bg-long" style={{ width: `${split.position / 100}%` }} />
            <div className="bg-flat" style={{ width: `${split.launcher / 100}%` }} />
            <div className="bg-accent" style={{ width: `${split.platform / 100}%` }} />
          </div>
          <ul className="num mt-3 space-y-1 text-sm">
            <li>
              <span className="text-long">{split.position / 100}%</span> → the position
            </li>
            <li>
              <span className="text-flat">{split.launcher / 100}%</span> → you (payout wallet)
            </li>
            <li>
              <span className="text-accent">{split.platform / 100}%</span> → buys back &amp; burns $BIAS
            </li>
          </ul>
        </div>
        {!launchesEnabled && <p className="panel p-3 text-sm text-accent">launches are paused right now.</p>}
        {signedIn ? (
          <button className="btn btn-long w-full py-3 text-base" disabled={!canLaunch} onClick={() => void launch()}>
            {step === "preparing" ? "preparing…" : step === "signing" ? "approve in wallet…" : step === "confirming" ? "confirming on solana…" : "launch"}
          </button>
        ) : (
          <div className="panel flex flex-col items-center gap-2 p-4 text-center text-sm text-muted">
            connect and sign in to launch
            <WalletButton />
          </div>
        )}
        {error && <p className="text-sm text-short">{error}</p>}
        <p className="text-xs text-muted">positions are leveraged and can lose everything. vaults are operated by the platform. memecoins are extremely risky. nothing here is financial advice.</p>
      </aside>
    </div>
  );
}

function strategyText(s: Strategy): string {
  switch (s.type) {
    case "single":
      return `${s.asset} ${s.side.toUpperCase()} ${s.leverage}×`;
    case "basket":
      return `${s.legs.map((l) => l.asset).join("+")} ${s.side.toUpperCase()} ${s.leverage}×`;
    case "pair":
      return `${s.long} long / ${s.short} short ${s.leverage}×`;
    case "funding":
      return `${s.asset} funding farm`;
  }
}

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        {hint && <span className="num">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="truncate text-right">{v}</dd>
    </div>
  );
}

function AssetSelect({ label, value, onChange, list }: { label: string; value: string; onChange: (v: string) => void; list: string[] }) {
  return (
    <Field label={label}>
      <select className="input num" value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
    </Field>
  );
}

function SideToggle({ side, setSide }: { side: "long" | "short"; setSide: (s: "long" | "short") => void }) {
  return (
    <Field label="side">
      <div className="grid grid-cols-2 gap-1">
        <button type="button" className={`btn ${side === "long" ? "border-long text-long" : "text-muted"}`} onClick={() => setSide("long")} aria-pressed={side === "long"}>
          long
        </button>
        <button type="button" className={`btn ${side === "short" ? "border-short text-short" : "text-muted"}`} onClick={() => setSide("short")} aria-pressed={side === "short"}>
          short
        </button>
      </div>
    </Field>
  );
}

function LevSlider({ lev, setLev, cap }: { lev: number; setLev: (n: number) => void; cap: number }) {
  return (
    <Field label="leverage" hint={`${lev}× (max ${cap}×)`}>
      <input type="range" min={1} max={cap} step={1} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full accent-[var(--long)]" aria-label="leverage" />
    </Field>
  );
}
