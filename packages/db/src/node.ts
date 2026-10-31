// node:sqlite backend for local dev, tests and DRY_RUN jobs. Not imported by the worker bundle.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb, migrateSync, syncBackend, type SyncExec } from "./driver";

export function nodeSqlite(path = ":memory:"): SyncExec {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  let depth = 0;
  return {
    exec(sql, params) {
      const st = db.prepare(sql);
      (st as unknown as { setReturnArrays?: (b: boolean) => void }).setReturnArrays?.(true);
      if (/^\s*(select|with|pragma)|returning/i.test(sql)) {
        const rows = st.all(...(params as never[])) as unknown[];
        return rows.map((r) => (Array.isArray(r) ? r : Object.values(r as object)));
      }
      st.run(...(params as never[]));
      return [];
    },
    transaction(fn) {
      if (depth > 0) return fn();
      depth++;
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

export function nodeDb(path = ":memory:") {
  const x = nodeSqlite(path);
  migrateSync(x);
  return createDb(syncBackend(x));
}
