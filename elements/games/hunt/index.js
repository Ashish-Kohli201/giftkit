// Hunt - a chain of clues. The recipient types an answer to each clue, one at a time.
// Answers are matched leniently (case, accents, punctuation and extra spaces are ignored) and the
// right answer is never revealed on a miss. After `hintAfter` misses on a clue, its hint (if any) appears.
// Solving a clue shows its optional `reveal` text (e.g. "Look under the second step"), then moves on.
// Progress (current clue) is kept through ctx.store, so closing and reopening resumes the hunt.
import { part } from '../../../core/util.js';

/** Lowercase (optional), drop accents, turn punctuation into spaces, collapse spaces. */
export function normalizeAnswer(text, ignoreCase = true) {
  const plain = String(text).normalize('NFD').replace(/\p{M}+/gu, '');
  return (ignoreCase ? plain.toLowerCase() : plain).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** True when `guess` equals the clue's `answer` or any of its `answers` alternates. */
export function isCorrect(clue, guess, ignoreCase = true) {
  const g = normalizeAnswer(guess, ignoreCase);
  if (!g) return false;
  return [clue.answer, ...(clue.answers ?? [])].some((a) => normalizeAnswer(a, ignoreCase) === g);
}

export default {
  id: 'hunt',
  kind: 'game',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['progress', 'dot', 'step', 'clue', 'form', 'input', 'submit', 'feedback', 'hint', 'reveal', 'next', 'done'],
  layoutParts: ['progress', 'form'],
  copy: {
    step: 'Clue {{n}} of {{total}}',
    progressLabel: 'Hunt progress',
    inputLabel: 'Your answer',
    placeholder: 'Type your answer',
    submit: 'Check',
    empty: 'Type an answer first.',
    right: 'That is it!',
    wrong: 'Not quite. Have another look.',
    hint: 'Hint: {{hint}}',
    next: 'Next clue',
    finish: 'Finish the hunt',
    done: 'Hunt complete! Every clue solved.',
  },
  paramsSchema: {
    type: 'object',
    required: ['clues'],
    properties: {
      hintAfter: { type: 'integer', minimum: 1, maximum: 5 },
      ignoreCase: { type: 'boolean' },
      clues: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', required: ['clue', 'answer'],
          properties: {
            clue: { type: 'string', minLength: 1 },
            answer: { type: 'string', minLength: 1 },
            answers: { type: 'array', items: { type: 'string', minLength: 1 } },
            hint: { type: 'string' },
            reveal: { type: 'string' },
          },
        },
      },
    },
  },
  placeholderParams: {
    hintAfter: 2,
    ignoreCase: true,
    clues: [
      { clue: 'I am the closest star to Earth. You can feel me on your face by day.', answer: 'Sun', answers: ['The Sun'], hint: 'It rises in the east.', reveal: 'Right! Now look for something that glows at night.' },
      { clue: 'I change shape every night, from a thin curve to a bright circle.', answer: 'Moon', hint: 'It orbits the Earth.', reveal: 'Nice. The next one is a pattern of stars.' },
      { clue: 'A group of stars that makes a picture is called a...', answer: 'Constellation', hint: 'It starts with the letter C.' },
    ],
  },

  mount(container, ctx) {
    const clues = ctx.params.clues;
    const total = clues.length;
    const hintAfter = ctx.params.hintAfter ?? 2;
    const ignoreCase = ctx.params.ignoreCase ?? true;
    const timers = [];

    // Saved progress: which clue we are on, whether it is already solved, and misses so far.
    const saved = ctx.store.get('progress', {});
    let index = Number.isInteger(saved.index) ? Math.min(Math.max(saved.index, 0), total) : 0;
    let solved = !!saved.solved && index < total;
    let totalMisses = Number.isInteger(saved.misses) ? saved.misses : 0;
    let clueMisses = 0;
    const save = () => ctx.store.set('progress', { index, solved, misses: totalMisses });

    const dots = clues.map(() => part('span', 'dot', { 'data-state': 'pending' }));
    const progress = part('div', 'progress', { role: 'group', 'aria-label': ctx.t('progressLabel') }, dots);
    const step = part('p', 'step', { 'aria-live': 'polite' });
    const clue = part('p', 'clue');
    const input = part('input', 'input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
      enterkeyhint: 'go', 'aria-label': ctx.t('inputLabel'), placeholder: ctx.t('placeholder'),
    });
    const submit = part('button', 'submit', { type: 'submit', 'data-variant': 'primary' }, ctx.t('submit'));
    const form = part('form', 'form', { novalidate: true }, input, submit);
    const feedback = part('p', 'feedback', { role: 'status', 'aria-live': 'polite' });
    const hint = part('p', 'hint', { hidden: true });
    const reveal = part('p', 'reveal', { hidden: true });
    const next = part('button', 'next', { type: 'button', hidden: true, 'data-variant': 'primary' });
    const done = part('p', 'done', { role: 'status', hidden: true }, ctx.t('done'));
    container.append(progress, step, clue, form, feedback, hint, reveal, next, done);

    const say = (text) => { feedback.textContent = text; };
    const shake = () => {
      form.setAttribute('data-shake', '');
      timers.push(setTimeout(() => form.removeAttribute('data-shake'), 400));
    };
    const paintDots = () => dots.forEach((d, i) => {
      d.dataset.state = i < index || (i === index && solved) ? 'solved' : i === index ? 'current' : 'pending';
    });

    // Draw clue `index` (fresh, or already solved when resuming).
    function show() {
      if (index >= total) return showDone(false);
      const c = clues[index];
      clueMisses = 0;
      paintDots();
      step.textContent = ctx.t('step', { n: index + 1, total });
      clue.textContent = c.clue;
      say('');
      hint.hidden = true;
      reveal.hidden = !(solved && c.reveal);
      reveal.textContent = solved && c.reveal ? c.reveal : '';
      next.hidden = !solved;
      next.textContent = index + 1 === total ? ctx.t('finish') : ctx.t('next');
      form.hidden = solved;
      input.value = '';
      input.disabled = submit.disabled = solved;
      if (solved) next.focus(); else input.focus({ preventScroll: true });
    }

    function showDone(announce) {
      paintDots();
      step.textContent = '';
      clue.textContent = '';
      form.hidden = true;
      hint.hidden = true;
      reveal.hidden = true;
      next.hidden = true;
      say('');
      done.hidden = false;
      if (announce) ctx.fx.success(container);
      ctx.onComplete({ clues: total, misses: totalMisses });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (solved || index >= total) return;
      const c = clues[index];
      if (!input.value.trim()) { say(ctx.t('empty')); shake(); return; }
      if (isCorrect(c, input.value, ignoreCase)) {
        solved = true;
        save();
        ctx.fx.success(form);
        show();
        say(ctx.t('right'));
        return;
      }
      clueMisses++;
      totalMisses++;
      save();
      say(ctx.t('wrong'));
      shake();
      ctx.fx.fail(form);
      ctx.onFail({ reason: 'wrong_answer', clue: index });
      if (c.hint && clueMisses >= hintAfter) {
        hint.textContent = ctx.t('hint', { hint: c.hint });
        hint.hidden = false;
      }
      input.select();
    });

    next.addEventListener('click', () => {
      index++;
      solved = false;
      save();
      if (index >= total) return showDone(true);
      show();
    });

    show();

    return { destroy() { timers.forEach(clearTimeout); } };
  },
};
