import type { Strategy } from "./types";

export function strategyLabel(s: Strategy, direction?: "long" | "short" | "flat"): string {
  const flip = direction === "short";
  switch (s.type) {
    case "single": {
      const side = direction && direction !== "flat" ? direction : s.side;
      return `${s.asset} ${side.toUpperCase()} ${s.leverage}×`;
    }
    case "basket": {
      const side = direction && direction !== "flat" ? direction : s.side;
      return `${s.legs.map((l) => l.asset).join("+")} ${side.toUpperCase()} ${s.leverage}×`;
    }
    case "pair":
      return flip
        ? `${s.short} long / ${s.long} short ${s.leverage}×`
        : `${s.long} long / ${s.short} short ${s.leverage}×`;
    case "funding":
      return `${s.asset} FUNDING FARM 1×`;
  }
}

export function shortAddr(a: string, n = 4): string {
  if (!a) return "";
  return a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
}

export function fmtUsd(v: number | string, digits = 2): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}b`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}m`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${a.toFixed(digits)}`;
}

export function fmtPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "0%";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function fmtSol(v: number | string, digits = 3): string {
  const n = typeof v === "string" ? Number(v) : v;
  return `${(Number.isFinite(n) ? n : 0).toFixed(digits)} SOL`;
}

export function fmtDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
