/**
 * Смена стажёра — сюжетная часть. Состояние загружается с сервера один раз (GET /attempts/:id), дальше
 * обновляется по ответам сервера — без лишних запросов между делами. Модуль решает, какую сцену показать:
 * пролог → титр главы → дела → итог главы → … → дедукция → финал.
 * Каждая сцена — функция, которая рисует экран и возвращает Promise, завершающийся по действию игрока.
 */
import { html, mount, $, $$, sleep, toast, prefersReducedMotion } from "../ui/dom.js";
import { PEOPLE, portrait, avatar } from "../ui/characters.js";
import { speaker, ratingTable } from "../ui/components.js";
import { typewriter, countUp, confetti, floatPoints } from "../ui/fx.js";
import { api, withRetry } from "../core/api.js";
import { store } from "../core/store.js";
import { go } from "../router.js";
import { PROLOGUE, CHAPTER_INTROS, DEDUCTION_INTRO, PRAISE, SCOLD, TIMEOUT_LINES, RANK_NOTES, pick } from "../story.js";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

export default async function game(ctx) {
  const id = store.attemptId();
  if (!id) { go("/badge", { replace: true }); return; }

  const cleanups = new Set();
  const alive = () => ctx.isCurrent();
  const onKey = handler => { document.addEventListener("keydown", handler); const off = () => document.removeEventListener("keydown", handler); cleanups.add(off); return off; };

  const setBar = s => ctx.bar(html`<span class="chip">${avatar(s.player.avatar)}<span>${s.player.name}</span></span><span class="score-pill" id="bar-score">${s.score}</span>`);

  async function load() {
    try { return await withRetry(() => api.attempt(id)); }
    catch (e) {
      if (e.code === "NOT_FOUND") { store.clearAttempt(); go("/badge", { replace: true }); return null; }
      fatal(e); return null;
    }
  }

  function fatal(e) {
    mount(ctx.root, html`<div class="wrap"><div class="sheet"><h2>Связь прервалась</h2><p class="err">${e.message}</p>
      <button class="btn" id="again">Повторить</button></div></div>`);
    $("#again").onclick = () => run();
  }

  /* ---------------- Главный цикл ---------------- */
  async function run() {
    let s = await load();
    while (s && alive()) {
      setBar(s);
      if (s.phase === "done") { await endingScene(s); return; }

      // Итоги главы, которые игрок ещё не видел (в том числе после перезагрузки страницы)
      const pendingOutro = s.chapters.find(c => c.finished && !store.seen(id, "outro" + c.n));
      if (pendingOutro) { await outroScene(pendingOutro, s); store.markSeen(id, "outro" + pendingOutro.n); continue; }

      if (s.phase === "deduction") {
        if (!store.seen(id, "dedintro")) { await cutscene(DEDUCTION_INTRO, "Главное дело"); store.markSeen(id, "dedintro"); }
        s = await deductionScene(s);
        continue;
      }

      const ch = s.chapters.find(c => s.position >= c.start && s.position < c.start + c.size);
      if (!s.question && ch && s.position === ch.start) {
        if (ch.n === 1 && !store.seen(id, "prologue")) { await cutscene(PROLOGUE, "Пролог"); store.markSeen(id, "prologue"); }
        if (!store.seen(id, "intro" + ch.n)) { await chapterCard(ch); store.markSeen(id, "intro" + ch.n); }
      }
      if (!alive()) return;
      let q = s.question;
      if (!q) {
        const slow = setTimeout(() => alive() && opening(s, ch), 120); // заглушка, только если сервер задумался
        let o;
        try { o = await withRetry(() => api.open(id)); } catch (e) { clearTimeout(slow); return fatal(e); }
        clearTimeout(slow);
        if (o.state) { s = o.state; continue; }
        q = o.question;
      }
      const r = await caseScene(q, s, ch);
      if (!r) { s = await load(); continue; } // ответ уже был засчитан в другой вкладке — берём свежее состояние
      applyAnswer(s, r);
    }
  }

  /** Обновить состояние по ответу сервера — без повторной загрузки. */
  function applyAnswer(s, r) {
    s.history = [...s.history.slice(0, r.position), r.correct];
    s.score = r.score;
    s.correct += r.correct ? 1 : 0;
    s.position = r.position + 1;
    s.question = null;
    if (r.chapterEnd) s.chapters = s.chapters.map(c => (c.n === r.chapterEnd.n ? r.chapterEnd : c));
    if (r.finished) { s.phase = "deduction"; s.suspects = r.suspects; }
  }

  /** Заглушка на время открытия папки. */
  function opening(s, ch) {
    mount(ctx.root, html`<div class="wrap"><article class="folder skeleton" data-tab="Дело № ${s.position + 1} · глава ${ch ? ch.n : ""}">
      <div class="boot" style="min-height:240px"><span class="spinner"></span>Открываю папку…</div></article></div>`);
  }

  /* ---------------- Катсцена с диалогом ---------------- */
  function cutscene(lines, label) {
    return new Promise(resolve => {
      let i = 0, tw = null;
      mount(ctx.root, html`<section class="scene-dark cutscene"><div class="dust" aria-hidden="true"></div>
        <div class="cutscene-inner">
          <p class="cut-label">${label}</p>
          <div class="dialog" id="dlg" role="button" tabindex="0" aria-label="Дальше">
            <div class="portrait" id="por"></div>
            <div class="dialog-box"><p class="who" id="who"></p><p class="line" id="line" aria-live="polite"></p><span class="dialog-next">▼ нажмите, чтобы продолжить</span></div>
          </div>
          <div class="cut-actions"><button class="skip" id="skip">Пропустить</button><button class="btn tag small" id="nxt">Дальше</button></div>
        </div></section>`);
      const show = () => {
        const l = lines[i], p = PEOPLE[l.who];
        const por = $("#por"); mount(por, portrait(p, l.mood || "neutral"));
        por.style.animation = "none"; void por.offsetWidth; por.style.animation = "";
        mount($("#who"), html`<b>${p.name}</b>, <span class="muted">${p.role}</span>`);
        tw = typewriter($("#line"), l.text);
      };
      const advance = () => {
        if (tw && $("#line").textContent.length < lines[i].text.length) { tw.finish(); return; }
        i++;
        if (i >= lines.length) { off(); resolve(); } else show();
      };
      const off = onKey(e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advance(); } if (e.key === "Escape") { off(); resolve(); } });
      $("#dlg").onclick = advance; $("#nxt").onclick = advance;
      $("#skip").onclick = () => { tw?.finish(); off(); resolve(); };
      show();
      $("#nxt").focus({ preventScroll: true });
    });
  }

  /* ---------------- Титр главы ---------------- */
  function chapterCard(ch) {
    return new Promise(resolve => {
      const line = (CHAPTER_INTROS[ch.n] || [])[0];
      mount(ctx.root, html`<section class="scene-dark chapter-card"><div class="dust" aria-hidden="true"></div>
        <div>
          <div class="chapter-num" aria-hidden="true">${ch.n}</div>
          <p class="chapter-label">Глава ${ch.n} из 4</p>
          <h1 class="chapter-title">${ch.title}</h1>
          <p class="chapter-place">${ch.place} · ${ch.size} дел</p>
          <div class="rule-line"></div>
          ${line ? html`<div class="dialog-box enter enter-5" style="max-width:560px;margin:0 auto 24px;text-align:left;min-height:0">
            <p class="who"><b>${PEOPLE[line.who].name}</b>, <span class="muted">${PEOPLE[line.who].role}</span></p><p class="line" style="min-height:0">${line.text}</p></div>` : ""}
          <button class="btn tag" id="go">Открыть первое дело</button>
        </div></section>`);
      $("#go").onclick = resolve;
      $("#go").focus({ preventScroll: true });
    });
  }

  /* ---------------- Дело ---------------- */
  function caseScene(q, s, ch) {
    return new Promise(resolve => {
      const total = s.total;
      let answered = false, raf = 0;
      const deadline = performance.now() + q.timeLeftMs;
      const C = 2 * Math.PI * 24;
      const rail = s.chapters.map(c => html`<div class="rail-ch" style="--size:${c.size}">${Array.from({ length: c.size }, (_, k) => {
        const pos = c.start + k;
        const cls = pos < s.history.length ? (s.history[pos] ? "ok" : "bad") : pos === q.position ? "now" : "";
        return html`<span class="rail-dot ${cls}"></span>`;
      })}</div>`);

      mount(ctx.root, html`<div class="wrap">
        <div class="hud">
          <div class="rail" role="img" aria-label="Дело ${q.position + 1} из ${total}">${rail}</div>
          <div class="timer-ring" id="ring" role="timer" aria-label="Осталось секунд">
            <svg viewBox="0 0 58 58"><circle class="track" cx="29" cy="29" r="24"/><circle class="prog" id="prog" cx="29" cy="29" r="24" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
            <span id="sec">${Math.ceil(q.timeLeftMs / 1000)}</span>
          </div>
        </div>
        <article class="folder" data-tab="Дело № ${q.position + 1} · глава ${ch ? ch.n : ""}">
          <h2>${q.title}</h2>
          ${speaker(q.who, q.story)}
          <p class="question">${q.question}</p>
          <div class="opts" id="opts">${q.options.map((o, k) => html`<button class="opt" data-opt="${o.id}"><b>${LETTERS[k]}</b><span>${o.text}</span></button>`)}</div>
          <div id="after"></div>
        </article></div>`);

      const ring = $("#ring"), prog = $("#prog"), sec = $("#sec");
      const tick = () => {
        const left = Math.max(0, deadline - performance.now());
        prog.setAttribute("stroke-dashoffset", String(C * (1 - left / q.timeLimitMs)));
        sec.textContent = Math.ceil(left / 1000);
        ring.classList.toggle("low", left < 10_000 && !prefersReducedMotion());
        if (left <= 0) { submit(null); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      cleanups.add(() => cancelAnimationFrame(raf));

      async function submit(option) {
        if (answered) return;
        answered = true;
        cancelAnimationFrame(raf);
        ring.classList.remove("low");
        const btns = $$(".opt", ctx.root);
        btns.forEach(b => { b.disabled = true; b.classList.toggle("pending", b.dataset.opt === option); });
        $(".folder").classList.add("checking");
        let r;
        try { r = await withRetry(() => api.answer(id, q.position, option)); }
        catch (e) {
          if (e.code === "STALE" || e.code === "FINISHED") { resolve(null); return; } // ответ уже засчитан (например, с другой вкладки)
          toast(e.message); answered = false; $(".folder")?.classList.remove("checking");
          btns.forEach(b => { b.disabled = false; b.classList.remove("pending"); }); raf = requestAnimationFrame(tick); return;
        }
        if (!alive()) return;
        $(".folder").classList.remove("checking");
        btns.forEach(b => b.classList.remove("pending"));
        btns.forEach(b => b.classList.add(b.dataset.opt === r.correctOption ? "right" : b.dataset.opt === r.chosen ? "wrong" : "dim"));
        const stamp = document.createElement("div");
        stamp.className = "stamp " + (r.correct ? "ok" : "bad");
        stamp.textContent = r.correct ? "Верно" : r.timeout ? "Время вышло" : "Ошибка";
        $(".folder").appendChild(stamp);
        const scoreEl = $("#bar-score");
        if (scoreEl) countUp(scoreEl, r.score, { from: +scoreEl.textContent || 0, ms: 700 });
        floatPoints(btns.find(b => b.dataset.opt === r.correctOption) || $(".folder"), r.correct ? `+${r.points}` : "+0", !r.correct);
        const correctLetter = LETTERS[q.options.findIndex(o => o.id === r.correctOption)];
        const last = q.position + 1 >= total;
        const label = r.chapterEnd ? "Итоги главы" : last ? "К главному делу" : "Следующее дело";
        mount($("#after"), html`<div class="review">
          <p class="points-fly ${r.correct ? "" : "bad"}">${r.correct ? `+${r.points} баллов` : `Правильный ответ: ${correctLetter}`}</p>
          ${speaker("mentor", `${r.correct ? pick(PRAISE) : r.timeout ? pick(TIMEOUT_LINES) : pick(SCOLD)} ${r.explain}`, { mood: r.correct ? "happy" : "sad", quote: false })}
          <button class="btn" id="next">${label}</button></div>`);
        const nb = $("#next");
        nb.onclick = () => { offKeys(); resolve(r); };
        nb.focus({ preventScroll: true });
        nb.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
      }

      $("#opts").addEventListener("click", e => { const b = e.target.closest("[data-opt]"); if (b && !b.disabled) submit(b.dataset.opt); });
      const offKeys = onKey(e => {
        if (e.target.tagName === "INPUT") return;
        const n = parseInt(e.key, 10);
        if (!answered && n >= 1 && n <= q.options.length) submit(q.options[n - 1].id);
      });
    });
  }

  /* ---------------- Итоги главы: улика ---------------- */
  function outroScene(ch, s) {
    return new Promise(async resolve => {
      const need = Math.ceil(ch.size / 2);
      mount(ctx.root, html`<section class="scene-dark"><div class="dust" aria-hidden="true"></div><div class="wrap outro">
        <p class="chapter-label">Глава ${ch.n} закрыта · ${ch.title}</p>
        <p class="tally"><span id="tally">0</span> / ${ch.size}</p>
        <p class="muted">дел решено верно</p>
        <div class="clue-wrap"><div class="clue-card" id="clue">
          <div class="clue-face clue-back">${ch.clue ? "Улика найдена…" : html`<span class="clue-locked">Улика не найдена.<br><small>Нужно было решить хотя бы ${need} из ${ch.size}.</small></span>`}</div>
          ${ch.clue ? html`<div class="clue-face clue-front"><p class="clue-kicker">Улика № ${ch.n}</p><h3>${ch.clue.title}</h3><p>${ch.clue.text}</p></div>` : ""}
        </div></div>
        <button class="btn tag" id="go">${ch.n < s.chapters.length ? "Следующая глава" : "К главному делу"}</button>
      </div></section>`);
      countUp($("#tally"), ch.correct, { ms: 700 });
      $("#go").onclick = resolve;
      if (ch.clue) { await sleep(900); $("#clue")?.classList.add("flipped"); }
      $("#go")?.focus({ preventScroll: true });
    });
  }

  /* ---------------- Доска улик ---------------- */
  function boardHtml(s) {
    return html`<div class="board" id="board"><svg class="strings" id="strings" aria-hidden="true"></svg><div class="board-grid">
      ${s.chapters.map(c => c.clue
        ? html`<div class="pin-card" data-pin><p class="ch">Глава ${c.n}</p><h3>${c.clue.title}</h3><p>${c.clue.text}</p></div>`
        : html`<div class="pin-card locked"><p class="ch">Глава ${c.n}</p><h3>Улика не найдена</h3><p>В этой главе решено меньше половины дел.</p></div>`)}
    </div></div>`;
  }
  function drawStrings() {
    const board = $("#board"), svg = $("#strings");
    if (!board || !svg) return;
    const b = board.getBoundingClientRect();
    const pts = $$("[data-pin]", board).map(el => { const r = el.getBoundingClientRect(); return [r.left - b.left + r.width / 2, r.top - b.top + 2]; });
    svg.setAttribute("viewBox", `0 0 ${b.width} ${b.height}`);
    svg.innerHTML = pts.slice(1).map((p, i) => {
      const a = pts[i], mx = (a[0] + p[0]) / 2, my = Math.max(a[1], p[1]) + 40;
      return `<path d="M${a[0]},${a[1]} Q${mx},${my} ${p[0]},${p[1]}"/>`;
    }).join("");
  }

  /* ---------------- Дедукция ---------------- */
  function deductionScene(s) {
    return new Promise(resolve => {
      let chosen = null;
      mount(ctx.root, html`<div class="wrap">
        <p class="small enter">Главное дело</p>
        <h1 class="enter enter-2">${s.mainCase.title}</h1>
        <p class="enter enter-3">${s.mainCase.summary}</p>
        ${boardHtml(s)}
        <h2 class="enter enter-4">Кто вынес конверт?</h2>
        <div class="suspects">${s.suspects.map(x => {
          const p = PEOPLE[x.person];
          return html`<button class="suspect" data-s="${x.id}" aria-pressed="false">${portrait(p)}<b>${p.name}</b><small>${p.role}</small><small>${x.motive}</small></button>`;
        })}</div>
        <p class="err" id="derr"></p>
        <button class="btn" id="accuse" disabled>Выберите подозреваемого</button>
      </div>`);
      requestAnimationFrame(drawStrings);
      const onResize = () => drawStrings();
      addEventListener("resize", onResize); cleanups.add(() => removeEventListener("resize", onResize));
      $(".suspects").addEventListener("click", e => {
        const b = e.target.closest("[data-s]"); if (!b) return;
        chosen = b.dataset.s;
        $$("[data-s]").forEach(x => x.setAttribute("aria-pressed", x === b));
        const btn = $("#accuse"); btn.disabled = false;
        btn.textContent = "Предъявить обвинение: " + PEOPLE[s.suspects.find(x => x.id === chosen).person].name;
      });
      $("#accuse").onclick = async () => {
        $("#accuse").disabled = true; $("#derr").className = "err pending"; $("#derr").textContent = "Бакыт Асанович изучает доводы…";
        try {
          const next = await withRetry(() => api.deduction(id, chosen));
          await revealScene(next);
          resolve(next);
        } catch (e) { $("#accuse").disabled = false; $("#derr").className = "err"; $("#derr").textContent = e.message; }
      };
    });
  }

  async function revealScene(s) {
    const solved = s.result.solved;
    mount(ctx.root, html`<section class="scene-dark chapter-card"><div>
      <p class="drumroll">Проверка версии…</p>
    </div></section>`);
    await sleep(1400);
    if (!alive()) return;
    mount(ctx.root, html`<section class="scene-dark chapter-card"><div>
      <p class="chapter-label">Главное дело</p>
      <h1 class="chapter-title" style="color:${solved ? "var(--tag)" : "#F06A61"}">${s.result.ending.title}</h1>
    </div></section>`);
    if (solved) confetti(90);
    await sleep(1400);
  }

  /* ---------------- Финал ---------------- */
  async function endingScene(s) {
    const r = s.result, mood = r.rank === "lead" || r.rank === "expert" ? "happy" : r.rank === "witness" ? "sad" : "neutral";
    const me = { name: s.player.name, group: s.player.group };
    mount(ctx.root, html`<section class="scene-dark"><div class="dust" aria-hidden="true"></div>
      <div class="wrap ending">
        <p class="chapter-label">Смена окончена</p>
        <p class="verdict ${r.solved ? "solved" : ""}">${r.ending.title}</p>
        <p class="ending-text">${r.ending.text}</p>
        <div class="rank-medal"><div><b id="final-score">0</b><br><span>баллов</span></div></div>
        <h2>${r.title}</h2>
        <p class="ending-text">${RANK_NOTES[r.rank] || ""}</p>
        <p class="stats-line">Верно ${r.correct} из ${r.total} · ${Math.floor(r.duration / 60)} мин ${r.duration % 60} с${r.place ? ` · место ${r.place} из ${r.players}` : ""}</p>
        <div class="sheet">
          <h3>Рейтинг экспертов</h3><div id="lb"><p class="muted">Загружаю…</p></div>
          <div class="row"><a class="btn" href="#/rating">Весь рейтинг</a><button class="btn ghost" id="home">На главную</button></div>
        </div>
      </div></section>`);
    countUp($("#final-score"), r.score, { ms: 1400 });
    if (r.solved) setTimeout(() => alive() && confetti(), 600);
    $("#home").onclick = () => { store.clearAttempt(); go("/"); };
    try {
      const lb = await api.leaderboard();
      if (alive()) mount($("#lb"), ratingTable(lb.rows, me, 10));
    } catch { if (alive()) mount($("#lb"), html`<p class="muted">Рейтинг сейчас недоступен.</p>`); }
  }

  run();
  return () => cleanups.forEach(f => f());
}
