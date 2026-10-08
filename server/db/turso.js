/**
 * Облачная база Turso (SQLite) через её HTTP API — без сторонних библиотек.
 * Документация протокола: https://docs.turso.tech/sdk/http/reference
 */
const toValue = v => {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "boolean") return { type: "integer", value: String(Number(v)) };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  return { type: "text", value: String(v) };
};
const fromValue = v => {
  switch (v?.type) {
    case "null": return null;
    case "integer": { const n = Number(v.value); return Number.isSafeInteger(n) ? n : v.value; }
    case "float": return Number(v.value);
    case "text": return v.value;
    default: return v?.value ?? null;
  }
};

export function createTurso({ url, token, fetchImpl = fetch }) {
  const base = String(url).trim().replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
  async function pipeline(stmts) {
    const body = { requests: [...stmts.map(s => ({ type: "execute", stmt: { sql: s.sql, args: (s.args || []).map(toValue) } })), { type: "close" }] };
    const res = await fetchImpl(base + "/v2/pipeline", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`База данных ответила ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.results.slice(0, stmts.length).map(r => {
      if (r.type !== "ok") throw new Error("Ошибка базы данных: " + (r.error?.message || JSON.stringify(r.error)));
      const result = r.response.result;
      const cols = result.cols.map(c => c.name);
      return {
        rows: result.rows.map(row => Object.fromEntries(row.map((v, i) => [cols[i], fromValue(v)]))),
        changes: Number(result.affected_row_count || 0),
      };
    });
  }
  return {
    kind: "turso",
    async all(sql, args = []) { return (await pipeline([{ sql, args }]))[0].rows; },
    async get(sql, args = []) { return (await pipeline([{ sql, args }]))[0].rows[0] ?? null; },
    async run(sql, args = []) { return { changes: (await pipeline([{ sql, args }]))[0].changes }; },
    /** Несколько запросов за один HTTP-запрос и на одном соединении. */
    async batch(stmts) { return pipeline(stmts); },
    async exec(script) {
      const stmts = script.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean).map(sql => ({ sql }));
      await pipeline(stmts);
    },
  };
}
