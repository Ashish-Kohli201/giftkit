// THE STUDIO APP: the top bar, the six steps, the live preview, and moving between screens.
//
// Routes (in the address bar, so the browser's back button and a reload both work):
//   #/                    all gifts
//   #/g/<name>/<step>     one gift, one step: setup | media | nights | room | ending | review
//
// A screen is a module with a default export { id, title, hint, render(root, ctx) }.
// `render` builds the screen once into `root` and may return a function that cleans up (listeners, timers).
// The shell calls it again when the whole gift is replaced (undo, redo, repair).
import { store } from './store.js';
import { createPreview } from './preview.js';
import { btn, clear, h, icon, toast } from './ui-kit.js';
import home from './pages/home.js';
import setup from './pages/setup.js';
import media from './pages/media.js';
import nights from './pages/nights.js';
import room from './pages/room.js';
import ending from './pages/ending.js';
import review from './pages/review.js';

const STEPS = [setup, media, nights, room, ending, review];
const app = document.getElementById('app');
let preview = null;
let cleanup = null;
let stops = [];

const parse = () => {
  const m = /^#\/g\/([a-z0-9-]+)(?:\/([a-z]+))?/.exec(location.hash);
  return m ? { name: m[1], step: STEPS.some((s) => s.id === m[2]) ? m[2] : 'setup' } : { name: null };
};
export const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
export const goStep = (step) => go(`#/g/${store.current.name}/${step}`);

// ------------------------------------------------------------------ the gift's problems, shown as a flag on the Review step
const problemCount = () => (store.current?.report?.errors?.length ?? 0);

async function route() {
  cleanup?.(); cleanup = null;
  stops.forEach((s) => s()); stops = [];
  preview?.destroy(); preview = null;
  const r = parse();
  if (!r.name) { store.closeGift(); renderHome(); return; }
  try { await store.openGift(r.name); } catch (e) { toast(e.message, 'error'); go('#/'); return; }
  renderGift(r.step);
}

function renderHome() {
  clear(app).append(
    h('header.topbar', {}, brand(), h('div.topbar-spacer')),
    h('main#screen', { style: { overflow: 'auto' } }));
  const root = app.querySelector('#screen');
  cleanup = home.render(root, { open: (name) => go(`#/g/${name}/setup`) });
}

function brand() {
  return h('a.brand', { href: '#/', 'aria-label': 'All gifts' }, h('span.brand-mark', {}, icon('gift', 18)), 'Gift Studio');
}

function renderGift(stepId) {
  const cur = store.current;
  const step = STEPS.find((s) => s.id === stepId);

  // ---- top bar
  const saveEl = h('span.save-state');
  const undoBtn = btn('', { variant: 'ghost', icon: 'undo', title: 'Undo (Ctrl+Z)', onClick: () => store.undo() });
  const redoBtn = btn('', { variant: 'ghost', icon: 'redo', title: 'Redo (Ctrl+Shift+Z)', onClick: () => store.redo() });
  const previewBtn = btn(store.ui.previewOpen ? 'Hide preview' : 'Show preview', { variant: 'ghost', icon: 'eye', onClick: () => { store.ui.previewOpen = !store.ui.previewOpen; route(); } });
  const paintTop = () => {
    const s = store.saving;
    saveEl.className = `save-state${s === 'error' ? ' is-error' : ''}`;
    saveEl.replaceChildren(...(s === 'saving' ? ['Saving...'] : s === 'error' ? [`Not saved: ${store.saveError}`] : [icon('check', 14), ' All changes saved']));
    undoBtn.disabled = !store.canUndo; redoBtn.disabled = !store.canRedo;
  };
  const top = h('header.topbar', {}, brand(),
    h('div.crumb', {}, h('span.muted', {}, '/'), h('span.crumb-name', { title: cur.name }, cur.config?.people?.recipient ? `${cur.config.people.recipient}'s gift` : cur.name), saveEl),
    h('div.topbar-spacer'),
    h('div.topbar-actions', {}, undoBtn, redoBtn, previewBtn, btn('Build & send', { variant: 'primary', icon: 'gift', onClick: () => goStep('review') })));

  // ---- the steps
  const stepEls = STEPS.map((s, i) => {
    const flag = h('span.step-flag');
    const el = h('button.step', { type: 'button', 'aria-current': s.id === stepId ? 'page' : null, onclick: () => goStep(s.id) },
      h('span.step-num', {}, String(i + 1)), h('span.step-label', {}, s.title, h('small', {}, s.hint)), flag);
    el.flag = flag; el.stepId = s.id;
    return el;
  });
  const paintFlags = () => {
    const n = problemCount();
    for (const el of stepEls) {
      el.flag.replaceChildren();
      if (el.stepId === 'review' && n) el.flag.append(h('span.badge.badge-bad', { title: `${n} to fix` }, String(n)));
    }
  };

  // ---- the screen
  const screen = h('main.page', { id: 'screen', 'aria-label': step.title });
  if (cur.rawError) {
    screen.append(repairScreen(cur));
  } else {
    cleanup = step.render(screen, { store, go, goStep });
  }
  preview = store.ui.previewOpen && !cur.rawError ? createPreview({ onFix: () => goStep('review') }) : null;

  clear(app).append(top, h(`div.workspace${preview ? '' : '.no-preview'}`, {}, h('nav.steps', { 'aria-label': 'Steps' }, stepEls), screen, preview?.el));
  paintTop(); paintFlags();

  stops.push(
    store.on('edit', paintTop), store.on('saved', paintTop), store.on('report', paintFlags),
    // undo / redo / repair replace the whole gift: rebuild this screen from the new state
    store.on('open', () => { cleanup?.(); cleanup = null; clear(screen); if (store.current.rawError) screen.append(repairScreen(store.current)); else cleanup = step.render(screen, { store, go, goStep }); paintTop(); paintFlags(); }),
  );
}

/** gift.json cannot be read: show what is wrong and let the person fix the text right here. */
function repairScreen(cur) {
  const box = h('textarea', { rows: 22, spellcheck: false, style: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '13px' } }, cur.rawText);
  return h('div', {}, h('div.page-head', {}, h('h1', {}, 'This gift file needs a quick fix'), h('p', {}, 'gift.json could not be read, so the studio cannot show it yet. Nothing is lost: here is the text, and the problem.')),
    h('div.callout.callout-bad', {}, icon('alert'), h('div', {}, h('strong', {}, 'The problem: '), cur.rawError, h('p.muted', {}, 'Look for a missing comma or quote, or a comma after the last item in a list.'))),
    h('div.section', { style: { marginTop: '16px' } }, box,
      btn('Save the fixed text', { variant: 'primary', onClick: async () => {
        try { store.current.raw = JSON.parse(box.value); store.current.rawError = null; store.saving = 'saving'; await store.saveNow(); await store.refreshDerived(); toast('Fixed', 'success'); route(); } catch (e) { toast(`Still not valid: ${e.message}`, 'error'); }
      } })));
}

// ------------------------------------------------------------------ keyboard
document.addEventListener('keydown', (e) => {
  const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && store.current) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing && store.current) { e.preventDefault(); store.redo(); }
});
window.addEventListener('beforeunload', (e) => { if (store.saving === 'saving') { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', route);

// ------------------------------------------------------------------ start
try {
  await store.init();
  await route();
} catch (e) {
  clear(app).append(h('main.page', {}, h('h1', {}, 'The studio could not start'), h('p.muted', {}, e.message)));
}
