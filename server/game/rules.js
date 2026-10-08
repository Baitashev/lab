/** Правила игры. Единственный источник истины — сервер; браузер получает их через API. */
export const RULES = Object.freeze({
  TIME_LIMIT_MS: 40_000,   // на одно дело
  GRACE_MS: 2_000,         // запас на задержку сети
  BASE_POINTS: 100,        // за верный ответ
  SPEED_BONUS: 50,         // максимум бонуса за скорость
  DEDUCTION_BONUS: 150,    // за раскрытие главного дела
  BASE_ATTEMPTS: 1,        // попыток на человека по умолчанию
  OPTION_IDS: ["a", "b", "c", "d", "e", "f"],
});

/** Сюжет из четырёх глав. Дела в каждой главе берутся случайно из своих тем. */
export const CHAPTERS = Object.freeze([
  { n: 1, title: "Первый день", place: "Республиканский центр судебных экспертиз, Бишкек", topics: ["concept", "subjects"], size: 4 },
  { n: 2, title: "Выезд", place: "Места происшествий", topics: ["forms"], size: 4 },
  { n: 3, title: "Лаборатория", place: "Отдел криминалистических исследований", topics: ["objects", "features"], size: 5 },
  { n: 4, title: "Заключение", place: "Зал судебных заседаний", topics: ["tasks", "expertise"], size: 4 },
]);
export const TOTAL_CASES = CHAPTERS.reduce((s, c) => s + c.size, 0);

/** Начало и конец главы в общей нумерации дел. */
export function chapterBounds() {
  let start = 0;
  return CHAPTERS.map(c => { const b = { ...c, start, end: start + c.size - 1 }; start += c.size; return b; });
}
export const chapterAt = position => chapterBounds().find(c => position >= c.start && position <= c.end) || null;

export function pointsFor(correct, ms) {
  if (!correct) return 0;
  const t = Math.min(Math.max(ms, 0), RULES.TIME_LIMIT_MS);
  return RULES.BASE_POINTS + Math.round(RULES.SPEED_BONUS * (RULES.TIME_LIMIT_MS - t) / RULES.TIME_LIMIT_MS);
}

const RANKS = [
  { min: 0.9, id: "lead", title: "Ведущий эксперт" },
  { min: 0.7, id: "expert", title: "Эксперт" },
  { min: 0.4, id: "specialist", title: "Специалист" },
  { min: 0, id: "witness", title: "Понятой" },
];
export const rankFor = (correct, total) => RANKS.find(r => (total ? correct / total : 0) >= r.min);
