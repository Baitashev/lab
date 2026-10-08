/**
 * Бэкенд «Экспертной лаборатории». Не зависит от платформы: принимает простой объект запроса
 * { method, url, headers, body, ip } и возвращает { status, headers, body }.
 * Запускается локально (server/local.js) и как функция Vercel (api/index.js).
 */
import { randomUUID } from "node:crypto";
import { HttpError, json, text, parseBody } from "./http.js";
import { ensureSchema } from "./db/schema.js";
import { createAuth } from "./auth.js";
import { RULES, CHAPTERS, TOTAL_CASES, chapterBounds, chapterAt, pointsFor, rankFor } from "./game/rules.js";
import { buildDeck, CASES, TOPICS } from "./game/deck.js";
import { MAIN_CASE, CLUES, SUSPECTS, CULPRIT, ENDINGS } from "./game/story.js";

const AVATAR_COUNT = 8;
const norm = s => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const clean = (s, max) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export function createApp({ db, env = {}, now = () => Date.now(), rnd = Math.random }) {
  const auth = createAuth({ db, env, now });

  /* ------------------------------ Попытки ------------------------------ */

  async function loadAttempt(id) {
    const a = await db.get(`SELECT a.*, p.name, p.group_name, p.avatar FROM attempts a JOIN players p ON p.id = a.player_id WHERE a.id = ?`, [id]);
    if (!a) throw new HttpError(404, "NOT_FOUND", "Попытка не найдена. Начните заново с главной страницы.");
    a.deck = JSON.parse(a.deck);
    return a;
  }

  async function chapterProgress(attemptId, rows = null) {
    rows ??= await db.all("SELECT position, correct FROM answers WHERE attempt_id = ? ORDER BY position", [attemptId]);
    return chapterBounds().map(ch => {
      const inCh = rows.filter(r => r.position >= ch.start && r.position <= ch.end);
      const correct = inCh.reduce((s, r) => s + Number(r.correct), 0);
      const finished = inCh.length === ch.size;
      const unlocked = finished && correct >= Math.ceil(ch.size / 2);
      return { n: ch.n, title: ch.title, place: ch.place, size: ch.size, start: ch.start, answered: inCh.length, correct, finished, clue: unlocked ? CLUES[ch.n] : null };
    });
  }

  function questionOf(a) {
    const item = a.deck[a.position], c = CASES.get(item.id);
    return {
      position: a.position, chapter: chapterAt(a.position)?.n, caseId: c.id,
      who: c.who, title: c.title, story: c.story, question: c.question,
      options: item.order.map((orig, k) => ({ id: RULES.OPTION_IDS[k], text: c.options[orig] })),
      timeLimitMs: RULES.TIME_LIMIT_MS,
      timeLeftMs: Math.max(0, RULES.TIME_LIMIT_MS - (now() - a.shown_at)),
    };
  }

  const expired = a => a.shown_at != null && now() - a.shown_at > RULES.TIME_LIMIT_MS + RULES.GRACE_MS;

  /** Записать ответ (или тайм-аут). Атомарно: позиция сдвигается, только если её никто не сдвинул раньше. */
  async function record(a, optionId) {
    const pos = a.position, item = a.deck[pos], c = CASES.get(item.id);
    const ms = now() - a.shown_at;
    const late = ms > RULES.TIME_LIMIT_MS + RULES.GRACE_MS;
    const k = optionId == null ? -1 : RULES.OPTION_IDS.indexOf(optionId);
    if (optionId != null && (k < 0 || k >= item.order.length)) throw new HttpError(400, "BAD_OPTION", "Такого варианта нет.");
    const orig = !late && k >= 0 ? item.order[k] : null;
    const correct = orig === 0;
    const points = pointsFor(correct, ms);
    const upd = await db.run(
      `UPDATE attempts SET position = position + 1, shown_at = NULL, score = score + ?, correct = correct + ?
       WHERE id = ? AND position = ? AND status = 'active'`, [points, correct ? 1 : 0, a.id, pos]);
    if (!upd.changes) throw new HttpError(409, "STALE", "Этот ответ уже засчитан.");
    await db.run(`INSERT INTO answers (attempt_id, position, case_id, option_index, correct, ms, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, pos, item.id, orig, correct ? 1 : 0, Math.min(ms, RULES.TIME_LIMIT_MS), points, now()]);
    a.position = pos + 1; a.shown_at = null; a.score += points; a.correct += correct ? 1 : 0;
    return {
      position: pos, correct, timeout: late || k < 0, chosen: late ? null : optionId,
      correctOption: RULES.OPTION_IDS[item.order.indexOf(0)], points, explain: c.explain, score: a.score,
    };
  }

  /** Если игрок ушёл и время вышло — засчитываем тайм-аут, чтобы нельзя было «подумать» вне игры. */
  async function settleTimeouts(a) {
    if (a.status === "active" && a.position < a.total && expired(a)) {
      try { await record(a, null); } catch (e) { if (e.code !== "STALE") throw e; return loadAttempt(a.id); }
    }
    return a;
  }

  async function stateOf(a) {
    const rows = await db.all("SELECT position, correct FROM answers WHERE attempt_id = ? ORDER BY position", [a.id]);
    const chapters = await chapterProgress(a.id, rows);
    const phase = a.status === "done" ? "done" : a.position < a.total ? "question" : "deduction";
    return {
      id: a.id, status: a.status, phase,
      player: { name: a.name, group: a.group_name, avatar: a.avatar },
      position: a.position, total: a.total, score: a.score, correct: a.correct,
      chapters, mainCase: MAIN_CASE, history: rows.map(r => !!r.correct),
      question: phase === "question" && a.shown_at != null ? questionOf(a) : null,
      suspects: phase === "deduction" ? SUSPECTS : null,
      result: phase === "done" ? await resultOf(a) : null,
    };
  }

  async function resultOf(a) {
    const rank = rankFor(a.correct, a.total);
    const board = await leaderboardRows();
    const place = board.findIndex(r => r.playerId === a.player_id) + 1;
    return {
      score: a.score, correct: a.correct, total: a.total, rank: rank.id, title: a.title || rank.title,
      deduction: a.deduction, solved: !!a.deduction_correct, ending: ENDINGS[a.deduction_correct ? "solved" : "missed"],
      duration: Math.round(((a.finished_at || now()) - a.started_at) / 1000), place, players: board.length,
    };
  }

  /* ------------------------------ Рейтинг ------------------------------ */

  async function leaderboardRows(group = null) {
    const rows = await db.all(`
      SELECT p.id AS playerId, p.name, p.group_name AS "group", p.avatar, a.score, a.correct, a.total, a.title,
             a.deduction_correct AS solved, (a.finished_at - a.started_at) AS durationMs
      FROM attempts a JOIN players p ON p.id = a.player_id
      WHERE a.status = 'done' ${group ? "AND p.group_name = ?" : ""}
      ORDER BY a.score DESC, durationMs ASC`, group ? [group] : []);
    const seen = new Set();
    return rows.filter(r => !seen.has(r.playerId) && seen.add(r.playerId))
      .map(r => ({ ...r, solved: !!r.solved, duration: Math.round(r.durationMs / 1000) }));
  }

  /* ------------------------------ Обработчики ------------------------------ */

  const handlers = {
    async health() {
      await db.get("SELECT 1 AS ok");
      return json(200, { ok: true, db: db.kind, adminConfigured: !!env.ADMIN_PASSWORD, cases: CASES.size });
    },

    async config() {
      return json(200, {
        timeLimitMs: RULES.TIME_LIMIT_MS, total: TOTAL_CASES, avatars: AVATAR_COUNT, deductionBonus: RULES.DEDUCTION_BONUS,
        chapters: CHAPTERS.map(({ n, title, place, size }) => ({ n, title, place, size })), mainCase: MAIN_CASE,
      });
    },

    async start(req) {
      const b = parseBody(req.body);
      const name = clean(b.name, 60), group = clean(b.group, 30).toUpperCase();
      const avatar = Math.min(Math.max(Math.round(Number(b.avatar)) || 0, 0), AVATAR_COUNT - 1);
      if (name.length < 3 || !/\s/.test(name)) throw new HttpError(400, "BAD_NAME", "Укажите фамилию и имя через пробел.");
      if (!group) throw new HttpError(400, "BAD_GROUP", "Укажите группу.");
      const key = norm(name) + "|" + norm(group);

      // При повторном входе меняется только аватар: имя остаётся в том написании, как в первый раз
      await db.run(`INSERT INTO players (key, name, group_name, avatar, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET avatar = excluded.avatar`,
        [key, name, group, avatar, now()]);
      const player = await db.get("SELECT id FROM players WHERE key = ?", [key]);

      // Незаконченная попытка продолжается — даже с другого устройства
      const active = await db.get("SELECT id FROM attempts WHERE player_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1", [player.id]);
      if (active) return json(200, { attemptId: active.id, resumed: true });

      const id = randomUUID();
      const ins = await db.run(`
        INSERT INTO attempts (id, player_id, deck, total, started_at)
        SELECT ?, ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM attempts WHERE player_id = ?) <
              ? + (SELECT extra_attempts FROM players WHERE id = ?)
                + COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'extra_all'), 0)`,
        [id, player.id, JSON.stringify(buildDeck(rnd)), TOTAL_CASES, now(), player.id, RULES.BASE_ATTEMPTS, player.id]);
      if (!ins.changes) throw new HttpError(409, "BLOCKED", "Вы уже проходили проверку. Ещё одну попытку может разрешить руководитель лаборатории.");
      return json(201, { attemptId: id, resumed: false });
    },

    async getAttempt(req, [id]) {
      const a = await settleTimeouts(await loadAttempt(id));
      return json(200, await stateOf(a));
    },

    /** Открыть следующее дело — с этого момента идёт время. Повторный вызов возвращает то же дело. */
    async open(req, [id]) {
      let a = await settleTimeouts(await loadAttempt(id));
      if (a.status !== "active" || a.position >= a.total) return json(200, await stateOf(a));
      if (a.shown_at == null) {
        await db.run("UPDATE attempts SET shown_at = ? WHERE id = ? AND shown_at IS NULL AND status = 'active'", [now(), id]);
        a = await loadAttempt(id);
      }
      return json(200, { question: questionOf(a), score: a.score, position: a.position, total: a.total });
    },

    async answer(req, [id]) {
      const b = parseBody(req.body);
      const a = await loadAttempt(id);
      if (a.status !== "active") throw new HttpError(409, "FINISHED", "Проверка уже завершена.");
      if (Number(b.position) !== a.position || a.shown_at == null) throw new HttpError(409, "STALE", "Это дело уже закрыто.", { position: a.position });
      const result = await record(a, b.option ?? null);
      const ch = chapterAt(result.position);
      let chapterEnd = null;
      if (ch && result.position === ch.end) {
        chapterEnd = (await chapterProgress(a.id)).find(c => c.n === ch.n);
      }
      return json(200, { ...result, chapterEnd, finished: a.position >= a.total });
    },

    async deduction(req, [id]) {
      const b = parseBody(req.body);
      const a = await loadAttempt(id);
      if (a.status === "done") return json(200, await stateOf(a));
      if (a.position < a.total) throw new HttpError(409, "NOT_READY", "Сначала закончите все дела.");
      if (!SUSPECTS.some(s => s.id === b.suspect)) throw new HttpError(400, "BAD_SUSPECT", "Выберите подозреваемого.");
      const solved = b.suspect === CULPRIT;
      const finishedAt = now();
      await db.run(`UPDATE attempts SET status = 'done', deduction = ?, deduction_correct = ?, score = score + ?, title = ?, finished_at = ?
        WHERE id = ? AND status = 'active'`,
        [b.suspect, solved ? 1 : 0, solved ? RULES.DEDUCTION_BONUS : 0, rankFor(a.correct, a.total).title, finishedAt, id]);
      return json(200, await stateOf(await loadAttempt(id)));
    },

    async leaderboard(req, _, url) {
      const group = url.searchParams.get("group") || null;
      const [rows, groups] = await Promise.all([
        leaderboardRows(group),
        db.all("SELECT DISTINCT p.group_name AS g FROM players p JOIN attempts a ON a.player_id = p.id WHERE a.status = 'done' ORDER BY g"),
      ]);
      return json(200, { rows: rows.slice(0, 200).map(({ playerId, durationMs, ...r }) => r), groups: groups.map(g => g.g) });
    },

    /* ------------------------------ Руководитель ------------------------------ */

    async adminLogin(req) {
      const b = parseBody(req.body);
      const cookie = await auth.login(String(b.password || ""), req.ip || "?");
      return json(200, { ok: true }, { "set-cookie": cookie });
    },
    async adminLogout(req) { return json(200, { ok: true }, { "set-cookie": await auth.logout(req) }); },
    async adminLogoutAll(req) { await auth.require(req); return json(200, { ok: true }, { "set-cookie": await auth.logoutAll() }); },
    async adminMe(req) { await auth.require(req); return json(200, { ok: true }); },

    async overview(req, _, url) {
      await auth.require(req);
      const group = url.searchParams.get("group") || null;
      const where = group ? "WHERE p.group_name = ?" : "", args = group ? [group] : [];
      const [players, attempts, caseStats, extraAllRow, groupRows] = await Promise.all([
        db.all(`SELECT p.id, p.name, p.group_name AS "group", p.avatar, p.extra_attempts AS extra FROM players p ${where} ORDER BY p.name`, args),
        db.all(`SELECT a.id, a.player_id AS playerId, a.status, a.position, a.total, a.score, a.correct, a.title, a.deduction_correct AS solved,
                       a.started_at AS startedAt, a.finished_at AS finishedAt FROM attempts a JOIN players p ON p.id = a.player_id ${where}`, args),
        db.all(`SELECT ans.case_id AS id, COUNT(*) AS n, SUM(ans.correct) AS ok FROM answers ans
                JOIN attempts t ON t.id = ans.attempt_id JOIN players p ON p.id = t.player_id ${where} GROUP BY ans.case_id`, args),
        db.get("SELECT value FROM settings WHERE key = 'extra_all'"),
        db.all("SELECT DISTINCT group_name AS g FROM players ORDER BY g"),
      ]);
      const extraAll = Number(extraAllRow?.value || 0);
      const byPlayer = new Map(players.map(p => [p.id, { ...p, attempts: [] }]));
      for (const a of attempts) byPlayer.get(a.playerId)?.attempts.push({ ...a, solved: !!a.solved, duration: a.finishedAt ? Math.round((a.finishedAt - a.startedAt) / 1000) : null });
      const list = [...byPlayer.values()].map(p => {
        const done = p.attempts.filter(a => a.status === "done").sort((x, y) => y.score - x.score || x.duration - y.duration);
        return { ...p, used: p.attempts.length, allowed: RULES.BASE_ATTEMPTS + p.extra + extraAll, best: done[0] || null,
          active: p.attempts.find(a => a.status === "active") || null };
      }).sort((x, y) => (y.best?.score ?? -1) - (x.best?.score ?? -1) || (x.best?.duration ?? 1e9) - (y.best?.duration ?? 1e9));

      const finished = list.filter(p => p.best);
      const topics = {};
      const cases = caseStats.filter(s => CASES.has(s.id)).map(s => {
        const c = CASES.get(s.id);
        topics[c.topic] = topics[c.topic] || { n: 0, ok: 0 };
        topics[c.topic].n += s.n; topics[c.topic].ok += Number(s.ok);
        return { id: s.id, title: c.title, n: s.n, pct: Math.round(100 * s.ok / s.n) };
      });
      return json(200, {
        summary: {
          players: list.length, attempts: attempts.length, finished: finished.length,
          active: list.filter(p => p.active).length,
          avgScore: finished.length ? Math.round(finished.reduce((s, p) => s + p.best.score, 0) / finished.length) : 0,
          solvedPct: finished.length ? Math.round(100 * finished.filter(p => p.best.solved).length / finished.length) : 0,
        },
        players: list, extraAll, groups: groupRows.map(g => g.g),
        topics: Object.entries(topics).map(([t, s]) => ({ title: TOPICS[t] || t, n: s.n, pct: Math.round(100 * s.ok / s.n) })).sort((a, b) => a.pct - b.pct),
        hardest: cases.filter(c => c.n >= 2).sort((a, b) => a.pct - b.pct || b.n - a.n).slice(0, 10),
      });
    },

    async grant(req, [playerId]) {
      await auth.require(req);
      const r = await db.run("UPDATE players SET extra_attempts = extra_attempts + 1 WHERE id = ?", [Number(playerId)]);
      if (!r.changes) throw new HttpError(404, "NOT_FOUND", "Игрок не найден.");
      return json(200, { ok: true });
    },

    async grantAll(req) {
      await auth.require(req);
      await db.run(`INSERT INTO settings (key, value) VALUES ('extra_all', '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`);
      return json(200, { ok: true });
    },

    async deleteAttempt(req, [id]) {
      await auth.require(req);
      await db.run("DELETE FROM answers WHERE attempt_id = ?", [id]);
      const r = await db.run("DELETE FROM attempts WHERE id = ?", [id]);
      if (!r.changes) throw new HttpError(404, "NOT_FOUND", "Попытка не найдена.");
      return json(200, { ok: true });
    },

    async exportCsv(req) {
      await auth.require(req);
      const rows = await db.all(`SELECT p.name, p.group_name, a.status, a.score, a.correct, a.total, a.title, a.deduction_correct,
        a.started_at, a.finished_at FROM attempts a JOIN players p ON p.id = a.player_id ORDER BY p.group_name, a.score DESC`);
      const head = ["Имя", "Группа", "Статус", "Баллы", "Верно", "Всего", "Звание", "Главное дело", "Начало", "Время, с"];
      const iso = t => t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) : "";
      const lines = [head, ...rows.map(r => [r.name, r.group_name, r.status === "done" ? "завершена" : "не завершена", r.score, r.correct, r.total,
        r.title || "", r.status === "done" ? (r.deduction_correct ? "раскрыто" : "не раскрыто") : "", iso(r.started_at),
        r.finished_at ? Math.round((r.finished_at - r.started_at) / 1000) : ""])];
      const csv = "\ufeff" + lines.map(l => l.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
      return text(200, csv, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="rezultaty.csv"' });
    },
  };

  const ID = "([0-9a-fA-F-]{36})";
  const routes = [
    ["GET", /^\/api\/health$/, handlers.health],
    ["GET", /^\/api\/config$/, handlers.config],
    ["POST", /^\/api\/attempts$/, handlers.start],
    ["GET", new RegExp(`^/api/attempts/${ID}$`), handlers.getAttempt],
    ["POST", new RegExp(`^/api/attempts/${ID}/open$`), handlers.open],
    ["POST", new RegExp(`^/api/attempts/${ID}/answer$`), handlers.answer],
    ["POST", new RegExp(`^/api/attempts/${ID}/deduction$`), handlers.deduction],
    ["GET", /^\/api\/leaderboard$/, handlers.leaderboard],
    ["POST", /^\/api\/admin\/login$/, handlers.adminLogin],
    ["POST", /^\/api\/admin\/logout$/, handlers.adminLogout],
    ["POST", /^\/api\/admin\/logout-all$/, handlers.adminLogoutAll],
    ["GET", /^\/api\/admin\/me$/, handlers.adminMe],
    ["GET", /^\/api\/admin\/overview$/, handlers.overview],
    ["POST", /^\/api\/admin\/players\/(\d+)\/grant$/, handlers.grant],
    ["POST", /^\/api\/admin\/grant-all$/, handlers.grantAll],
    ["DELETE", new RegExp(`^/api/admin/attempts/${ID}$`), handlers.deleteAttempt],
    ["GET", /^\/api\/admin\/export\.csv$/, handlers.exportCsv],
  ];

  return async function handle(req) {
    const url = new URL(req.url, "http://local");
    try {
      await ensureSchema(db);
      for (const [method, re, h] of routes) {
        const m = url.pathname.match(re);
        if (m) {
          if (req.method !== method) continue;
          return await h(req, m.slice(1), url);
        }
      }
      throw new HttpError(404, "NO_ROUTE", "Нет такого адреса API.");
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: { code: e.code, message: e.message, ...e.extra } });
      console.error(e);
      return json(500, { error: { code: "SERVER", message: "Ошибка сервера. Попробуйте ещё раз через минуту." } });
    }
  };
}
