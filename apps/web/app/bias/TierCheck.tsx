"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

export function TierCheck() {
  const { publicKey } = useWallet();
  const [addr, setAddr] = useState("");
  const [res, setRes] = useState<{ tier: string; balance: number; perks: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function check() {
    setErr(null);
    const w = addr || publicKey?.toBase58() || "";
    const r = await fetch(`/api/tier?wallet=${encodeURIComponent(w)}`);
    const j = await r.json();
    if (r.ok) setRes(j);
    else setErr(j.error);
  }
  return (
    <section className="panel p-4">
      <h2 className="font-display text-lg">check my tier</h2>
      <div className="mt-2 flex gap-2">
        <input className="input num text-xs" placeholder={publicKey?.toBase58() ?? "wallet address"} value={addr} onChange={(e) => setAddr(e.target.value.trim())} aria-label="wallet address" />
        <button className="btn" onClick={() => void check()}>
          check
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-short">{err}</p>}
      {res && (
        <div className="mt-3 text-sm">
          <div className="num">
            tier: <span className="text-accent">{res.tier}</span> · {res.balance.toLocaleString("en-US")} $BIAS
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted">
            {res.perks.length ? res.perks.map((p) => <li key={p}>{p}</li>) : <li>no perks yet. single-asset markets are always open.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
