import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SRC = dirname(fileURLToPath(import.meta.url));

/** Brand tokens (spec §3). No purple. */
export const C = {
  bg: "#0A0B0D",
  panel: "#121418",
  line: "#22262D",
  text: "#E8EAED",
  dim: "#8A9099",
  long: "#00E58F",
  short: "#FF3B5C",
  flat: "#9AA4B2",
  accent: "#FFD23F",
} as const;

const font = (file: string) => readFileSync(join(SRC, "fonts", file)).toString("base64");

let fontCss: string | null = null;
function fonts(): string {
  if (fontCss) return fontCss;
  const face = (family: string, file: string) =>
    `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${font(file)}) format('truetype');font-weight:100 900;font-style:normal;font-display:block}`;
  fontCss = [
    face("Space Grotesk", "SpaceGrotesk.ttf"),
    face("Inter", "Inter.ttf"),
    face("JetBrains Mono", "JetBrainsMono.ttf"),
  ].join("\n");
  return fontCss;
}

export const LOGO_SVG = readFileSync(join(SRC, "logo.svg"), "utf8");

/** Logo at an arbitrary pixel size; filter ids are made unique so several logos can share a page. */
let logoN = 0;
export function logo(size: number): string {
  const id = `g${logoN++}`;
  return LOGO_SVG.replace('width="100" height="100"', `width="${size}" height="${size}"`)
    .replaceAll("bias-glow", `bias-glow-${id}`)
    .replace(/<\?xml[^>]*>/, "");
}

/** Hand-drawn flame (we do not rely on emoji fonts in images). */
export function flame(size: number, color: string = C.accent): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="filter:drop-shadow(0 0 ${Math.round(size / 5)}px ${color}aa)">
  <path fill="${color}" d="M12 1.5c.6 3.2 2.6 4.9 4.4 6.9 1.9 2.1 3.1 4.2 3.1 6.9 0 4.4-3.4 7.2-7.5 7.2S4.5 19.7 4.5 15.6c0-2.7 1.3-4.6 2.9-6.1.3 1.6 1.1 2.8 2.3 3.4-.4-4.6.6-8.4 2.3-11.4z"/>
  <path fill="${C.bg}" opacity=".85" d="M12.2 12.2c.3 1.6 1.4 2.4 2.2 3.4.7.9 1 1.7 1 2.6 0 1.9-1.5 3.1-3.4 3.1s-3.4-1.2-3.4-3c0-1.4.8-2.5 1.8-3.3 0 .8.4 1.4 1 1.7-.2-1.7.1-3.2.8-4.5z"/>
</svg>`;
}

export function page(width: number, height: number, body: string, css = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;height:${height}px;overflow:hidden}
body{background:${C.bg};color:${C.text};font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;position:relative}
.mono{white-space:nowrap;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
.grot{font-family:'Space Grotesk',sans-serif}
.grid{position:absolute;inset:0;
  background-image:
    linear-gradient(${C.line}55 1px,transparent 1px),
    linear-gradient(90deg,${C.line}55 1px,transparent 1px),
    linear-gradient(${C.line}22 1px,transparent 1px),
    linear-gradient(90deg,${C.line}22 1px,transparent 1px);
  background-size:100px 100px,100px 100px,20px 20px,20px 20px;
  background-position:-1px -1px;}
.vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,${C.bg} 100%)}
.panel{background:${C.panel};border:1px solid ${C.line};border-radius:18px}
.pill{white-space:nowrap;display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 14px;font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:600;letter-spacing:.02em}
.long{color:${C.long}} .short{color:${C.short}} .flat{color:${C.flat}} .acc{color:${C.accent}} .dim{color:${C.dim}}
.b-long{background:${C.long}1a;color:${C.long};border:1px solid ${C.long}66}
.b-short{background:${C.short}1a;color:${C.short};border:1px solid ${C.short}66}
.b-flat{background:${C.flat}14;color:${C.flat};border:1px solid ${C.flat}55}
.b-acc{background:${C.accent}14;color:${C.accent};border:1px solid ${C.accent}66}
.glow-long{text-shadow:0 0 18px ${C.long}99}
.glow-short{text-shadow:0 0 18px ${C.short}99}
.glow-acc{text-shadow:0 0 18px ${C.accent}88}
.brand{position:absolute;display:flex;align-items:center;gap:12px;font-family:'Space Grotesk';font-weight:700;font-size:26px;letter-spacing:.06em}
${css}
</style></head><body>${body}</body></html>`;
}

/** Small deterministic PRNG so the mock charts never change between runs. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Random walk that lands on `end`. */
export function candles(n: number, start: number, end: number, vol: number, seed: number): Candle[] {
  const r = rng(seed);
  const out: Candle[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const target = start + ((end - start) * (i + 1)) / n;
    const o = p;
    const c = o + (target - o) * 0.35 + (r() - 0.5) * vol * 2;
    const h = Math.max(o, c) + r() * vol * 0.9;
    const l = Math.min(o, c) - r() * vol * 0.9;
    out.push({ o, h, l, c });
    p = c;
  }
  const last = out[out.length - 1]!;
  last.c = end;
  last.h = Math.max(last.h, end);
  last.l = Math.min(last.l, end);
  return out;
}

export function candleSvg(
  cs: Candle[],
  w: number,
  h: number,
  lo: number,
  hi: number,
  opts: { gap?: number; glow?: boolean } = {},
): string {
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  const step = w / cs.length;
  const bw = Math.max(2, step * (1 - (opts.gap ?? 0.35)));
  return cs
    .map((k, i) => {
      const x = i * step + step / 2;
      const up = k.c >= k.o;
      const col = up ? C.long : C.short;
      const top = y(Math.max(k.o, k.c));
      const bh = Math.max(1.5, Math.abs(y(k.o) - y(k.c)));
      return `<line x1="${x}" x2="${x}" y1="${y(k.h)}" y2="${y(k.l)}" stroke="${col}" stroke-width="1.5" opacity=".85"/>
<rect x="${x - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${col}" rx="1" opacity="${up ? 0.95 : 0.9}"/>`;
    })
    .join("");
}

export function linePath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

/** Mock coin avatar for fictional tickers (no third-party logos). */
export function coinAvatar(ticker: string, size: number, color: string): string {
  const ch = ticker.replace("$", "").slice(0, 2);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(circle at 30% 25%,${color}55,${C.panel} 70%);border:2px solid ${color}88;
    font-family:'Space Grotesk';font-weight:700;font-size:${Math.round(size * 0.36)}px;color:${color}">${ch}</div>`;
}
