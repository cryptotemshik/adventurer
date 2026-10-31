import { listEvents } from "@bias/db";
import { getDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const events = await listEvents(await getDb(), {
    types: u.get("types")?.split(",").filter(Boolean),
    limit: Number(u.get("limit") ?? 100),
    before: u.get("before") ? Number(u.get("before")) : undefined,
    marketId: u.get("market") ?? undefined,
  });
  return ok({ events }, { cache: 5 });
});
