// ROOM: what is in the room, and when each thing appears. Plus the little extras that carry the owner's own words and files.
//
// A Signature gift is a room that grows: it starts almost empty and every finished night adds one thing. This screen shows that
// as a timeline the owner can rearrange by dragging (or with the "Appears after night" menu on each thing), and lets them leave
// things out. Countdown shows its whole small room from the start (just a list with "Leave out"); Spark has nothing to arrange.
//
// Writes: roles.unlockDay { role: night }, roles.exclude [role], roles.progressive false. See docs/WORLD_CONTRACT.md.
import { PROGRESS_ORDER, defaultUnlockDay } from '/repo/core/roles.js';
import { previewReload } from '../preview.js';
import { roomLabels, ROLE_ICON } from '../room-labels.js';
import { buildExtras } from '../room-extras.js';
import { btn, h, icon, plural, select, toggle } from '../ui-kit.js';

const ALWAYS_THERE = ['hub', 'vault']; // cannot be removed: without them there is nothing to play
const ALWAYS_FROM_START = ['scenic', 'tally']; // optional, but not part of the growing order
const COUNTDOWN_THINGS = ['scenic', 'tally', 'board', 'light', 'jar'];

/** Remove empty leftovers so gift.json stays tidy. */
function tidy(d) {
  const r = d.roles;
  if (!r) return;
  if (r.unlockDay && !Object.keys(r.unlockDay).length) delete r.unlockDay;
  if (Array.isArray(r.exclude) && !r.exclude.length) delete r.exclude;
  if (!Object.keys(r).length) delete d.roles;
}

export default {
  id: 'room', title: 'Room', hint: 'What appears when',
  render(root, { store, goStep }) {
    const raw = () => store.current.raw;
    const tier = () => raw().meta?.tier;
    const nights = () => (raw().days ?? []).length;
    const excluded = () => raw().roles?.exclude ?? [];
    const overrides = () => raw().roles?.unlockDay ?? {};
    const progressive = () => raw().roles?.progressive !== false;
    let label = (role) => role;

    const setUnlock = (role, n) => { store.edit((d) => { const r = (d.roles ??= {}); r.unlockDay ??= {}; if (n === defaultUnlockDay(role, nights())) delete r.unlockDay[role]; else r.unlockDay[role] = n; tidy(d); }, { coalesce: `unlock-${role}` }); paintThings(); };
    const leaveOut = (role, out) => { store.edit((d) => { const r = (d.roles ??= {}); const set = new Set(r.exclude ?? []); out ? set.add(role) : set.delete(role); r.exclude = [...set]; if (out && r.unlockDay) delete r.unlockDay[role]; tidy(d); }); paintThings(); };
    const resetAll = () => { store.edit((d) => { if (d.roles) { delete d.roles.unlockDay; delete d.roles.exclude; } tidy(d); }); paintThings(); };
    const showNight = (n) => { store.ui.night = n; store.emit('report'); previewReload(); };

    // ---------------------------------------------------------------- what a thing needs before it can appear
    const hasCoupons = () => (raw().apps?.coupons?.items?.length ?? 0) > 0 && raw().apps.coupons.enabled !== false;
    const needs = (role) => {
      const media = store.current.media ?? [];
      if (role === 'app-music' && !media.some((m) => m.type === 'audio') && !Array.isArray(raw().apps?.music?.tracks)) return { text: 'Needs a song.', go: () => goStep('media') };
      if (role === 'app-gallery' && !media.some((m) => m.type === 'image') && !Array.isArray(raw().apps?.gallery?.items)) return { text: 'Needs a picture.', go: () => goStep('media') };
      if (role === 'jar' && !hasCoupons()) return { text: 'Needs a coupon.', go: () => document.getElementById('room-coupons')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) };
      if (role === 'app-notes' && !((raw().apps?.notes?.items?.length ?? 0) > 0 && raw().apps.notes.enabled !== false)) return { text: 'Needs a note.', go: () => document.getElementById('room-notes')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) };
      return null;
    };

    // ---------------------------------------------------------------- a thing in the room
    function chip(role, { movable }) {
      const n = nights();
      const at = overrides()[role] ?? defaultUnlockDay(role, n);
      const need = needs(role);
      const choices = [['0', 'At the start'], ...Array.from({ length: n }, (_, i) => [String(i + 1), `After night ${i + 1}`])];
      const when = movable ? select(choices, { value: String(Math.min(at, n)), 'aria-label': `${label(role)} appears`, onchange: (e) => setUnlock(role, Number(e.target.value)) }) : null;
      const el = h('div.room-chip', { 'data-role': role, 'data-night': movable ? String(Math.min(at, n)) : null },
        h('div.room-chip-main', { title: movable ? 'Drag to another night' : null }, movable ? icon('grip', 16) : null, icon(ROLE_ICON[role] ?? 'sparkle', 18), h('strong', {}, label(role))),
        need ? h('p.room-chip-need', {}, need.text, ' ', h('button.linklike', { type: 'button', onclick: need.go }, 'Add one')) : null,
        when ? h('label.room-chip-when', {}, h('span.sr-only', {}, 'Appears after night'), when) : null,
        h('div.room-chip-actions', {},
          btn('Leave out', { variant: 'ghost', small: true, onClick: () => leaveOut(role, true) }),
          movable && overrides()[role] != null ? btn('Back to automatic', { variant: 'ghost', small: true, onClick: () => setUnlock(role, defaultUnlockDay(role, n)) }) : null));
      if (movable) dragify(el, role);
      return el;
    }

    /** Pointer-events drag: the chip follows the finger, the column under it lights up, and dropping moves it. */
    function dragify(el, role) {
      const grip = el.querySelector('.room-chip-main');
      grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const startX = e.clientX, startY = e.clientY;
        let ghost = null, over = null;
        grip.setPointerCapture(e.pointerId);
        const colAt = (x, y) => document.elementsFromPoint(x, y).find((n) => n.classList?.contains('room-col'));
        const move = (ev) => {
          if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
            ghost = el.cloneNode(true); ghost.classList.add('room-chip-ghost'); ghost.style.width = `${el.offsetWidth}px`; document.body.append(ghost); el.classList.add('is-dragging');
          }
          if (!ghost) return;
          ghost.style.left = `${ev.clientX - 24}px`; ghost.style.top = `${ev.clientY - 16}px`;
          const col = colAt(ev.clientX, ev.clientY);
          if (col !== over) { over?.classList.remove('is-over'); over = col ?? null; over?.classList.add('is-over'); }
        };
        const end = (ev) => {
          grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', end); grip.removeEventListener('pointercancel', end);
          ghost?.remove(); el.classList.remove('is-dragging'); over?.classList.remove('is-over');
          if (ghost && over && ev.type === 'pointerup') { const to = Number(over.dataset.night); if (to !== Number(el.dataset.night)) setUnlock(role, to); }
        };
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
      });
    }

    // ---------------------------------------------------------------- the things area
    const things = h('div.room-things');
    // what the things area depends on besides the room settings: the media library and the extras. Used to skip pointless rebuilds.
    const sigOf = () => JSON.stringify([(store.current.media ?? []).map((m) => `${m.id}:${m.type}`), hasCoupons(), raw().apps?.notes?.items?.length ?? 0]);
    let lastSig = '';
    function paintThings() {
      lastSig = sigOf();
      things.replaceChildren();
      const t = tier();
      if (t === 'spark') {
        things.append(h('div.callout', {}, icon('info'), h('div', {}, 'A Spark gift is one scene with one thing to tap. Nothing to arrange here. The little extras do not apply either: your letter, photos and video are set on the Ending step.')));
        return;
      }
      const n = nights();
      const out = excluded();
      const present = (list) => list.filter((r) => !out.includes(r));
      const fixedBox = h('div.room-fixed', {}, h('strong', {}, 'Always there'), h('div.room-fixed-list', {}, ALWAYS_THERE.map((r) => h('span.chip', {}, icon(ROLE_ICON[r], 14), label(r)))));

      if (t === 'countdown') {
        things.append(h('div.callout', {}, icon('info'), h('div', {}, 'A Countdown gift shows its whole small room from the start. Leave out anything you do not want.')), fixedBox,
          h('div.room-simple', {}, present(COUNTDOWN_THINGS).map((r) => h('div.room-chip', { 'data-role': r }, h('div.room-chip-main', {}, icon(ROLE_ICON[r], 18), h('strong', {}, label(r))), needs(r) ? h('p.room-chip-need', {}, needs(r).text, ' ', h('button.linklike', { type: 'button', onclick: needs(r).go }, 'Add one')) : null,
            h('div.room-chip-actions', {}, btn('Leave out', { variant: 'ghost', small: true, onClick: () => leaveOut(r, true) }))))));
      } else {
        const sw = toggle('Show the whole room from the start', !progressive(), (on) => { store.edit((d) => { const r = (d.roles ??= {}); if (on) r.progressive = false; else delete r.progressive; tidy(d); }); paintThings(); },
          { hint: 'Everything is there on night one. Turn this off to let the room grow night by night.' });
        things.append(h('div.callout', {}, icon('sparkle'), h('div', {}, h('strong', {}, 'The room starts almost empty.'), ' Each finished night adds one thing, so they always have something new to find.')), sw);
        if (!n) { things.append(h('div.callout.callout-warn', {}, icon('alert'), h('div', {}, 'Add the nights first on the ', h('button.linklike', { type: 'button', onclick: () => goStep('nights') }, 'Nights step'), ', then arrange when things appear.'))); }
        else {
          const cols = Array.from({ length: n + 1 }, (_, c) => {
            const here = present(PROGRESS_ORDER).filter((r) => Math.min(overrides()[r] ?? defaultUnlockDay(r, n), n) === c);
            const head = h('button.room-col-head', { type: 'button', title: c ? `See the room after night ${c}` : 'See the room at the start', onclick: () => showNight(c) }, c ? `After night ${c}` : 'At the start');
            return h('div.room-col', { 'data-night': String(c), 'aria-label': c ? `After night ${c}` : 'At the start' }, head,
              c === 0 ? [fixedBox, present(ALWAYS_FROM_START).map((r) => h('div.room-chip.room-chip-still', { 'data-role': r }, h('div.room-chip-main', {}, icon(ROLE_ICON[r], 18), h('strong', {}, label(r))), h('div.room-chip-actions', {}, btn('Leave out', { variant: 'ghost', small: true, onClick: () => leaveOut(r, true) }))))] : null,
              here.map((r) => chip(r, { movable: true })));
          });
          things.append(h('div.room-timeline-wrap', {}, h('div.room-timeline', { style: { gridTemplateColumns: `repeat(${n + 1}, minmax(168px, 1fr))` }, 'data-progressive': String(progressive()) }, cols)),
            h('div.room-timeline-foot', {}, btn('Reset all', { small: true, icon: 'refresh', onClick: resetAll, disabled: !Object.keys(overrides()).length && !out.length }), h('span.muted', {}, `${plural(PROGRESS_ORDER.filter((r) => !out.includes(r)).length, 'thing')} appear over ${plural(n, 'night')}. Drag a thing to another night, or use its menu.`)));
        }
      }
      if (out.length) {
        things.append(h('div.room-out', {}, h('strong', {}, 'Left out'), h('div.room-out-list', {}, out.filter((r) => PROGRESS_ORDER.includes(r) || ALWAYS_FROM_START.includes(r)).map((r) => h('span.chip', {}, icon(ROLE_ICON[r] ?? 'sparkle', 14), label(r), btn('Put back', { variant: 'ghost', small: true, onClick: () => leaveOut(r, false) }))))));
      }
    }

    // ---------------------------------------------------------------- put it together
    const extras = tier() === 'spark' ? null : buildExtras({ store, goStep });
    root.append(
      h('div.page-head', {}, h('h1', {}, 'The room'), h('p', {}, 'What is in the room, and when each thing shows up. The recipient is never told: they just notice something new.')),
      h('section.section', {}, h('header', {}, h('h2', {}, 'Things in the room'), h('p', {}, 'Click "After night 3" to see the room as it will be then, in the preview.')), things),
      extras?.el);

    const stops = [store.on('report', () => extras?.refreshProblems()), store.on('media', () => { extras?.refreshMedia(); if (sigOf() !== lastSig) paintThings(); })];
    roomLabels(raw().meta?.theme, raw().meta?.skin).then((fn) => { label = fn; paintThings(); });
    paintThings();
    return () => stops.forEach((s) => s());
  },
};
