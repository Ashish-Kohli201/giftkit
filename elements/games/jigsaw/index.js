// Jigsaw - a photo is cut into a cols x rows grid and shuffled. Swap pieces until the picture is whole.
// Swap by dragging (Pointer Events), by tapping two pieces, or by keyboard (arrows move focus, Enter/Space selects).
// Slicing is pure CSS (background-size / background-position on the same image) - no canvas, no extra files.
import { part, seededRandom, shuffle, reducedMotion } from '../../../core/util.js';

const DRAG_THRESHOLD = 8; // px of movement before a press becomes a drag
const PEEK_MS = 1600;

export default {
  id: 'jigsaw',
  kind: 'game',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  // Public styling API. Piece states: idle, selected, dragging, placed.
  parts: ['stage', 'board', 'piece', 'peek', 'preview', 'bar', 'counter', 'hint', 'message', 'retry'],
  layoutParts: ['stage', 'board', 'bar'],
  copy: {
    moves: 'Moves: {{moves}}',
    hint: 'Peek at the picture',
    loading: 'Loading the picture...',
    piece: 'Piece {{n}}, row {{row}}, column {{col}}',
    inPlace: 'in the right place',
    selected: 'selected',
    win: 'The picture is whole! Solved in {{moves}} moves.',
    loadError: 'The picture could not be loaded.',
    retry: 'Try again',
    previewLabel: 'Reference picture',
  },
  paramsSchema: {
    type: 'object',
    required: ['image'],
    properties: {
      image: { type: 'string', pattern: '^@[\\w-]+$' }, // an asset slot, e.g. "@photo_01"
      cols: { type: 'integer', minimum: 2, maximum: 6 },
      rows: { type: 'integer', minimum: 2, maximum: 6 },
      showPreview: { type: 'boolean' },
      shuffleSeed: { type: 'string' },
    },
  },
  placeholderParams: { image: '@photo_01', cols: 3, rows: 3 },

  mount(container, ctx) {
    const cols = ctx.params.cols ?? 3;
    const rows = ctx.params.rows ?? 3;
    const total = cols * rows;
    const showPreview = ctx.params.showPreview ?? true;
    const rand = ctx.params.shuffleSeed ? seededRandom(ctx.params.shuffleSeed) : Math.random;
    const timers = [];
    let destroyed = false;
    let url = '';
    let order = [];      // order[slot] = home index of the piece currently in that slot
    let pieces = [];     // pieces[slot] = the button for that slot (buttons never move, their picture does)
    let selected = null; // slot index or null
    let moves = 0;
    let solved = false;
    let suppressClick = false;

    const counter = part('p', 'counter', { 'aria-live': 'polite' }, ctx.t('moves', { moves }));
    const hint = part('button', 'hint', { type: 'button' }, ctx.t('hint'));
    const preview = showPreview ? part('div', 'preview', { role: 'img', 'aria-label': ctx.t('previewLabel') }) : null;
    const bar = part('div', 'bar', {}, counter, preview, hint);
    const peek = part('div', 'peek', { 'aria-hidden': 'true', 'data-state': 'hidden' });
    const board = part('div', 'board', { role: 'group', 'aria-label': ctx.t('hint'), 'data-state': 'loading', style: `--gk-cols:${cols};--gk-rows:${rows}` });
    const stage = part('div', 'stage', {}, board, peek);
    const message = part('p', 'message', { role: 'status', 'aria-live': 'polite' }, ctx.t('loading'));
    container.append(bar, stage, message);

    const bgPosition = (home) => {
      const c = home % cols, r = Math.floor(home / cols);
      return `${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`;
    };

    // ---------------------------------------------------------------- rendering
    function paintPiece(slot) {
      const b = pieces[slot];
      const home = order[slot];
      const inPlace = home === slot;
      b.style.backgroundPosition = bgPosition(home);
      b.dataset.home = String(home);
      if (b.dataset.state !== 'dragging') b.dataset.state = solved ? 'placed' : selected === slot ? 'selected' : inPlace ? 'placed' : 'idle';
      const label = ctx.t('piece', { n: home + 1, row: Math.floor(slot / cols) + 1, col: (slot % cols) + 1 });
      b.setAttribute('aria-label', [label, inPlace ? ctx.t('inPlace') : '', selected === slot ? ctx.t('selected') : ''].filter(Boolean).join(', '));
      b.setAttribute('aria-pressed', String(selected === slot));
    }
    const paintAll = () => pieces.forEach((_, i) => paintPiece(i));

    // Roving tabindex: only one piece is in the tab order, arrows move between pieces.
    const setFocus = (slot) => pieces.forEach((b, i) => { b.tabIndex = i === slot ? 0 : -1; });

    // ---------------------------------------------------------------- game logic
    function swap(a, b) {
      [order[a], order[b]] = [order[b], order[a]];
      moves++;
      counter.textContent = ctx.t('moves', { moves });
      ctx.fx.tap(pieces[b]);
      selected = null;
      paintAll();
      if (order.every((home, slot) => home === slot)) finish();
    }

    function finish() {
      solved = true;
      board.dataset.state = 'solved';
      paintAll();
      message.textContent = ctx.t('win', { moves });
      ctx.fx.success(board);
      ctx.onComplete({ moves });
    }

    function choose(slot) {
      if (solved) return;
      if (selected === null) selected = slot;
      else if (selected === slot) selected = null;
      else return swap(selected, slot);
      paintAll();
    }

    // ---------------------------------------------------------------- drag (Pointer Events only)
    function attachDrag(b, slot) {
      let start = null;
      b.addEventListener('pointerdown', (e) => {
        if (solved || (e.pointerType === 'mouse' && e.button !== 0)) return;
        start = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
        b.setPointerCapture?.(e.pointerId);
      });
      b.addEventListener('pointermove', (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!start.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!start.dragging) { start.dragging = true; selected = null; paintAll(); b.dataset.state = 'dragging'; }
        b.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      const end = (e, cancelled) => {
        if (!start || e.pointerId !== start.id) return;
        const wasDragging = start.dragging;
        start = null;
        b.releasePointerCapture?.(e.pointerId);
        if (!wasDragging) return; // a plain tap: the click handler takes it from here
        suppressClick = true;
        timers.push(setTimeout(() => { suppressClick = false; }, 60));
        b.style.transform = '';
        b.dataset.state = 'idle';
        const target = cancelled ? null : document.elementsFromPoint(e.clientX, e.clientY).find((n) => n !== b && pieces.includes(n));
        if (target) { const t = pieces.indexOf(target); setFocus(t); swap(slot, t); } else paintAll();
      };
      b.addEventListener('pointerup', (e) => end(e, false));
      b.addEventListener('pointercancel', (e) => end(e, true));
    }

    // ---------------------------------------------------------------- keyboard
    function onKey(e, slot) {
      if (e.key === 'Escape' && selected !== null) { e.preventDefault(); e.stopPropagation(); selected = null; paintAll(); return; }
      const col = slot % cols, row = Math.floor(slot / cols);
      const next = { ArrowLeft: col > 0 ? slot - 1 : null, ArrowRight: col < cols - 1 ? slot + 1 : null, ArrowUp: row > 0 ? slot - cols : null, ArrowDown: row < rows - 1 ? slot + cols : null }[e.key];
      if (next === undefined) return; // not an arrow key
      e.preventDefault();
      if (next === null) return; // at the edge
      setFocus(next);
      pieces[next].focus();
    }

    // ---------------------------------------------------------------- start
    function build(aspect) {
      stage.style.setProperty('--gk-aspect', String(aspect));
      const bg = `url(${JSON.stringify(url)})`;
      board.replaceChildren();
      const identity = Array.from({ length: total }, (_, i) => i);
      order = shuffle(identity, rand);
      // A shuffle that lands on the solved picture would be a free win: rotate it by one.
      if (order.every((h, i) => h === i)) order.push(order.shift());
      pieces = identity.map((slot) => {
        const b = part('button', 'piece', {
          type: 'button', 'data-index': slot, 'data-state': 'idle', tabindex: slot === 0 ? '0' : '-1',
          style: `background-image:${bg};background-size:${cols * 100}% ${rows * 100}%`,
        });
        b.addEventListener('click', () => { if (suppressClick) return; setFocus(slot); choose(slot); });
        b.addEventListener('keydown', (e) => onKey(e, slot));
        attachDrag(b, slot);
        return b;
      });
      board.append(...pieces);
      if (preview) preview.style.backgroundImage = bg;
      peek.style.backgroundImage = bg;
      board.dataset.state = 'playing';
      message.textContent = '';
      paintAll();
    }

    async function load() {
      container.querySelector('[data-part="retry"]')?.remove();
      board.dataset.state = 'loading';
      message.textContent = ctx.t('loading');
      try {
        const asset = await ctx.assets.resolve(ctx.params.image);
        url = asset.url;
        const img = new Image();
        img.decoding = 'async';
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('image failed')); img.src = url; });
        if (destroyed) return;
        build(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4 / 3);
      } catch {
        if (destroyed) return;
        board.dataset.state = 'error';
        message.textContent = ctx.t('loadError');
        const retry = part('button', 'retry', { type: 'button' }, ctx.t('retry'));
        retry.addEventListener('click', load);
        container.append(retry);
      }
    }

    hint.addEventListener('click', () => {
      if (board.dataset.state === 'loading' || board.dataset.state === 'error') return;
      peek.dataset.state = 'shown';
      timers.push(setTimeout(() => { peek.dataset.state = 'hidden'; }, reducedMotion() ? PEEK_MS * 2 : PEEK_MS));
    });

    load();
    return { destroy() { destroyed = true; timers.forEach(clearTimeout); } };
  },
};
