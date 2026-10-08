/** Связь с бэкендом (/api). Ошибки приходят как ApiError с кодом и понятным текстом. */
export class ApiError extends Error {
  constructor(status, code, message, data = {}) { super(message); this.status = status; this.code = code; this.data = data; }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: { "content-type": "application/json", "x-lab": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Нет связи с лабораторией. Проверьте интернет и попробуйте ещё раз.");
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const e = data.error || {};
    throw new ApiError(res.status, e.code || "HTTP_" + res.status, e.message || "Сервер не ответил. Попробуйте ещё раз.", e);
  }
  return data;
}

export const api = {
  config: () => request("GET", "/config"),
  start: player => request("POST", "/attempts", player),
  attempt: id => request("GET", `/attempts/${id}`),
  open: id => request("POST", `/attempts/${id}/open`),
  answer: (id, position, option) => request("POST", `/attempts/${id}/answer`, { position, option }),
  deduction: (id, suspect) => request("POST", `/attempts/${id}/deduction`, { suspect }),
  leaderboard: group => request("GET", "/leaderboard" + (group ? "?group=" + encodeURIComponent(group) : "")),
  admin: {
    login: password => request("POST", "/admin/login", { password }),
    logout: () => request("POST", "/admin/logout"),
    logoutAll: () => request("POST", "/admin/logout-all"),
    me: () => request("GET", "/admin/me"),
    overview: group => request("GET", "/admin/overview" + (group ? "?group=" + encodeURIComponent(group) : "")),
    grant: playerId => request("POST", `/admin/players/${playerId}/grant`),
    grantAll: () => request("POST", "/admin/grant-all"),
    deleteAttempt: id => request("DELETE", `/admin/attempts/${id}`),
    exportUrl: "/api/admin/export.csv",
  },
};

/** Повтор при обрыве сети (до 3 раз, с паузой). */
export async function withRetry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (e.code !== "NETWORK" || i >= tries - 1) throw e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
}
