/** Кабинет руководителя: вход по паролю (сессия в HttpOnly-cookie), затем панель. */
import { html, mount, $ } from "../../ui/dom.js";
import { api } from "../../core/api.js";
import dashboard from "./dashboard.js";

export default async function admin(ctx) {
  ctx.bar(html`<span>Кабинет руководителя</span>`);
  mount(ctx.root, html`<div class="boot"><span class="spinner"></span>Проверяю доступ…</div>`);
  try { await api.admin.me(); return dashboard(ctx); }
  catch (e) { if (e.code !== "AUTH") return loginView(ctx, e.message); return loginView(ctx); }
}

export function loginView(ctx, message = "") {
  mount(ctx.root, html`<section class="scene-dark title-scene"><div class="lamp"></div>
    <div class="title-inner" style="max-width:460px">
      <p class="kicker">Только для руководителя</p>
      <h1 style="font-size:clamp(40px,8vw,64px)">Кабинет</h1>
      <form id="lf" class="sheet" style="color:var(--text)" novalidate>
        <div class="field"><label for="pw">Пароль</label><input id="pw" type="password" autocomplete="current-password"></div>
        <p class="err" role="alert">${message}</p>
        <button class="btn" type="submit" id="in">Войти</button>
      </form>
    </div></section>`);
  $("#pw").focus();
  $("#lf").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $(".err");
    $("#in").disabled = true; err.className = "err pending"; err.textContent = "Проверяю…";
    try { await api.admin.login($("#pw").value); if (ctx.isCurrent()) dashboard(ctx); }
    catch (ex) { $("#in").disabled = false; err.className = "err"; err.textContent = ex.message; }
  });
}
