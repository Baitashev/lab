/** Схема базы. Применяется автоматически при первом запросе (CREATE … IF NOT EXISTS). */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  avatar INTEGER NOT NULL DEFAULT 0,
  extra_attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  deck TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  shown_at INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  deduction TEXT,
  deduction_correct INTEGER,
  title TEXT,
  answer_token TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS attempts_player ON attempts(player_id, status);
CREATE TABLE IF NOT EXISTS answers (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  case_id TEXT NOT NULL,
  option_index INTEGER,
  correct INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, position)
);
CREATE INDEX IF NOT EXISTS answers_case ON answers(case_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_fails (ip TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL)
`;

/** Изменения схемы для баз, созданных прошлыми версиями. Ошибка «колонка уже есть» — это нормально. */
const MIGRATIONS = ["ALTER TABLE attempts ADD COLUMN answer_token TEXT"];

async function migrate(db) {
  await db.exec(SCHEMA);
  for (const sql of MIGRATIONS) {
    try { await db.run(sql); } catch (e) { if (!/duplicate column/i.test(String(e.message))) throw e; }
  }
}

const ready = new WeakMap();
export function ensureSchema(db) {
  if (!ready.has(db)) ready.set(db, migrate(db).catch(e => { ready.delete(db); throw e; }));
  return ready.get(db);
}
