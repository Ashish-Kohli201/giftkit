// FRIENDLY EDITORS for the games people use most. The generic schema form can edit any game, but these say things the way the
// owner thinks about them ("the word", "who is it more likely to be", "put these in order") and show what the player will see.
//
//   const ed = customEditor('wordle', { params, update })   // { el, skip: [fields it handles] } or null
//
// `params()` returns the game's CURRENT settings; `update(fn, key)` edits a copy and saves it (see schema-form.js).
import { store } from './store.js';
import { mediaThumb, pickMedia, slotLabel } from './media-picker.js';
import { btn, chip, h, icon, input, textarea, toggle } from './ui-kit.js';
import { delIn, getIn, setIn } from './schema-form.js';
import { makeSortable, moveItem } from './nights-sortable.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** A number with minus and plus buttons (and a box to type in). */
function stepper(value, { min, max, onChange, label }) {
  const box = input({ type: 'number', min, max, value, 'aria-label': label, onchange: (e) => { const n = clamp(Math.round(Number(e.target.value) || min), min, max); e.target.value = n; onChange(n); } });
  const step = (d) => { const n = clamp((Number(box.value) || min) + d, min, max); box.value = n; onChange(n); };
  return h('div.stepper', {}, btn('', { small: true, icon: 'down', title: `Fewer ${label ?? ''}`.trim(), onClick: () => step(-1) }), box, btn('', { small: true, icon: 'up', title: `More ${label ?? ''}`.trim(), onClick: () => step(1) }));
}
const row = (title, control, hint) => h('div.field', {}, h('label', {}, title), control, hint ? h('p.hint', {}, hint) : null);
const tools = (list, i, { onUp, onDown, onRemove, minItems = 0 }) => h('span.sform-item-tools', {},
  btn('', { small: true, variant: 'ghost', icon: 'up', title: 'Move up', disabled: i === 0, onClick: onUp }),
  btn('', { small: true, variant: 'ghost', icon: 'down', title: 'Move down', disabled: i === list.length - 1, onClick: onDown }),
  btn('', { small: true, variant: 'ghost', icon: 'trash', title: 'Remove', disabled: list.length <= minItems, onClick: onRemove }));

// ------------------------------------------------------------------ wordle
function wordle({ params, update }) {
  const NAME = '{{recipient}}';
  const tiles = h('div.tile-row', { 'aria-label': 'What the player will see' });
  const answer = input({ maxlength: 8, placeholder: 'A word of 3 to 8 letters', autocomplete: 'off', 'aria-label': 'The word', oninput: (e) => {
    const letters = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8);
    e.target.value = letters;
    update((p) => (letters ? setIn(p, ['answer'], letters) : delIn(p, ['answer'])), 'answer');
    paintTiles();
  } });
  const useName = toggle('Use her name as the word', params().answer === NAME, (on) => {
    update((p) => (on ? setIn(p, ['answer'], NAME) : delIn(p, ['answer'])), 'answer');
    answer.value = on ? '' : answer.value; paintTiles(); paintMode();
  }, { hint: 'The word becomes her name, whatever it is (3 to 8 letters).' });
  const paintMode = () => { const on = params().answer === NAME; answer.disabled = on; answer.closest('.field').hidden = on; };
  function paintTiles() {
    const raw = params().answer ?? '';
    const word = raw === NAME ? String(store.current.raw.people?.recipient ?? '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) : raw;
    tiles.replaceChildren(...(word ? [...word].map((c) => h('span.tile', {}, c)) : [h('span.muted', {}, 'Type the word to see its tiles')]));
    tiles.dataset.length = String(word.length);
  }
  answer.value = params().answer && params().answer !== NAME ? params().answer : '';
  const hint = input({ value: params().hint ?? '', placeholder: 'A small clue (optional)', oninput: (e) => update((p) => (e.target.value ? setIn(p, ['hint'], e.target.value) : delIn(p, ['hint'])), 'hint') });
  const el = h('div.game-editor', {},
    h('div.field', {}, h('label', {}, 'The word they have to guess'), answer, tiles),
    useName,
    row('How many guesses', stepper(params().maxGuesses ?? 6, { min: 3, max: 8, label: 'guesses', onChange: (n) => update((p) => setIn(p, ['maxGuesses'], n), 'guesses') })),
    row('A clue (shown above the tiles)', hint));
  paintTiles(); paintMode();
  return { el, skip: ['answer', 'maxGuesses', 'hint'] };
}

// ------------------------------------------------------------------ quiz (questions, or "who said it?")
function quiz({ params, update }) {
  const holder = h('div.sform-items');
  const mode = () => params().mode ?? 'quiz';
  const modeBar = h('div.segmented', { role: 'group', 'aria-label': 'Kind of questions' });
  const passRow = h('div.field');
  const setMode = (m) => {
    update((p) => {
      p.mode = m;
      if (m === 'whosaid') { p.passMark = 0; for (const q of p.questions ?? []) { q.correct = null; delete q.options; } }
      else { p.passMark = p.passMark > 0 ? p.passMark : 0.6; for (const q of p.questions ?? []) { q.options = q.options?.length >= 2 ? q.options : ['', '']; q.correct = Number.isInteger(q.correct) ? q.correct : 0; } }
    }, 'mode');
    paint();
  };
  function paint() {
    const who = mode() === 'whosaid';
    modeBar.replaceChildren(...[['quiz', 'Quiz (right and wrong answers)'], ['whosaid', 'Who is it more likely to be? (no wrong answers)']].map(([m, l]) =>
      h('button.seg', { type: 'button', 'aria-pressed': String(mode() === m), onclick: () => setMode(m) }, l)));
    const pass = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round((params().passMark ?? 0.6) * 100), 'aria-label': 'Pass mark', oninput: (e) => { label.textContent = `${e.target.value}% right to pass`; update((p) => { p.passMark = Number(e.target.value) / 100; }, 'pass'); } });
    const label = h('span', {}, `${Math.round((params().passMark ?? 0.6) * 100)}% right to pass`);
    passRow.replaceChildren(...(who ? [] : [h('label', {}, 'How much they need to get right'), pass, label]));
    passRow.hidden = who;
    const qs = params().questions ?? [];
    holder.replaceChildren(...qs.map((q, i) => {
      const optionsBox = h('div.options');
      const paintOptions = () => {
        const cur = params().questions[i];
        if (who) { optionsBox.replaceChildren(); return; }
        const rows = (cur.options ?? []).map((o, oi) => h('div.option-row', {},
          h('input', { type: 'radio', name: `correct-${i}`, checked: cur.correct === oi, 'aria-label': `Option ${oi + 1} is the right answer`, onchange: () => update((p) => { p.questions[i].correct = oi; }, `q${i}-correct`) }),
          input({ value: o, placeholder: `Option ${oi + 1}`, oninput: (e) => update((p) => { p.questions[i].options[oi] = e.target.value; }, `q${i}-o${oi}`) }),
          btn('', { small: true, variant: 'ghost', icon: 'close', title: 'Remove option', disabled: cur.options.length <= 2, onClick: () => { update((p) => { const qq = p.questions[i]; qq.options.splice(oi, 1); if (qq.correct >= qq.options.length) qq.correct = 0; }); paintOptions(); } })));
        const add = (cur.options?.length ?? 0) < 4 ? btn('Add an option', { small: true, icon: 'plus', onClick: () => { update((p) => { p.questions[i].options.push(''); }); paintOptions(); } }) : null;
        optionsBox.replaceChildren(h('p.hint', {}, 'Tick the right answer.'), ...rows, add);
      };
      paintOptions();
      return h('div.sform-item', {}, h('div.sform-item-head', {}, h('strong', {}, `Question ${i + 1}`),
        tools(qs, i, { minItems: 1,
          onUp: () => { update((p) => moveItem(p.questions, i, i - 1)); paint(); }, onDown: () => { update((p) => moveItem(p.questions, i, i + 1)); paint(); },
          onRemove: () => { update((p) => p.questions.splice(i, 1)); paint(); } })),
        h('div.sform-item-body', {}, h('div.field', {}, h('label', {}, who ? 'The question' : 'The question'), input({ value: q.q ?? '', placeholder: who ? 'Who is more likely to fall asleep during a movie?' : 'Which planet is closest to the Sun?', oninput: (e) => update((p) => { p.questions[i].q = e.target.value; }, `q${i}-q`) })),
          optionsBox,
          h('div.field', {}, h('label', {}, 'A line after they answer (optional)'), input({ value: q.explain ?? '', oninput: (e) => update((p) => { if (e.target.value) p.questions[i].explain = e.target.value; else delete p.questions[i].explain; }, `q${i}-explain`) }))));
    }));
    holder.append(btn('Add a question', { small: true, icon: 'plus', disabled: qs.length >= 12, onClick: () => { update((p) => { (p.questions ??= []).push(who ? { q: '', correct: null } : { q: '', options: ['', ''], correct: 0 }); }); paint(); } }));
  }
  paint();
  return { el: h('div.game-editor', {}, h('div.field', {}, h('label', {}, 'Kind of game'), modeBar), passRow, h('div.field', {}, h('label', {}, 'The questions'), holder)), skip: ['mode', 'passMark', 'questions'] };
}

// ------------------------------------------------------------------ hunt (follow the clues)
function hunt({ params, update }) {
  const holder = h('div.sform-items');
  function paint() {
    const clues = params().clues ?? [];
    holder.replaceChildren(...clues.map((c, i) => {
      const chips = h('div.chips');
      const paintChips = () => {
        const alts = params().clues[i].answers ?? [];
        chips.replaceChildren(...alts.map((a, ai) => chip(`${a}  x`, { onClick: () => { update((p) => { p.clues[i].answers.splice(ai, 1); if (!p.clues[i].answers.length) delete p.clues[i].answers; }); paintChips(); }, title: 'Remove' })),
          input({ placeholder: 'Another answer that counts (Enter)', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); const v = e.target.value.trim(); update((p) => { (p.clues[i].answers ??= []).push(v); }); paintChips(); } } }));
      };
      paintChips();
      const text = (name, labelText, ph, long) => h('div.field', {}, h('label', {}, labelText), (long ? textarea : input)({ value: c[name] ?? '', rows: 2, placeholder: ph, oninput: (e) => update((p) => { if (e.target.value) p.clues[i][name] = e.target.value; else if (name !== 'clue' && name !== 'answer') delete p.clues[i][name]; else p.clues[i][name] = ''; }, `clue${i}-${name}`) }));
      const body = h('div.sform-item-body', {}, text('clue', 'The clue', 'I am full of stories but never speak. Find me on a shelf.', true), text('answer', 'The answer they type', 'book'), h('div.field', {}, h('label', {}, 'Other answers that also count'), chips),
        text('hint', 'A hint (shown after a few wrong tries)', 'You read me.'), text('reveal', 'What to do next (shown when they get it right)', 'Look inside it for the next clue.'));
      const box = body.querySelectorAll('textarea'); if (box[0]) box[0].value = c.clue ?? '';
      return h('div.sform-item', {}, h('div.sform-item-head', {}, h('strong', {}, `Clue ${i + 1}`), tools(clues, i, { minItems: 1, onUp: () => { update((p) => moveItem(p.clues, i, i - 1)); paint(); }, onDown: () => { update((p) => moveItem(p.clues, i, i + 1)); paint(); }, onRemove: () => { update((p) => p.clues.splice(i, 1)); paint(); } })), body);
    }));
    holder.append(btn('Add a clue', { small: true, icon: 'plus', disabled: clues.length >= 12, onClick: () => { update((p) => { (p.clues ??= []).push({ clue: '', answer: '' }); }); paint(); } }));
  }
  paint();
  return { el: h('div.game-editor', {}, h('div.field', {}, h('label', {}, 'The clues, in order'), holder)), skip: ['clues'] };
}

// ------------------------------------------------------------------ memory (match the pairs)
function memory({ params, update }) {
  const faces = h('div.faces');
  const bar = h('div.segmented', { role: 'group', 'aria-label': 'Card faces' });
  const kind = () => { const f = params().faces; return f === '@all' ? 'pictures' : Array.isArray(f) && f.length ? 'pick' : 'default'; };
  function paint() {
    const k = kind();
    bar.replaceChildren(...[['pictures', 'Use my pictures'], ['pick', 'Pick pictures'], ['default', 'Little symbols']].map(([id, l]) => h('button.seg', { type: 'button', 'aria-pressed': String(k === id), onclick: () => {
      update((p) => { if (id === 'pictures') p.faces = '@all'; else if (id === 'default') delete p.faces; else p.faces = Array.isArray(p.faces) ? p.faces : []; }, 'faces');
      if (id === 'pick' && !(params().faces ?? []).length) choose(); else paint();
    } }, l)));
    const imgs = store.mediaOf('image');
    faces.replaceChildren();
    if (k === 'pictures') faces.append(h('p.hint', {}, imgs.length ? `The cards use your ${imgs.length} picture${imgs.length === 1 ? '' : 's'} (the first ${Math.min(imgs.length, params().pairs ?? 6)}).` : 'You have no pictures yet, so little symbols are used until you add some in Media.'));
    if (k === 'pick') {
      const picked = params().faces ?? [];
      faces.append(h('div.thumbs', {}, picked.map((s) => { const e = store.current.media.find((m) => `@${m.id}` === s); return e ? mediaThumb(e, 56) : h('span.chip', {}, `${slotLabel(s)} (missing)`); })), btn(picked.length ? 'Change pictures' : 'Pick pictures', { small: true, icon: 'image', onClick: choose }),
        h('p.hint', {}, `${picked.length} of ${params().pairs ?? 6} cards have a picture; the rest use symbols.`));
    }
  }
  async function choose() { const picks = await pickMedia({ type: 'image', multiple: true, selected: params().faces ?? [] }); if (picks) update((p) => { p.faces = picks.slice(0, 15); }, 'faces'); paint(); }
  paint();
  return { el: h('div.game-editor', {}, row('Pairs of cards', stepper(params().pairs ?? 6, { min: 3, max: 15, label: 'pairs', onChange: (n) => { update((p) => { p.pairs = n; }, 'pairs'); paint(); } })), h('div.field', {}, h('label', {}, 'What is on the cards'), bar, faces)), skip: ['pairs', 'faces'] };
}

// ------------------------------------------------------------------ jigsaw
function jigsaw({ params, update }) {
  const holder = h('div.faces');
  function paint() {
    const img = params().image;
    const auto = img === '@any';
    const entry = !auto && img ? store.current.media.find((m) => `@${m.id}` === img) : null;
    holder.replaceChildren(
      h('div.segmented', { role: 'group', 'aria-label': 'Which picture' },
        h('button.seg', { type: 'button', 'aria-pressed': String(auto), onclick: () => { update((p) => { p.image = '@any'; }, 'image'); paint(); } }, 'The first picture I added'),
        h('button.seg', { type: 'button', 'aria-pressed': String(!auto), onclick: async () => { const pick = await pickMedia({ type: 'image' }); if (pick) { update((p) => { p.image = pick; }, 'image'); paint(); } } }, 'Pick a picture')),
      !auto ? h('div.media-field', {}, entry ? mediaThumb(entry, 56) : null, h('span', {}, img ? (entry ? slotLabel(img) : `${slotLabel(img)} (file missing)`) : 'No picture chosen yet')) : null);
  }
  paint();
  return { el: h('div.game-editor', {}, h('div.field', {}, h('label', {}, 'The picture to put together'), holder),
    h('div.grid-2', {}, row('Pieces across', stepper(params().cols ?? 3, { min: 2, max: 6, label: 'columns', onChange: (n) => update((p) => { p.cols = n; }, 'cols') })), row('Pieces down', stepper(params().rows ?? 3, { min: 2, max: 6, label: 'rows', onChange: (n) => update((p) => { p.rows = n; }, 'rows') })))), skip: ['image', 'cols', 'rows', 'shuffleSeed'] };
}

// ------------------------------------------------------------------ timeline (put it in order)
function timeline({ params, update }) {
  const holder = h('div.sform-items.sortable-list');
  makeSortable(holder, { itemSelector: '.sform-item', handleSelector: '.grip', onMove: (from, to) => { update((p) => moveItem(p.events, from, to)); paint(); } });
  function paint() {
    const events = params().events ?? [];
    holder.replaceChildren(...events.map((ev, i) => {
      const f = (name, ph) => input({ value: ev[name] ?? '', placeholder: ph, oninput: (e) => update((p) => { if (e.target.value || name === 'label') p.events[i][name] = e.target.value; else delete p.events[i][name]; }, `ev${i}-${name}`) });
      return h('div.sform-item', {}, h('div.sform-item-head', {}, h('button.grip', { type: 'button', 'aria-label': `Drag moment ${i + 1} to move it`, title: 'Drag to move (or use the arrow keys)' }, icon('grip', 16)), h('strong', {}, `${i + 1}. ${ev.label || 'A moment'}`),
        tools(events, i, { minItems: 3, onUp: () => { update((p) => moveItem(p.events, i, i - 1)); paint(); }, onDown: () => { update((p) => moveItem(p.events, i, i + 1)); paint(); }, onRemove: () => { update((p) => p.events.splice(i, 1)); paint(); } })),
        h('div.sform-item-body', {}, h('div.field', {}, h('label', {}, 'What happened'), f('label', 'The first message')), h('div.grid-2', {}, h('div.field', {}, h('label', {}, 'A few words more (optional)'), f('detail', 'Nervous typing, many drafts.')), h('div.field', {}, h('label', {}, 'When (optional, shown once solved)'), f('date', 'March 2022')))));
    }));
    holder.append(btn('Add a moment', { small: true, icon: 'plus', disabled: events.length >= 10, onClick: () => { update((p) => { (p.events ??= []).push({ label: '' }); }); paint(); } }));
  }
  paint();
  return { el: h('div.game-editor', {}, h('div.field', {}, h('label', {}, 'The moments, in the order they really happened'), h('p.hint', {}, 'Write them in the right order. We shuffle them for the player, who puts them back.'), holder)), skip: ['events'] };
}

const EDITORS = { wordle, quiz, hunt, memory, jigsaw, timeline };
export function customEditor(type, ctx) { return EDITORS[type]?.(ctx) ?? null; }
