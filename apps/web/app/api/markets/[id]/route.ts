import { fail, handle, ok } from "@/lib/http";
import { getDetail } from "@/lib/detail";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const d = await getDetail(id);
  if (!d) return fail(404, "market not found");
  return ok(d, { cache: 5 });
});
