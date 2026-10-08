/** Память устройства: текущая попытка, данные пропуска и просмотренные сцены. Только удобства — всё важное на сервере. */
const PREFIX = "lab.v1.";
const get = (k, d = null) => { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* приватный режим */ } };
const del = k => { try { localStorage.removeItem(PREFIX + k); } catch { /* ignore */ } };

export const store = {
  player: () => get("player", { name: "", group: "", avatar: 0 }),
  setPlayer: p => set("player", p),
  attemptId: () => get("attempt"),
  setAttemptId: id => set("attempt", id),
  clearAttempt: () => del("attempt"),
  /** Какие катсцены уже показаны в этой попытке — чтобы не повторять их после перезагрузки. */
  seen(attemptId, key) { return !!get("seen", {})[attemptId + ":" + key]; },
  markSeen(attemptId, key) { const s = get("seen", {}); s[attemptId + ":" + key] = 1; set("seen", s); },
};
