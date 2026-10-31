"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/Providers";
import { WalletButton } from "@/components/WalletButton";

interface State {
  effective: Record<string, string | number | boolean>;
  jobs: { id: number; job: string; startedAt: number; finishedAt: number | null; ok: boolean | null; summary: string; error: string | null }[];
  alerts: { id: number; level: string; message: string; at: number; resolved: boolean; marketId: string | null }[];
  log: { id: number; wallet: string; action: string; payload: string; at: number }[];
  pool: { free: number; total: number };
}

export function AdminPanel() {
  const session = useSession();
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [market, setMarket] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin", { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setS(j);
    else setErr(j.error);
  }, []);
  useEffect(() => {
    if (session.admin) void load();
  }, [session.admin, load]);

  async function act(body: Record<string, unknown>) {
    if (body.action === "set" && body.key === "TRADING_MODE" && body.value !== "normal" && !confirm(`set trading mode to ${body.value}?`)) return;
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setErr(j.error);
    await load();
  }

  if (!session.wallet) return <div className="panel mx-auto max-w-md p-6 text-center">admins sign in with their wallet.<div className="mt-3"><WalletButton /></div></div>;
  if (!session.admin) return <p className="text-muted">this wallet is not an admin.</p>;
  if (!s) return <p className="text-muted">{err ?? "loading…"}</p>;
  const e = s.effective;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">admin</h1>
      {err && <p className="text-sm text-short">{err}</p>}
      <section className="panel p-4">
        <h2 className="font-display mb-3 text-lg">kill switches</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">launches:</span>
          <button className={`btn ${e.LAUNCHES_ENABLED ? "text-long" : "text-short"}`} onClick={() => void act({ action: "set", key: "LAUNCHES_ENABLED", value: String(!e.LAUNCHES_ENABLED) })}>
            {e.LAUNCHES_ENABLED ? "enabled — click to pause" : "paused — click to enable"}
          </button>
          <span className="ml-4 text-sm text-muted">trading:</span>
          {(["normal", "close_only", "halted"] as const).map((m) => (
            <button key={m} className={`btn ${e.TRADING_MODE === m ? (m === "normal" ? "border-long text-long" : "border-short text-short") : "text-muted"}`} onClick={() => void act({ action: "set", key: "TRADING_MODE", value: m })}>
              {m}
            </button>
          ))}
        </div>
        <p className="num mt-2 text-xs text-muted">
          hl network: {String(e.HL_NETWORK)} · dry run: {String(e.DRY_RUN)} · address pool: {s.pool.free}/{s.pool.total} free
        </p>
      </section>
      <section className="panel grid gap-3 p-4 md:grid-cols-3">
        {(["MAX_NOTIONAL_PER_MARKET_USD", "MAX_TOTAL_NOTIONAL_USD", "ASSET_ALLOWLIST"] as const).map((k) => (
          <form
            key={k}
            onSubmit={(ev) => {
              ev.preventDefault();
              const v = new FormData(ev.currentTarget).get("v");
              void act({ action: "set", key: k, value: String(v) });
            }}
          >
            <label className="text-xs text-muted">{k.toLowerCase()}</label>
            <div className="mt-1 flex gap-2">
              <input name="v" className="input num text-xs" defaultValue={String(e[k])} />
              <button className="btn">save</button>
            </div>
          </form>
        ))}
      </section>
      <section className="panel p-4">
        <h2 className="font-display mb-3 text-lg">market controls</h2>
        <div className="flex flex-wrap gap-2">
          <input className="input num w-80 text-xs" placeholder="market id or mint" value={market} onChange={(ev) => setMarket(ev.target.value.trim())} />
          <button className="btn" onClick={() => void act({ action: "pause", market, value: true })}>close-only</button>
          <button className="btn" onClick={() => void act({ action: "pause", market, value: false })}>resume</button>
          <button className="btn" onClick={() => void act({ action: "hide", market, value: true })}>hide</button>
          <button className="btn" onClick={() => void act({ action: "hide", market, value: false })}>unhide</button>
          <button className="btn" onClick={() => void act({ action: "community", market, value: true })}>enable voting</button>
        </div>
      </section>
      <section className="panel p-4">
        <h2 className="font-display mb-3 text-lg">alerts</h2>
        <ul className="space-y-1 text-sm">
          {s.alerts.length === 0 && <li className="text-muted">none.</li>}
          {s.alerts.map((a) => (
            <li key={a.id} className={`flex items-center gap-2 ${a.resolved ? "opacity-40" : a.level === "critical" ? "text-short" : a.level === "warn" ? "text-accent" : ""}`}>
              <span className="num text-xs text-muted">{new Date(a.at).toISOString().slice(5, 16)}</span>
              <span className="flex-1">{a.message}</span>
              {!a.resolved && (
                <button className="btn py-0.5 text-xs" onClick={() => void act({ action: "resolve_alert", id: a.id })}>
                  resolve
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel p-4">
        <h2 className="font-display mb-3 text-lg">jobs</h2>
        <table className="num w-full text-xs">
          <tbody>
            {s.jobs.map((j) => (
              <tr key={j.id} className="border-t border-line">
                <td className="py-1">{j.job}</td>
                <td>{new Date(j.startedAt).toISOString().slice(5, 19)}</td>
                <td>{j.finishedAt ? `${((j.finishedAt - j.startedAt) / 1000).toFixed(0)}s` : "running"}</td>
                <td className={j.ok === false ? "text-short" : "text-long"}>{j.ok === null ? "…" : j.ok ? "ok" : "fail"}</td>
                <td className="max-w-md truncate text-muted">{j.error ?? j.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel p-4">
        <h2 className="font-display mb-3 text-lg">audit log</h2>
        <ul className="num space-y-1 text-xs text-muted">
          {s.log.map((l) => (
            <li key={l.id}>
              {new Date(l.at).toISOString().slice(0, 19)} · {l.wallet.slice(0, 6)} · {l.action} · {l.payload}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
