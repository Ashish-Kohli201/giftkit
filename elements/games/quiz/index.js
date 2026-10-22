// Quiz - multiple choice. One module covers three flavors via params:
//   mode "quiz"    : questions with a correct option
//   mode "whosaid" : "who said it / who is more likely" - options default to [recipient, sender]
//   correct: null  : a "no wrong answer" question (always counts)
// Failing shows a result + Retry (never a silent loop). passMark is configurable.
import { part } from '../../../core/util.js';

export default {
  id: 'quiz',
  kind: 'game',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['progress', 'question', 'options', 'option', 'feedback', 'next', 'result', 'retry'],
  layoutParts: ['options'],
  copy: {
    progress: 'Question {{n}} of {{total}}',
    right: 'Correct!',
    wrong: 'Not quite.',
    neutral: 'Love that answer.',
    next: 'Next',
    finish: 'See result',
    score: 'You got {{score}} of {{total}}.',
    passed: 'Well done!',
    failed: 'Almost - you need {{need}} right. Give it another go.',
    retry: 'Try again',
    optRecipient: 'You',
    optSender: 'Me',
  },
  paramsSchema: {
    type: 'object',
    required: ['questions'],
    properties: {
      mode: { type: 'string', enum: ['quiz', 'whosaid'] },
      passMark: { type: 'number', minimum: 0, maximum: 1 },
      allowRetry: { type: 'boolean' },
      questions: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1 },
            options: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } },
            correct: { type: ['integer', 'null'], minimum: 0, maximum: 3 },
            explain: { type: 'string' },
          },
        },
      },
    },
  },
  placeholderParams: {
    mode: 'quiz',
    passMark: 0.6,
    questions: [
      { q: 'Which planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Mars'], correct: 1, explain: 'Mercury orbits closest.' },
      { q: 'How many moons does Earth have?', options: ['None', 'One', 'Two', 'Three'], correct: 1 },
      { q: 'What do we call a group of stars that forms a picture?', options: ['A galaxy', 'A comet', 'A constellation'], correct: 2 },
    ],
  },

  mount(container, ctx) {
    const mode = ctx.params.mode ?? 'quiz';
    const passMark = ctx.params.passMark ?? 0.6;
    const allowRetry = ctx.params.allowRetry ?? true;
    const qs = ctx.params.questions.map((q) => ({
      ...q,
      options: q.options ?? (mode === 'whosaid'
        ? [ctx.vars.recipient ?? ctx.t('optRecipient'), ctx.vars.sender ?? ctx.t('optSender')]
        : ['Yes', 'No']),
      correct: q.correct === undefined ? null : q.correct,
    }));
    const need = Math.ceil(qs.length * passMark);
    let idx = 0, score = 0;

    function show() {
      container.replaceChildren();
      const q = qs[idx];
      const feedback = part('p', 'feedback', { role: 'status', 'aria-live': 'polite' });
      const next = part('button', 'next', { type: 'button', hidden: true, 'data-variant': 'primary' },
        idx + 1 === qs.length ? ctx.t('finish') : ctx.t('next'));
      const buttons = q.options.map((text, i) => {
        const b = part('button', 'option', { type: 'button', 'data-state': 'idle' }, text);
        b.addEventListener('click', () => choose(i));
        return b;
      });

      function choose(i) {
        if (next.hidden === false) return; // already answered
        const hasAnswer = q.correct !== null;
        const ok = !hasAnswer || i === q.correct;
        if (ok) score++;
        buttons.forEach((b, bi) => {
          b.disabled = true;
          if (!hasAnswer) b.dataset.state = bi === i ? 'selected' : 'idle';
          else b.dataset.state = bi === q.correct ? 'correct' : bi === i ? 'wrong' : 'idle';
        });
        feedback.textContent = [!hasAnswer ? ctx.t('neutral') : ok ? ctx.t('right') : ctx.t('wrong'), q.explain].filter(Boolean).join(' ');
        (ok ? ctx.fx.success : ctx.fx.fail)(buttons[i]);
        next.hidden = false;
        next.focus();
      }
      next.addEventListener('click', () => { idx++; idx < qs.length ? show() : finish(); });

      container.append(
        part('p', 'progress', {}, ctx.t('progress', { n: idx + 1, total: qs.length })),
        part('h3', 'question', {}, q.q),
        part('div', 'options', { role: 'group', 'aria-label': q.q }, buttons),
        feedback,
        next,
      );
    }

    function finish() {
      container.replaceChildren();
      const pass = score >= need;
      container.append(part('div', 'result', { role: 'status', 'data-state': pass ? 'pass' : 'fail' },
        part('p', 'question', {}, ctx.t('score', { score, total: qs.length })),
        part('p', 'feedback', {}, pass ? ctx.t('passed') : ctx.t('failed', { need }))));
      if (pass) { ctx.fx.success(container); ctx.onComplete({ score, total: qs.length }); return; }
      ctx.fx.fail(container);
      ctx.onFail({ score, total: qs.length, need });
      if (allowRetry) {
        const retry = part('button', 'retry', { type: 'button', 'data-variant': 'primary' }, ctx.t('retry'));
        retry.addEventListener('click', () => { idx = 0; score = 0; show(); });
        container.append(retry);
      }
    }

    show();
    return { destroy() {} };
  },
};
