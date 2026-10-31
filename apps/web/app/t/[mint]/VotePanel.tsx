"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import type { MarketView } from "@/lib/view";
import { useSession } from "@/components/Providers";
import { WalletButton } from "@/components/WalletButton";
import type { Detail } from "./MarketDetail";

const COLORS: Record<string, string> = { long: "bg-long", short: "bg-short", flat: "bg-flat" };

export function VotePanel({ market, vote, rounds }: { market: MarketView; vote: Detail["vote"]; rounds: Detail["rounds"] }) {
  const { publicKey } = useWallet();
  const session = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [left, setLeft] = useState("");

  useEffect(() => {
    if (!vote) return;
    const f = () => {
      const s = Math.max(0, vote.endsAt - Date.now()) / 1000;
      setLeft(`${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
    };
    f();
    const id = setInterval(f, 30_000);
    return () => clearInterval(id);
  }, [vote]);

  const labels =
    market.strategy.type === "pair"
      ? { long: `${market.strategy.long}/${market.strategy.short}`, short: `${market.strategy.short}/${market.strategy.long}`, flat: "flat" }
      : { long: "long", short: "short", flat: "flat" };

  async function cast(choice: "long" | "short" | "flat") {
    if (!publicKey || !vote || !market.mint) return;
    setBusy(choice);
    setMsg(null);
    try {
      const wallet = publicKey.toBase58();
      const n = await (await fetch(`/api/auth/nonce?purpose=vote&wallet=${wallet}&mint=${market.mint}&choice=${choice}&round=${vote.round}`, { cache: "no-store" })).json();
      const signature = await session.signMessage(n.message);
      const r = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint: market.mint, choice, wallet, message: n.message, signature }) });
      const j = await r.json();
      setMsg(r.ok ? `voted ${choice}. you can change it until the round closes.` : j.error);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel p-4" aria-label="community vote">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">🗳 holders&apos; bias</h2>
        {vote && <span className="num text-xs text-muted">closes in {left} · 00:00 utc</span>}
      </div>
      <p className="mt-1 text-xs text-muted">sqrt-weighted, max 10% per wallet. needs ≥ 5 wallets and 1% of supply (sqrt) to count. one flip per 24h.</p>
      {vote ? (
        <>
          <div className="mt-3 space-y-2">
            {(["long", "short", "flat"] as const).map((c) => {
              const pct = (vote.tally.shares[c] ?? 0) * 100;
              return (
                <div key={c}>
                  <div className="num flex justify-between text-xs">
                    <span>{labels[c]}</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded bg-line">
                    <div className={`h-full ${COLORS[c]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="num mt-2 text-xs text-muted">
            {vote.tally.wallets} wallets · {vote.tally.quorum ? <span className="text-long">quorum reached</span> : "no quorum yet"} · now: {market.direction}
          </p>
          {publicKey ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["long", "short", "flat"] as const).map((c) => (
                <button key={c} className={`btn ${c === "long" ? "text-long" : c === "short" ? "text-short" : "text-flat"}`} disabled={!!busy} onClick={() => void cast(c)}>
                  {busy === c ? "sign…" : labels[c]}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <WalletButton />
            </div>
          )}
          {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">voting opens once the coin is live.</p>
      )}
      {rounds.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted">history</summary>
          <ul className="num mt-2 space-y-1">
            {rounds.map((r) => (
              <li key={r.round} className="flex justify-between">
                <span>{r.round}</span>
                <span>{r.quorum ? r.winner ?? "tie" : "no quorum"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
