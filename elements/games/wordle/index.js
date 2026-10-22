// Wordle - guess the secret word. Word length comes from the answer, row count from maxGuesses.
// Logic only: all look & feel is theme-owned via data-part / data-state hooks (see style.css).
import { part } from '../../../core/util.js';
import { reducedMotion } from '../../../core/util.js';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const RANK = { absent: 1, present: 2, correct: 3 };

export default {
  id: 'wordle',
  kind: 'game',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  // Public styling API: every part below is a hook themes can style.
  parts: ['board', 'row', 'tile', 'keyboard', 'key-row', 'key', 'message', 'hint', 'retry'],
  // layoutParts are structural wrappers; themes rarely need to style them (excluded from coverage)
  layoutParts: ['board', 'row', 'keyboard', 'key-row'],
  copy: {
    title: 'Guess the word',
    hint: 'Hint: {{hint}}',
    short: 'Not enough letters',
    win: 'You got it!',
    lose: 'Out of guesses. The word was {{answer}}.',
    retry: 'Try again',
    enter: 'Enter',
    back: 'Delete',
  },
  paramsSchema: {
    type: 'object',
    required: ['answer'],
    properties: {
      answer: { type: 'string', pattern: '^[A-Za-z]{3,8}$' },
      maxGuesses: { type: 'integer', minimum: 3, maximum: 8 },
      hint: { type: 'string' },
      allowRetry: { type: 'boolean' },
    },
  },
  placeholderParams: { answer: 'STARS', maxGuesses: 5, hint: 'Look up tonight', allowRetry: true },

  mount(container, ctx) {
    const answer = ctx.params.answer.toUpperCase();
    const len = answer.length;
    const max = ctx.params.maxGuesses ?? 5;
    const allowRetry = ctx.params.allowRetry ?? true;
    const timers = [];
    let row = 0, col = 0, over = false;
    const letters = Array.from({ length: max }, () => Array(len).fill(''));

    const tiles = letters.map(() => Array.from({ length: len }, () => part('div', 'tile', { role: 'gridcell', 'data-state': 'empty' })));
    const rows = tiles.map((r, i) => part('div', 'row', { role: 'row', 'aria-label': `Guess ${i + 1}` }, r));
    const board = part('div', 'board', { role: 'grid', 'aria-label': ctx.t('title'), style: `--gk-cols:${len};--gk-rows:${max}` }, rows);
    const message = part('p', 'message', { role: 'status', 'aria-live': 'polite' });
    const keys = {};

    const makeKey = (k, label, aria, wide) => {
      const b = part('button', 'key', { type: 'button', 'data-key': k, 'data-state': 'idle', 'aria-label': aria, ...(wide ? { 'data-wide': '' } : {}) }, label);
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus off the key so typing keeps working
      b.addEventListener('click', () => press(k));
      keys[k] = b;
      return b;
    };
    const keyboard = part('div', 'keyboard', { role: 'group', 'aria-label': 'Keyboard' },
      KEY_ROWS.map((letterRow, i) => part('div', 'key-row', {}, [
        i === 2 ? makeKey('Enter', '↵', ctx.t('enter'), true) : null,
        ...[...letterRow].map((c) => makeKey(c, c, c)),
        i === 2 ? makeKey('Backspace', '⌫', ctx.t('back'), true) : null,
      ])));

    const hint = ctx.params.hint ? part('p', 'hint', {}, ctx.t('hint', { hint: ctx.params.hint })) : null;
    container.append(...[hint, board, message, keyboard].filter(Boolean));

    const say = (text) => { message.textContent = text; };
    const setTile = (r, c, ch) => { letters[r][c] = ch; tiles[r][c].textContent = ch; tiles[r][c].dataset.state = ch ? 'filled' : 'empty'; };
    const shake = (el) => { el.setAttribute('data-shake', ''); timers.push(setTimeout(() => el.removeAttribute('data-shake'), 400)); };

    function score(guess) {
      const res = Array(len).fill('absent');
      const left = {};
      for (let i = 0; i < len; i++) {
        if (guess[i] === answer[i]) res[i] = 'correct';
        else left[answer[i]] = (left[answer[i]] || 0) + 1;
      }
      for (let i = 0; i < len; i++) {
        if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
      }
      return res;
    }

    function submit() {
      if (col < len) { say(ctx.t('short')); shake(rows[row]); return; }
      const guess = letters[row].join('');
      const res = score(guess);
      res.forEach((state, i) => { tiles[row][i].style.setProperty('--i', i); tiles[row][i].dataset.state = state; });
      const settle = reducedMotion() ? 0 : len * 120 + 250;
      timers.push(setTimeout(() => {
        res.forEach((state, i) => {
          const k = keys[guess[i]];
          if (k && RANK[state] > (RANK[k.dataset.state] || 0)) k.dataset.state = state;
        });
      }, settle));

      if (guess === answer) {
        over = true; say(ctx.t('win')); ctx.fx.success(board); ctx.onComplete({ guesses: row + 1 });
      } else if (row + 1 >= max) {
        over = true; say(ctx.t('lose', { answer })); ctx.fx.fail(board); ctx.onFail({ reason: 'out_of_guesses' });
        if (allowRetry) {
          const retry = part('button', 'retry', { type: 'button' }, ctx.t('retry'));
          retry.addEventListener('click', reset);
          container.append(retry);
        }
      } else { row++; col = 0; }
    }

    function reset() {
      container.querySelector('[data-part="retry"]')?.remove();
      letters.forEach((r, ri) => r.forEach((_, ci) => { setTile(ri, ci, ''); tiles[ri][ci].style.removeProperty('--i'); }));
      Object.values(keys).forEach((k) => { k.dataset.state = 'idle'; });
      row = 0; col = 0; over = false; say('');
    }

    function press(k) {
      if (over) return;
      if (k === 'Enter') return submit();
      if (k === 'Backspace') { if (col > 0) { col--; setTile(row, col, ''); } return; }
      if (/^[A-Z]$/.test(k) && col < len) { setTile(row, col, k); col++; ctx.fx.tap(); }
    }

    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return;
      if (e.key === 'Enter' && e.target.closest?.('button')) return; // the button's own click handles it
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (k === 'Enter' || k === 'Backspace' || /^[A-Z]$/.test(k)) { e.preventDefault(); press(k); }
    };
    document.addEventListener('keydown', onKey);

    return { destroy() { document.removeEventListener('keydown', onKey); timers.forEach(clearTimeout); } };
  },
};
