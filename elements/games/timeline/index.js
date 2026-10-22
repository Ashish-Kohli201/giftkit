// Timeline - put shuffled moments back in the order they happened.
// `events` are given in the CORRECT order by the gift config; the element shuffles them.
// Reorder by dragging a card's handle (Pointer Events, works with touch), with the up/down buttons,
// or with the arrow keys while the handle is focused. "Check order" marks each card correct / wrong.
// Logic only: all look & feel is theme-owned via data-part / data-state hooks (see style.css).
import { part, shuffle } from '../../../core/util.js';

export default {
  id: 'timeline',
  kind: 'game',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  // Public styling API. Card states: idle | correct | wrong. A card being dragged also carries data-dragging.
  parts: ['list', 'card', 'handle', 'text', 'label', 'detail', 'date', 'controls', 'up', 'down', 'hint', 'check', 'message', 'status', 'retry'],
  layoutParts: ['list', 'text', 'controls', 'status'],
  copy: {
    title: 'Moments in order',
    hint: 'Put these moments in the order they happened, earliest first. Drag a handle or use the arrows.',
    handle: 'Reorder {{label}}. Drag, or press the up and down arrow keys.',
    up: 'Move {{label}} up',
    down: 'Move {{label}} down',
    moved: '{{label}} is now number {{pos}} of {{total}}',
    check: 'Check order',
    score: '{{correct}} of {{total}} in the right place. Keep rearranging.',
    wrong: 'Not quite right yet. Keep rearranging.',
    win: 'Perfect, that is exactly how it happened!',
    retry: 'Shuffle again',
  },
  paramsSchema: {
    type: 'object',
    required: ['events'],
    properties: {
      // Listed in the CORRECT (chronological) order. `date` is display-only and revealed once solved.
      events: {
        type: 'array',
        minItems: 3,
        maxItems: 10,
        items: {
          type: 'object',
          required: ['label'],
          properties: { label: { type: 'string', minLength: 1 }, detail: { type: 'string' }, date: { type: 'string' } },
        },
      },
      showCorrectCount: { type: 'boolean' },
      allowRetry: { type: 'boolean' },
    },
  },
  placeholderParams: {
    events: [
      { label: 'We spotted the first star', detail: 'Just after sunset', date: 'Early evening' },
      { label: 'The telescope came out', detail: 'Slightly out of focus', date: 'Around nine' },
      { label: 'We counted shooting stars', detail: 'Five, maybe six', date: 'Close to midnight' },
      { label: 'The tea went cold', detail: 'Nobody wanted to move', date: 'After midnight' },
      { label: 'We watched the sunrise', detail: 'Worth every yawn', date: 'Morning' },
    ],
    showCorrectCount: true,
    allowRetry: true,
  },

  mount(container, ctx) {
    const events = ctx.params.events;
    const len = events.length;
    const showCount = ctx.params.showCorrectCount ?? true;
    const allowRetry = ctx.params.allowRetry ?? true;
    let checks = 0, over = false;

    // order[position] = index of the event shown at that position. Solved when order[i] === i for every i.
    const freshOrder = () => {
      const o = shuffle(events.map((_, i) => i));
      return o.every((v, i) => v === i) ? [...o.slice(1), o[0]] : o; // never start solved
    };
    let order = freshOrder();

    const status = part('p', 'status', { role: 'status', 'aria-live': 'polite' });
    const message = part('p', 'message', { role: 'status', 'aria-live': 'polite' });
    const say = (text) => { message.textContent = text; };

    // One card per event, created once; render() only reorders the nodes.
    const cards = events.map((ev, id) => {
      const handle = part('button', 'handle', { type: 'button', 'aria-label': ctx.t('handle', { label: ev.label }) }, '⠿');
      const up = part('button', 'up', { type: 'button', 'aria-label': ctx.t('up', { label: ev.label }) }, '↑');
      const down = part('button', 'down', { type: 'button', 'aria-label': ctx.t('down', { label: ev.label }) }, '↓');
      const date = ev.date ? part('span', 'date', { hidden: true }, ev.date) : null;
      const node = part('div', 'card', { role: 'listitem', 'data-id': id, 'data-state': 'idle' },
        handle,
        part('div', 'text', {}, part('span', 'label', {}, ev.label), ev.detail ? part('span', 'detail', {}, ev.detail) : null, date),
        part('div', 'controls', {}, up, down));
      return { id, ev, node, handle, up, down, date };
    });

    const list = part('div', 'list', { role: 'list', 'aria-label': ctx.t('title') });
    const hint = part('p', 'hint', {}, ctx.t('hint'));
    const check = part('button', 'check', { type: 'button', 'data-variant': 'primary' }, ctx.t('check'));
    container.append(hint, list, check, message, status);

    const clearMarks = () => cards.forEach((c) => { c.node.dataset.state = 'idle'; });
    const removeRetry = () => container.querySelector('[data-part="retry"]')?.remove();

    // Put the nodes in `order`, set the stagger index and the edge buttons.
    function render() {
      order.forEach((id, pos) => {
        const c = cards[id];
        list.append(c.node);
        c.node.style.setProperty('--i', pos);
        c.up.disabled = over || pos === 0;
        c.down.disabled = over || pos === len - 1;
        c.handle.disabled = over;
      });
    }

    // Move the card at `from` to `to`. `focusKey` is the control to keep focused ('handle' | 'up' | 'down').
    function moveTo(from, to, focusKey) {
      if (over || to < 0 || to >= len || to === from) return;
      const [id] = order.splice(from, 1);
      order.splice(to, 0, id);
      clearMarks(); removeRetry(); say('');
      render();
      const c = cards[id];
      // An edge button is disabled after the move, so hand focus to the other arrow.
      const target = c[focusKey]?.disabled ? c[focusKey === 'up' ? 'down' : 'up'] : c[focusKey];
      target?.focus({ preventScroll: true });
      status.textContent = ctx.t('moved', { label: c.ev.label, pos: to + 1, total: len });
    }

    // ---- pointer drag from the handle: the card follows the finger, neighbours slide out of the way
    function startDrag(e, id) {
      if (over || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const c = cards[id];
      const from = order.indexOf(id);
      const rects = order.map((o) => cards[o].node.getBoundingClientRect());
      const slot = rects[from].height + (parseFloat(getComputedStyle(list).rowGap) || 0);
      const startY = e.clientY;
      let target = from;
      c.handle.setPointerCapture(e.pointerId);
      c.node.dataset.dragging = '';

      const onMove = (m) => {
        const dy = m.clientY - startY;
        c.node.style.transform = `translateY(${dy}px)`;
        const center = rects[from].top + rects[from].height / 2 + dy;
        target = rects.filter((r, i) => i !== from && r.top + r.height / 2 < center).length;
        order.forEach((o, i) => {
          if (i === from) return;
          const shift = from < target && i > from && i <= target ? -slot : from > target && i >= target && i < from ? slot : 0;
          cards[o].node.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      };
      const end = (up, cancelled) => {
        c.handle.removeEventListener('pointermove', onMove);
        c.handle.removeEventListener('pointerup', onUp);
        c.handle.removeEventListener('pointercancel', onCancel);
        if (c.handle.hasPointerCapture(up.pointerId)) c.handle.releasePointerCapture(up.pointerId);
        // Commit with transitions off, so neighbours do not animate back from their shifted offsets.
        list.dataset.settle = '';
        cards.forEach((k) => { k.node.style.transform = ''; });
        delete c.node.dataset.dragging;
        moveTo(from, cancelled ? from : target, 'handle');
        render();
        void list.offsetHeight;
        delete list.dataset.settle;
      };
      const onUp = (u) => end(u, false);
      const onCancel = (u) => end(u, true);
      c.handle.addEventListener('pointermove', onMove);
      c.handle.addEventListener('pointerup', onUp);
      c.handle.addEventListener('pointercancel', onCancel);
    }

    for (const c of cards) {
      c.handle.addEventListener('pointerdown', (e) => startDrag(e, c.id));
      c.handle.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const pos = order.indexOf(c.id);
        moveTo(pos, pos + (e.key === 'ArrowUp' ? -1 : 1), 'handle');
      });
      c.up.addEventListener('click', () => moveTo(order.indexOf(c.id), order.indexOf(c.id) - 1, 'up'));
      c.down.addEventListener('click', () => moveTo(order.indexOf(c.id), order.indexOf(c.id) + 1, 'down'));
    }

    function shuffleAgain() {
      order = freshOrder();
      clearMarks(); removeRetry(); say('');
      render();
      check.focus({ preventScroll: true });
    }

    check.addEventListener('click', () => {
      if (over) return;
      checks++;
      const correct = order.filter((id, pos) => id === pos).length;
      order.forEach((id, pos) => { cards[id].node.dataset.state = id === pos ? 'correct' : 'wrong'; });
      if (correct === len) {
        over = true;
        check.disabled = true;
        cards.forEach((c) => { if (c.date) c.date.hidden = false; });
        render();
        say(ctx.t('win'));
        ctx.fx.success(list);
        ctx.onComplete({ checks });
        return;
      }
      say(showCount ? ctx.t('score', { correct, total: len }) : ctx.t('wrong'));
      ctx.fx.fail(list);
      ctx.onFail({ reason: 'wrong_order', correct });
      if (allowRetry && !container.querySelector('[data-part="retry"]')) {
        const retry = part('button', 'retry', { type: 'button' }, ctx.t('retry'));
        retry.addEventListener('click', shuffleAgain);
        check.after(retry);
      }
    });

    render();
    return { destroy() {} };
  },
};
