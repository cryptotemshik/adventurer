import type { MarketStatus } from "@bias/shared";
import { fmtUsd, fmtPct } from "@bias/shared";
import { STATUS_LABEL } from "@/lib/view";

const STATUS_COLOR: Record<MarketStatus, string> = {
  pending_launch: "text-muted border-line",
  waiting_for_fees: "text-accent border-accent/40",
  live: "text-long border-long/40",
  cooldown: "text-flat border-flat/40",
  flat: "text-flat border-flat/40",
  stopped: "text-short border-short/40",
  dead: "text-muted border-line",
};

export function StatusBadge({ status }: { status: MarketStatus }) {
  return (
    <span className={`chip ${STATUS_COLOR[status]}`}>
      {status === "live" && <span className="live-dot" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StrategyBadge({ label, direction }: { label: string; direction: string }) {
  const c = direction === "short" ? "text-short border-short/40 bg-short/5" : direction === "flat" ? "text-flat border-flat/40" : "text-long border-long/40 bg-long/5";
  return <span className={`chip font-semibold ${c}`}>{label}</span>;
}

export function Pnl({ v, pct, className = "" }: { v: number; pct?: number; className?: string }) {
  const c = v > 0 ? "text-long" : v < 0 ? "text-short" : "text-muted";
  return (
    <span className={`num ${c} ${className}`}>
      {v > 0 ? "+" : ""}
      {fmtUsd(v)}
      {pct !== undefined && pct !== 0 && <span className="ml-1 text-xs opacity-80">({fmtPct(pct)})</span>}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "long" | "short" | "accent" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : tone === "accent" ? "text-accent" : "text-text";
  return (
    <div className="panel px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Distance from mark to SL and to liquidation, as a bar. */
export function RiskMeter({ toSl, toLiq, compact = false }: { toSl: number | null; toLiq: number | null; compact?: boolean }) {
  if (toSl === null) return <div className="text-xs text-muted">risk: no position</div>;
  const sl = Math.max(0, toSl * 100);
  const liq = toLiq === null ? null : Math.max(0, toLiq * 100);
  const scale = Math.max(liq ?? sl * 2, 1);
  const danger = sl < 3;
  return (
    <div className="space-y-1" aria-label={`distance to stop-loss ${sl.toFixed(1)} percent, to liquidation ${liq?.toFixed(1) ?? "n/a"} percent`}>
      <div className="relative h-1.5 overflow-hidden rounded bg-line">
        <div className={`absolute inset-y-0 left-0 ${danger ? "bg-short" : "bg-accent"}`} style={{ width: `${Math.min(100, (sl / scale) * 100)}%` }} />
      </div>
      {!compact && (
        <div className="num flex justify-between text-[11px] text-muted">
          <span className={danger ? "text-short" : ""}>to SL {sl.toFixed(1)}%</span>
          <span>to liq {liq === null ? "—" : `${liq.toFixed(1)}%`}</span>
        </div>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel grid place-items-center px-6 py-16 text-center">
      <div className="font-display text-xl">{title}</div>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function CoinImage({ src, ticker, size = 48 }: { src: string; ticker: string; size?: number }) {
  const safe = src && /^(https:\/\/|ipfs:\/\/)/.test(src) ? src.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/") : "";
  return safe ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={safe} alt={`$${ticker}`} width={size} height={size} loading="lazy" className="shrink-0 rounded-lg border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="num grid shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-xs text-muted" style={{ width: size, height: size }}>
      ${ticker.slice(0, 4)}
    </div>
  );
}
