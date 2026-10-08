/** Проверка HTTP-адаптера Turso на поддельном сервере, который говорит на том же протоколе (v2/pipeline). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTurso } from "../server/db/turso.js";
import { createSqlite } from "../server/db/sqlite.js";
import { createApp } from "../server/app.js";

async function fakeTurso() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  const enc = v => v === null ? { type: "null" } : typeof v === "number" ? (Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v })
    : typeof v === "bigint" ? { type: "integer", value: String(v) } : { type: "text", value: String(v) };
  const dec = v => v.type === "null" ? null : v.type === "integer" ? Number(v.value) : v.value;
  return async (url, init) => {
    assert.match(url, /^https:\/\/demo-db\.turso\.io\/v2\/pipeline$/);
    assert.equal(init.headers.Authorization, "Bearer TOKEN");
    const { requests } = JSON.parse(init.body);
    const results = requests.map(r => {
      if (r.type === "close") return { type: "ok", response: { type: "close" } };
      try {
        const st = db.prepare(r.stmt.sql);
        const args = (r.stmt.args || []).map(dec);
        if (st.columns().length) {
          const rows = st.all(...args); const cols = st.columns().map(c => ({ name: c.name, decltype: null }));
          return { type: "ok", response: { type: "execute", result: { cols, rows: rows.map(o => cols.map(c => enc(o[c.name]))), affected_row_count: 0, last_insert_rowid: null } } };
        }
        const info = st.run(...args);
        return { type: "ok", response: { type: "execute", result: { cols: [], rows: [], affected_row_count: Number(info.changes), last_insert_rowid: null } } };
      } catch (e) { return { type: "error", error: { message: e.message } }; }
    });
    return new Response(JSON.stringify({ baton: null, base_url: null, results }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("адаптер Turso: схема, запись, чтение, целые/текст/null", async () => {
  const db = createTurso({ url: "libsql://demo-db.turso.io", token: "TOKEN", fetchImpl: await fakeTurso() });
  const app = createApp({ db, env: { ADMIN_PASSWORD: "pw" } });
  const call = async (method, url, body) => {
    const r = await app({ method, url, headers: {}, body: body ? JSON.stringify(body) : "", ip: "x" });
    return { status: r.status, data: JSON.parse(r.body) };
  };
  const s = await call("POST", "/api/attempts", { name: "Тест Турсо", group: "Т1" });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const o = await call("POST", `/api/attempts/${s.data.attemptId}/open`);
  assert.equal(o.data.question.position, 0);
  const a = await call("POST", `/api/attempts/${s.data.attemptId}/answer`, { position: 0, option: "c" });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const st = await call("GET", `/api/attempts/${s.data.attemptId}`);
  assert.equal(st.data.position, 1);
  assert.equal(typeof st.data.score, "number");
});
