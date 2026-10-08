/** Скорость: сколько обращений к базе делает каждое действие игрока (каждое — это сетевой запрос к Turso). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { createSqlite } from "../server/db/sqlite.js";

function counting(db) {
  const c = { n: 0 };
  const wrap = name => async (...a) => { c.n++; return db[name](...a); };
  return { c, db: { ...db, all: wrap("all"), get: wrap("get"), run: wrap("run"), batch: wrap("batch"), exec: wrap("exec") } };
}

test("каждое действие игрока — не больше двух обращений к базе", async () => {
  const { c, db } = counting(await createSqlite(":memory:"));
  let t = 1e6;
  const app = createApp({ db, env: {}, now: () => t });
  const call = async (method, url, body) => JSON.parse((await app({ method, url, headers: {}, body: body ? JSON.stringify(body) : "", ip: "x" })).body);
  await call("GET", "/api/health"); // создание схемы при холодном старте — не считаем

  c.n = 0; const { attemptId } = await call("POST", "/api/attempts", { name: "Быстрый Тест", group: "Б1" });
  assert.equal(c.n, 1, "старт — 1 запрос");
  c.n = 0; await call("GET", "/api/config");
  assert.equal(c.n, 0, "конфигурация без базы");
  for (let i = 0; i < 17; i++) {
    c.n = 0; const o = await call("POST", `/api/attempts/${attemptId}/open`);
    assert.equal(c.n, 1, "открыть дело — 1 запрос");
    t += 3000;
    c.n = 0; await call("POST", `/api/attempts/${attemptId}/answer`, { position: o.question.position, option: "a" });
    assert.equal(c.n, 2, "ответ — 2 запроса");
  }
});

test("старая база без колонки answer_token обновляется сама", async () => {
  const raw = await createSqlite(":memory:");
  await raw.exec(`CREATE TABLE attempts (id TEXT PRIMARY KEY, player_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', deck TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, shown_at INTEGER, score INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
    deduction TEXT, deduction_correct INTEGER, title TEXT, started_at INTEGER NOT NULL, finished_at INTEGER)`);
  const app = createApp({ db: raw, env: {} });
  const r = await app({ method: "POST", url: "/api/attempts", headers: {}, body: JSON.stringify({ name: "Старая База", group: "С1" }), ip: "x" });
  assert.equal(r.status, 201, r.body);
  const id = JSON.parse(r.body).attemptId;
  await app({ method: "POST", url: `/api/attempts/${id}/open`, headers: {}, body: "", ip: "x" });
  const a = await app({ method: "POST", url: `/api/attempts/${id}/answer`, headers: {}, body: JSON.stringify({ position: 0, option: "b" }), ip: "x" });
  assert.equal(a.status, 200, a.body);
});
