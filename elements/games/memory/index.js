// Memory - flip cards, match all pairs. Faces are text/glyphs, or "@photoSlot" refs resolved via the AssetResolver.
import { part, shuffle } from '../../../core/util.js';

const DEFAULT_FACES = ['✦', '☾', '☄', '✧', '❂', '✺', '❖', '✿', '♥', '☀', '♪', '✈', '☂', '⚑', '✎'];

export default {
  id: 'memory',
  kind: 'game',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['grid', 'card', 'card-inner', 'card-back', 'card-front', 'counter', 'message'],
  layoutParts: ['grid', 'card-inner'],
  copy: { moves: 'Moves: {{moves}}', win: 'All pairs found in {{moves}} moves!', card: 'Face-down card' },
  paramsSchema: {
    type: 'object',
    properties: {
      pairs: { type: 'integer', minimum: 3, maximum: 15 },
      faces: { type: 'array', items: { type: 'string' }, maxItems: 15 }, // glyphs or "@slot" photo refs
      flipBackMs: { type: 'integer', minimum: 300, maximum: 3000 },
    },
  },
  placeholderParams: { pairs: 6 },

  mount(container, ctx) {
    const pairs = ctx.params.pairs ?? 6;
    const supplied = [...new Set(ctx.params.faces ?? [])].slice(0, pairs);
    const faces = [...supplied, ...DEFAULT_FACES.filter((f) => !supplied.includes(f))].slice(0, pairs);
    const deck = shuffle([...faces, ...faces]);
    const flipBackMs = ctx.params.flipBackMs ?? 800;
    const timers = [];
    let open = [], locked = false, moves = 0, matched = 0;

    const counter = part('p', 'counter', { 'aria-live': 'polite' }, ctx.t('moves', { moves }));
    const message = part('p', 'message', { role: 'status', 'aria-live': 'polite' });
    const cols = deck.length <= 12 ? 3 : deck.length <= 20 ? 4 : 5;

    const cards = deck.map((face) => {
      const front = part('span', 'card-front');
      const card = part('button', 'card', { type: 'button', 'data-state': 'hidden', 'aria-label': ctx.t('card') },
        part('span', 'card-inner', {}, part('span', 'card-back'), front));
      const c = { face, card, label: face };
      if (face.startsWith('@')) {
        const img = document.createElement('img');
        img.decoding = 'async';
        front.append(img);
        ctx.assets.resolve(face).then((a) => { img.src = a.url; img.alt = a.alt || 'Photo'; c.label = img.alt; }).catch(() => { front.textContent = '?'; });
      } else {
        front.textContent = face;
      }
      card.addEventListener('click', () => flip(c));
      return c;
    });

    const grid = part('div', 'grid', { role: 'group', 'aria-label': 'Cards', style: `--gk-cols:${cols};--gk-rows:${Math.ceil(deck.length / cols)}` }, cards.map((c) => c.card));
    container.append(counter, grid, message);

    const setState = (c, s) => {
      c.card.dataset.state = s;
      c.card.setAttribute('aria-label', s === 'hidden' ? ctx.t('card') : c.label);
    };

    function flip(c) {
      if (locked || c.card.dataset.state !== 'hidden') return;
      setState(c, 'flipped');
      open.push(c);
      ctx.fx.tap(c.card);
      if (open.length < 2) return;

      moves++;
      counter.textContent = ctx.t('moves', { moves });
      const [a, b] = open;
      if (a.face === b.face) {
        setState(a, 'matched'); setState(b, 'matched');
        matched += 2; open = [];
        if (matched === deck.length) {
          message.textContent = ctx.t('win', { moves });
          ctx.fx.success(grid);
          ctx.onComplete({ moves });
        }
      } else {
        locked = true;
        timers.push(setTimeout(() => { setState(a, 'hidden'); setState(b, 'hidden'); open = []; locked = false; }, flipBackMs));
      }
    }

    return { destroy() { timers.forEach(clearTimeout); } };
  },
};
