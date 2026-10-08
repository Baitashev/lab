/** Титульный экран. */
import { html, mount } from "../ui/dom.js";
import { store } from "../core/store.js";

const words = text => text.split(" ").map((w, i) => html`<span class="w" style="animation-delay:${0.15 + i * 0.18}s">${w}</span> `);

export default function title(ctx) {
  const { mainCase, chapters, total, timeLimitMs } = ctx.config;
  const resume = !!store.attemptId();
  mount(ctx.root, html`
    <section class="scene-dark title-scene">
      <div class="lamp" aria-hidden="true"></div><div class="dust" aria-hidden="true"></div>
      <div class="title-inner">
        <p class="kicker">Учебная игра по теории судебной экспертизы КР</p>
        <h1>${words("Экспертная лаборатория")}</h1>
        <article class="case-file" aria-label="Главное дело">
          <span class="secret">Срочно</span>
          <h2>${mainCase.title}</h2>
          <p>${mainCase.summary}</p>
        </article>
        <p class="muted">${chapters.length} главы · ${total} дел · ${timeLimitMs / 1000} секунд на каждое · рейтинг группы</p>
        <div class="row title-actions">
          <a class="btn tag" href="${resume ? "#/play" : "#/badge"}">${resume ? "Продолжить смену" : "Начать смену"}</a>
          <a class="btn ghost" href="#/rating">Рейтинг экспертов</a>
        </div>
      </div>
    </section>`);
}
