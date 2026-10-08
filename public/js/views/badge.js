/** Оформление пропуска: имя, группа, аватар → начало (или продолжение) смены. */
import { html, mount, $, on, toast, sleep } from "../ui/dom.js";
import { AVATARS, avatar } from "../ui/characters.js";
import { speaker, errorLine } from "../ui/components.js";
import { api } from "../core/api.js";
import { store } from "../core/store.js";
import { go } from "../router.js";

export default function badge(ctx) {
  const p = store.player();
  let chosen = Math.min(p.avatar || 0, AVATARS.length - 1);
  mount(ctx.root, html`
    <div class="wrap">
      <div class="badge-layout">
        <div class="sheet enter">
          <h1>Пропуск стажёра</h1>
          ${speaker("mentor", "Заполните пропуск. По фамилии, имени и группе вас найдут в рейтинге — пишите так, как в журнале.", { quote: false })}
          <form id="f" novalidate>
            <div class="field"><label for="nm">Фамилия и имя</label><input id="nm" autocomplete="name" maxlength="60" value="${p.name}" placeholder="Асанова Айжан"></div>
            <div class="field"><label for="gr">Группа</label><input id="gr" maxlength="30" value="${p.group}" placeholder="ЮР-21"></div>
            <p class="small" id="avl">Фото на пропуск</p>
            <div class="avatars" role="radiogroup" aria-labelledby="avl">
              ${AVATARS.map((_, i) => html`<button type="button" class="av" data-av="${i}" role="radio" aria-checked="${i === chosen}" aria-label="Аватар ${i + 1}">${avatar(i, "happy")}</button>`)}
            </div>
            ${errorLine()}
            <div class="row"><button class="btn" type="submit" id="go">Выйти на смену</button><a class="btn ghost" href="#/">Назад</a></div>
          </form>
        </div>
        <div class="badge-card" id="card" aria-hidden="true">
          <div class="strap"></div><div class="hole"></div>
          <div class="badge-body"><span id="b-av">${avatar(chosen, "happy")}</span>
            <div><p class="badge-org">Республиканский центр судебных экспертиз</p><p class="badge-name" id="b-name">${p.name || "Фамилия Имя"}</p><p class="badge-role">Стажёр-эксперт</p></div></div>
          <div class="badge-foot"><span>Группа: <b id="b-gr">${p.group || "—"}</b></span><span>№ ${String(Date.now()).slice(-5)}</span></div>
          <div class="badge-stamp">Допущен</div>
        </div>
      </div>
    </div>`);

  const sync = () => {
    $("#b-name").textContent = $("#nm").value.trim() || "Фамилия Имя";
    $("#b-gr").textContent = $("#gr").value.trim().toUpperCase() || "—";
  };
  $("#nm").addEventListener("input", sync); $("#gr").addEventListener("input", sync);
  const off = on(ctx.root, "click", "[data-av]", (_, b) => {
    chosen = +b.dataset.av;
    ctx.root.querySelectorAll("[data-av]").forEach(x => x.setAttribute("aria-checked", x === b));
    mount($("#b-av"), avatar(chosen, "happy"));
  });

  $("#f").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#nm").value.trim().replace(/\s+/g, " "), group = $("#gr").value.trim().replace(/\s+/g, " ");
    const err = $(".err");
    if (name.length < 3 || !name.includes(" ")) { err.textContent = "Нужны фамилия и имя через пробел."; $("#nm").focus(); return; }
    if (!group) { err.textContent = "Укажите группу."; $("#gr").focus(); return; }
    store.setPlayer({ name, group, avatar: chosen });
    $("#go").disabled = true; err.className = "err pending"; err.textContent = "Оформляю пропуск…";
    try {
      const r = await api.start({ name, group, avatar: chosen });
      store.setAttemptId(r.attemptId);
      err.textContent = "";
      $("#card").classList.add("approved");
      await sleep(550);
      $("#card").classList.add("leave");
      if (r.resumed) toast("Продолжаем вашу незаконченную смену");
      await sleep(900);
      if (ctx.isCurrent()) go("/play");
    } catch (ex) {
      if (!ctx.isCurrent()) return;
      $("#go").disabled = false; err.className = "err";
      if (ex.code === "BLOCKED") return blocked(ctx, name);
      err.textContent = ex.message;
    }
  });
  return off;
}

function blocked(ctx, name) {
  mount(ctx.root, html`<div class="wrap"><div class="sheet enter">
    <h1>Смена уже отработана</h1>
    ${speaker("mentor", `${name}, вы уже проходили проверку. Ещё одну попытку может разрешить руководитель лаборатории — попросите его, а потом вернитесь сюда.`, { mood: "sad", quote: false })}
    <div class="row"><a class="btn" href="#/badge" id="retry">Попробовать снова</a><a class="btn ghost" href="#/rating">Рейтинг</a></div>
  </div></div>`);
  $("#retry").onclick = e => { e.preventDefault(); badge(ctx); };
}
