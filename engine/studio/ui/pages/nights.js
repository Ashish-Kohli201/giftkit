// NIGHTS: the heart of the studio. One card per night, in order. Each holds the night's game (with its settings), a line above the
// game, and the story the recipient reads when the night is finished. Everything saves as you type and the live preview follows.
//
// The screen is built once. Typing never re-renders (it would steal the cursor); a night's card is rebuilt only when the list's
// shape changes (add, move, delete) and the whole screen only when the gift is replaced (undo / redo).
import { registry } from '/repo/elements/registry.js';
import { addDays, longDate } from '../catalog.js';
import { previewGo, previewReload } from '../preview.js';
import { customEditor } from '../nights-games.js';
import { gameList, gameTitle, GAMES, newNight, problemsForNight, starterNights, freshParams } from '../nights-data.js';
import { makeSortable, moveItem } from '../nights-sortable.js';
import { schemaForm } from '../schema-form.js';
import { badge, btn, confirmBox, field, h, icon, input, modal, plural, select, textarea, toast } from '../ui-kit.js';

// kept across rebuilds (undo, redo) so the screen comes back looking the same
const memo = { open: null, scrollY: 0 };

export default {
  id: 'nights', title: 'Nights', hint: 'Games and stories',
  render(root, { store, goStep }) {
    const raw = () => store.current.raw;
    const days = () => raw().days ?? [];
    const tier = () => raw().meta?.tier;
    const edit = (fn, coalesce) => store.edit((d) => fn(d), coalesce ? { coalesce } : {});
    const editNight = (i, fn, key) => edit((d) => fn(d.days[i]), key && `night-${i}-${key}`);
    const editParams = (i, fn, key) => editNight(i, (n) => { n.game.params ??= {}; fn(n.game.params); }, key && `p-${key}`);

    const list = h('div.nights');
    let cards = []; // [{ el, refresh(), closeBody(), openBody() }]
    const dateOf = (i) => { const s = raw().schedule; return s?.mode === 'date' && s.startDate ? longDate(addDays(s.startDate, i)) : ''; };

    // ---------------------------------------------------------------- list changes (the only times cards are rebuilt)
    /** Change the shape of the list, renumber the nights 1..N, and rebuild the cards. */
    function restructure(fn, open = memo.open) {
      edit((d) => {
        d.days ??= [];
        const before = d.days.map((n) => n.day);
        fn(d.days);
        d.days.forEach((n, idx) => {
          // a story title that is just "Night <old number>" follows the night to its new place
          if (n.story?.title === `Night ${n.day}`) n.story.title = `Night ${idx + 1}`;
          n.day = idx + 1;
        });
        void before;
      });
      memo.open = open;
      paintList();
    }
    const mapOpenAfterMove = (open, from, to) => (open === from ? to : open != null && from < open && open <= to ? open - 1 : open != null && to <= open && open < from ? open + 1 : open);

    // ---------------------------------------------------------------- one night's card
    function buildCard(i) {
      const night = () => days()[i];
      const head = h('div.night-head');
      const body = h('div.night-body', { hidden: true });
      const el = h('article.night', { 'data-index': i }, head, body);
      let editorApi = null;

      const problems = () => problemsForNight(store.current.report, night().day);
      const paintHead = () => {
        const n = night();
        const errs = problems().filter((p) => p.level === 'error').length;
        const warns = problems().filter((p) => p.level === 'warning').length;
        const summary = (n.story?.text || n.note || '').trim();
        const open = memo.open === i;
        head.replaceChildren(
          h('button.night-grip.grip', { type: 'button', 'aria-label': `Drag night ${n.day} to move it`, title: 'Drag to move (or use the arrow keys)' }, icon('grip', 18)),
          h('span.night-num', {}, String(n.day)),
          h('button.night-toggle', { type: 'button', 'aria-expanded': String(open), 'aria-controls': `night-body-${i}`, onclick: () => setOpen(open ? null : i) },
            h('span.night-title', {}, gameTitle(n.game?.type), dateOf(i) ? h('span.night-date', {}, ` - opens ${dateOf(i)}`) : null),
            h('span.night-summary.muted', {}, summary ? (summary.length > 90 ? `${summary.slice(0, 90)}...` : summary) : (tier() === 'signature' ? 'No story yet' : 'Nothing written yet'))),
          h('span.night-badges', {}, errs ? badge(`${errs} to fix`, 'bad') : warns ? badge('Worth a look', 'warn') : null),
          h('span.night-tools', {},
            btn('', { small: true, variant: 'ghost', icon: 'up', title: `Move night ${n.day} up`, disabled: i === 0, onClick: () => move(i, i - 1) }),
            btn('', { small: true, variant: 'ghost', icon: 'down', title: `Move night ${n.day} down`, disabled: i === days().length - 1, onClick: () => move(i, i + 1) }),
            btn('', { small: true, variant: 'ghost', icon: 'copy', title: `Duplicate night ${n.day}`, onClick: () => duplicate(i) }),
            btn('', { small: true, variant: 'ghost', icon: 'trash', title: `Delete night ${n.day}`, onClick: () => remove(i) })));
        el.classList.toggle('is-open', open);
        el.classList.toggle('has-error', errs > 0);
      };

      function buildEditor() {
        const n = night();
        const type = n.game?.type;
        const element = registry[type];
        const wrap = h('div.night-editor', { id: `night-body-${i}` });

        const problemBox = h('div.callout.callout-bad', { hidden: true });
        const paintProblems = () => {
          const mine = problems();
          problemBox.hidden = !mine.some((p) => p.level === 'error');
          problemBox.replaceChildren(icon('alert'), h('div', {}, h('strong', {}, 'To fix before sending'), h('ul', {}, mine.filter((p) => p.level === 'error').map((p) => h('li', {}, p.path ? `${p.path}: ` : '', p.message)))));
          editorApi?.form?.setProblems(mine.filter((p) => p.path));
        };

        // ---- 1. which game
        const gameSelect = select(gameList().map((g) => [g.id, g.title]), { value: type, 'aria-label': 'Game', onchange: async (e) => {
          const next = e.target.value;
          if (next === type) return;
          const ok = await confirmBox({ title: 'Change the game?', message: `Night ${n.day} will become "${gameTitle(next)}" and its current game settings will be cleared. Your story stays.`, confirm: 'Change the game', danger: true });
          if (!ok) { e.target.value = type; return; }
          editNight(i, (x) => { x.game = { type: next, params: freshParams(next) }; });
          rebuildCard(i);
        } });
        const info = h('p.hint', {}, GAMES[type]?.line ?? '');

        // ---- 2. its settings: a friendly editor where we have one, and the generic form for everything else
        const params = () => night().game?.params ?? {};
        const custom = element ? customEditor(type, { params, update: (fn, key) => editParams(i, fn, key) }) : null;
        const form = element ? schemaForm({ schema: element.paramsSchema, getParams: params, update: (fn, key) => editParams(i, fn, key), skip: custom?.skip ?? [], copyDefaults: element.copy }) : null;
        const settings = h('div.night-section', {}, h('h3', {}, 'The game'), h('div.field', {}, h('label', {}, 'Which game'), gameSelect, info),
          element ? null : h('div.callout.callout-warn', {}, icon('alert'), h('div', {}, `"${type}" is not a game this studio knows. Change it to one of the games above.`)),
          custom?.el, form && form.el.children.length ? h('div.night-more', {}, custom ? h('h4', {}, 'More settings') : null, form.el) : null);

        // ---- 3. the line above the game
        const note = input({ value: n.note ?? '', placeholder: 'A small one to warm up.', oninput: (e) => editNight(i, (x) => { if (e.target.value) x.note = e.target.value; else delete x.note; }, 'note') });
        const noteSec = h('div.night-section', {}, h('h3', {}, 'A line above the game'), field('Shown just above the game (optional)', note));

        // ---- 4. the story
        const storySec = storyEditor(i);

        // ---- 5. try it
        const tryBar = h('div.night-try', {},
          btn('Try this night', { variant: 'primary', icon: 'play', onClick: () => tryNight(n.day) }),
          btn('See the room after this night', { icon: 'eye', onClick: async () => { await settled(); store.ui.night = n.day; previewReload(); } }),
          h('span.hint', {}, 'Opens the live preview on this night, exactly as the player sees it.'));

        wrap.append(problemBox, settings, noteSec, storySec.el, tryBar);
        editorApi = { el: wrap, form, paintProblems };
        paintProblems();
        return wrap;
      }

      /** Story: the card the recipient reads when the night is finished. */
      function storyEditor(idx) {
        const n = () => days()[idx];
        const title = input({ value: n().story?.title ?? '', placeholder: `Night ${n().day}`, 'aria-label': 'Story title', oninput: () => save('title') });
        const text = textarea({ rows: 5, 'aria-label': 'Story text', placeholder: 'What happened that night, in your own words...', oninput: () => { save('text'); count(); } });
        text.value = n().story?.text ?? '';
        const counter = h('span.hint');
        const warn = h('p.hint.story-warn');
        const count = () => {
          const len = text.value.length;
          counter.textContent = `${len} character${len === 1 ? '' : 's'}`;
          warn.textContent = tier() === 'signature' && !text.value.trim() ? 'A Signature night shines with a short story: it opens when the night is finished.' : '';
          warn.hidden = !warn.textContent;
        };
        function save(which) {
          editNight(idx, (x) => {
            const t = title.value, b = text.value;
            if (!t && !b) delete x.story; else x.story = { title: t, text: b };
          }, `story-${which}`);
        }
        const insert = (token) => {
          const box = document.activeElement === title ? title : text;
          const s = box.selectionStart ?? box.value.length, e = box.selectionEnd ?? box.value.length;
          box.value = box.value.slice(0, s) + token + box.value.slice(e);
          box.focus(); box.setSelectionRange(s + token.length, s + token.length);
          save(box === title ? 'title' : 'text'); count();
        };
        count();
        const el = h('div.night-section', {}, h('h3', {}, 'The story'), h('p.hint', {}, 'A short card that opens after the night is finished.'),
          field('Title', title), field('Story', text), h('div.story-tools', {},
            h('span.hint', {}, 'Add a name:'), btn('{{recipient}}', { small: true, onClick: () => insert('{{recipient}}') }), btn('{{sender}}', { small: true, onClick: () => insert('{{sender}}') }), counter), warn);
        return { el };
      }

      function setBody(open) {
        body.hidden = !open;
        if (open && !editorApi) body.append(buildEditor());
        if (!open) { body.replaceChildren(); editorApi = null; }
      }
      paintHead();
      if (memo.open === i) setBody(true);
      return {
        el, paintHead,
        setBody,
        refresh() { paintHead(); editorApi?.paintProblems(); },
        rebuildBody() { body.replaceChildren(); editorApi = null; if (memo.open === i) body.append(buildEditor()); paintHead(); },
      };
    }

    const rebuildCard = (i) => cards[i]?.rebuildBody();
    function setOpen(i) {
      const prev = memo.open;
      memo.open = i;
      if (prev != null) { cards[prev]?.setBody(false); cards[prev]?.paintHead(); }
      if (i != null) { cards[i]?.setBody(true); cards[i]?.paintHead(); cards[i]?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }

    // ---------------------------------------------------------------- what the buttons do
    const move = (from, to) => { if (to < 0 || to >= days().length) return; restructure((d) => moveItem(d, from, to), mapOpenAfterMove(memo.open, from, to)); };
    const duplicate = (i) => restructure((d) => d.splice(i + 1, 0, structuredClone(d[i])), i + 1);
    async function remove(i) {
      const ok = await confirmBox({ title: `Delete night ${days()[i].day}?`, message: 'Its game and story are removed from the gift. You can undo this right after.', confirm: 'Delete the night', danger: true });
      if (!ok) return;
      const open = memo.open == null ? null : memo.open === i ? null : memo.open > i ? memo.open - 1 : memo.open;
      restructure((d) => d.splice(i, 1), open);
      toast('Night deleted. Press Undo to bring it back.');
    }
    function addNight(afterIndex) {
      const games = gameList();
      const m = modal({ title: 'Add a night', wide: true, body: h('div.game-choices', {}, games.map((g) => h('button.choice', { type: 'button', onclick: () => {
        m.close();
        const at = afterIndex == null ? days().length : afterIndex + 1;
        restructure((d) => d.splice(at, 0, newNight(g.id)), at);
      } }, icon(g.icon, 22), h('strong', {}, g.title), h('span.muted', {}, g.line)))) });
    }
    /** Wait until the preview has caught up with what was just typed, so "Try this night" never shows an older version. */
    async function settled() {
      const pending = store.saving === 'saving';
      const since = Date.now() - 50;
      await store.flush();
      if (!pending) return;
      const p = store.current.preview;
      if (p?.status !== 'building' && p?.at >= since) return;
      await new Promise((res) => {
        const off = store.on('preview', (d) => { if (d.status !== 'building' && d.at >= since) { off(); res(); } });
        setTimeout(() => { off(); res(); }, 10000);
      });
    }
    async function tryNight(day) { await settled(); previewGo({ play: day }); }

    // ---------------------------------------------------------------- painting the list
    function paintList() {
      cards = days().map((_, i) => buildCard(i));
      list.replaceChildren(...cards.map((c) => c.el));
      empty.hidden = days().length > 0;
      addBar.hidden = days().length === 0;
    }
    makeSortable(list, { itemSelector: '.night', handleSelector: '.night-grip', onMove: (from, to) => move(from, to) });

    // ---------------------------------------------------------------- the rest of the page
    const spark = tier() === 'spark';
    const intro = tier() === 'signature' ? introCard() : null;
    function introCard() {
      const s = () => raw().story?.intro ?? {};
      const title = input({ value: s().title ?? '', placeholder: 'Ten nights', oninput: () => save('title') });
      const text = textarea({ rows: 3, placeholder: 'What these nights are about, in your own words. It opens once, when the gift is first opened.', oninput: () => save('text') });
      text.value = s().text ?? '';
      const save = (w) => edit((d) => { const t = title.value, b = text.value; if (!t && !b) { if (d.story) { delete d.story.intro; if (!Object.keys(d.story).length) delete d.story; } } else (d.story ??= {}).intro = { title: t, text: b }; }, `intro-${w}`);
      return h('section.card.intro-card', {}, h('h2', {}, 'Opening words'), h('p.muted', {}, 'The first thing she sees when she opens the gift. Set the scene for the ten nights.'),
        h('div.grid-2', {}, field('Title', title)), field('Words', text));
    }
    const empty = h('div.empty-nights', { hidden: true }, icon('moon', 36), h('h2', {}, 'No nights yet'), h('p.muted', {}, 'A night is one small game and, if you like, a short story. Start with a few and change them as you go.'),
      h('div.empty-actions', {}, btn('Fill with a starting set', { variant: 'primary', icon: 'sparkle', onClick: () => restructure((d) => d.push(...starterNights().map((n) => ({ ...n }))), 0) }), btn('Add one night', { icon: 'plus', onClick: () => addNight(null) })));
    const addBar = h('div.add-bar', {}, btn('Add a night', { icon: 'plus', onClick: () => addNight(null) }));

    root.append(...[
      h('div.page-head', {}, h('h1', {}, 'The nights'), h('p', {}, 'A night is one small game with a story. They open one at a time, so keep each one short and personal.')),
      spark ? h('div.callout.callout-warn', {}, icon('info'), h('div', {}, h('strong', {}, 'A Spark gift has no nights. '), `${plural(days().length, 'night')} ${days().length === 1 ? 'is' : 'are'} kept in the file but not shown. `, h('button.linklike', { type: 'button', onclick: () => goStep('setup') }, 'Change the size in Setup'), ' to use them.')) : null,
      intro, list, empty, addBar].filter(Boolean));
    paintList();
    if (memo.scrollY) requestAnimationFrame(() => window.scrollTo(0, memo.scrollY));

    const stop = store.on('report', () => cards.forEach((c) => c.refresh()));
    return () => { memo.scrollY = window.scrollY; stop(); };
  },
};
