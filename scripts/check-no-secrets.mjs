// CI guard: seeds must never reach the client bundle or the Cloudflare worker.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps/web/.next/static", "apps/web/.open-next", "apps/web/wrangler.jsonc"].filter(existsSync);
const needles = ["MASTER_SEED", "AGENT_SEED"];
for (const k of ["MASTER_SEED", "AGENT_SEED"]) {
  const v = process.env[k];
  if (v) needles.push(v.trim().split(/\s+/).slice(0, 4).join(" "));
}
let bad = 0;
function walk(p) {
  const s = statSync(p);
  if (s.isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (!/\.(js|mjs|cjs|json|jsonc|html|map)$/.test(p) || s.size > 50_000_000) return;
  const txt = readFileSync(p, "utf8");
  for (const n of needles) if (txt.includes(n)) { console.error(`✗ ${n.includes(" ") ? "seed words" : n} found in ${p}`); bad++; }
}
roots.forEach(walk);
if (bad) process.exit(1);
console.log(`✓ no seeds in ${roots.length ? roots.join(", ") : "(nothing built)"}`);
