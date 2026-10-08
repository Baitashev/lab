/** Вход руководителя: пароль из переменной окружения ADMIN_PASSWORD, сессия в HttpOnly-cookie. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError, parseCookies, setCookie } from "./http.js";

export const SESSION_COOKIE = "lab_admin";
const SESSION_DAYS = 30;
const MAX_FAILS = 8, LOCK_MS = 10 * 60_000;

const sha256 = s => createHash("sha256").update(String(s)).digest();
const hex = s => sha256(s).toString("hex");

export function createAuth({ db, env, now }) {
  const secure = !env.INSECURE_COOKIES;

  async function login(password, ip) {
    if (!env.ADMIN_PASSWORD) throw new HttpError(503, "NO_ADMIN_PASSWORD", "Пароль руководителя не задан: добавьте ADMIN_PASSWORD в настройках сервера.");
    const lock = await db.get("SELECT count, until FROM login_fails WHERE ip = ?", [ip]);
    if (lock && lock.count >= MAX_FAILS && lock.until > now()) throw new HttpError(429, "RATE", "Слишком много неверных попыток. Подождите 10 минут.");
    if (!timingSafeEqual(sha256(password), sha256(env.ADMIN_PASSWORD))) {
      await db.run(`INSERT INTO login_fails (ip, count, until) VALUES (?, 1, ?)
        ON CONFLICT(ip) DO UPDATE SET count = CASE WHEN until < ? THEN 1 ELSE count + 1 END, until = ?`, [ip, now() + LOCK_MS, now(), now() + LOCK_MS]);
      throw new HttpError(401, "BAD_PASSWORD", "Неверный пароль.");
    }
    await db.run("DELETE FROM login_fails WHERE ip = ?", [ip]);
    await db.run("DELETE FROM sessions WHERE expires_at < ?", [now()]);
    const token = randomBytes(32).toString("base64url");
    await db.run("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)", [hex(token), now() + SESSION_DAYS * 864e5]);
    return setCookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure });
  }

  async function logout(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await db.run("DELETE FROM sessions WHERE token_hash = ?", [hex(token)]);
    return setCookie(SESSION_COOKIE, "", { maxAge: 0, secure });
  }

  async function logoutAll() { await db.run("DELETE FROM sessions"); return setCookie(SESSION_COOKIE, "", { maxAge: 0, secure }); }

  /** Проверка сессии + защита от CSRF: изменяющие запросы должны нести заголовок X-Lab. */
  async function require(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) throw new HttpError(401, "AUTH", "Нужно войти в кабинет.");
    const s = await db.get("SELECT expires_at FROM sessions WHERE token_hash = ?", [hex(token)]);
    if (!s || s.expires_at < now()) throw new HttpError(401, "AUTH", "Сессия истекла — войдите снова.");
    if (req.method !== "GET" && req.headers["x-lab"] !== "1") throw new HttpError(403, "CSRF", "Запрос отклонён.");
  }

  return { login, logout, logoutAll, require };
}
