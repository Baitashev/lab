/** Точка входа: конфигурация с сервера, маршруты, верхняя полоса. */
import { $, html, mount } from "./ui/dom.js";
import { api } from "./core/api.js";
import { define, startRouter } from "./router.js";
import title from "./views/title.js";
import badge from "./views/badge.js";
import game from "./views/game.js";
import rating from "./views/rating.js";
import admin from "./views/admin/index.js";
import ceremony from "./views/admin/ceremony.js";

async function boot() {
  const root = $("#app"), barRight = $("#bar-right");
  const ctx = { root, config: null, isCurrent: () => true, bar: content => mount(barRight, content || "") };
  try {
    ctx.config = await api.config();
  } catch (e) {
    mount(root, html`<div class="wrap"><div class="sheet"><h1>Лаборатория недоступна</h1><p class="err">${e.message}</p>
      <p class="muted">Если вы руководитель: проверьте настройки сервера (переменные TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ADMIN_PASSWORD) и откройте /api/health.</p>
      <button class="btn" onclick="location.reload()">Обновить</button></div></div>`);
    return;
  }
  define("/", title);
  define("/badge", badge);
  define("/play", game);
  define("/rating", rating);
  define("/admin", admin);
  define("/admin/results", ceremony);
  startRouter(ctx);
}
boot();
