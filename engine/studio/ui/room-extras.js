// ROOM EXTRAS: the little things inside the room that carry the owner's own words and files:
// coupons, notes, the music, the photos, and the memories board. Each is a card with an on/off switch.
//
// Music, photos and the board have two modes: AUTOMATIC (everything in the media folder is used, nothing to maintain) and
// CHOSEN (a list the owner picks, names and puts in order). Switching between them never loses work that matters.
// Everything is written to gift.json through store.edit; typing never rebuilds the card (that would steal focus).
import { pickMedia, mediaThumb, slotLabel } from './media-picker.js';
import { btn, field, h, humanize, icon, input, plural, textarea, toggle } from './ui-kit.js';

/** A list of rows the owner can add to, reorder and delete. Rows are built once; only add / move / delete rebuild the list. */
function listEditor({ store, id, read, getList, fields, blank, addLabel, max, extra, onEmpty, onChange }) {
  const rows = h('div.room-list');
  const addBtn = btn(addLabel, { icon: 'plus', small: true, onClick: () => { store.edit((d) => { getList(d).push(blank(getList(d))); }); paint(); onChange?.(); } });
  const mutate = (fn) => { store.edit((d) => fn(getList(d), d)); paint(); onChange?.(); };

  function row(item, i, total) {
    const controls = h('div.room-row-controls', {},
      btn('', { variant: 'ghost', small: true, icon: 'up', title: 'Move up', disabled: i === 0, onClick: () => mutate((l) => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; }) }),
      btn('', { variant: 'ghost', small: true, icon: 'down', title: 'Move down', disabled: i === total - 1, onClick: () => mutate((l, d) => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; }) }),
      btn('', { variant: 'ghost', small: true, icon: 'trash', title: 'Remove', onClick: () => mutate((l, d) => { l.splice(i, 1); if (!l.length) onEmpty?.(d); }) }));
    const inputs = fields.map((f) => {
      const el = f.type === 'textarea' ? textarea({ rows: 3, value: item[f.key] ?? '', placeholder: f.placeholder, maxlength: f.maxlength })
        : input({ type: f.type === 'date' ? 'date' : 'text', value: item[f.key] ?? '', placeholder: f.placeholder, maxlength: f.maxlength });
      el.addEventListener('input', () => store.edit((d) => {
        const it = getList(d)[i];
        if (!it) return;
        if (el.value === '' && f.optional) delete it[f.key]; else it[f.key] = el.value;
      }, { coalesce: `${id}-${i}-${f.key}` }));
      return field(f.label, el, { wide: f.wide });
    });
    return h('div.room-row', {}, h('span.room-row-num', {}, String(i + 1)), h('div.room-row-body', {}, extra?.(item, i, mutate), h('div.room-row-fields', {}, inputs)), controls);
  }

  function paint() {
    const list = read();
    rows.replaceChildren(...list.map((it, i) => row(it, i, list.length)));
    addBtn.disabled = list.length >= max;
  }
  paint();
  return { el: h('div.room-list-wrap', {}, rows, addBtn), paint };
}

/** A card with a title, a switch and a place for problems the checker found. */
function card({ id, title, help, isOn, setOn, body, problemPrefixes, store }) {
  const problems = h('div.room-problems', { role: 'status' });
  const sw = toggle(title, isOn(), (on) => { setOn(on); bodyWrap.hidden = !on; });
  const bodyWrap = h('div.room-card-body', { hidden: !isOn() }, body());
  const el = h(`section.card.room-card#room-${id}`, {}, h('header.room-card-head', {}, sw, h('p.hint', {}, help)), bodyWrap, problems);
  const paintProblems = () => {
    const errors = (store.current?.report?.errors ?? []).filter((e) => problemPrefixes.some((p) => e.startsWith(p)));
    problems.replaceChildren(...errors.map((e) => h('p.room-problem', {}, icon('alert', 15), e.replace(/^(apps|scene)\.[\w.\[\]]+: /, ''))));
  };
  paintProblems();
  return { el, paintProblems, repaintBody: () => { bodyWrap.replaceChildren(body()); bodyWrap.hidden = !isOn(); sw.querySelector('input').checked = isOn(); } };
}

export function buildExtras({ store, goStep }) {
  const raw = () => store.current.raw;
  const cards = [];
  const mediaEntry = (slot) => (store.current.media ?? []).find((m) => `@${m.id}` === slot);

  // ------------------------------------------------------------ coupons and notes: plain lists of words
  const wordsCard = ({ id, title, help, key, noun, fields, blank }) => {
    const a = () => raw().apps?.[id];
    const isOn = () => !!a() && a() !== false && a().enabled !== false && (a().items?.length ?? 0) > 0;
    const ensure = (d) => { const x = (d.apps ??= {}); if (!x[id] || x[id] === false) x[id] = { enabled: true, items: [] }; x[id].items ??= []; x[id].enabled = true; return x[id]; };
    let ed;
    const c = card({
      store, id, title, help, problemPrefixes: [`apps.${id}`],
      isOn,
      setOn: (on) => {
        store.edit((d) => { const x = ensure(d); if (on) { if (!x.items.length) x.items.push(blank(x.items)); x.enabled = true; } else x.enabled = false; });
        c.repaintBody();
      },
      body: () => {
        ed = listEditor({
          store, id, read: () => a()?.items ?? [], getList: (d) => ensure(d).items, fields, blank, addLabel: `Add ${noun}`, max: key === 'coupons' ? 12 : 20,
          onEmpty: (d) => { if (d.apps?.[id]) d.apps[id].enabled = false; }, onChange: () => { c.paintProblems(); if (!isOn()) c.repaintBody(); },
        });
        return ed.el;
      },
    });
    return c;
  };

  const nextId = (list) => `c${Math.max(0, ...list.map((x) => Number(/^c(\d+)$/.exec(x.id)?.[1] ?? 0))) + 1}`;
  cards.push(wordsCard({
    id: 'coupons', key: 'coupons', title: 'Coupons', noun: 'a coupon', help: 'Little promises they can keep. They live in a jar in the room.',
    fields: [{ key: 'title', label: 'The promise', placeholder: 'One slow dance', wide: true }, { key: 'detail', label: 'The small print', placeholder: 'Anytime, anywhere.', optional: true, wide: true }],
    blank: (list) => ({ id: nextId(list), title: 'A little promise', detail: '' }),
  }));
  cards.push(wordsCard({
    id: 'notes', key: 'notes', title: 'Notes', noun: 'a note', help: 'Words to keep. They open in a notebook on the laptop.',
    fields: [{ key: 'title', label: 'Title', placeholder: 'A note for a rainy day' }, { key: 'date', label: 'Date (optional)', type: 'date', optional: true }, { key: 'text', label: 'The note', type: 'textarea', wide: true, placeholder: 'Write it as you would say it.' }],
    blank: () => ({ title: 'A note', text: 'Write it here.' }),
  }));

  // ------------------------------------------------------------ music, photos, board: automatic or chosen
  /** @param spec { id, title, help, media: 'audio'|'image', noun, cap, read(): { state, list }, auto(d), off(d), on(d), chooseFrom(entries), getList(d), blank(slot), rowFields, rowExtra, prefixes } */
  const pickedCard = (spec) => {
    const state = () => spec.read().state;
    let c;
    let paintModeRef = null;
    const body = () => {
      const wrap = h('div.room-picked');
      const paintMode = () => {
        wrap.replaceChildren();
        const s = state();
        const entries = store.mediaOf(spec.media);
        if (s === 'auto') {
          wrap.append(h('div.callout', {}, icon('info'), h('div', {},
            h('strong', {}, entries.length ? `All your ${spec.plural} (automatic)` : `No ${spec.plural} yet`),
            h('p', {}, entries.length
              ? `${plural(Math.min(entries.length, spec.cap), spec.noun)} will be used, in the order of their names. New files appear on their own.`
              : `Add some on the Media step and they show up here by themselves.`),
            entries.length ? h('div.room-thumbs', {}, entries.slice(0, spec.cap).map((e) => mediaThumb(e, 44))) : null)),
          h('div.room-actions', {}, entries.length ? btn('Choose and name them', { icon: 'sparkle', small: true, onClick: () => { store.edit((d) => spec.chooseFrom(d, entries.slice(0, spec.cap))); paintMode(); c.paintProblems(); } }) : null,
            !entries.length ? btn('Go to Media', { small: true, icon: 'upload', onClick: () => goStep('media') }) : null));
        } else {
          const ed = listEditor({
            store, id: spec.id, read: () => spec.read().list, getList: spec.getList, fields: spec.rowFields, blank: () => spec.blank(), addLabel: `Add ${spec.noun}`, max: spec.cap,
            extra: spec.rowExtra, onEmpty: (d) => spec.off(d), onChange: () => { c.paintProblems(); if (!spec.read().list.length) paintMode(); },
          });
          wrap.append(ed.el, h('div.room-actions', {}, btn('Back to automatic', { small: true, icon: 'refresh', onClick: () => { store.edit((d) => spec.auto(d)); paintMode(); c.paintProblems(); } })));
        }
      };
      paintMode();
      paintModeRef = paintMode;
      return wrap;
    };
    c = card({
      store, id: spec.id, title: spec.title, help: spec.help, problemPrefixes: spec.prefixes,
      isOn: () => state() !== 'off',
      setOn: (on) => { store.edit((d) => (on ? spec.on(d) : spec.off(d))); c.repaintBody(); c.paintProblems(); },
      body,
    });
    c.refreshAuto = () => { if (state() === 'auto') paintModeRef?.(); };
    return c;
  };

  const picker = (type, row, i, mutate, key) => h('div.room-pick', {},
    row[key] && mediaEntry(row[key]) ? mediaThumb(mediaEntry(row[key]), 56) : h('span.media-thumb.media-thumb-icon', { style: { width: '56px', height: '56px' } }, icon(type === 'audio' ? 'music' : 'image', 20)),
    btn(row[key] ? slotLabel(row[key]) : `Choose a ${type === 'audio' ? 'song' : 'picture'}`, { small: true, onClick: async (e) => {
      const slot = await pickMedia({ type });
      if (!slot) return;
      mutate((l) => { l[i][key] = slot; });
    } }));

  cards.push(pickedCard({
    id: 'music', title: 'Music', plural: 'songs', noun: 'song', media: 'audio', cap: 12, prefixes: ['apps.music'],
    help: 'Songs they can play in the room. Only your own songs, please.',
    read: () => { const a = raw().apps?.music; if (a === false || a?.enabled === false) return { state: 'off', list: [] }; return Array.isArray(a?.tracks) ? { state: 'chosen', list: a.tracks } : { state: 'auto', list: [] }; },
    auto: (d) => { (d.apps ??= {}).music = { tracks: '@all' }; },
    off: (d) => { const a = (d.apps ??= {}); a.music = { tracks: Array.isArray(a.music?.tracks) ? a.music.tracks : '@all', enabled: false }; },
    on: (d) => { const a = d.apps?.music; if (a && typeof a === 'object') delete a.enabled; else (d.apps ??= {}).music = { tracks: '@all' }; },
    chooseFrom: (d, entries) => { (d.apps ??= {}).music = { tracks: entries.map((e) => ({ title: humanize(e.id), src: `@${e.id}` })) }; },
    getList: (d) => { const a = (d.apps ??= {}); if (!Array.isArray(a.music?.tracks)) a.music = { tracks: [] }; return a.music.tracks; },
    blank: () => { const e = store.mediaOf('audio')[0]; return { title: e ? humanize(e.id) : 'A song', src: e ? `@${e.id}` : '@' }; },
    rowFields: [{ key: 'title', label: 'Song title', placeholder: 'Our song' }, { key: 'artist', label: 'Artist (optional)', optional: true, placeholder: 'Who plays it' }],
    rowExtra: (row, i, mutate) => picker('audio', row, i, mutate, 'src'),
  }));

  cards.push(pickedCard({
    id: 'gallery', title: 'Photos', plural: 'pictures', noun: 'picture', media: 'image', cap: 24, prefixes: ['apps.gallery'],
    help: 'A photo album they can flip through.',
    read: () => { const a = raw().apps?.gallery; if (a === false || a?.enabled === false) return { state: 'off', list: [] }; return Array.isArray(a?.items) ? { state: 'chosen', list: a.items } : { state: 'auto', list: [] }; },
    auto: (d) => { (d.apps ??= {}).gallery = { items: '@all' }; },
    off: (d) => { const a = (d.apps ??= {}); a.gallery = { items: Array.isArray(a.gallery?.items) ? a.gallery.items : '@all', enabled: false }; },
    on: (d) => { const a = d.apps?.gallery; if (a && typeof a === 'object') delete a.enabled; else (d.apps ??= {}).gallery = { items: '@all' }; },
    chooseFrom: (d, entries) => { (d.apps ??= {}).gallery = { items: entries.map((e) => ({ photo: `@${e.id}` })) }; },
    getList: (d) => { const a = (d.apps ??= {}); if (!Array.isArray(a.gallery?.items)) a.gallery = { items: [] }; return a.gallery.items; },
    blank: () => { const e = store.mediaOf('image')[0]; return { photo: e ? `@${e.id}` : '@' }; },
    rowFields: [{ key: 'caption', label: 'Caption (optional)', optional: true, placeholder: 'The night we got lost', wide: true }],
    rowExtra: (row, i, mutate) => picker('image', row, i, mutate, 'photo'),
  }));

  cards.push(pickedCard({
    id: 'board', title: 'Memories board', plural: 'pictures', noun: 'picture', media: 'image', cap: 8, prefixes: ['scene.'],
    help: 'Pictures pinned up in the room, each with a note on the back.',
    read: () => { const c = raw().scene?.corkboard; if (Array.isArray(c) && c.length === 0) return { state: 'off', list: [] }; return Array.isArray(c) ? { state: 'chosen', list: c } : { state: 'auto', list: [] }; },
    auto: (d) => { d.scene ??= {}; delete d.scene.corkboard; },
    off: (d) => { (d.scene ??= {}).corkboard = []; },
    on: (d) => { d.scene ??= {}; delete d.scene.corkboard; },
    chooseFrom: (d, entries) => { (d.scene ??= {}).corkboard = entries.map((e) => ({ photo: `@${e.id}` })); },
    getList: (d) => { d.scene ??= {}; if (!Array.isArray(d.scene.corkboard)) d.scene.corkboard = []; return d.scene.corkboard; },
    blank: () => { const e = store.mediaOf('image')[0]; return { photo: e ? `@${e.id}` : '@' }; },
    rowFields: [{ key: 'caption', label: 'Caption', optional: true, maxlength: 80, placeholder: 'Golden hour' }, { key: 'back', label: 'Written on the back', optional: true, maxlength: 200, placeholder: 'Remember this day.' }],
    rowExtra: (row, i, mutate) => picker('image', row, i, mutate, 'photo'),
  }));

  const el = h('section.section.room-extras', {}, h('header', {}, h('h2', {}, 'Little extras'), h('p', {}, 'The words and files that make the room yours. Switch off anything you do not want.')), ...cards.map((c) => c.el));
  return {
    el,
    refreshProblems: () => cards.forEach((c) => c.paintProblems()),
    // only the automatic lists depend on the media library; never rebuild a card someone may be typing in
    refreshMedia: () => cards.forEach((c) => c.refreshAuto?.()),
  };
}
