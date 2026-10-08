/**
 * Мини-шаблонизатор: html`...` экранирует все подстановки, кроме обёрнутых в raw().
 * Так в разметку невозможно случайно вставить чужой HTML (имена игроков и т. п.).
 */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s));

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = v => v == null || v === false ? "" : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join("") : esc(v);

export function html(strings, ...values) {
  return raw(strings.reduce((out, s, i) => out + s + (i < values.length ? fmt(values[i]) : ""), ""));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(el, content) { el.innerHTML = fmt(content); }

/** Делегирование: on(root, "click", "[data-act=x]", handler) */
export function on(root, type, selector, handler) {
  const fn = e => { const t = e.target.closest(selector); if (t && root.contains(t)) handler(e, t); };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

export function toast(message) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const fmtDuration = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export function fmtDate(d) {
  const x = new Date(d);
  return isNaN(x) ? String(d ?? "") : x.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Ждать (с учётом «уменьшить движение»). */
export const sleep = ms => new Promise(r => setTimeout(r, prefersReducedMotion() ? Math.min(ms, 30) : ms));
