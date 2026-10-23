// Small motion helpers. None is needed to use the site, and each is skipped when the visitor prefers reduced motion.
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Add .in to elements as they scroll into view (CSS does the animation). */
export function revealOnScroll(root = document) {
  const items = root.querySelectorAll('[data-reveal]');
  if (reduced() || !('IntersectionObserver' in window)) { items.forEach((n) => n.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
  items.forEach((n) => io.observe(n));
}

/** Split a headline into words that rise one after another. Text only, never HTML. */
export function splitWords(node) {
  const words = node.textContent.trim().split(/\s+/);
  node.replaceChildren(...words.flatMap((w, i) => {
    const outer = document.createElement('span');
    outer.className = 'word';
    const inner = document.createElement('span');
    inner.textContent = w;
    inner.style.setProperty('--i', i);
    outer.append(inner);
    return [outer, document.createTextNode(' ')];
  }));
}

/** Count a number to a new value (the price). */
export function tween(node, from, to, format, ms = 450) {
  if (reduced() || from === to) { node.textContent = format(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    node.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** A burst of paper confetti over the whole screen, then it removes itself. */
export function confetti(colors = ['#ff8fb1', '#f2b61d', '#7aa7ff', '#6fd6a8', '#ffffff'], count = 70) {
  if (reduced()) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.style.cssText = `--x:${Math.random() * 100}vw;--dx:${(Math.random() - 0.5) * 40}vw;--r:${Math.round(Math.random() * 720 - 360)}deg;--d:${1.6 + Math.random() * 1.6}s;--w:${Math.random() * 0.6}s;background:${colors[i % colors.length]}`;
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4200);
}

export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
