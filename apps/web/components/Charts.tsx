"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, LineSeries, LineStyle, AreaSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

const theme = {
  layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8A9099", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11 },
  grid: { vertLines: { color: "rgba(34,38,45,0.6)" }, horzLines: { color: "rgba(34,38,45,0.6)" } },
  rightPriceScale: { borderColor: "#22262D" },
  timeScale: { borderColor: "#22262D", timeVisible: true },
  crosshair: { horzLine: { color: "#3a404a" }, vertLine: { color: "#3a404a" } },
};

export interface Level {
  price: number;
  label: string;
  color: string;
  dashed?: boolean;
}

export function PriceChart({ coin, levels, height = 320 }: { coin: string; levels: Level[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, { ...theme, height, autoSize: true });
    chart.current = c;
    const s = c.addSeries(CandlestickSeries, {
      upColor: "#00E58F",
      downColor: "#FF3B5C",
      borderVisible: false,
      wickUpColor: "#00E58F",
      wickDownColor: "#FF3B5C",
    });
    for (const l of levels) {
      if (!Number.isFinite(l.price) || l.price <= 0) continue;
      s.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: l.label });
    }
    let alive = true;
    fetch(`/api/candles?coin=${encodeURIComponent(coin)}&interval=1h`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { time: number; open: number; high: number; low: number; close: number }[]) => {
        if (!alive) return;
        s.setData(d.map((k) => ({ ...k, time: k.time as UTCTimestamp })));
        c.timeScale().fitContent();
      })
      .catch(() => {});
    return () => {
      alive = false;
      c.remove();
    };
  }, [coin, height, JSON.stringify(levels)]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={el} style={{ height }} className="w-full" aria-label={`${coin} price chart with entry, stop-loss and take-profit lines`} role="img" />;
}

export function EquityChart({ points, height = 180 }: { points: { t: number; v: number }[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, { ...theme, height, autoSize: true });
    const up = (points.at(-1)?.v ?? 0) >= (points[0]?.v ?? 0);
    const s = c.addSeries(points.length > 1 ? AreaSeries : LineSeries, {
      lineColor: up ? "#00E58F" : "#FF3B5C",
      topColor: up ? "rgba(0,229,143,0.25)" : "rgba(255,59,92,0.25)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
    } as never);
    const seen = new Set<number>();
    const data = points
      .map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.v }))
      .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)));
    s.setData(data);
    c.timeScale().fitContent();
    return () => c.remove();
  }, [points, height]);
  return <div ref={el} style={{ height }} className="w-full" role="img" aria-label="market equity over time" />;
}
