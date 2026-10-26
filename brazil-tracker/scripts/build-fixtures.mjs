// Builds fixtures/replay.json and fixtures/history-seed.json from raw snapshots recorded by
// scripts/record.py (one directory per snapshot, files named "<uf>__<file>.json" plus "hl-xyz.json").
// Usage: node scripts/build-fixtures.mjs <recordings-dir> [maxFrames]
import fs from 'node:fs';
import path from 'node:path';

const [, , recDir, maxFramesArg] = process.argv;
if (!recDir) {
  console.error('usage: node scripts/build-fixtures.mjs <recordings-dir> [maxFrames]');
  process.exit(1);
}
const CYCLE = 'ele2026';
const ELECTION = '6258';
const SYMBOL = 'xyz:EWZ';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));

/** Keeps only the fields the parser reads, so the bundle stays small. */
function trim(doc) {
  return {
    ...pick(doc, ['ele', 't', 'f', 'tpabr', 'cdabr', 'dg', 'hg', 'dt', 'ht', 'tf', 'and', 'md']),
    s: pick(doc.s, ['ts', 'st', 'pstn']),
    e: pick(doc.e, ['te', 'est', 'c']),
    v: pick(doc.v, ['vv', 'vb', 'tvn']),
    carg: (doc.carg ?? []).map((c) => ({
      cd: c.cd,
      agr: (c.agr ?? []).map((a) => ({ par: (a.par ?? []).map((p) => ({ cand: (p.cand ?? []).map((x) => pick(x, ['n', 'nmu', 'vap', 'pvapn', 'e', 'st'])) })) })),
    })),
  };
}

function readFrame(dir) {
  const files = {};
  let price = null;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (f === 'hl-xyz.json') {
      try {
        const d = JSON.parse(fs.readFileSync(full, 'utf8'));
        const i = d[0].universe.findIndex((a) => a.name === SYMBOL);
        const c = d[1][i];
        const n = (v) => (v === undefined || v === null ? null : Number(v));
        price = { markPx: n(c.markPx), oraclePx: n(c.oraclePx), midPx: n(c.midPx), prevDayPx: n(c.prevDayPx), fundingRate: n(c.funding) };
      } catch {}
      continue;
    }
    if (!f.includes('-u.json')) continue;
    const [uf, name] = f.split('__');
    try {
      files[`${CYCLE}/${ELECTION}/dados/${uf}/${name}`] = trim(JSON.parse(fs.readFileSync(full, 'utf8')));
    } catch {}
  }
  return { files, price };
}

const dirs = fs.readdirSync(recDir).filter((d) => /^\d{8}T\d{6}Z$/.test(d)).sort();
let frames = dirs.map((d) => {
  const ts = d.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
  return { ts, ...readFrame(path.join(recDir, d)) };
});
frames = frames.filter((f) => f.files[`${CYCLE}/${ELECTION}/dados/br/br-c0001-e${ELECTION.padStart(6, '0')}-u.json`]);
const max = Number(maxFramesArg || 24);
if (frames.length > max) {
  // Keep first and last, sample evenly in between.
  const step = (frames.length - 1) / (max - 1);
  frames = Array.from({ length: max }, (_, i) => frames[Math.round(i * step)]);
}

const brKey = `${CYCLE}/${ELECTION}/dados/br/br-c0001-e${ELECTION.padStart(6, '0')}-u.json`;
const last = frames.at(-1);
if (last && last.files[brKey].tf !== 's') {
  // Synthetic "counting finished" frame for UI checks: last real frame with the final flags set.
  const files = JSON.parse(JSON.stringify(last.files));
  for (const doc of Object.values(files)) {
    doc.tf = 's';
    doc.and = 'f';
    doc.s.st = doc.s.ts;
    doc.s.pstn = '100';
    doc.e.est = doc.e.te;
  }
  const br = files[brKey];
  const cands = br.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand));
  const lead = cands.reduce((a, b) => (Number(a.vap) >= Number(b.vap) ? a : b));
  for (const c of cands) {
    c.e = c === lead ? 's' : 'n';
    c.st = c === lead ? 'Eleito' : 'Não eleito';
  }
  frames.push({ ts: last.ts, files, price: last.price, synthetic: true });
}

fs.writeFileSync(path.join(root, 'fixtures/replay.json'), JSON.stringify({ election: ELECTION, cycle: CYCLE, frames }));

// History seed for the live DO: real recorded points only.
const num = (v) => Number(String(v).replace(',', '.'));
const points = frames
  .filter((f) => !f.synthetic)
  .map((f) => {
    const br = f.files[brKey];
    const cands = br.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand));
    const lula = cands.find((c) => c.n === '13');
    const flavio = cands.find((c) => c.n === '22');
    const lv = num(lula.vap);
    const fv = num(flavio.vap);
    const lp = num(lula.pvapn);
    const fp = num(flavio.pvapn);
    const [d, m, y] = br.dt.split('/');
    const src = `${y}-${m}-${d}T${br.ht}-03:00`;
    return {
      t: new Date(src).toISOString(),
      sourceUpdatedAt: src,
      countedPct: Math.round(num(br.s.pstn) * 100) / 100,
      lulaPct: Math.round(lp * 100) / 100,
      flavioPct: Math.round(fp * 100) / 100,
      marginVotes: lv - fv,
      marginPp: Math.round((lp - fp) * 100) / 100,
      leader: lv > fv ? 'lula' : fv > lv ? 'flavio' : 'tie',
    };
  });
fs.writeFileSync(path.join(root, 'fixtures/history-seed.json'), JSON.stringify({ election: ELECTION, points }, null, 1));
const size = fs.statSync(path.join(root, 'fixtures/replay.json')).size;
console.log(`frames: ${frames.length} (${frames.filter((f) => f.synthetic).length} synthetic), replay.json ${Math.round(size / 1024)} KB, seed points: ${points.length}`);
