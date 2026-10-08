/** Выбор базы: Turso в облаке (если заданы переменные окружения), иначе локальный файл SQLite. */
import { createTurso } from "./turso.js";

let instance = null;
export async function getDb(env = process.env) {
  if (instance) return instance;
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    instance = createTurso({ url: env.TURSO_DATABASE_URL, token: env.TURSO_AUTH_TOKEN });
  } else if (env.VERCEL || env.NETLIFY || env.RENDER || env.NODE_ENV === "production") {
    // В облаке файл базы не сохраняется между запусками — нужна Turso
    throw new Error("Не заданы TURSO_DATABASE_URL и TURSO_AUTH_TOKEN в настройках хостинга");
  } else {
    const { createSqlite } = await import("./sqlite.js");
    instance = await createSqlite(env.SQLITE_FILE || "lab.db");
  }
  return instance;
}
