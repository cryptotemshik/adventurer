// Local-dev SQLite backend (node:sqlite). Loaded with a runtime import so it never ends up in the worker bundle.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openSqlite(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  let depth = 0;
  return {
    exec(sql, params) {
      const st = db.prepare(sql);
      st.setReturnArrays?.(true);
      if (/^\s*(select|with|pragma)|returning/i.test(sql)) {
        return st.all(...params).map((r) => (Array.isArray(r) ? r : Object.values(r)));
      }
      st.run(...params);
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
