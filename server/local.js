/**
 * Локальный запуск: `npm start` → http://localhost:3000
 * Отдаёт фронтенд из public/ и API из server/app.js. База — файл lab.db (или Turso, если заданы переменные).
 * Пароль руководителя: ADMIN_PASSWORD=... npm start  (по умолчанию «admin» — только для локальной проверки).
 * Этот же файл запускает игру на Render (там задана переменная RENDER): пароль и база берутся из настроек.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { getDb } from "./db/index.js";

const ROOT = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

const hosted = !!(process.env.RENDER || process.env.NODE_ENV === "production");
const env = hosted
  ? { ...process.env }                                                     // на хостинге: только настройки, никаких паролей по умолчанию
  : { ...process.env, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin", INSECURE_COOKIES: "1" };
// Если база не настроена, сайт всё равно открывается, а API объясняет, чего не хватает
let app, setupError = null;
try { app = createApp({ db: await getDb(env), env }); }
catch (e) { setupError = e; console.error(e.message); }

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      if (setupError) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: { code: "SETUP", message: setupError.message } }));
        return;
      }
      const out = await app({ method: req.method, url: req.url, headers: req.headers, body: await readBody(req), ip: (hosted && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress });
      res.writeHead(out.status, out.headers).end(out.body);
      return;
    }
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (path.endsWith("/")) path += "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    await stat(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-cache" }).end(await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Не найдено");
  }
}).listen(PORT, "0.0.0.0", () => console.log(hosted
  ? `Экспертная лаборатория запущена на порту ${PORT}`
  : `Экспертная лаборатория: http://localhost:${PORT}  (кабинет: /#/admin, пароль: ${env.ADMIN_PASSWORD === "admin" ? "admin" : "из ADMIN_PASSWORD"})`));
