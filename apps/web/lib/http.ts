import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok(data: unknown, init: ResponseInit & { cache?: number } = {}) {
  const headers = new Headers(init.headers);
  if (init.cache) headers.set("cache-control", `public, max-age=${init.cache}, s-maxage=${init.cache}`);
  else headers.set("cache-control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "cache-control": "no-store" } });
}

export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof ZodError) return fail(400, "invalid input", { issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      if (e instanceof HttpError) return fail(e.status, e.message);
      console.error(e);
      return fail(500, "internal error");
    }
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
