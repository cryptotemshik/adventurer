import { allMids } from "@/lib/hl-public";
import { handle, ok } from "@/lib/http";

export const GET = handle(async () => ok(await allMids(), { cache: 15 }));
