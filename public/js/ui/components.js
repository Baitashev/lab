/** Повторяющиеся куски интерфейса. */
import { html } from "./dom.js";
import { PEOPLE, portrait, avatar } from "./characters.js";

export function speaker(who, text, { mood = "neutral", quote = true } = {}) {
  const p = typeof who === "string" ? PEOPLE[who] : who;
  return html`<div class="speaker">${portrait(p, mood)}<div class="bubble">
    <p class="who"><b>${p.name}</b>, <span class="muted">${p.role}</span></p>
    <p class="${quote ? "said" : ""}">${text}</p></div></div>`;
}

export const playerCell = r => html`<span class="mini">${avatar(r.avatar)}</span>${r.name}`;

export function ratingTable(rows, me = null, limit = 10) {
  if (!rows.length) return html`<p class="muted">Пока никто не закрыл смену. Будьте первым!</p>`;
  const key = r => `${String(r.name).toLowerCase()}|${String(r.group).toLowerCase()}`;
  const myIdx = me ? rows.findIndex(r => key(r) === key(me)) : -1;
  const shown = rows.slice(0, limit).map((r, i) => ({ r, i }));
  if (myIdx >= limit) shown.push({ gap: true }, { r: rows[myIdx], i: myIdx });
  return html`<div class="tablebox"><table>
    <thead><tr><th class="num">#</th><th>Эксперт</th><th>Группа</th><th>Звание</th><th class="num">Баллы</th></tr></thead>
    <tbody>${shown.map(x => x.gap ? html`<tr><td colspan="5" class="muted">…</td></tr>` : html`
      <tr class="${x.i === myIdx ? "mine" : ""}"><td class="num">${x.i + 1}</td><td>${playerCell(x.r)}${x.r.solved ? html` <span class="solved-mark" title="Раскрыл главное дело">✓</span>` : ""}</td>
      <td>${x.r.group}</td><td>${x.r.title || ""}</td><td class="num"><b>${x.r.score}</b></td></tr>`)}</tbody></table></div>`;
}

export const errorLine = (msg = "") => html`<p class="err" role="alert">${msg}</p>`;
