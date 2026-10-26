// Edge entry point: static assets, /api/* via a short per-isolate cache in front of the global Tracker DO.
import type { Env } from './env';
import { handleReplay } from './replay';

export { Tracker } from './tracker';

const API_ROUTES = new Set(['/api/summary', '/api/states', '/api/price', '/api/health', '/api/sp', '/api/history']);
const EDGE_TTL_MS = 3_000;
const memo = new Map<string, { at: number; body: string; status: number }>();

function respond(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=5' : 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

function tracker(env: Env) {
  return env.TRACKER.get(env.TRACKER.idFromName('global'));
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') return respond('{"error":"method not allowed"}', 405);
    if (!API_ROUTES.has(url.pathname)) return respond('{"error":"not found"}', 404);

    if (env.RATE_LIMITER) {
      const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return respond('{"error":"слишком много запросов, подождите минуту"}', 429, { 'retry-after': '60' });
    }

    if (env.REPLAY === '1' || url.searchParams.get('replay') === '1') return handleReplay(url, env);

    if (url.pathname === '/api/health') {
      const res = await tracker(env).fetch(`https://tracker${url.pathname}`);
      return respond(await res.text(), res.status, { 'cache-control': 'no-store' });
    }

    // Edge cache (Cache API), 5 s per Cloudflare location.
    const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return hit;

    // Per-isolate micro-cache: coalesces bursts from one location before they reach the DO.
    const now = Date.now();
    const m = memo.get(url.pathname);
    if (m && now - m.at < EDGE_TTL_MS) return respond(m.body, m.status, { 'x-cache': 'isolate' });

    const res = await tracker(env).fetch(`https://tracker${url.pathname}`);
    const body = await res.text();
    if (res.status === 200) memo.set(url.pathname, { at: now, body, status: 200 });
    const out = respond(body, res.status);
    if (res.status === 200) ctx.waitUntil(cache.put(cacheKey, out.clone()).catch(() => {}));
    return out;
  },

  async scheduled(_evt: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(tracker(env).fetch('https://tracker/cron').then((r) => r.text()).then((t) => console.log('cron', t)));
  },
};
