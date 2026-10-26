import './style.css';
import type { HistoryResponse, PriceResponse, SpResponse, StateRow, StatesResponse, Summary } from '../../../workers/api/src/types';

declare const __BUILD__: string;

const POLL_MS = 15_000;
const params = new URLSearchParams(location.search);
const replay = params.get('replay') === '1';
const passthrough = ['replay', 'frame', 'scenario'].filter((k) => params.has(k)).map((k) => `${k}=${encodeURIComponent(params.get(k)!)}`).join('&');

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtInt = (n: number) => nf0.format(n);
const fmtPct = (n: number) => `${nf2.format(n)}%`;
const fmtPx = (n: number | null) => (n === null ? '—' : nf3.format(n));
const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtShort = (n: number) => (n >= 1e6 ? `${(n >= 1e7 ? nf1 : nf2).format(n / 1e6)}\u00a0млн` : n >= 1e4 ? `${nf0.format(Math.round(n / 1000))}\u00a0тыс.` : fmtInt(n));

const tf = (tz: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const tBRT = tf('America/Sao_Paulo');
const tAMS = tf('Europe/Amsterdam');
const amsZone = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'CET';
const bothTimes = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${tBRT.format(d)} BRT · ${tAMS.format(d)} ${amsZone(d)}`;
};
const ago = (sec: number) => (sec < 60 ? `${sec} с` : sec < 3600 ? `${Math.floor(sec / 60)} мин` : `${Math.floor(sec / 3600)} ч ${Math.floor((sec % 3600) / 60)} мин`);

// ---------- change highlighting ----------
const prev = new Map<string, string>();
function setText(key: string, text: string) {
  document.querySelectorAll<HTMLElement>(`[data-k="${key}"]`).forEach((el) => {
    if (el.textContent === text) return;
    el.textContent = text;
    if (prev.has(key) && prev.get(key) !== text) {
      el.classList.remove('flash-off');
      el.classList.add('flash');
      setTimeout(() => {
        el.classList.remove('flash');
        el.classList.add('flash-off');
      }, 1000);
    }
  });
  prev.set(key, text);
}

// ---------- data ----------
async function get<T>(path: string): Promise<{ data: T | null; error: string | null; receivedAt: number }> {
  const url = passthrough ? `${path}?${passthrough}` : path;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: body?.error ?? `HTTP ${res.status}`, receivedAt: Date.now() };
    return { data: body as T, error: null, receivedAt: Date.now() };
  } catch (e) {
    return { data: null, error: 'нет связи с сервером', receivedAt: Date.now() };
  }
}

const state: {
  summary?: { data: Summary; receivedAt: number };
  price?: { data: PriceResponse; receivedAt: number };
  states?: StatesResponse;
  sp?: SpResponse;
  history?: HistoryResponse;
  errors: Record<string, string | null>;
  sort: 'remaining' | 'name' | 'margin';
} = { errors: {}, sort: 'remaining' };

try {
  const s = localStorage.getItem('sort');
  if (s === 'name' || s === 'margin' || s === 'remaining') state.sort = s;
} catch {}

async function poll() {
  const [summary, price, states, sp, history] = await Promise.all([
    get<Summary>('/api/summary'),
    get<PriceResponse>('/api/price'),
    get<StatesResponse>('/api/states'),
    get<SpResponse>('/api/sp'),
    get<HistoryResponse>('/api/history'),
  ]);
  if (summary.data) state.summary = { data: summary.data, receivedAt: summary.receivedAt };
  if (price.data) state.price = { data: price.data, receivedAt: price.receivedAt };
  if (states.data) state.states = states.data;
  if (sp.data) state.sp = sp.data;
  if (history.data) state.history = history.data;
  state.errors = { summary: summary.error, price: price.error, states: states.error, sp: sp.error };
  render();
}

// ---------- rendering ----------
function freshness(ageSec: number, stale: boolean): 'ok' | 'warn' | 'bad' {
  if (stale || ageSec > 120) return 'bad';
  if (ageSec > 30) return 'warn';
  return 'ok';
}

function liveAge(x: { data: { ageSeconds: number }; receivedAt: number }) {
  return x.data.ageSeconds + Math.round((Date.now() - x.receivedAt) / 1000);
}

function renderHeader() {
  const s = state.summary;
  const dotT = $('dot-tse');
  if (s) {
    const age = liveAge(s);
    const level = s.data.complete ? 'ok' : freshness(age, s.data.stale);
    dotT.className = `dot ${level}`;
    const label = s.data.complete ? 'подсчёт завершён' : level === 'bad' ? 'данные устарели' : `получено ${ago(age)} назад`;
    $('fresh-tse').textContent = `TSE: ${bothTimes(s.data.sourceUpdatedAt)} — ${label}`;
  } else {
    dotT.className = 'dot bad';
    $('fresh-tse').textContent = `TSE: ${state.errors.summary ?? 'загрузка…'}`;
  }
  const p = state.price;
  const dotP = $('dot-price');
  if (p) {
    const age = liveAge(p);
    const level = freshness(age, p.data.stale);
    dotP.className = `dot ${level}`;
    $('fresh-price').textContent = `Цена: ${bothTimes(p.data.fetchedAt)} — ${level === 'bad' ? 'данные устарели' : `${ago(age)} назад`}`;
  } else {
    dotP.className = 'dot bad';
    $('fresh-price').textContent = `Цена: ${state.errors.price ?? 'загрузка…'}`;
  }
  $('mode').textContent = replay ? 'REPLAY: записанные данные, не live' : 'обновление каждые 15 с';
}

function renderBanner() {
  const msgs: string[] = [];
  const s = state.summary;
  if (s && s.data.stale) msgs.push(`Источник TSE недоступен, показываем данные ${ago(liveAge(s))} назад.`);
  else if (!s && state.errors.summary) msgs.push(`Источник TSE недоступен: ${state.errors.summary}.`);
  else if (s && state.errors.summary) msgs.push(`Сервер недоступен, на экране данные ${ago(liveAge(s))} назад.`);
  const p = state.price;
  if (p && p.data.stale) msgs.push(`Цена EWZ не обновляется, показываем данные ${ago(liveAge(p))} назад.`);
  if (replay) msgs.push('Режим replay: показаны записанные ранее данные, а не live.');
  const b = $('banner');
  b.hidden = msgs.length === 0;
  b.textContent = msgs.join(' ');
}

function renderSummary() {
  const x = state.summary?.data;
  if (!x) return;
  const left = x.sections.total - x.sections.counted;
  // 2-decimal rounding shows "100,00%" while a few sections are still out; be exact near the end.
  setText('counted', !x.complete && left > 0 && x.countedPct >= 99.99 ? `${nf2.format(99.99)}%+ (осталось ${fmtInt(left)} уч.)` : fmtPct(x.countedPct));
  $('counted-bar').style.width = `${Math.min(100, x.countedPct)}%`;
  setText('lula-pct', fmtPct(x.candidates.lula.pct));
  setText('flavio-pct', fmtPct(x.candidates.flavio.pct));
  setText('lula-votes', `${fmtInt(x.candidates.lula.votes)} гол.`);
  setText('flavio-votes', `${fmtInt(x.candidates.flavio.votes)} гол.`);
  $('split-l').style.width = `${x.candidates.lula.pct}%`;
  const name = x.leader === 'lula' ? 'Лула' : x.leader === 'flavio' ? 'Флавио Болсонару' : null;
  const badge = $('badge');
  if (x.complete) {
    badge.hidden = false;
    badge.textContent = 'Подсчёт завершён';
    const w = x.winner === 'lula' ? 'Лула' : x.winner === 'flavio' ? 'Флавио Болсонару' : name;
    $('lead-line').textContent = `Итог: ${w ?? 'ничья'} — отрыв ${fmtInt(x.marginVotes)} голосов (${nf2.format(x.marginPp)} п.п.). Официально результат объявляет TSE.`;
  } else {
    badge.hidden = !x.mathematicallyDefined;
    badge.textContent = 'Математически определён (TSE)';
    $('lead-line').textContent = name ? `Впереди ${name}: отрыв ${fmtInt(x.marginVotes)} голосов (${nf2.format(x.marginPp)} п.п.)` : 'Равенство голосов';
    if (x.mathematicallyDefined) $('lead-line').textContent += '. TSE отметил результат как математически определённый, подсчёт продолжается.';
  }
  const facts: [string, string][] = [
    ['Участков', `${fmtInt(x.sections.counted)} из ${fmtInt(x.sections.total)}`],
    ['Валидных голосов', fmtInt(x.validVotes)],
    ['Пустые / недейств.', `${fmtInt(x.blankVotes)} / ${fmtInt(x.nullVotes)}`],
    ['Явка (подсчит.)', x.turnoutPct === null ? '—' : fmtPct(x.turnoutPct)],
    ['Осталось голосов (оценка)', x.remainingValidVotesEst === null ? '—' : `≈ ${fmtInt(x.remainingValidVotesEst)}`],
    ['Избирателей', fmtInt(x.electorate)],
  ];
  $('facts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  // break-even
  const sec = $('breakeven');
  const be = x.breakEven;
  sec.hidden = x.complete || be.lulaNeedsPctOfRemaining === null;
  if (!sec.hidden) {
    const show = (key: string, hintId: string, v: number) => {
      document.querySelector(`[data-k="${key}"]`)?.classList.toggle('be-word', v > 100 || v <= 0);
      // Outside 0..100% the raw number is arithmetic noise; say what it means and keep the number in the hint.
      if (v > 100) {
        setText(key, 'недостижимо');
        $(hintId).textContent = `нужно ${fmtPct(v)} оставшихся голосов`;
      } else if (v <= 0) {
        setText(key, 'уже достаточно');
        $(hintId).textContent = `формально ${fmtPct(v)} оставшихся`;
      } else {
        setText(key, fmtPct(v));
        $(hintId).textContent = 'оставшихся голосов';
      }
    };
    show('be-lula', 'be-lula-hint', be.lulaNeedsPctOfRemaining!);
    show('be-flavio', 'be-flavio-hint', be.flavioNeedsPctOfRemaining!);
  }
}

function svgEl(w: number, h: number, inner: string, label: string) {
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" preserveAspectRatio="none">${inner}</svg>`;
}

function renderPrice() {
  const p = state.price?.data;
  if (!p) return;
  setText('mark', fmtPx(p.markPx));
  setText('oracle', fmtPx(p.oraclePx));
  setText('basis', p.markPx !== null && p.oraclePx !== null ? `${p.markPx - p.oraclePx >= 0 ? '+' : '−'}${nf3.format(Math.abs(p.markPx - p.oraclePx))}` : '—');
  for (const [k, c] of [['c5', p.change.m5], ['c15', p.change.m15], ['c60', p.change.m60]] as const) {
    const el = document.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
    if (!c) {
      setText(k, '—');
      el.className = 'num';
      continue;
    }
    const sign = c.abs > 0 ? '+' : c.abs < 0 ? '−' : '';
    setText(k, `${sign}${nf3.format(Math.abs(c.abs))} (${sign}${nf2.format(Math.abs(c.pct))}%)`);
    el.className = `num ${c.abs > 0 ? 'up' : c.abs < 0 ? 'down' : ''}`;
  }
  $('price-src').textContent = `${p.source} · ${p.symbol}${p.delayed ? ' · с задержкой' : ''}`;
  const notes: string[] = [];
  if (p.markUnchangedSeconds !== null && p.markUnchangedSeconds >= 60) notes.push(`mark не менялся ${ago(p.markUnchangedSeconds)}.`);
  if (p.note) notes.push(p.note);
  notes.push(`График: ${p.historyBasis}, 2 часа.`);
  if (p.changeBasis === 'candles') notes.push('Изменения посчитаны по 1-мин свечам (история mark ещё набирается).');
  $('price-note').textContent = notes.join(' ');

  const pts = p.history;
  const spark = $('spark');
  if (pts.length < 2) {
    spark.innerHTML = '<p class="muted small">Недостаточно точек для графика.</p>';
    return;
  }
  const W = 320, H = 70, pad = 4;
  const xs = pts.map((q) => Date.parse(q.t));
  const ys = pts.map((q) => q.px);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const sx = (t: number) => pad + ((t - x0) / Math.max(1, x1 - x0)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 2 * pad - 12);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(q.px).toFixed(1)}`).join('');
  const up = ys[ys.length - 1] >= ys[0];
  spark.innerHTML = svgEl(
    W,
    H,
    `<path d="${d}" fill="none" stroke="${up ? 'var(--ok)' : 'var(--bad)'}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>` +
      `<text x="${pad}" y="10" class="axis">max ${nf3.format(hi)}</text><text x="${W - pad}" y="10" class="axis" text-anchor="end">min ${nf3.format(lo)}</text>`,
    `Цена за 2 часа: от ${nf3.format(ys[0])} до ${nf3.format(ys[ys.length - 1])}`,
  );
}

function renderHistory() {
  const h = state.history;
  const el = $('hist-chart');
  if (!h || h.points.length < 2) {
    el.innerHTML = '<p class="muted small">История начнёт строиться после нескольких обновлений.</p>';
    $('hist-note').textContent = '';
    return;
  }
  const pts = h.points;
  const W = 340, H = 150, L = 34, R = 6, T = 10, B = 20;
  const xs = pts.map((p) => p.countedPct);
  const ys = pts.map((p) => p.marginPp);
  const x0 = Math.min(...xs), x1 = Math.max(100, ...xs);
  const m = Math.max(0.5, ...ys.map(Math.abs)) * 1.1;
  const sx = (v: number) => L + ((v - x0) / Math.max(1e-6, x1 - x0)) * (W - L - R);
  const sy = (v: number) => T + ((m - v) / (2 * m)) * (H - T - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.countedPct).toFixed(1)},${sy(p.marginPp).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  el.innerHTML = svgEl(
    W,
    H,
    `<rect x="${L}" y="${T}" width="${W - L - R}" height="${sy(0) - T}" fill="var(--lula-bar)" opacity="0.07"/>` +
      `<rect x="${L}" y="${sy(0)}" width="${W - L - R}" height="${H - B - sy(0)}" fill="var(--flavio-bar)" opacity="0.07"/>` +
      `<line x1="${L}" x2="${W - R}" y1="${sy(0)}" y2="${sy(0)}" stroke="var(--muted)" stroke-dasharray="3 3"/>` +
      `<path d="${d}" fill="none" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
      `<circle cx="${sx(last.countedPct)}" cy="${sy(last.marginPp)}" r="3" fill="var(--text)"/>` +
      `<text x="${L - 4}" y="${T + 8}" class="axis" text-anchor="end">+${nf2.format(m)}</text>` +
      `<text x="${L - 4}" y="${sy(0) + 3}" class="axis" text-anchor="end">0</text>` +
      `<text x="${L - 4}" y="${H - B}" class="axis" text-anchor="end">−${nf2.format(m)}</text>` +
      `<text x="${L + 4}" y="${T + 10}" class="axis">Лула впереди</text>` +
      `<text x="${L + 4}" y="${H - B - 4}" class="axis">Флавио впереди</text>` +
      `<text x="${L}" y="${H - 4}" class="axis">${nf0.format(x0)}%</text>` +
      `<text x="${W - R}" y="${H - 4}" class="axis" text-anchor="end">${nf0.format(x1)}% подсчитано</text>`,
    `Отрыв Лула минус Флавио, п.п., по доле подсчёта. Сейчас ${nf2.format(last.marginPp)} п.п.`,
  );
  $('hist-note').textContent = `Ось Y: Лула минус Флавио, п.п.; ось X: доля подсчитанных участков. Точек: ${pts.length}.`;
}

function leadCell(r: { leader: string; marginVotes: number }) {
  if (r.leader === 'tie') return '<span>=</span>';
  const cls = r.leader === 'lula' ? 'lead-l' : 'lead-f';
  const who = r.leader === 'lula' ? 'Л' : 'Ф';
  return `<span class="${cls}" title="${r.leader === 'lula' ? 'Лула' : 'Флавио'} впереди">${who} +${fmtShort(r.marginVotes)}</span>`;
}

function renderStates() {
  const s = state.states;
  const body = $('states-body');
  if (!s) {
    body.innerHTML = `<tr><td colspan="4" class="muted">${state.errors.states ?? 'Загрузка…'}</td></tr>`;
    return;
  }
  const rows = [...s.states];
  const rem = (r: StateRow) => r.remainingValidVotesEst ?? 0;
  if (state.sort === 'remaining') rows.sort((a, b) => rem(b) - rem(a));
  else if (state.sort === 'name') rows.sort((a, b) => a.uf.localeCompare(b.uf));
  else rows.sort((a, b) => b.flavioMinusLulaVotes - a.flavioMinusLulaVotes);
  body.innerHTML = rows
    .map(
      (r) => `<tr class="${r.stale ? 'stale' : ''}">
      <td><strong>${r.uf}</strong>${r.complete ? '<span class="tag">100%</span>' : ''}<span class="sub2">${r.name}</span></td>
      <td class="r">${fmtPct(r.countedPct)}<span class="sub2">${r.remainingValidVotesEst ? `≈${fmtShort(r.remainingValidVotesEst)}` : '&nbsp;'}</span></td>
      <td class="r">${fmtPct(r.flavio.pct)}<span class="sub2">Л ${fmtPct(r.lula.pct)}</span></td>
      <td class="r">${leadCell(r)}</td>
    </tr>`,
    )
    .join('');
  if (s.missing.length) body.insertAdjacentHTML('beforeend', `<tr><td colspan="4" class="muted small">Нет данных: ${s.missing.join(', ')}</td></tr>`);
}

function renderSp() {
  const s = state.sp;
  const el = $('sp-body');
  if (!s) {
    el.innerHTML = `<p class="muted">${state.errors.sp ?? 'Загрузка…'}</p>`;
    return;
  }
  el.innerHTML =
    `<table class="tbl"><caption class="sr">Сан-Паулу по районам</caption><thead><tr><th scope="col">Район</th><th scope="col" class="r">Подсч.</th><th scope="col" class="r">Флавио</th><th scope="col" class="r">Отрыв</th></tr></thead><tbody>` +
    s.regions
      .map(
        (r) => `<tr><td>${r.name}</td><td class="r">${fmtPct(r.countedPct)}</td><td class="r">${fmtPct(r.flavio.pct)}<span class="sub2">Л ${fmtPct(r.lula.pct)}</span></td><td class="r">${leadCell(r)}</td></tr>`,
      )
      .join('') +
    `</tbody></table>` +
    (s.missing.length ? `<p class="note small">Не загружено файлов: ${s.missing.length}; Большой SP / интерьор показываются только при полном наборе.</p>` : '');
}

function render() {
  renderHeader();
  renderBanner();
  renderSummary();
  renderHistory();
  renderPrice();
  renderSp();
  renderStates();
}

document.querySelectorAll<HTMLButtonElement>('.sorter button').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort));
  b.addEventListener('click', () => {
    state.sort = b.dataset.sort as typeof state.sort;
    try {
      localStorage.setItem('sort', state.sort);
    } catch {}
    document.querySelectorAll('.sorter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderStates();
  });
});

$('ver').textContent = __BUILD__;
if (replay)
  document.querySelectorAll<HTMLAnchorElement>('a[href="?replay=1"]').forEach((a) => {
    a.href = '/';
    a.textContent = 'live';
  });

let timer: number | undefined;
async function loop() {
  clearTimeout(timer);
  await poll();
  timer = window.setTimeout(loop, POLL_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loop();
});
setInterval(renderHeader, 1000);
loop();
