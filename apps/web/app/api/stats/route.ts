import { handle, ok } from "@/lib/http";
import { platformStats } from "@/lib/stats";

export const GET = handle(async () => ok(await platformStats(), { cache: 10 }));
