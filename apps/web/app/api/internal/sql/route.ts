import { z } from "zod";
import { getBackend } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";

const Q = z.object({ sql: z.string().max(100_000), params: z.array(z.unknown()).max(5000), method: z.enum(["run", "all", "values", "get"]) });
const Body = z.object({ queries: z.array(Q).min(1).max(500), batch: z.boolean() });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Database access for GitHub Actions jobs (JOB_TOKEN bearer). Seeds never come here — only SQL. */
export const POST = handle(async (req: Request) => {
  const token = process.env.JOB_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || token.length < 32 || !safeEqual(auth, `Bearer ${token}`)) return fail(401, "unauthorized");
  const b = Body.parse(await req.json());
  const be = await getBackend();
  if (b.batch) return ok(await be.batch(b.queries));
  return ok(await be.query(b.queries[0]!));
});
