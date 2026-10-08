/** Адаптер Vercel: восстановление адреса после rewrite и проброс ответа. */
import { test } from "node:test";
import assert from "node:assert/strict";

test("api/index.js отвечает через Node-подобные req/res", async () => {
  process.env.SQLITE_FILE = ":memory:";
  process.env.ADMIN_PASSWORD = "pw";
  const { default: handler } = await import("../api/index.js");
  const call = (url, method = "GET", body) => new Promise(resolve => {
    const headers = {};
    const res = { statusCode: 0, setHeader: (k, v) => { headers[k] = v; }, end: b => resolve({ status: res.statusCode, headers, body: JSON.parse(b) }) };
    handler({ method, url, headers: {}, body, socket: {} }, res);
  });
  const viaRewrite = await call("/api/index?__path=leaderboard&group=%D0%AE%D0%A0");
  assert.equal(viaRewrite.status, 200);
  assert.deepEqual(viaRewrite.body.rows, []);
  const direct = await call("/api/config");
  assert.equal(direct.body.total, 17);
  const start = await call("/api/index?__path=attempts", "POST", { name: "Тест Верселя", group: "В1" });
  assert.equal(start.status, 201);
});
