/**
 * Маршрутизатор на hash: #/ , #/badge , #/play , #/rating , #/admin , #/admin/results.
 * Вид (view) — функция (ctx) => cleanup?; cleanup вызывается при уходе со страницы.
 */
const routes = new Map();
let ctx = null, cleanup = null, token = 0;

const ALIASES = { "admin": "/admin" };

export const define = (path, view) => routes.set(path, view);

export function go(path, { replace = false } = {}) {
  const hash = "#" + path;
  if (location.hash === hash) return render();
  if (replace) { history.replaceState(null, "", hash); render(); }
  else location.hash = hash;
}

function currentPath() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  return ALIASES[h] || h || "/";
}

async function render() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const my = ++token;
  const view = routes.get(currentPath()) || routes.get("/");
  ctx.bar("");
  document.body.dataset.route = currentPath();
  ctx.isCurrent = () => my === token;
  window.scrollTo(0, 0);
  ctx.root.focus({ preventScroll: true });
  try {
    const result = await view(ctx);
    if (typeof result === "function") { if (my === token) cleanup = result; else result(); }
  } catch (e) {
    console.error(e);
    ctx.root.innerHTML = `<div class="wrap"><div class="sheet"><h1>Что-то пошло не так</h1><p class="err">${String(e.message || "").replace(/[<>&]/g, "")}</p><p>Обновите страницу. Если ошибка повторяется, сообщите руководителю.</p></div></div>`;
  }
}

export function startRouter(context) {
  ctx = context;
  addEventListener("hashchange", render);
  render();
}
