import { cookies } from "next/headers";
import { deleteSession } from "@bias/db";
import { getDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/auth";

export const POST = handle(async () => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await deleteSession(await getDb(), id);
  jar.delete(SESSION_COOKIE);
  return ok({ ok: true });
});
