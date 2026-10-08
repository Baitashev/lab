/** Эффекты: печатная машинка, счётчик, конфетти, всплывающие очки. Все уважают «уменьшить движение». */
import { prefersReducedMotion } from "./dom.js";

/** Печатает текст посимвольно. Возвращает { done: Promise, finish() } — finish() сразу дописывает строку. */
export function typewriter(el, text, { cps = 55 } = {}) {
  let i = 0, timer = null, resolve;
  const done = new Promise(r => { resolve = r; });
  const finish = () => { clearInterval(timer); el.textContent = text; resolve(); };
  if (prefersReducedMotion()) { finish(); return { done, finish }; }
  el.textContent = "";
  timer = setInterval(() => {
    i += 1;
    el.textContent = text.slice(0, i);
    if (i >= text.length) finish();
  }, 1000 / cps);
  return { done, finish };
}

export function countUp(el, to, { from = 0, ms = 900 } = {}) {
  if (prefersReducedMotion()) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function confetti(count = 120) {
  if (prefersReducedMotion()) return;
  const box = document.createElement("div");
  box.className = "confetti";
  const colors = ["#F2C230", "#B3261E", "#2E7D4F", "#E5CB92", "#F6F7F4", "#1F6FB2"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", (Math.random() * 200 - 100) + "px");
    p.style.setProperty("--rot", (Math.random() * 1080 - 540) + "deg");
    p.style.animationDuration = 2.2 + Math.random() * 2 + "s";
    p.style.animationDelay = Math.random() * .6 + "s";
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5000);
}

export function floatPoints(anchor, text, bad = false) {
  if (!anchor || prefersReducedMotion()) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "float-points";
  if (bad) el.style.color = "var(--stamp)";
  el.textContent = text;
  el.style.left = r.left + r.width / 2 - 20 + "px";
  el.style.top = r.top - 10 + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
