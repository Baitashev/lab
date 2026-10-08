/** Набор дел для попытки: по главам, из нужных тем, варианты перемешаны на сервере. */
import bank from "../data/cases.js";
import { CHAPTERS } from "./rules.js";

export const CASES = new Map(bank.cases.map(c => [c.id, c]));
export const TOPICS = bank.topics;

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** → [{ id, order }] — order[k] = индекс варианта в options, показанного k-м. */
export function buildDeck(rnd = Math.random) {
  const used = new Set();
  const deck = [];
  for (const ch of CHAPTERS) {
    let pool = bank.cases.filter(c => ch.topics.includes(c.topic) && !used.has(c.id));
    if (pool.length < ch.size) pool = pool.concat(bank.cases.filter(c => !used.has(c.id) && !pool.includes(c)));
    for (const c of shuffle(pool, rnd).slice(0, ch.size)) {
      used.add(c.id);
      deck.push({ id: c.id, order: shuffle([...c.options.keys()], rnd) });
    }
  }
  return deck;
}
