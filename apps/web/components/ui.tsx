import type { MarketStatus } from "@bias/shared";
import { fmtUsd, fmtPct } from "@bias/shared";
import { STATUS_LABEL } from "@/lib/view";

const STATUS_COLOR: Record<MarketStatus, string> = {
  pending_launch: "text-muted",
  waiting_for_fees: "text-accent",
  live: "text-long",
  cooldown: "text-flat",
  flat: "text-flat",
  stopped: "text-short",
  dead: "text-muted",
};

export function StatusBadge({ status }: { status: MarketStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${STATUS_COLOR[status]}`}>
      <span className="dot" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StrategyBadge({ label, direction }: { label: string; direction: string }) {
  const c = direction === "short" ? "text-short" : direction === "flat" ? "text-flat" : "text-long";
  return <span className={`num text-xs font-medium ${c}`}>{label}</span>;
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
    <div className="px-4 py-3">
      <div className="label">{label}</div>
      <div className={`num mt-1 text-lg ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** A row of stats separated by hairlines. */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return <div className="panel grid grid-cols-2 divide-line sm:grid-cols-3 md:grid-cols-5 md:divide-x [&>*]:border-line max-md:[&>*]:border-b">{children}</div>;
}

/** Distance from mark to SL and to liquidation. */
export function RiskMeter({ toSl, toLiq, compact = false }: { toSl: number | null; toLiq: number | null; compact?: boolean }) {
  if (toSl === null) return <span className="text-xs text-muted">no position</span>;
  const sl = Math.max(0, toSl * 100);
  const liq = toLiq === null ? null : Math.max(0, toLiq * 100);
  const scale = Math.max(liq ?? sl * 2, 1);
  const danger = sl < 3;
  return (
    <div className="space-y-1" aria-label={`distance to stop-loss ${sl.toFixed(1)} percent, to liquidation ${liq?.toFixed(1) ?? "n/a"} percent`}>
      <div className="relative h-1 bg-line">
        <div className={`absolute inset-y-0 left-0 ${danger ? "bg-short" : "bg-flat"}`} style={{ width: `${Math.min(100, (sl / scale) * 100)}%` }} />
      </div>
      {!compact && (
        <div className="num flex justify-between text-[11px] text-muted">
          <span className={danger ? "text-short" : ""}>SL {sl.toFixed(1)}%</span>
          <span>liq {liq === null ? "–" : `${liq.toFixed(1)}%`}</span>
        </div>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <div className="text-sm text-text">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function CoinImage({ src, ticker, size = 48 }: { src: string; ticker: string; size?: number }) {
  const safe = src && /^(https:\/\/|ipfs:\/\/)/.test(src) ? src.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/") : "";
  return safe ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={safe} alt={`$${ticker}`} width={size} height={size} loading="lazy" className="shrink-0 rounded-[2px] object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="num grid shrink-0 place-items-center rounded-[2px] bg-panel-2 text-[10px] text-muted" style={{ width: size, height: size }}>
      {ticker.slice(0, 3)}
    </div>
  );
}

export function PageTitle({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
