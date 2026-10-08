/** Панель руководителя: живое обновление, игроки, попытки, статистика по темам. */
import { html, raw, mount, $, on, toast, fmtDate, fmtDuration } from "../../ui/dom.js";
import { playerCell } from "../../ui/components.js";
import { api } from "../../core/api.js";
import { go } from "../../router.js";
import { view } from "./state.js";
import { loginView } from "./index.js";

const REFRESH_MS = 15_000;

export default function dashboard(ctx) {
  let data = null, timer = null, loading = false, updated = null;

  async function load() {
    if (loading) return;
    loading = true;
    try {
      data = await api.admin.overview(view.group);
      updated = new Date();
      if (ctx.isCurrent()) render();
    } catch (e) {
      if (e.code === "AUTH") { stop(); if (ctx.isCurrent()) loginView(ctx, e.message); }
      else toast(e.message);
    } finally { loading = false; }
  }
  const stop = () => { clearInterval(timer); timer = null; };
  const startTimer = () => { stop(); timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS); };

  function render() {
    const d = data, s = d.summary;
    const bars = items => items.length ? items.map(t => html`<div class="bar-row"><span>${t.title}</span><span class="meter"><i style="width:${t.pct}%"></i></span><span class="num">${t.pct}%</span></div>`)
      : html`<p class="muted">Появится, когда кто-нибудь ответит.</p>`;
    mount(ctx.root, html`<div class="wrap" style="max-width:1100px">
      <div class="admin-head">
        <h1>Кабинет руководителя</h1>
        <span class="live"><i></i>обновляется сам · ${updated ? updated.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}</span>
      </div>

      <div class="panel">
        <h2>Ссылка для группы</h2>
        <div class="share"><input class="select" id="share" readonly value="${location.origin}/"><button class="btn ghost small" data-act="copy">Скопировать</button></div>
      </div>

      <div class="kpis">
        <div class="kpi"><b>${s.players}</b><span>участников</span></div>
        <div class="kpi"><b>${s.active}</b><span>играют сейчас</span></div>
        <div class="kpi"><b>${s.finished}</b><span>закончили</span></div>
        <div class="kpi"><b>${s.avgScore}</b><span>средний балл</span></div>
        <div class="kpi"><b>${s.solvedPct}%</b><span>раскрыли дело</span></div>
      </div>

      <div class="toolbar">
        <a class="btn tag" href="#/admin/results">Подвести итоги</a>
        ${d.groups.length > 1 ? html`<select class="select" id="grp" aria-label="Группа"><option value="">Все группы</option>${d.groups.map(g => html`<option ${g === view.group ? html`selected` : ""}>${g}</option>`)}</select>` : ""}
        <button class="btn ghost small" data-act="refresh">Обновить</button>
        <button class="btn ghost small" data-act="grant-all">+1 попытка всем</button>
        <a class="btn ghost small" href="${api.admin.exportUrl}">Скачать CSV</a>
      </div>
      ${d.extraAll ? html`<p class="small">Всем добавлено попыток: ${d.extraAll}.</p>` : ""}

      <div class="panel">
        <h2>Игроки</h2>
        ${d.players.length ? html`<div class="tablebox"><table>
          <thead><tr><th class="num">#</th><th>Игрок</th><th>Группа</th><th class="num">Лучший балл</th><th class="num">Верно</th><th>Звание</th><th>Дело</th><th class="num">Время</th><th>Статус</th><th class="num">Попытки</th><th></th></tr></thead>
          <tbody>${d.players.map((p, i) => playerRows(p, i))}</tbody></table></div>`
          : html`<p class="muted">Пока никто не начал. Отправьте ссылку группе.</p>`}
      </div>

      <div class="two-col">
        <div class="panel"><h2>Темы</h2>${bars(d.topics)}</div>
        <div class="panel"><h2>Самые трудные дела</h2>${bars(d.hardest)}</div>
      </div>

      <div class="toolbar" style="margin-top:24px">
        <button class="btn ghost small" data-act="logout">Выйти</button>
        <button class="btn ghost small" data-act="logout-all">Выйти на всех устройствах</button>
      </div>
    </div>`);
    const grp = $("#grp");
    if (grp) grp.onchange = e => { view.group = e.target.value; load(); };
  }

  function playerRows(p, i) {
    const b = p.best, open = view.expanded.has(p.id);
    const status = p.active
      ? html`<span class="status-dot"></span>играет: дело ${p.active.position + 1} из ${p.active.total}`
      : b ? html`закончил` : html`<span class="muted">не начал</span>`;
    return html`<tr>
      <td class="num">${b ? i + 1 : "—"}</td><td>${playerCell(p)}</td><td>${p.group}</td>
      <td class="num"><b>${b ? b.score : "—"}</b></td><td class="num">${b ? `${b.correct}/${b.total}` : ""}</td><td>${b?.title || ""}</td>
      <td>${b ? (b.solved ? html`<span class="solved-mark">раскрыл</span>` : "нет") : ""}</td><td class="num">${b?.duration != null ? fmtDuration(b.duration) : ""}</td>
      <td>${status}</td><td class="num">${p.used} из ${p.allowed}</td>
      <td>${p.used >= p.allowed ? html`<button class="btn ghost small" data-act="grant" data-id="${p.id}" data-name="${p.name}">+1 попытка</button>` : html`<span class="small">может играть</span>`}
        ${p.attempts.length ? html` <button class="btn ghost small" data-act="toggle" data-id="${p.id}" aria-expanded="${open}">${open ? "Скрыть" : "Попытки"}</button>` : ""}</td></tr>
      ${open ? html`<tr><td></td><td colspan="10" class="attempts-mini">${p.attempts.sort((x, y) => y.startedAt - x.startedAt).map(a => html`
        <div>${fmtDate(a.startedAt)} — ${a.status === "done" ? `${a.score} баллов, ${a.correct}/${a.total}` : `не завершена (дело ${a.position + 1})`}
        <button data-act="delete" data-id="${a.id}">удалить</button></div>`)}</td></tr>` : ""}`;
  }

  const off = on(ctx.root, "click", "[data-act]", async (e, b) => {
    const act = b.dataset.act;
    try {
      if (act === "refresh") return load();
      if (act === "copy") { const i = $("#share"); i.select(); try { await navigator.clipboard.writeText(i.value); } catch { document.execCommand("copy"); } return toast("Ссылка скопирована"); }
      if (act === "toggle") { const id = +b.dataset.id; view.expanded.has(id) ? view.expanded.delete(id) : view.expanded.add(id); return render(); }
      if (act === "grant") { b.disabled = true; await api.admin.grant(b.dataset.id); toast(`${b.dataset.name}: разрешена ещё одна попытка`); return load(); }
      if (act === "grant-all") { if (!confirm("Разрешить каждому ещё одну попытку?")) return; await api.admin.grantAll(); toast("Всем разрешена ещё одна попытка"); return load(); }
      if (act === "delete") { if (!confirm("Удалить эту попытку безвозвратно? Игрок сможет сыграть снова.")) return; await api.admin.deleteAttempt(b.dataset.id); toast("Попытка удалена"); return load(); }
      if (act === "logout") { await api.admin.logout(); stop(); return go("/"); }
      if (act === "logout-all") { if (!confirm("Выйти на всех устройствах?")) return; await api.admin.logoutAll(); stop(); return go("/"); }
    } catch (ex) {
      if (ex.code === "AUTH") { stop(); return loginView(ctx, ex.message); }
      b.disabled = false; toast(ex.message);
    }
  });

  ctx.bar(html`<span>Кабинет руководителя</span>`);
  mount(ctx.root, html`<div class="boot"><span class="spinner"></span>Загружаю данные…</div>`);
  load(); startTimer();
  return () => { stop(); off(); };
}
