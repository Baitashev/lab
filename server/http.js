/** Ответы, ошибки и cookie — независимо от того, где запущен сервер (локально или на Vercel). */
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

export function json(status, data, headers = {}) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
    body: JSON.stringify(data),
  };
}

export function text(status, body, headers = {}) {
  return { status, headers: { "cache-control": "no-store", ...headers }, body };
}

export function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map(p => p.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}

export function setCookie(name, value, { maxAge, secure = true } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Strict", secure && "Secure", maxAge != null && `Max-Age=${maxAge}`]
    .filter(Boolean).join("; ");
}

/** Тело запроса: Vercel может отдать его уже разобранным, локальный сервер — строкой. */
export function parseBody(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Buffer.isBuffer(raw)) return raw;
  try { return JSON.parse(String(raw)); } catch { throw new HttpError(400, "BAD_JSON", "Неверный формат запроса"); }
}
