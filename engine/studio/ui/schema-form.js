// SCHEMA FORM: build an editing form from an element's params schema (the JSON-Schema subset the validator understands).
// This is what lets the studio edit any game, including one that is added later, without writing a screen for it.
//
//   const form = schemaForm({ schema, getParams: () => night.game.params, update: (fn, key) => ..., skip: ['answer'], problems })
//   form.el            the form
//   form.setProblems(list)   show validation messages next to the fields they are about
//
// `getParams()` always returns the CURRENT params, and `update(fn, key)` runs `fn(params)` on a copy and saves it, so the form
// never holds its own state. Text boxes are updated in place (nothing is re-rendered under the cursor); a list is rebuilt only
// when an item is added, removed or moved.
import { store } from './store.js';
import { mediaThumb, pickMedia, slotLabel } from './media-picker.js';
import { btn, chip, h, humanize, icon, input, textarea, toggle } from './ui-kit.js';
import { moveItem } from './nights-sortable.js';

export const getIn = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setIn(obj, path, value) {
  let o = obj;
  path.slice(0, -1).forEach((k, i) => { o[k] ??= typeof path[i + 1] === 'number' ? [] : {}; o = o[k]; });
  o[path.at(-1)] = value;
}
export function delIn(obj, path) {
  const parent = getIn(obj, path.slice(0, -1));
  if (parent == null) return;
  if (Array.isArray(parent)) parent.splice(path.at(-1), 1); else delete parent[path.at(-1)];
}
export const pathString = (path) => path.reduce((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${k}` : k), '');

/** "allowRetry" -> "Allow retry" (the shared humanize leaves camelCase alone). */
const nice = (name) => humanize(String(name).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
const LONG_TEXT = /^(text|detail|explain|reveal|note|clue|story)$/i;
const typesOf = (s) => [].concat(s.type ?? []);
const isMediaString = (s) => typesOf(s).includes('string') && typeof s.pattern === 'string' && s.pattern.startsWith('^@');
const mediaKindFor = (name) => (/src|song|track|audio|music/i.test(name) ? 'audio' : /video/i.test(name) ? 'video' : 'image');

/** Words for the limits a field has ("3 to 8"). */
function rangeHint(s) {
  if (typesOf(s).some((t) => t === 'integer' || t === 'number') && s.minimum != null && s.maximum != null) return `${s.minimum} to ${s.maximum}`;
  if (typesOf(s).includes('array') && s.maxItems != null) return `up to ${s.maxItems}`;
  return '';
}

export function schemaForm({ schema, getParams, update, skip = [], problems = [], copyDefaults = null }) {
  const fieldNodes = []; // { path, errEl } so problems can be shown without rebuilding anything
  let currentProblems = problems;

  const key = (path) => `f-${pathString(path)}`;
  const label = (name, s, required) => h('span', {}, s.title ?? nice(name), required ? h('span.needed', {}, ' (needed)') : null);
  const wrap = (path, name, s, required, control, { inline = false } = {}) => {
    const errEl = h('p.error', { role: 'alert', hidden: true });
    const hint = s.description ?? rangeHint(s);
    const el = h(`div.field${inline ? '.field-inline' : ''}`, { 'data-path': pathString(path) },
      h('label', {}, label(name, s, required)), control, hint ? h('p.hint', {}, hint) : null, errEl);
    fieldNodes.push({ path: pathString(path), errEl });
    return el;
  };

  function fieldFor(path, s, required) {
    const name = String(path.filter((p) => typeof p === 'string').at(-1) ?? '');
    const types = typesOf(s);
    const k = key(path);
    const val = () => getIn(getParams(), path);

    if (s.enum) {
      const sel = h('select', { onchange: (e) => update((p) => (e.target.value === '' ? delIn(p, path) : setIn(p, path, e.target.value)), k) },
        required ? null : h('option', { value: '' }, 'Default'), s.enum.map((v) => h('option', { value: v, selected: val() === v }, humanize(v))));
      sel.value = val() ?? (required ? s.enum[0] : '');
      return wrap(path, name, s, required, sel);
    }
    if (isMediaString(s)) return wrap(path, name, s, required, mediaField(path, name, val, k));
    if (types.includes('string')) {
      const make = LONG_TEXT.test(name) ? textarea : input;
      const box = make({ value: val() ?? '', rows: 2, placeholder: s.examples?.[0] ?? '', oninput: (e) => update((p) => (e.target.value === '' ? delIn(p, path) : setIn(p, path, e.target.value)), k) });
      if (make === textarea) box.value = val() ?? '';
      return wrap(path, name, s, required, box);
    }
    if (types.includes('integer') || types.includes('number')) {
      const box = input({ type: 'number', min: s.minimum, max: s.maximum, step: types.includes('integer') ? 1 : 0.1, value: val() ?? '', oninput: (e) => update((p) => { const n = e.target.value === '' ? NaN : Number(e.target.value); Number.isFinite(n) ? setIn(p, path, types.includes('integer') ? Math.round(n) : n) : delIn(p, path); }, k) });
      return wrap(path, name, s, required, box, { inline: true });
    }
    if (types.includes('boolean')) {
      const on = (val() ?? s.default ?? true) === true;
      return wrap(path, name, { ...s, title: ' ' }, false, toggle(s.title ?? nice(name), on, (v) => update((p) => setIn(p, path, v), k)));
    }
    if (types.includes('array')) return arrayField(path, name, s, required);
    if (types.includes('object') && s.properties) return objectField(path, name, s);
    return wrap(path, name, s, required, h('p.muted', {}, 'This setting cannot be edited here.'));
  }

  function mediaField(path, name, val, k) {
    const kind = mediaKindFor(name);
    const slot = h('div.media-field');
    const paint = () => {
      const v = val();
      const entry = v ? store.current.media.find((m) => `@${m.id}` === v) : null;
      slot.replaceChildren(
        entry ? mediaThumb(entry, 48) : h('span.media-thumb.media-thumb-icon', { style: { width: '48px', height: '48px' } }, icon(kind === 'audio' ? 'music' : kind, 20)),
        h('span.media-field-name', {}, v ? (entry ? slotLabel(v) : `${slotLabel(v)} (file missing)`) : 'Nothing chosen'),
        btn(v ? 'Change' : 'Choose', { small: true, onClick: async () => { const pick = await pickMedia({ type: kind }); if (pick) { update((p) => setIn(p, path, pick), k); paint(); } } }),
        v ? btn('', { small: true, variant: 'ghost', icon: 'close', title: 'Clear', onClick: () => { update((p) => delIn(p, path), k); paint(); } }) : null);
    };
    paint();
    return slot;
  }

  function arrayField(path, name, s, required) {
    const item = s.items ?? {};
    const k = key(path);
    const holder = h('div.sform-list');
    // a list of picture / song references
    if (isMediaString(item)) {
      const kind = mediaKindFor(name);
      const paint = () => {
        const list = getIn(getParams(), path) ?? [];
        holder.replaceChildren(h('div.chips', {}, list.map((v, i) => chip(`${slotLabel(v)}  x`, { onClick: () => { update((p) => getIn(p, path).splice(i, 1), k); paint(); }, title: 'Remove' }))),
          btn('Add', { small: true, icon: 'plus', onClick: async () => { const picks = await pickMedia({ type: kind, multiple: true, selected: list }); if (picks) { update((p) => setIn(p, path, picks), k); paint(); } } }));
      };
      paint();
      return wrap(path, name, s, required, holder);
    }
    // a list of plain text entries
    if (typesOf(item).includes('string')) {
      const paint = () => {
        const list = getIn(getParams(), path) ?? [];
        const add = input({ placeholder: 'Type and press Enter', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); const v = e.target.value.trim(); update((p) => { const a = getIn(p, path) ?? []; setIn(p, path, [...a, v]); }, k); paint(); } } });
        holder.replaceChildren(h('div.chips', {}, list.map((v, i) => chip(`${v}  x`, { onClick: () => { update((p) => { getIn(p, path).splice(i, 1); if (!getIn(p, path).length) delIn(p, path); }, k); paint(); }, title: 'Remove' }))), add);
      };
      paint();
      return wrap(path, name, s, required, holder);
    }
    // a list of things with their own settings
    const max = s.maxItems ?? 99;
    const singular = (s.title ?? nice(name)).replace(/s$/i, '').toLowerCase();
    const paint = () => {
      const list = getIn(getParams(), path) ?? [];
      const rows = h('div.sform-items');
      list.forEach((_, i) => {
        const itemPath = [...path, i];
        const body = h('div.sform-item-body');
        for (const [pn, ps] of Object.entries(item.properties ?? {})) body.append(fieldFor([...itemPath, pn], ps, (item.required ?? []).includes(pn)));
        rows.append(h('div.sform-item', {}, h('div.sform-item-head', {}, h('strong', {}, `${humanize(singular)} ${i + 1}`),
          h('span.sform-item-tools', {},
            btn('', { small: true, variant: 'ghost', icon: 'up', title: 'Move up', disabled: i === 0, onClick: () => { update((p) => moveItem(getIn(p, path), i, i - 1), k); rebuildAll(); } }),
            btn('', { small: true, variant: 'ghost', icon: 'down', title: 'Move down', disabled: i === list.length - 1, onClick: () => { update((p) => moveItem(getIn(p, path), i, i + 1), k); rebuildAll(); } }),
            btn('', { small: true, variant: 'ghost', icon: 'trash', title: 'Remove', disabled: list.length <= (s.minItems ?? 0), onClick: () => { update((p) => getIn(p, path).splice(i, 1), k); rebuildAll(); } }))), body));
      });
      holder.replaceChildren(rows, btn(`Add ${singular}`, { small: true, icon: 'plus', disabled: list.length >= max, onClick: () => { update((p) => { const a = getIn(p, path) ?? []; setIn(p, path, [...a, defaultFor(item)]); }, k); rebuildAll(); } }));
    };
    paint();
    holder.repaint = paint;
    return wrap(path, name, s, required, holder);
  }

  function objectField(path, name, s) {
    const box = h('fieldset.sform-object', {}, h('legend', {}, s.title ?? nice(name)));
    for (const [pn, ps] of Object.entries(s.properties)) box.append(fieldFor([...path, pn], ps, (s.required ?? []).includes(pn)));
    return box;
  }

  // ---- the form
  const el = h('div.sform');
  const build = () => {
    fieldNodes.length = 0;
    el.replaceChildren();
    for (const [name, s] of Object.entries(schema.properties ?? {})) {
      if (skip.includes(name) || name === 'copy') continue;
      el.append(fieldFor([name], s, (schema.required ?? []).includes(name)));
    }
    if (copyDefaults && Object.keys(copyDefaults).length) el.append(copyEditor());
    showProblems();
  };
  const rebuildAll = () => { build(); };

  /** "Reword the messages": the words the game says, with their usual wording shown as a hint. */
  function copyEditor() {
    const rows = Object.entries(copyDefaults).map(([ck, def]) => {
      const box = input({ value: getIn(getParams(), ['copy', ck]) ?? '', placeholder: def, oninput: (e) => update((p) => {
        if (e.target.value === '') { delIn(p, ['copy', ck]); if (p.copy && !Object.keys(p.copy).length) delete p.copy; } else setIn(p, ['copy', ck], e.target.value);
      }, `copy-${ck}`) });
      return h('div.field', {}, h('label', {}, nice(ck)), box);
    });
    return h('details.sform-copy', {}, h('summary', {}, 'Reword the messages'), h('p.hint', {}, 'Leave a box empty to keep the usual wording.'), h('div.sform-copy-grid', {}, rows));
  }

  function showProblems() {
    for (const f of fieldNodes) {
      const mine = currentProblems.filter((p) => p.path === f.path || p.path.startsWith(`${f.path}.`) || p.path.startsWith(`${f.path}[`));
      f.errEl.hidden = mine.length === 0;
      f.errEl.textContent = mine[0]?.message ?? '';
    }
  }

  build();
  return {
    el,
    rebuild: build,
    setProblems(list) { currentProblems = list; showProblems(); },
  };
}

/** A new, empty entry for a list of objects (required text starts empty; numbers start at their minimum). */
export function defaultFor(s) {
  if (typesOf(s).includes('object')) return Object.fromEntries((s.required ?? []).map((k) => [k, defaultFor(s.properties[k] ?? {})]));
  if (typesOf(s).includes('array')) return Array.from({ length: s.minItems ?? 0 }, () => defaultFor(s.items ?? {}));
  if (typesOf(s).some((t) => t === 'integer' || t === 'number')) return s.minimum ?? 0;
  if (typesOf(s).includes('boolean')) return false;
  return '';
}
