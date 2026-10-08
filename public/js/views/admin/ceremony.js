/** Подведение итогов для проектора: места открываются по одному, с барабанной дробью. */
import { html, mount, $, sleep } from "../../ui/dom.js";
import { avatar } from "../../ui/characters.js";
import { playerCell } from "../../ui/components.js";
import { confetti } from "../../ui/fx.js";
import { api } from "../../core/api.js";
import { go } from "../../router.js";
import { view } from "./state.js";

const COLUMNS = [1, 0, 2];
const HEIGHTS = { 0: 200, 1: 150, 2: 110 };

export default async function ceremony(ctx) {
  ctx.bar(html`<span>Подведение итогов</span>`);
  let top;
  try { top = (await api.admin.overview(view.group)).players.filter(p => p.best).slice(0, 10).map(p => ({ ...p.best, name: p.name, group: p.group, avatar: p.avatar })); }
  catch (e) { if (e.code === "AUTH") return go("/admin", { replace: true }); throw e; }
  if (!ctx.isCurrent()) return;
  let revealed = Math.max(0, 3 - top.length), busy = false;

  function draw(drum = false) {
    const open = i => i >= 3 - revealed;
    mount(ctx.root, html`<section class="scene-dark"><div class="wrap" style="text-align:center">
      <p class="chapter-label">${view.group ? "Группа " + view.group : "Все группы"}</p>
      <h1>Лучшие эксперты смены</h1>
      ${top.length ? html`<div class="podium">${COLUMNS.map(i => {
        const r = top[i];
        if (!r) return html`<div class="pcol"></div>`;
        return html`<div class="pcol ${i === 0 ? "first" : ""}">${open(i)
          ? html`<div class="pav">${avatar(r.avatar, "happy")}</div><p class="pname">${r.name}</p><p class="pscore">${r.group} · ${r.score} баллов</p>`
          : html`<div class="pav ghost">?</div><p class="pscore">&nbsp;</p>`}
          <div class="pstep" style="height:${HEIGHTS[i]}px">${i + 1}</div></div>`;
      })}</div>` : html`<p class="muted">Пока никто не закончил смену.</p>`}
      ${drum ? html`<p class="drumroll">Барабанная дробь…</p>` : ""}
      ${revealed >= 3 && top.length > 3 ? html`<div class="sheet" style="text-align:left"><table><tbody>${top.slice(3).map((r, j) =>
        html`<tr><td class="num">${j + 4}</td><td>${playerCell(r)}</td><td>${r.group}</td><td class="num"><b>${r.score}</b></td></tr>`)}</tbody></table></div>` : ""}
      <div class="row" style="justify-content:center;margin-top:22px">
        ${top.length && revealed < 3 ? html`<button class="btn tag" id="nx">Объявить ${3 - revealed} место</button>` : ""}
        <a class="btn ghost" href="#/admin">Вернуться в кабинет</a></div>
    </div></section>`);
    const nx = $("#nx");
    if (nx) {
      nx.focus();
      nx.onclick = async () => {
        if (busy) return; busy = true;
        draw(true); await sleep(revealed === 2 ? 1800 : 1000);
        revealed++; busy = false;
        if (ctx.isCurrent()) { draw(); if (revealed === 3) confetti(); }
      };
    }
  }
  draw();
}
