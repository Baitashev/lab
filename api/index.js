/** Точка входа для Vercel: все запросы /api/* попадают сюда (см. vercel.json). */
import { createApp } from "../server/app.js";
import { getDb } from "../server/db/index.js";

let app = null;

/** Vercel переписывает /api/* на /api/index?__path=*, восстанавливаем исходный адрес. */
function originalUrl(raw) {
  const u = new URL(raw, "http://x");
  const path = u.searchParams.get("__path");
  if (path == null) return u.pathname + u.search;
  u.searchParams.delete("__path");
  const qs = u.searchParams.toString();
  return "/api/" + path.replace(/^\/+/, "") + (qs ? "?" + qs : "");
}

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return "";
  if (req.body !== undefined) return req.body;
  if (typeof req[Symbol.asyncIterator] !== "function") return "";
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  try {
    app ??= createApp({ db: await getDb(process.env), env: process.env });
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress;
    const out = await app({ method: req.method, url: originalUrl(req.url), headers: req.headers, body: await readBody(req), ip });
    res.statusCode = out.status;
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.end(out.body);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: { code: "SETUP", message: e.message } }));
  }
}
