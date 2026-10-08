/** Локальная база для разработки и тестов — встроенный в Node модуль node:sqlite. */
export async function createSqlite(file = ":memory:") {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const norm = args => args.map(v => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  return {
    kind: "sqlite",
    async all(sql, args = []) { return db.prepare(sql).all(...norm(args)); },
    async get(sql, args = []) { return db.prepare(sql).get(...norm(args)) ?? null; },
    async run(sql, args = []) { const r = db.prepare(sql).run(...norm(args)); return { changes: Number(r.changes) }; },
    async exec(sql) { db.exec(sql); },
    close() { db.close(); },
  };
}
