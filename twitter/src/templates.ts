import { C, candleSvg, candles, coinAvatar, flame, linePath, logo, page, rng } from "./base";

const W = 1600;
const H = 900;

const brand = (pos = "right:56px;bottom:44px", size = 34) =>
  `<div class="brand" style="${pos}">${logo(size)}<span>BIAS</span></div>`;

/* ───────────────────────────── #1 teaser ───────────────────────────── */
export function tweet01(): string {
  const axis = [220, 210, 200, 190, 180]
    .map((v, i) => `<div style="position:absolute;right:40px;top:${200 + i * 100 - 11}px" class="mono dim">${v}.00</div>`)
    .join("");
  return page(
    W,
    H,
    `<div class="grid"></div><div class="vignette"></div>${axis}
    <svg width="${W}" height="${H}" style="position:absolute;inset:0">
      <defs><filter id="g" x="-200%" y="-50%" width="500%" height="200%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <line x1="0" x2="${W}" y1="430" y2="430" stroke="${C.dim}" stroke-dasharray="4 8" opacity=".35"/>
      <g filter="url(#g)">
        <line x1="800" x2="800" y1="170" y2="640" stroke="${C.long}" stroke-width="5" stroke-linecap="round"/>
        <rect x="760" y="250" width="80" height="320" rx="5" fill="${C.long}"/>
      </g>
    </svg>
    <div class="mono" style="position:absolute;left:0;right:0;top:700px;text-align:center;font-size:44px;letter-spacing:.06em">
      <span class="dim">BIAS:</span> <span>pending</span><span style="display:inline-block;width:22px;height:44px;background:${C.long};margin-left:10px;vertical-align:-6px;box-shadow:0 0 16px ${C.long}"></span>
    </div>`,
  );
}

/* ───────────────────────────── #2 the loop ───────────────────────────── */
export function tweet02(): string {
  // nodes: coin (left), position (right), buyback (bottom)
  const node = (x: number, y: number, inner: string, w = 340) =>
    `<div class="panel" style="position:absolute;left:${x - w / 2}px;top:${y - 75}px;width:${w}px;height:150px;display:flex;align-items:center;justify-content:center;gap:18px;box-shadow:0 0 60px #000">${inner}</div>`;
  const arrowLabel = (x: number, y: number, txt: string, cls: string) =>
    `<div class="mono ${cls}" style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);font-size:30px;font-weight:700;background:${C.bg};padding:4px 16px;border-radius:8px">${txt}</div>`;
  return page(
    W,
    H,
    `<div class="grid"></div><div class="vignette"></div>
    <div class="grot" style="position:absolute;left:64px;top:52px;font-size:30px;font-weight:700;letter-spacing:.04em" class="dim"><span class="dim">the loop</span></div>
    <svg width="${W}" height="${H}" style="position:absolute;inset:0">
      <defs>
        <filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.long}"/></marker>
        <marker id="ay" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.accent}"/></marker>
      </defs>
      <g filter="url(#g)" fill="none" stroke-width="6" stroke-linecap="round">
        <path d="M 420 300 C 620 120, 980 120, 1180 300" stroke="${C.long}" marker-end="url(#ah)"/>
        <path d="M 1250 470 C 1240 620, 1080 700, 990 715" stroke="${C.long}" marker-end="url(#ah)"/>
        <path d="M 610 715 C 520 700, 360 620, 350 470" stroke="${C.accent}" marker-end="url(#ay)"/>
      </g>
    </svg>
    ${node(340, 390, `${coinAvatar("$EXAMPLE", 84, C.text)}<div><div class="grot" style="font-size:40px;font-weight:700">the coin</div><div class="mono dim" style="font-size:20px">launched on pump.fun</div></div>`, 400)}
    ${node(1270, 390, `<div style="text-align:center"><div class="mono dim" style="font-size:20px;margin-bottom:10px">position · hyperliquid</div><div class="pill b-long" style="font-size:34px;padding:10px 22px">HYPE LONG 3×</div></div>`, 380)}
    ${node(800, 730, `${flame(64)}<div><div class="grot acc glow-acc" style="font-size:42px;font-weight:700">buyback</div><div class="mono dim" style="font-size:20px">market buy → burn</div></div>`)}
    ${arrowLabel(800, 166, "fees →", "long glow-long")}
    ${arrowLabel(1235, 640, "profit", "long glow-long")}
    ${arrowLabel(372, 640, "burn 🔥", "acc glow-acc")}
    <div class="grot" style="position:absolute;left:0;right:0;top:350px;text-align:center;font-size:34px;font-weight:500"><span class="dim">your chart,</span><br/><span style="font-size:46px;font-weight:700">backed by a trade.</span></div>
    ${brand()}`,
  );
}

/* ───────────────────────────── market card (tweets 3 & 5) ───────────────────────────── */
interface Level {
  label: string;
  px: number;
  color: string;
  dash?: string;
  strong?: boolean;
}

function levelChart(
  w: number,
  h: number,
  lo: number,
  hi: number,
  cs: ReturnType<typeof candles>,
  levels: Level[],
  chartW: number,
): string {
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  const lines = levels
    .map(
      (l) => `<line x1="0" x2="${chartW + 14}" y1="${y(l.px)}" y2="${y(l.px)}" stroke="${l.color}" stroke-width="${l.strong ? 2.5 : 2}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ""} opacity=".9"/>`,
    )
    .join("");
  const tags = levels
    .map(
      (l) => `<g transform="translate(${chartW + 14} ${y(l.px) - 17})">
      <rect width="${w - chartW - 14}" height="34" rx="6" fill="${l.color}22" stroke="${l.color}88"/>
      <text x="12" y="23" fill="${l.color}" font-family="JetBrains Mono" font-size="17" font-weight="700">${l.label}</text>
      <text x="${w - chartW - 26}" y="23" text-anchor="end" fill="${C.text}" font-family="JetBrains Mono" font-size="17">${l.px.toFixed(2)}</text></g>`,
    )
    .join("");
  const hgrid = Array.from({ length: 8 }, (_, i) => `<line x1="0" x2="${chartW}" y1="${(h / 8) * i}" y2="${(h / 8) * i}" stroke="${C.line}" />`).join("");
  const vgrid = Array.from({ length: 12 }, (_, i) => `<line y1="0" y2="${h}" x1="${(chartW / 12) * i}" x2="${(chartW / 12) * i}" stroke="${C.line}" opacity=".6"/>`).join("");
  return `<svg width="${w}" height="${h}" style="overflow:visible">${hgrid}${vgrid}
    <g>${candleSvg(cs, chartW, h, lo, hi)}</g>${lines}${tags}</svg>`;
}

function stat(label: string, value: string, cls = "", size = 30): string {
  return `<div><div class="mono dim" style="font-size:16px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${label}</div><div class="mono ${cls}" style="font-size:${size}px;font-weight:700">${value}</div></div>`;
}

function riskMeter(distSl: number, distLiq: number, width: number): string {
  // scale: 0% (mark, right) … 25% (left)
  const max = 25;
  const x = (d: number) => width - (d / max) * width;
  return `<div style="position:relative;width:${width}px;height:66px">
    <div style="position:absolute;left:0;right:0;top:22px;height:12px;border-radius:6px;background:linear-gradient(90deg,${C.short} 0%,${C.short}aa ${(x(distLiq) / width) * 100}%,${C.accent}99 ${(x(distSl) / width) * 100}%,${C.long} 100%);box-shadow:0 0 18px ${C.long}33"></div>
    <div style="position:absolute;left:${x(distLiq) - 1}px;top:12px;width:3px;height:32px;background:${C.text}"></div>
    <div style="position:absolute;left:${x(distSl) - 1}px;top:12px;width:3px;height:32px;background:${C.text}"></div>
    <div style="position:absolute;right:-8px;top:14px;width:28px;height:28px;border-radius:50%;background:${C.long};box-shadow:0 0 16px ${C.long}"></div>
    <div class="mono" style="position:absolute;left:${x(distLiq)}px;top:46px;transform:translateX(-50%);font-size:15px;color:${C.short}">liq</div>
    <div class="mono" style="position:absolute;left:${x(distSl)}px;top:46px;transform:translateX(-50%);font-size:15px;color:${C.accent}">SL</div>
    <div class="mono" style="position:absolute;right:-14px;top:46px;font-size:15px;color:${C.long}">mark</div>
  </div>`;
}

export function tweet03(): string {
  const entry = 180.0;
  const mark = 186.4;
  const levels: Level[] = [
    { label: "TP3 +100%", px: 240.0, color: C.long, dash: "10 7" },
    { label: "TP2 +50%", px: 210.0, color: C.long, dash: "10 7" },
    { label: "TP1 +25%", px: 195.0, color: C.long, dash: "10 7" },
    { label: "MARK", px: mark, color: C.accent, strong: true },
    { label: "ENTRY", px: entry, color: C.text, dash: "3 5" },
    { label: "SL", px: 165.9, color: C.short, dash: "10 7" },
    { label: "LIQ", px: 150.98, color: C.short, strong: true },
  ];
  const cs = candles(54, 172, mark, 2.6, 7);
  return page(
    W,
    H,
    `<div class="grid" style="opacity:.5"></div>
    <div class="panel" style="position:absolute;left:56px;top:48px;right:56px;bottom:48px;padding:34px 40px;box-shadow:0 30px 120px #000">
      <div style="display:flex;align-items:center;gap:22px">
        ${coinAvatar("$EXAMPLE", 76, C.long)}
        <div>
          <div class="grot" style="font-size:44px;font-weight:700;line-height:1">$EXAMPLE</div>
          <div class="mono dim" style="font-size:18px;margin-top:8px">CA 7xKX…demo</div>
        </div>
        <div class="pill b-long" style="font-size:26px;padding:10px 20px;margin-left:12px">SOL LONG 3×</div>
        <div class="pill b-long" style="margin-left:4px"><span style="width:10px;height:10px;border-radius:50%;background:${C.long};box-shadow:0 0 10px ${C.long}"></span>live</div>
        <div style="flex:1"></div>
        <div style="display:flex;gap:40px">
          ${stat("equity", "$4,812.40")}
          ${stat("uPnL", "+$371.22", "long glow-long")}
          ${stat("burned", "1.90 SOL", "acc")}
        </div>
      </div>
      <div style="display:flex;gap:36px;margin-top:30px">
        <div style="flex:none">${levelChart(1100, 540, 140, 252, cs, levels, 830)}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:22px;padding-top:4px">
          <div class="mono dim" style="font-size:15px;letter-spacing:.08em">ON THE EXCHANGE</div>
          ${[
            ["stop-loss", "165.90", C.short, "set at launch"],
            ["tp1 · 25%", "195.00", C.long, "pays buybacks"],
            ["tp2 · 25%", "210.00", C.long, "sl → breakeven"],
            ["tp3 · 25%", "240.00", C.long, "sl → tp1"],
          ]
            .map(
              ([a, b, c, d]) => `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${C.line};padding-bottom:14px">
              <div><div class="mono" style="font-size:20px;color:${c};font-weight:700">${a}</div><div class="mono dim" style="font-size:15px;margin-top:4px">${d}</div></div>
              <div class="mono" style="font-size:22px">${b}</div></div>`,
            )
            .join("")}
          <div class="mono" style="font-size:15px;color:${C.dim}">reduce-only · isolated</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:40px;margin-top:20px">
        <div class="mono" style="font-size:16px;letter-spacing:.08em;color:${C.dim};flex:none">RISK</div>
        ${riskMeter(11, 19, 720)}
        <div class="mono" style="font-size:24px;flex:none"><span class="dim">distance to SL</span> <span class="acc">11%</span> <span class="dim">·</span> <span class="dim">to liq</span> <span class="short">19%</span></div>
      </div>
    </div>`,
  );
}

/* ───────────────────────────── #4 halloween ───────────────────────────── */
export function tweet04(): string {
  const r = rng(31);
  const stars = Array.from({ length: 70 }, () => `<circle cx="${r() * W}" cy="${r() * 420}" r="${r() * 1.6 + 0.4}" fill="${C.text}" opacity="${0.2 + r() * 0.5}"/>`).join("");
  // falling red line in the background
  const pts: [number, number][] = [];
  let yv = 160;
  for (let x = 0; x <= W; x += 40) {
    pts.push([x, yv]);
    yv += 7 + (r() - 0.35) * 26;
  }
  return page(
    W,
    H,
    `<div class="grid" style="opacity:.6"></div>
    <svg width="${W}" height="${H}" style="position:absolute;inset:0">
      <defs>
        <radialGradient id="pk" cx="42%" cy="35%" r="70%"><stop offset="0" stop-color="#FFA23A"/><stop offset=".55" stop-color="#F07A12"/><stop offset="1" stop-color="#8E3D05"/></radialGradient>
        <radialGradient id="inside" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#FFE3A0"/><stop offset=".35" stop-color="${C.short}"/><stop offset="1" stop-color="#7A0C1E"/></radialGradient>
        <filter id="red" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="40"/></filter>
      </defs>
      ${stars}
      <path d="${linePath(pts)}" fill="none" stroke="${C.short}" stroke-width="3" opacity=".35"/>
      <ellipse cx="800" cy="745" rx="330" ry="34" fill="#000" opacity=".7"/>
      <ellipse cx="800" cy="470" rx="340" ry="250" fill="${C.short}" opacity=".12" filter="url(#soft)"/>
      <!-- pumpkin ribs -->
      <g stroke="#6B2E04" stroke-width="4">
        <ellipse cx="640" cy="490" rx="170" ry="245" fill="url(#pk)"/>
        <ellipse cx="960" cy="490" rx="170" ry="245" fill="url(#pk)"/>
        <ellipse cx="715" cy="485" rx="160" ry="258" fill="url(#pk)"/>
        <ellipse cx="885" cy="485" rx="160" ry="258" fill="url(#pk)"/>
        <ellipse cx="800" cy="480" rx="150" ry="265" fill="url(#pk)"/>
      </g>
      <path d="M790 230 C 786 190, 800 160, 836 140 L 850 158 C 822 176, 815 200, 818 232 Z" fill="#3E5A1E" stroke="#22330F" stroke-width="3"/>
      <!-- face: a red down candle cut out -->
      <g filter="url(#red)">
        <rect x="789" y="290" width="22" height="430" rx="6" fill="url(#inside)"/>
        <rect x="712" y="360" width="176" height="290" rx="12" fill="url(#inside)"/>
      </g>
      <rect x="712" y="360" width="176" height="290" rx="12" fill="none" stroke="#5A1A04" stroke-width="5"/>
    </svg>
    <div class="mono" style="position:absolute;left:0;right:0;top:800px;text-align:center;font-size:40px;letter-spacing:.04em">
      <span class="dim">costume:</span> <span class="short glow-short" style="font-weight:700">20× · no stop</span>
    </div>
    <div class="mono" style="position:absolute;right:56px;top:48px;font-size:22px;color:${C.short}">liquidated · −100.00%</div>
    ${brand("left:56px;top:44px", 32)}`,
  );
}

/* ───────────────────────────── #5 launch poster ───────────────────────────── */
export function tweet05(): string {
  const chartW = 900;
  const chartH = 380;
  const hgrid = Array.from({ length: 6 }, (_, i) => `<line x1="0" x2="${chartW}" y1="${(chartH / 6) * i}" y2="${(chartH / 6) * i}" stroke="${C.line}"/>`).join("");
  const vgrid = Array.from({ length: 15 }, (_, i) => `<line y1="0" y2="${chartH}" x1="${(chartW / 14) * i}" x2="${(chartW / 14) * i}" stroke="${C.line}" opacity=".6"/>`).join("");
  return page(
    W,
    H,
    `<div class="grid"></div><div class="vignette"></div>
    <div class="grot" style="position:absolute;left:0;right:0;top:46px;text-align:center;font-size:76px;font-weight:700;letter-spacing:.01em">EVERY COIN HAS A <span class="long glow-long">BIAS.</span></div>
    <div class="panel" style="position:absolute;left:150px;right:150px;top:176px;bottom:56px;padding:34px 40px;box-shadow:0 30px 140px #000,0 0 0 1px ${C.long}22">
      <div style="display:flex;align-items:center;gap:24px">
        <div style="width:96px;height:96px;border-radius:50%;background:${C.bg};display:flex;align-items:center;justify-content:center;border:1px solid ${C.line}">${logo(78)}</div>
        <div>
          <div style="display:flex;align-items:baseline;gap:16px"><span class="grot" style="font-size:56px;font-weight:700;line-height:1">$BIAS</span><span class="mono dim" style="font-size:20px">flagship market · #0</span></div>
          <div style="display:flex;gap:12px;margin-top:14px">
            <div class="pill b-long" style="font-size:22px">BTC 40 · SOL 30 · HYPE 30 · LONG 3×</div>
            <div class="pill b-acc" style="font-size:20px">community bias</div>
          </div>
        </div>
        <div style="flex:1"></div>
        <div class="pill b-flat" style="font-size:20px"><span style="width:10px;height:10px;border-radius:50%;background:${C.flat}"></span>waiting for fees</div>
      </div>
      <div style="display:flex;gap:40px;margin-top:30px">
        <div style="position:relative">
          <div class="mono dim" style="font-size:15px;letter-spacing:.08em;margin-bottom:10px">EQUITY CURVE</div>
          <svg width="${chartW}" height="${chartH}">${hgrid}${vgrid}
            <line x1="0" x2="${chartW}" y1="${chartH - 40}" y2="${chartH - 40}" stroke="${C.long}" stroke-width="3" stroke-dasharray="2 10" opacity=".7"/>
            <circle cx="10" cy="${chartH - 40}" r="8" fill="${C.long}" style="filter:drop-shadow(0 0 10px ${C.long})"/>
          </svg>
          <div class="mono" style="position:absolute;left:34px;top:${chartH - 54}px;font-size:22px;background:${C.panel};padding:2px 10px" class="long"><span class="long">day 0</span></div>
          <div class="grot dim" style="position:absolute;left:0;right:0;top:150px;text-align:center;font-size:30px">the chart starts here.</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:30px 0 4px">
          ${stat("equity", "$0.00")}
          ${stat("fees → position", "0.000 SOL")}
          ${stat("bought back", "0.000 SOL", "acc")}
          ${stat("burned", "0", "acc")}
        </div>
      </div>
      <div class="mono" style="margin-top:22px;font-size:20px;display:flex;gap:28px"><span class="long">fees → position</span><span class="dim">·</span><span class="acc">profit → buyback &amp; burn</span><span class="dim">·</span><span class="dim">stops included</span></div>
    </div>`,
  );
}

/* ───────────────────────────── #6 donut 70/20/10 ───────────────────────────── */
export function tweet06(): string {
  const cx = 520;
  const cy = 450;
  const rad = 250;
  const sw = 74;
  const circ = 2 * Math.PI * rad;
  const gap = 10;
  const segs = [
    { pct: 70, color: C.long },
    { pct: 20, color: C.text },
    { pct: 10, color: C.accent },
  ];
  let off = 0;
  const arcs = segs
    .map((s) => {
      const len = (s.pct / 100) * circ - gap;
      const el = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})" style="filter:drop-shadow(0 0 18px ${s.color}88)"/>`;
      off += (s.pct / 100) * circ;
      return el;
    })
    .join("");
  const row = (pct: string, label: string, sub: string, color: string) => `
    <div style="display:flex;align-items:center;gap:30px;padding:26px 0;border-bottom:1px solid ${C.line}">
      <div class="mono" style="font-size:84px;font-weight:700;color:${color};width:220px;text-shadow:0 0 24px ${color}66">${pct}</div>
      <div><div class="grot" style="font-size:40px;font-weight:700">${label}</div><div class="mono dim" style="font-size:20px;margin-top:6px">${sub}</div></div>
    </div>`;
  return page(
    W,
    H,
    `<div class="grid" style="opacity:.55"></div>
    <svg width="${W}" height="${H}" style="position:absolute;inset:0">
      <circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${C.line}" stroke-width="${sw + 14}"/>
      ${arcs}
    </svg>
    <div style="position:absolute;left:${cx - 160}px;top:${cy - 80}px;width:320px;text-align:center">
      <div class="mono dim" style="font-size:22px;letter-spacing:.1em">EVERY CLAIM</div>
      <div class="grot" style="font-size:72px;font-weight:700;line-height:1.1">fees</div>
      <div class="mono dim" style="font-size:20px">split on-chain</div>
    </div>
    <div style="position:absolute;left:900px;right:90px;top:150px">
      ${row("70%", "position", "funds the trade on hyperliquid", C.long)}
      ${row("20%", "launcher", "whoever launched the market", C.text)}
      ${row("10%", "$BIAS burn", "buys back &amp; burns $BIAS", C.accent)}
    </div>
    ${brand()}`,
  );
}

/* ───────────────────────────── #7 vote ───────────────────────────── */
export function tweet07(): string {
  const bar = (label: string, pct: number, color: string, wallets: number, mine = false) => `
    <div style="margin-bottom:52px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
        <div class="grot" style="font-size:40px;font-weight:700;color:${color}">${label}${mine ? `<span class="mono" style="font-size:18px;color:${C.dim};margin-left:16px;font-weight:400">← your vote</span>` : ""}</div>
        <div class="mono" style="font-size:36px;font-weight:700">${pct.toFixed(1)}%<span class="dim" style="font-size:20px;font-weight:400;margin-left:14px">${wallets} wallets</span></div>
      </div>
      <div style="height:34px;border-radius:8px;background:${C.bg};border:1px solid ${C.line};overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${color}88,${color});box-shadow:0 0 24px ${color}88"></div>
      </div>
    </div>`;
  return page(
    W,
    H,
    `<div class="grid" style="opacity:.55"></div>
    <div class="panel" style="position:absolute;left:180px;right:180px;top:70px;bottom:70px;padding:44px 56px;box-shadow:0 30px 120px #000">
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:12px">
        <div style="width:58px;height:58px;border-radius:50%;background:${C.bg};display:flex;align-items:center;justify-content:center;border:1px solid ${C.line}">${logo(46)}</div>
        <div class="grot" style="font-size:38px;font-weight:700">community bias · $BIAS</div>
        <div style="flex:1"></div>
        <div class="pill b-acc">round #1 · utc day</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 52px">
        <div class="mono dim" style="font-size:20px">weight = √balance · cap 10% per wallet · quorum ✓</div>
        <div class="mono" style="font-size:22px"><span class="dim">closes in</span> <span class="acc glow-acc" style="font-size:40px;font-weight:700;margin-left:8px">02:59:41</span></div>
      </div>
      ${bar("long", 58.4, C.long, 41, true)}
      ${bar("short", 26.9, C.short, 22)}
      ${bar("flat", 14.7, C.flat, 9)}
      <div class="mono" style="font-size:20px;display:flex;gap:24px;margin-top:6px"><span class="long">a vote is a signature</span><span class="dim">·</span><span class="dim">0 transactions · 0 SOL</span></div>
    </div>`,
  );
}

/* ───────────────────────────── #8 3×3 grid ───────────────────────────── */
interface Mock {
  t: string;
  strat: string;
  side: "long" | "short" | "flat";
  status: string;
  mcap: string;
  pnl: string;
  pnlCls: string;
  burned: string;
  sl: number;
  liq: number;
  seed: number;
  trend: number;
  community?: boolean;
}

function miniCard(m: Mock, w: number, h: number): string {
  const r = rng(m.seed);
  const pts: [number, number][] = [];
  let v = 50;
  const sw = w - 48;
  for (let i = 0; i <= 40; i++) {
    v += (r() - 0.5) * 10 + m.trend;
    v = Math.max(8, Math.min(92, v));
    pts.push([(i / 40) * sw, 60 - (v / 100) * 56]);
  }
  const col = m.side === "long" ? C.long : m.side === "short" ? C.short : C.flat;
  const lineCol = m.pnlCls === "long" ? C.long : m.pnlCls === "short" ? C.short : C.flat;
  const statusCls = m.status === "live" ? "b-long" : m.status === "cooldown" ? "b-short" : "b-flat";
  const max = 25;
  return `<div class="panel" style="width:${w}px;height:${h}px;padding:18px 24px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;align-items:center;gap:12px">
      ${coinAvatar(m.t, 44, col)}
      <div style="flex:1;min-width:0"><div class="grot" style="font-size:24px;font-weight:700;line-height:1.1">${m.t}${m.community ? `<span class="mono" style="font-size:13px;color:${C.accent};margin-left:8px;vertical-align:3px">VOTE</span>` : ""}</div><div class="mono dim" style="font-size:14px">mcap ${m.mcap}</div></div>
      <div class="pill ${statusCls}" style="font-size:13px;padding:4px 10px">${m.status}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="pill ${m.side === "long" ? "b-long" : m.side === "short" ? "b-short" : "b-flat"}" style="font-size:15px;padding:4px 12px">${m.strat}</div>
      <div class="mono ${m.pnlCls}" style="font-size:20px;font-weight:700">${m.pnl}</div>
    </div>
    <svg width="${sw}" height="60"><path d="${linePath(pts)}" fill="none" stroke="${lineCol}" stroke-width="2.5" style="filter:drop-shadow(0 0 6px ${lineCol}88)"/></svg>
    <div style="display:flex;align-items:center;gap:10px">
      <div style="flex:1;height:6px;border-radius:3px;background:${C.bg};position:relative;overflow:hidden">
        ${m.sl > 0 ? `<div style="position:absolute;right:0;top:0;bottom:0;width:${(m.sl / max) * 100}%;background:${C.long}"></div><div style="position:absolute;right:${(m.liq / max) * 100}%;top:0;bottom:0;width:3px;background:${C.short}"></div>` : ""}
      </div>
      <div class="mono dim" style="font-size:13px;flex:none">${m.sl > 0 ? `SL ${m.sl}% · liq ${m.liq}%` : "no position"}</div>
      <div class="mono acc" style="font-size:13px;flex:none">🔥 ${m.burned}</div>
    </div>
  </div>`;
}

export function tweet08(): string {
  const mocks: Mock[] = [
    { t: "$LONGBOI", strat: "SOL LONG 3×", side: "long", status: "live", mcap: "$412k", pnl: "+18.2%", pnlCls: "long", burned: "2.1", sl: 12, liq: 21, seed: 3, trend: 1.2 },
    { t: "$SHORTKING", strat: "ETH SHORT 2×", side: "short", status: "live", mcap: "$238k", pnl: "+6.4%", pnlCls: "long", burned: "0.8", sl: 19, liq: 24, seed: 9, trend: 0.6 },
    { t: "$EXAMPLE", strat: "HYPE LONG 3×", side: "long", status: "live", mcap: "$96k", pnl: "−3.1%", pnlCls: "short", burned: "0.2", sl: 13, liq: 22, seed: 4, trend: -0.4, community: true },
    { t: "$BASKETCASE", strat: "BTC+SOL LONG 2×", side: "long", status: "live", mcap: "$151k", pnl: "+9.7%", pnlCls: "long", burned: "1.0", sl: 21, liq: 24, seed: 12, trend: 0.8 },
    { t: "$PAIRZ", strat: "SOL / ETH 2×", side: "long", status: "live", mcap: "$74k", pnl: "+2.2%", pnlCls: "long", burned: "0.1", sl: 22, liq: 25, seed: 21, trend: 0.3 },
    { t: "$FARMER", strat: "HYPE FUNDING 1×", side: "flat", status: "live", mcap: "$58k", pnl: "+1.1%", pnlCls: "long", burned: "0.1", sl: 0, liq: 0, seed: 5, trend: 0.15 },
    { t: "$DEGEN", strat: "BTC LONG 5×", side: "long", status: "cooldown", mcap: "$31k", pnl: "−50.0%", pnlCls: "short", burned: "0.0", sl: 0, liq: 0, seed: 17, trend: -1.4 },
    { t: "$COPIUM", strat: "HYPE SHORT 2×", side: "short", status: "flat", mcap: "$44k", pnl: "0.0%", pnlCls: "flat", burned: "0.3", sl: 0, liq: 0, seed: 8, trend: 0, community: true },
    { t: "$FRESH", strat: "SOL LONG 4×", side: "long", status: "waiting", mcap: "$12k", pnl: "—", pnlCls: "dim", burned: "0.0", sl: 0, liq: 0, seed: 2, trend: 0.2 },
  ];
  const cw = 480;
  const ch = 232;
  return page(
    W,
    H,
    `<div class="grid" style="opacity:.4"></div>
    <div style="position:absolute;left:56px;right:56px;top:40px;display:flex;align-items:center;justify-content:space-between">
      <div class="brand" style="position:static">${logo(34)}<span>BIAS</span><span class="mono dim" style="font-size:20px;font-weight:400;letter-spacing:0;margin-left:14px">markets · newest</span></div>
      <div class="mono dim" style="font-size:18px;display:flex;gap:26px"><span><span class="long">●</span> 9 live</span><span>fees routed <span style="color:${C.text}">41.6 SOL</span></span><span>burned <span class="acc">4.6 SOL</span></span></div>
    </div>
    <div style="position:absolute;left:56px;top:110px;display:grid;grid-template-columns:repeat(3,${cw}px);gap:24px">
      ${mocks.map((m) => miniCard(m, cw, ch)).join("")}
    </div>`,
  );
}

/* ───────────────────────────── #9 proof + graveyard ───────────────────────────── */
export function tweet09(): string {
  const check = `<span class="long" style="font-weight:700">✓</span>`;
  const row = (k: string, v: string, ok = true) => `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid ${C.line}">
    <span class="mono dim" style="font-size:19px">${k}</span><span class="mono" style="font-size:19px">${v} ${ok ? check : ""}</span></div>`;
  const r = rng(99);
  const grass = Array.from({ length: 120 }, (_, i) => {
    const x = 1060 + i * 3.6;
    const hh = 10 + r() * 22;
    return `<line x1="${x}" y1="742" x2="${x + (r() - 0.5) * 8}" y2="${742 - hh}" stroke="#1C3A2C" stroke-width="2"/>`;
  }).join("");
  return page(
    W,
    H,
    `<div class="grid" style="opacity:.45"></div>
    <div class="panel" style="position:absolute;left:56px;top:70px;width:820px;padding:34px 38px;box-shadow:0 30px 120px #000">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px">
        <div class="grot" style="font-size:38px;font-weight:700">/proof</div>
        <div class="pill b-long" style="font-size:15px">reconciled</div>
        <div style="flex:1"></div>
        <div class="mono dim" style="font-size:17px">$EXAMPLE · SOL LONG 3×</div>
      </div>
      ${row("solana vault", '<span class="long">7xKX…demo ↗</span>', false)}
      ${row("hyperliquid account", '<span class="long">0x3f9a…demo ↗</span>', false)}
      ${row("agent (trade only)", "0x81c2…demo", false)}
      <div class="mono dim" style="font-size:15px;letter-spacing:.1em;margin:22px 0 4px">RECONCILIATION</div>
      ${row("fees claimed", "12.400 SOL")}
      ${row("→ launcher 20% / platform 10%", "2.480 / 1.240")}
      ${row("→ position pipeline 70%", "8.680 SOL")}
      ${row("equity on hyperliquid", "$1,644.10")}
      ${row("withdrawn profit", "$212.40")}
      ${row("bought back · burned", '<span class="acc">1.31 SOL · 4.2m</span>')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:22px">
        <span class="mono dim" style="font-size:17px">closed by SL: 1 · by liquidation: <span class="long">0</span></span>
        <span class="pill b-flat" style="font-size:15px">export json ↓</span>
      </div>
    </div>
    <svg width="${W}" height="${H}" style="position:absolute;inset:0">
      <defs>
        <linearGradient id="stone" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2A2F37"/><stop offset="1" stop-color="#15181D"/></linearGradient>
        <radialGradient id="moon"><stop offset="0" stop-color="${C.text}" stop-opacity=".9"/><stop offset=".6" stop-color="${C.text}" stop-opacity=".15"/><stop offset="1" stop-color="${C.text}" stop-opacity="0"/></radialGradient>
      </defs>
      <circle cx="1440" cy="150" r="90" fill="url(#moon)"/>
      <circle cx="1440" cy="150" r="38" fill="${C.text}" opacity=".85"/>
      <linearGradient id="ground" x1="0" x2="1"><stop offset="0" stop-color="#0E1512" stop-opacity="0"/><stop offset=".2" stop-color="#0E1512"/><stop offset=".8" stop-color="#0E1512"/><stop offset="1" stop-color="#0E1512" stop-opacity="0"/></linearGradient>
      <path d="M 1100 742 L 1100 380 Q 1100 250 1240 250 Q 1380 250 1380 380 L 1380 742 Z" fill="url(#stone)" stroke="${C.line}" stroke-width="3"/>
      <rect x="990" y="738" width="560" height="44" fill="url(#ground)"/>
      ${grass}
    </svg>
    <div style="position:absolute;left:1100px;width:280px;top:330px;text-align:center">
      <div class="grot" style="font-size:58px;font-weight:700;color:${C.text};letter-spacing:.08em">R.I.P.</div>
      <div style="width:120px;height:2px;background:${C.line};margin:18px auto"></div>
      <div class="mono" style="font-size:24px;color:${C.flat};line-height:1.5">here lies<br/>nobody<br/><span class="dim">(yet)</span></div>
      <div class="mono dim" style="font-size:15px;margin-top:40px">liquidations: 0</div>
    </div>
    <div class="mono dim" style="position:absolute;left:1000px;right:60px;top:800px;text-align:center;font-size:20px">/graveyard · we'd like it to stay empty</div>`,
  );
}

/* ───────────────────────────── banner ───────────────────────────── */
export function banner(): string {
  const BW = 1500;
  const BH = 500;
  const r = rng(5);
  const meet: [number, number] = [1330, 360];
  const price: [number, number][] = [];
  const eq: [number, number][] = [];
  const x0 = 440;
  const n = 44;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (meet[0] - x0) * t;
    const pNoise = (r() - 0.5) * 34 * (1 - t);
    const eNoise = (r() - 0.5) * 22 * (1 - t);
    price.push([x, 300 + (meet[1] - 300) * t + Math.sin(t * 11) * 26 * (1 - t) + pNoise]);
    eq.push([x, 470 + (meet[1] - 470) * t ** 0.8 + eNoise]);
  }
  return page(
    BW,
    BH,
    `<div class="grid"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 35%,transparent 30%,${C.bg} 95%)"></div>
    <svg width="${BW}" height="${BH}" style="position:absolute;inset:0">
      <path d="${linePath(price)}" fill="none" stroke="${C.flat}" stroke-width="2" opacity=".75"/>
      <path d="${linePath(eq)}" fill="none" stroke="${C.long}" stroke-width="4" style="filter:drop-shadow(0 0 8px ${C.long})"/>
      <circle cx="${meet[0]}" cy="${meet[1]}" r="9" fill="${C.accent}" style="filter:drop-shadow(0 0 12px ${C.accent})"/>
      <text x="460" y="${price[0]![1] - 14}" fill="${C.flat}" font-family="JetBrains Mono" font-size="15">coin price</text>
      <text x="${eq[8]![0]}" y="${eq[8]![1] + 34}" fill="${C.long}" font-family="JetBrains Mono" font-size="15">position equity</text>
    </svg>
    <div style="position:absolute;left:${meet[0] + 18}px;top:${meet[1] - 52}px;display:flex;flex-direction:column;align-items:center">${flame(46)}<span class="mono acc" style="font-size:18px;font-weight:700">burn</span></div>
    <div class="grot" style="position:absolute;left:0;right:0;top:120px;text-align:center;font-size:92px;font-weight:700;letter-spacing:-.01em">every coin has a <span class="long glow-long">bias.</span></div>
    <div class="mono dim" style="position:absolute;right:40px;top:30px;font-size:20px"><span class="long">fees → position</span> · <span class="acc">profit → burn</span></div>`,
  );
}

/* ───────────────────────────── avatar / coin ───────────────────────────── */
export function avatar(size: number): string {
  return page(
    size,
    size,
    `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,${C.long}1f 0%,transparent 55%),${C.bg}"></div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${logo(Math.round(size * 0.72))}</div>`,
  );
}
