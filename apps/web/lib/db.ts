import "server-only";
/** Minimal Durable Object namespace shape (full types live in tsconfig.worker.json). */
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): unknown;
}

import { createDb, migrateSync, syncBackend, type Db, type SqlBackend } from "@bias/db";

let devDb: Db | null = null;

function doBackend(ns: DurableObjectNamespace): SqlBackend {
  const stub = ns.get(ns.idFromName("main")) as unknown as SqlBackend;
  return { query: (q) => stub.query(q), batch: (qs) => stub.batch(qs) };
}

export async function getBackend(): Promise<SqlBackend> {
  const ns = await cfBinding();
  if (ns) return doBackend(ns);
  return devBackend();
}

export async function getDb(): Promise<Db> {
  const ns = await cfBinding();
  if (ns) return createDb(doBackend(ns));
  if (!devDb) devDb = createDb(await devBackend());
  return devDb;
}

async function cfBinding(): Promise<DurableObjectNamespace | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    return (ctx.env as unknown as { BIAS_DB?: DurableObjectNamespace }).BIAS_DB ?? null;
  } catch {
    return null;
  }
}

let devBackendP: Promise<SqlBackend> | null = null;
/** Local development / e2e: node:sqlite file, loaded at runtime so it never enters the worker bundle. */
async function devBackend(): Promise<SqlBackend> {
  if (process.env.NEXT_RUNTIME === "edge") throw new Error("no database binding");
  devBackendP ??= (async () => {
    const path = process.env.BIAS_SQLITE_PATH ?? `${process.cwd()}/.data/bias.db`;
    const mod = (await import(/* webpackIgnore: true */ `${process.cwd()}/dev/sqlite.mjs`)) as {
      openSqlite: (p: string) => { exec: (s: string, p: unknown[]) => unknown[][]; transaction: <T>(f: () => T) => T };
    };
    const x = mod.openSqlite(path);
    migrateSync(x);
    return syncBackend(x);
  })();
  return devBackendP;
}
