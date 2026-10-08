/** Сквозные тесты API на базе SQLite в памяти: `npm test` */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { createSqlite } from "../server/db/sqlite.js";
import { CHAPTERS } from "../server/game/rules.js";

async function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, tick: ms => { t += ms; } };
  const db = await createSqlite(":memory:");
  const app = createApp({ db, env: { ADMIN_PASSWORD: "pw" }, now: clock.now });
  let cookie = "";
  const call = async (method, url, body, headers = {}) => {
    const res = await app({ method, url, headers: { cookie, ...headers }, body: body ? JSON.stringify(body) : "", ip: "1.1.1.1" });
    if (res.headers["set-cookie"]) cookie = res.headers["set-cookie"].split(";")[0];
    return { status: res.status, data: res.headers["content-type"]?.includes("json") ? JSON.parse(res.body) : res.body };
  };
  return { call, clock, db };
}

async function playAll(call, clock, id, pick = () => "a") {
  let last;
  for (let i = 0; i < 17; i++) {
    const { data: o } = await call("POST", `/api/attempts/${id}/open`);
    clock.tick(5000);
    last = await call("POST", `/api/attempts/${id}/answer`, { position: o.question.position, option: pick(o.question, i) });
    assert.equal(last.status, 200, JSON.stringify(last.data));
  }
  return last.data;
}

test("полный проход: выдача, ответы, главы, улики, дедукция, рейтинг", async () => {
  const { call, clock } = await setup();
  const s = await call("POST", "/api/attempts", { name: "Асанова Айжан", group: "юр-21", avatar: 2 });
  assert.equal(s.status, 201);
  const id = s.data.attemptId;

  const st = await call("GET", `/api/attempts/${id}`);
  assert.equal(st.data.phase, "question");
  assert.equal(st.data.question, null, "время не идёт, пока дело не открыто");

  const o = await call("POST", `/api/attempts/${id}/open`);
  assert.equal(o.data.question.options.length, 4);
  assert.ok(!JSON.stringify(o.data).includes("\"correct\""), "правильный ответ не уходит в браузер");

  // Подбираем правильный вариант через ответ сервера (как это видит игрок после ответа)
  clock.tick(1000);
  const first = await call("POST", `/api/attempts/${id}/answer`, { position: 0, option: "a" });
  assert.equal(first.status, 200);
  assert.ok(first.data.correctOption);
  const dup = await call("POST", `/api/attempts/${id}/answer`, { position: 0, option: "a" });
  assert.equal(dup.status, 409, "повторный ответ не засчитывается");

  let chapterEnds = 0;
  for (let i = 1; i < 17; i++) {
    const { data } = await call("POST", `/api/attempts/${id}/open`);
    clock.tick(3000);
    const r = await call("POST", `/api/attempts/${id}/answer`, { position: i, option: "b" });
    if (r.data.chapterEnd) chapterEnds++;
    if (i === 16) assert.equal(r.data.finished, true);
  }
  assert.equal(chapterEnds, CHAPTERS.length, "каждая глава завершается итогом");
  const before = await call("GET", `/api/attempts/${id}`);
  assert.equal(before.data.phase, "deduction");
  assert.equal(before.data.suspects.length, 4);

  const d = await call("POST", `/api/attempts/${id}/deduction`, { suspect: "gulzat" });
  assert.equal(d.data.phase, "done");
  assert.equal(d.data.result.solved, true);
  assert.equal(d.data.result.place, 1);

  const lb = await call("GET", "/api/leaderboard");
  assert.equal(lb.data.rows.length, 1);
  assert.equal(lb.data.rows[0].name, "Асанова Айжан");
  assert.ok(!("playerId" in lb.data.rows[0]));
});

test("одна попытка, продолжение, разрешение руководителя", async () => {
  const { call, clock } = await setup();
  const a = await call("POST", "/api/attempts", { name: "Иванов Иван", group: "ЮР-22" });
  const again = await call("POST", "/api/attempts", { name: "иванов  иван", group: "юр-22" });
  assert.equal(again.data.attemptId, a.data.attemptId, "незаконченная попытка продолжается");
  assert.equal(again.data.resumed, true);

  await playAll(call, clock, a.data.attemptId);
  await call("POST", `/api/attempts/${a.data.attemptId}/deduction`, { suspect: "timur" });
  const blocked = await call("POST", "/api/attempts", { name: "Иванов Иван", group: "ЮР-22" });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.error.code, "BLOCKED");

  assert.equal((await call("GET", "/api/admin/overview")).status, 401);
  assert.equal((await call("POST", "/api/admin/login", { password: "no" })).status, 401);
  assert.equal((await call("POST", "/api/admin/login", { password: "pw" })).status, 200);
  const ov = await call("GET", "/api/admin/overview");
  assert.equal(ov.status, 200);
  const p = ov.data.players[0];
  assert.equal(p.used, 1); assert.equal(p.allowed, 1);
  assert.equal((await call("POST", `/api/admin/players/${p.id}/grant`)).status, 403, "без заголовка X-Lab — отказ (CSRF)");
  assert.equal((await call("POST", `/api/admin/players/${p.id}/grant`, null, { "x-lab": "1" })).status, 200);
  const ok = await call("POST", "/api/attempts", { name: "Иванов Иван", group: "ЮР-22" });
  assert.equal(ok.status, 201);
});

test("тайм-аут засчитывается сервером, даже если игрок ушёл", async () => {
  const { call, clock } = await setup();
  const { data } = await call("POST", "/api/attempts", { name: "Петров Пётр", group: "ЮР-21" });
  await call("POST", `/api/attempts/${data.attemptId}/open`);
  clock.tick(60_000);
  const st = await call("GET", `/api/attempts/${data.attemptId}`);
  assert.equal(st.data.position, 1);
  const late = await call("POST", `/api/attempts/${data.attemptId}/answer`, { position: 0, option: "a" });
  assert.equal(late.status, 409);
});

test("баллы: скорость влияет на бонус, дедукция добавляет бонус", async () => {
  const { call, clock } = await setup();
  const { data } = await call("POST", "/api/attempts", { name: "Быстрый Игрок", group: "Г1" });
  const id = data.attemptId;
  let score = 0;
  for (let i = 0; i < 17; i++) {
    await call("POST", `/api/attempts/${id}/open`);
    const r = await call("POST", `/api/attempts/${id}/answer`, { position: i, option: "a" });
    score += r.data.points;
    assert.equal(r.data.score, score);
    if (r.data.correct) assert.equal(r.data.points, 150);
  }
  const d = await call("POST", `/api/attempts/${id}/deduction`, { suspect: "gulzat" });
  assert.equal(d.data.result.score, score + 150);
});
