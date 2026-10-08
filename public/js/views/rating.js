/** Публичный рейтинг экспертов с фильтром по группе. */
import { html, mount, $ } from "../ui/dom.js";
import { ratingTable } from "../ui/components.js";
import { api } from "../core/api.js";
import { store } from "../core/store.js";

export default async function rating(ctx) {
  let group = "";
  const me = store.player();
  mount(ctx.root, html`<div class="wrap"><div class="sheet enter">
    <div class="lb-head"><h1>Рейтинг экспертов</h1><span id="filter"></span></div>
    <p class="muted">У каждого учитывается лучшая смена. ✓ — раскрыл главное дело.</p>
    <div id="lb"><p class="muted">Загружаю…</p></div>
    <a class="btn ghost" href="#/">На главную</a></div></div>`);
  async function load() {
    try {
      const d = await api.leaderboard(group);
      if (!ctx.isCurrent()) return;
      if (d.groups.length > 1) {
        mount($("#filter"), html`<select class="select" id="grp" aria-label="Группа"><option value="">Все группы</option>${d.groups.map(g => html`<option ${g === group ? html`selected` : ""}>${g}</option>`)}</select>`);
        $("#grp").onchange = e => { group = e.target.value; load(); };
      }
      mount($("#lb"), ratingTable(d.rows, me.name ? me : null, 200));
    } catch (e) { if (ctx.isCurrent()) mount($("#lb"), html`<p class="err">${e.message}</p>`); }
  }
  load();
}
