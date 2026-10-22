// Small DOM + data helpers. Importing this file must never touch `document` (so Node tools can import elements).

/** Create an element. `on<event>` attrs become listeners, `true` becomes an empty attribute. Text is always set via text nodes (never innerHTML). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Create an element tagged as a styleable part: <tag data-part="name">. Parts are the public styling API. */
export const part = (tag, name, attrs = {}, ...children) => el(tag, { 'data-part': name, ...attrs }, ...children);

/** Replace {{vars}} in a string. Unknown vars are left untouched so mistakes are visible. */
export function template(str, vars = {}) {
  return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function deepTemplate(value, vars) {
  if (typeof value === 'string') return template(value, vars);
  if (Array.isArray(value)) return value.map((v) => deepTemplate(v, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepTemplate(v, vars)]));
  }
  return value;
}

/** Deterministic PRNG (mulberry32) seeded from a string, so a gift renders identically every visit. */
export function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Load a stylesheet once (by href). Resolves when loaded or failed (never blocks the gift). */
export function ensureCss(href) {
  if (document.querySelector(`link[data-gk-css="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = el('link', { rel: 'stylesheet', href, 'data-gk-css': href });
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
}
