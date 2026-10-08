/** Адаптер Netlify: веб-стандартные Request/Response. */
import { test } from "node:test";
import assert from "node:assert/strict";

test("netlify/functions/api.mjs обслуживает /api/*", async () => {
  process.env.SQLITE_FILE = ":memory:";
  process.env.ADMIN_PASSWORD = "pw";
  const { default: fn, config } = await import("../netlify/functions/api.mjs");
  assert.equal(config.path, "/api/*");
  const cfg = await fn(new Request("https://lab.netlify.app/api/config"), { ip: "1.2.3.4" });
  assert.equal(cfg.status, 200);
  assert.equal((await cfg.json()).total, 17);
  const start = await fn(new Request("https://lab.netlify.app/api/attempts", { method: "POST", body: JSON.stringify({ name: "Тест Нетлифая", group: "Н1" }) }), {});
  assert.equal(start.status, 201);
  const login = await fn(new Request("https://lab.netlify.app/api/admin/login", { method: "POST", body: JSON.stringify({ password: "pw" }) }), { ip: "1.2.3.4" });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict; Secure/);
});
