import { listMarkets, type MarketSort } from "@bias/db";
import { getDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { toView } from "@/lib/view";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const bool = (k: string) => (u.get(k) === null || u.get(k) === "" ? undefined : u.get(k) === "true");
  const rows = await listMarkets(await getDb(), {
    sort: (u.get("sort") as MarketSort) || "newest",
    strategy: u.get("strategy") || undefined,
    asset: u.get("asset") || undefined,
    side: u.get("side") || undefined,
    community: bool("community"),
    bonding: (u.get("bonding") as "bonding" | "graduated") || undefined,
    status: u.get("status")?.split(",").filter(Boolean),
    q: u.get("q") || undefined,
    limit: Number(u.get("limit") ?? 60),
    offset: Number(u.get("offset") ?? 0),
  });
  return ok({ markets: rows.map(toView) }, { cache: 5 });
});
