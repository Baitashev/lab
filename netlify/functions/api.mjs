/** Точка входа для Netlify: все запросы /api/* попадают сюда (см. config.path ниже). */
import { createApp } from "../../server/app.js";
import { getDb } from "../../server/db/index.js";

let app = null;

export default async (req, context) => {
  try {
    app ??= createApp({ db: await getDb(process.env, { hosted: true }), env: process.env });
    const url = new URL(req.url);
    const out = await app({
      method: req.method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(req.headers),
      body: req.method === "GET" || req.method === "HEAD" ? "" : await req.text(),
      ip: context?.ip || req.headers.get("x-nf-client-connection-ip") || "?",
    });
    return new Response(out.body, { status: out.status, headers: out.headers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: { code: "SETUP", message: e.message } }, { status: 500 });
  }
};

export const config = { path: "/api/*" };
