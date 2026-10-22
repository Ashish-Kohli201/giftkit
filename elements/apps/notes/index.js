// Notes - a notes app for the customer's own words. A list of notes with unread dots; tap one to read it on a sheet of paper,
// then step to the previous or next note. Text is untrusted: it is only ever placed as text nodes. Read state persists.
import { part } from '../../../core/util.js';

export default {
  id: 'notes',
  kind: 'app',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['note-list', 'note-row', 'note-dot', 'note-row-title', 'note-row-preview', 'note-row-date', 'note-page', 'note-bar', 'note-heading', 'note-date', 'note-body', 'note-paragraph', 'note-back', 'note-prev', 'note-next', 'note-count'],
  layoutParts: ['note-list', 'note-page', 'note-bar', 'note-body'],
  copy: {
    list: 'Notes',
    back: 'All notes',
    prev: 'Previous note',
    next: 'Next note',
    count: '{{n}} / {{total}}',
    unread: 'unread',
    open: 'Open note: {{title}}',
  },
  paramsSchema: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array', minItems: 1, maxItems: 20,
        items: {
          type: 'object', required: ['title', 'text'],
          properties: { title: { type: 'string', minLength: 1 }, text: { type: 'string', minLength: 1 }, date: { type: 'string' } },
        },
      },
    },
  },
  placeholderParams: {
    items: [
      { title: 'For a quiet moment', text: 'No big words here. Just a small reminder that the light left on in the window is for you.', date: '1 Dec' },
      { title: 'Things I noticed today', text: 'The way you hum when you think nobody is listening.\n\nThe tea that went cold because something more interesting came up.\n\nThe way the day gets easier with you in it.', date: '2 Dec' },
      { title: 'A list for later', text: 'Stay up too late talking.\n\nTake the long way home.\n\nDo nothing together, on purpose.' },
    ],
  },

  mount(container, ctx) {
    const items = ctx.params.items;
    const read = new Set(ctx.store.get('read', []));
    let open = -1; // note shown on the page, -1 = the list is showing

    // ---- list view
    const rows = items.map((item, i) => {
      const preview = item.text.split(/\n+/)[0];
      const row = part('button', 'note-row', { type: 'button', 'data-state': 'unread' },
        part('span', 'note-dot', { 'aria-hidden': 'true' }),
        part('span', 'note-row-title', {}, item.title),
        part('span', 'note-row-preview', {}, preview),
        item.date ? part('span', 'note-row-date', {}, item.date) : null);
      row.addEventListener('click', () => show(i));
      return row;
    });
    const list = part('div', 'note-list', { role: 'group', 'aria-label': ctx.t('list') }, rows);

    // ---- page view
    const back = part('button', 'note-back', { type: 'button' }, `‹ ${ctx.t('back')}`);
    const prev = part('button', 'note-prev', { type: 'button', 'aria-label': ctx.t('prev') }, '‹');
    const next = part('button', 'note-next', { type: 'button', 'aria-label': ctx.t('next') }, '›');
    const count = part('span', 'note-count', { 'aria-live': 'polite' });
    const heading = part('h3', 'note-heading', { tabindex: '-1' });
    const date = part('p', 'note-date');
    const body = part('div', 'note-body');
    const page = part('section', 'note-page', { hidden: true },
      part('div', 'note-bar', {}, back, count, prev, next), heading, date, body);
    container.append(list, page);

    const sync = (i) => {
      rows[i].dataset.state = read.has(i) ? 'read' : 'unread';
      rows[i].setAttribute('aria-label', `${ctx.t('open', { title: items[i].title })}${read.has(i) ? '' : `, ${ctx.t('unread')}`}`);
    };
    rows.forEach((_, i) => sync(i));

    function show(i) {
      open = (i + items.length) % items.length;
      const item = items[open];
      read.add(open);
      ctx.store.set('read', [...read]);
      sync(open);
      heading.textContent = item.title;
      date.textContent = item.date ?? '';
      date.hidden = !item.date;
      body.replaceChildren(...item.text.split(/\n\s*\n/).map((p) => part('p', 'note-paragraph', {}, p.trim())));
      count.textContent = ctx.t('count', { n: open + 1, total: items.length });
      prev.hidden = next.hidden = items.length < 2;
      list.hidden = true;
      page.hidden = false;
      page.scrollTop = 0;
      heading.focus({ preventScroll: true });
    }

    function showList() {
      const from = open;
      open = -1;
      page.hidden = true;
      list.hidden = false;
      rows[from]?.focus({ preventScroll: true });
    }

    back.addEventListener('click', showList);
    prev.addEventListener('click', () => show(open - 1));
    next.addEventListener('click', () => show(open + 1));

    // Escape and the arrow keys are caught in the capture phase so Escape returns to the list instead of closing the sheet behind
    const onKey = (e) => {
      if (open < 0) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); showList(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(open - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(open + 1); }
    };
    document.addEventListener('keydown', onKey, true);

    return { destroy() { document.removeEventListener('keydown', onKey, true); } };
  },
};
