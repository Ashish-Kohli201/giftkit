// Vault - the finale gate. The code is DERIVED from collected fragments by the engine and passed in as params.code.
// Never hardcode a code in config. Wrong code = feedback + clear (no silent loops, no lockout).
import { part } from '../../../core/util.js';
import { FRAGMENT_ALPHABET } from '../../../core/fragments.js';

export default {
  id: 'vault',
  kind: 'finale',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['slots', 'slot', 'keypad', 'key', 'clear', 'submit', 'message'],
  layoutParts: ['slots', 'keypad'],
  copy: {
    prompt: 'Enter the {{length}} fragments you collected, in order.',
    wrong: 'That is not it. Try again.',
    open: 'The vault opens...',
    clear: 'Delete',
    submit: 'Open',
  },
  paramsSchema: {
    type: 'object',
    required: ['code'],
    properties: { code: { type: 'string', pattern: '^[A-Za-z0-9]{3,12}$' } },
  },
  placeholderParams: { code: 'STAR7' },

  mount(container, ctx) {
    const code = ctx.params.code.toUpperCase();
    const timers = [];
    let entered = [], attempts = 0, opened = false;

    const slots = Array.from({ length: code.length }, () => part('span', 'slot', { 'data-state': 'empty', 'aria-hidden': 'true' }));
    const slotRow = part('div', 'slots', { role: 'status', 'aria-label': 'Code entry' }, slots);
    const message = part('p', 'message', { role: 'status', 'aria-live': 'polite' }, ctx.t('prompt', { length: code.length }));
    const submit = part('button', 'submit', { type: 'button', disabled: true, 'data-variant': 'primary' }, ctx.t('submit'));
    const clear = part('button', 'clear', { type: 'button', 'aria-label': ctx.t('clear') }, '⌫');
    const keys = [...FRAGMENT_ALPHABET].map((c) => {
      const b = part('button', 'key', { type: 'button', 'data-key': c }, c);
      b.addEventListener('click', () => push(c));
      return b;
    });
    const keypad = part('div', 'keypad', { role: 'group', 'aria-label': 'Keypad' }, keys, clear);
    container.append(slotRow, message, keypad, submit);

    function paint() {
      slots.forEach((s, i) => { s.textContent = entered[i] ?? ''; s.dataset.state = entered[i] ? 'filled' : 'empty'; });
      slotRow.setAttribute('aria-label', `Code entry: ${entered.length} of ${code.length} entered`);
      submit.disabled = entered.length !== code.length;
    }
    function push(c) {
      if (opened || entered.length >= code.length) return;
      entered.push(c); ctx.fx.tap(); paint();
    }
    clear.addEventListener('click', () => { if (!opened) { entered.pop(); paint(); } });
    submit.addEventListener('click', () => {
      if (opened || entered.length !== code.length) return;
      if (entered.join('') === code) {
        opened = true;
        container.dataset.state = 'open';
        slots.forEach((s) => { s.dataset.state = 'open'; });
        message.textContent = ctx.t('open');
        ctx.fx.unlock(slotRow);
        ctx.onComplete({ attempts: attempts + 1 });
      } else {
        attempts++;
        message.textContent = ctx.t('wrong');
        slotRow.setAttribute('data-shake', '');
        slots.forEach((s) => { s.dataset.state = 'error'; });
        ctx.fx.fail(slotRow);
        ctx.onFail({ attempts });
        timers.push(setTimeout(() => { slotRow.removeAttribute('data-shake'); entered = []; paint(); }, 600));
      }
    });
    paint();
    return { destroy() { timers.forEach(clearTimeout); } };
  },
};
