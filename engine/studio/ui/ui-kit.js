// UI KIT: the small set of building blocks every studio screen uses. No framework: plain DOM, one helper (h) to build it.
//
//   h('div.card#id', { onclick, class: 'extra', style: { gap: '8px' }, 'aria-label': '...' }, 'text', otherNode, [list], null)
//
// Text is always inserted as text (never as HTML), so a gift's words can never break the page.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an element. "tag.class.class#id" is shorthand; `on*` attributes are listeners; null / false children are skipped. */
export function h(spec, attrs = {}, ...children) {
  const m = /^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i.exec(spec);
  const node = document.createElement(m?.[1] || 'div');
  for (const part of (m?.[2] ?? '').match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') node.classList.add(part.slice(1)); else node.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') node.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

export const clear = (node) => { node.replaceChildren(); return node; };
export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
export const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const clone = (v) => structuredClone(v);
export const humanize = (s) => { const t = String(s).replace(/[_-]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };

// ------------------------------------------------------------------ icons (24x24, stroke)
const ICONS = {
  plus: 'M12 5v14M5 12h14', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3', upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  play: 'M8 5l11 7-11 7z', pause: 'M8 5v14M16 5v14', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01', music: 'M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3', redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  phone: 'M7 3h10v18H7zM11 18h2', check: 'M5 13l4 4L19 7', alert: 'M12 4l10 17H2zM12 10v5M12 18h.01', info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 11v6M12 7.5h.01',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01', arrowRight: 'M5 12h14M13 6l6 6-6 6', arrowLeft: 'M19 12H5M11 6l-6 6 6 6', close: 'M6 6l12 12M18 6L6 18',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', copy: 'M9 9h11v11H9zM5 15V4h11', folder: 'M3 6h6l2 2h10v11H3z', download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', refresh: 'M20 12a8 8 0 11-3-6.2M20 4v5h-5',
  gift: 'M4 9h16v4H4zM6 13h12v7H6zM12 9v11M12 9c-2-4-6-3-5 0 1 2 5 0 5 0zM12 9c2-4 6-3 5 0-1 2-5 0-5 0z', heart: 'M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z',
  moon: 'M20 14A8 8 0 1110 4a7 7 0 0010 10z', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3', unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 017-2.5', tent: 'M3 20L12 4l9 16zM12 4v16', letter: 'M3 6h18v12H3zM3 7l9 7 9-7',
};
export function icon(name, size = 18) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] ?? ICONS.sparkle);
  svg.append(path);
  return svg;
}

// ------------------------------------------------------------------ controls
/** A button. variant: primary | secondary | ghost | danger. */
export function btn(label, { variant = 'secondary', icon: ic, onClick, title, disabled, small, type = 'button' } = {}) {
  return h(`button.btn.btn-${variant}${small ? '.btn-small' : ''}`, { type, title, 'aria-label': label || title || null, disabled, onclick: onClick }, ic ? icon(ic, small ? 15 : 18) : null, label ? h('span', {}, label) : null);
}

/** A labelled form row. `control` is any node. */
export function field(label, control, { hint, error, wide } = {}) {
  const id = control.id || `f${Math.random().toString(36).slice(2, 8)}`;
  if (!control.id && /^(input|select|textarea)$/i.test(control.tagName)) control.id = id;
  return h(`div.field${wide ? '.field-wide' : ''}${error ? '.field-error' : ''}`, {},
    h('label', { for: control.id || null }, label), control, hint ? h('p.hint', {}, hint) : null, error ? h('p.error', { role: 'alert' }, error) : null);
}
export const input = (opts = {}) => h('input', { type: 'text', ...opts, oninput: opts.oninput });
export const textarea = ({ rows = 4, ...opts } = {}) => h('textarea', { rows, ...opts });
export const select = (options, { value, onchange, ...rest } = {}) => {
  const el = h('select', { onchange, ...rest }, options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, humanize(o)]; return h('option', { value: v, selected: v === value }, l); }));
  if (value !== undefined) el.value = value;
  return el;
};
export function toggle(label, checked, onChange, { hint } = {}) {
  const box = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('label.toggle', {}, box, h('span.toggle-track', {}, h('span.toggle-dot')), h('span.toggle-text', {}, label, hint ? h('small', {}, hint) : null));
}
export const chip = (text, { kind = '', onClick, title } = {}) => h(`${onClick ? 'button' : 'span'}.chip${kind ? `.chip-${kind}` : ''}`, { type: onClick ? 'button' : null, onclick: onClick, title }, text);
export const badge = (text, kind = 'neutral') => h(`span.badge.badge-${kind}`, {}, text);

// ------------------------------------------------------------------ feedback
let toastHost;
/** A short message at the bottom of the screen. kind: info | success | error. */
export function toast(message, kind = 'info', ms = 3200) {
  toastHost ??= document.body.appendChild(h('div.toasts', { role: 'status', 'aria-live': 'polite' }));
  const t = h(`div.toast.toast-${kind}`, {}, icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info', 16), message);
  toastHost.append(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 250); }, ms);
}

/** A modal dialog. Returns { close }. `body` is a node; `actions` is a list of buttons. Escape and the backdrop close it. */
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const previous = document.activeElement;
  const close = () => { document.removeEventListener('keydown', onKey); backdrop.remove(); previous?.focus?.(); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h(`div.modal${wide ? '.modal-wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header.modal-head', {}, h('h2', {}, title), btn('', { variant: 'ghost', icon: 'close', title: 'Close', onClick: close })),
    h('div.modal-body', {}, body), actions.length ? h('footer.modal-foot', {}, actions) : null);
  const backdrop = h('div.modal-backdrop', { onmousedown: (e) => { if (e.target === backdrop) close(); } }, box);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  (box.querySelector('input, textarea, select') ?? box.querySelector('.btn-primary'))?.focus();
  return { close, box };
}

/** Ask before doing something that cannot be undone. Resolves true / false. */
export function confirmBox({ title, message, confirm = 'Yes', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { answered = true; m.close(); resolve(v); };
    const m = modal({
      title, body: h('p', {}, message),
      actions: [btn(cancel, { onClick: () => done(false) }), btn(confirm, { variant: danger ? 'danger' : 'primary', onClick: () => done(true) })],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied', 'success', 1500); } catch { toast('Could not copy. Select it and copy by hand.', 'error'); }
}

/** A drag-and-drop zone that also opens the file picker. onFiles gets an array of File. */
export function dropZone({ label, accept, multiple = true, onFiles, compact = false }) {
  const pick = h('input', { type: 'file', multiple, accept, hidden: true, onchange: (e) => { onFiles([...e.target.files]); e.target.value = ''; } });
  const zone = h(`div.dropzone${compact ? '.dropzone-compact' : ''}`, {
    tabindex: 0, role: 'button', 'aria-label': label,
    onclick: () => pick.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } },
    ondragover: (e) => { e.preventDefault(); zone.classList.add('is-over'); }, ondragleave: () => zone.classList.remove('is-over'),
    ondrop: (e) => { e.preventDefault(); zone.classList.remove('is-over'); onFiles([...e.dataTransfer.files]); },
  }, icon('upload', compact ? 18 : 28), h('strong', {}, label), compact ? null : h('span', {}, 'or click to choose'), pick);
  return zone;
}
