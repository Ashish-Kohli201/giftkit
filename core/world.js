// WORLD ENGINE - the behavior shared by every theme (desk room, outdoor camp, ...). See docs/WORLD_CONTRACT.md.
// It builds the room and the ROLES (hero, hub, vault, board, tally, jar, light, scenic, app-*, pet, toy, ambient-*),
// wires what they do, and implements the shell interface the engine talks to:
//   mount(root, opts) -> { setItems, setFragments, onSelect, present, presentFinale, destroy }
// It knows nothing about how anything looks: a theme's layout.css positions the roles, a skin paints them.
// Nothing here says "level", "fragment" or "collect": the room guides the recipient implicitly.
import { part } from './util.js';
import { createSheets } from './sheets.js';

const TOOLS = ['music', 'gallery', 'notes'];
const TOOL_GLYPHS = { music: '♪', gallery: '▣', notes: '✎' };
const DAY_GLYPHS = ['◈', '✦', '☾', '✿', '♪', '❀', '★', '✶', '❦', '❈'];
const SLOTS = ['a', 'b', 'c', 'd'];

// PROGRESSIVE REVEAL (Signature). A ten-day gift must not show everything on day one: the room starts with the hub (where the days
// live), the locked vault and the backdrop, and every finished day adds one more thing to the room, in this order. The recipient
// is guided by a gentle glow on whatever is new, never by a list. A gift config may re-time a role with roles.unlockDay.
const PROGRESS_ORDER = ['board', 'light', 'jar', 'app-music', 'pet', 'app-gallery', 'toy', 'app-notes', 'ambient-a', 'ambient-b'];
// roles a gift can never remove: without them there is no way to play
const REQUIRED_ROLES = new Set(['hero', 'hub', 'vault']);

/**
 * @param opts   shell options from the engine: { title, items, extras, copy, tier, vars, decorateWorld,
 *                 progressive (reveal the room day by day), roleConfig { exclude, include, unlockDay }, store }
 * @param world  { id } the theme mounting this engine (themes may later pass extra hooks here)
 */
export function mountWorld(root, opts, world = {}) {
  const copy = opts.copy;
  const vars = opts.vars ?? {};
  const tier = opts.tier;
  const spark = tier === 'spark';
  const signature = tier === 'signature';
  let items = opts.items ?? [];
  let extras = opts.extras ?? [];
  let fragments = { collected: [], total: 0 };
  let selectFn = () => {};
  let hubSheet = null;
  const sheets = createSheets(root);
  const timers = [];
  const roles = {};

  const days = () => items.filter((it) => it.id.startsWith('day-'));
  const finale = () => items.find((it) => it.id === 'finale');
  const hasExtra = (id) => extras.some((ex) => ex.id === id);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- which roles exist in this gift, and when they appear
  const roleConfig = opts.roleConfig ?? {};
  const excluded = new Set(roleConfig.exclude ?? []);
  const only = roleConfig.include ? new Set(roleConfig.include) : null;
  const progressive = signature && !!opts.progressive;
  const allowed = (role) => REQUIRED_ROLES.has(role) || (!excluded.has(role) && (!only || only.has(role)));
  /** The number of finished days after which a role appears (0 = from the start). */
  function unlockAfter(role) {
    if (roleConfig.unlockDay?.[role] != null) return roleConfig.unlockDay[role];
    const i = PROGRESS_ORDER.indexOf(role);
    if (i < 0) return 0;
    return Math.ceil(((i + 1) * Math.max(days().length, 1)) / PROGRESS_ORDER.length);
  }
  const seen = new Set(opts.store?.get('seenRoles', []) ?? []);
  const shown = new Set(); // roles already visible, so a newly appearing one can announce itself
  let firstRender = true;

  // ---- building blocks. Every role gets four empty decorative slots for the skin to paint.
  const slotSpans = () => SLOTS.map((s) => part('span', `slot-${s}`, { 'aria-hidden': 'true' }));
  const register = (name, el) => { roles[name] = el; return el; };
  const hotspot = (name, labelKey, onClick, ...extraChildren) => {
    const el = part('button', name, { type: 'button', 'aria-label': copy(labelKey, vars) }, slotSpans(), extraChildren);
    if (onClick) el.addEventListener('click', onClick);
    el.addEventListener('click', () => markSeen(name));
    return register(name, el);
  };
  const decor = (name, ...children) => register(name, part('div', name, { 'aria-hidden': 'true' }, slotSpans(), children));

  /** Briefly set data-state on a role (a pet purring, a toy playing), then settle back. */
  function pulse(el, to, ms) {
    el.dataset.state = to;
    timers.push(setTimeout(() => { el.dataset.state = 'idle'; }, ms));
  }
  /** A role that flips an on/off attribute on the room (ambience, extra toggles). */
  function toggle(name, labelKey, attr, initial) {
    const el = hotspot(name, labelKey);
    room.dataset[attr] = initial;
    el.setAttribute('aria-pressed', String(initial === 'on'));
    el.addEventListener('click', () => {
      const on = room.dataset[attr] !== 'on';
      room.dataset[attr] = on ? 'on' : 'off';
      el.setAttribute('aria-pressed', String(on));
    });
    return el;
  }

  // ---- the roles
  const room = part('div', 'room', { role: 'main', 'aria-label': opts.title });
  const stageChildren = [];

  if (spark) {
    const hero = hotspot('hero', 'giftTag', () => pressHero(), part('span', 'hero-label', {}, copy('giftTag', vars)));
    hero.dataset.state = 'idle';
    stageChildren.push(hero);
  } else {
    const noteList = part('div', 'board-notes');
    const memories = hasExtra('memories');
    const board = memories
      ? hotspot('board', 'board', () => selectFn('memories'), noteList)
      : decor('board', noteList);
    const tally = decor('tally');
    stageChildren.push(
      hotspot('scenic', 'scenic', () => pulse(roles.scenic, 'pop', 1200)),
      board, tally,
      hotspot('vault', 'vault', () => selectFn('finale')),
      hotspot('jar', 'jar', () => selectFn('coupons')),
      hotspot('hub', 'hub', () => openHub()),
      hotspot('light', 'light', null),
    );
    roles.scenic.dataset.state = 'idle';
    roles['board-notes'] = noteList;
    // the light switches the room's ambience between lit and dim
    room.dataset.ambient = 'on';
    roles.light.setAttribute('aria-pressed', 'true');
    roles.light.addEventListener('click', () => {
      const on = room.dataset.ambient !== 'on';
      room.dataset.ambient = on ? 'on' : 'off';
      roles.light.setAttribute('aria-pressed', String(on));
    });

    if (signature) {
      const pet = hotspot('pet', 'pet', () => pulse(roles.pet, 'happy', 2600));
      const toy = hotspot('toy', 'toy', () => pulse(roles.toy, 'play', 2200));
      pet.dataset.state = 'idle';
      toy.dataset.state = 'idle';
      stageChildren.push(
        hotspot('app-music', 'appMusic', () => selectFn('music')),
        hotspot('app-gallery', 'appGallery', () => selectFn('gallery')),
        hotspot('app-notes', 'appNotes', () => selectFn('notes')),
        pet, toy,
        toggle('ambient-a', 'ambientA', 'ambientA', 'on'),
        toggle('ambient-b', 'ambientB', 'ambientB', 'off'),
      );
    }
  }

  const stage = part('div', 'room-stage', {}, stageChildren,
    // ambience layers live inside the stage so roles can sit above them; they overscan the whole room.
    // Spark has no light to switch, so it has no ambience layers.
    spark ? null : [part('div', 'dim', { 'aria-hidden': 'true' }), part('div', 'glow', { 'aria-hidden': 'true' })]);
  room.append(
    part('div', 'room-back', { 'aria-hidden': 'true' }),
    part('div', 'room-floor', { 'aria-hidden': 'true' }),
    stage,
    part('div', 'room-over', { 'aria-hidden': 'true' }));
  root.append(room);

  // The gift is made for landscape. In portrait a full-screen hint asks the recipient to turn the phone (shown by CSS only);
  // browsers that allow it (Android, once fullscreen) are also asked to lock the orientation on the first touch.
  const rotateHint = part('div', 'rotate-hint', { role: 'status' },
    part('span', 'rotate-icon', { 'aria-hidden': 'true' }), part('p', 'rotate-text', {}, copy('rotateHint', vars)));
  root.append(rotateHint);
  const lockLandscape = () => { try { screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch { /* not supported */ } };
  root.addEventListener('pointerdown', lockLandscape, { once: true });

  function pressHero() {
    const item = finale();
    const hero = roles.hero;
    if (!item || hero.dataset.state === 'pressed') return;
    hero.dataset.state = 'pressed';
    // let the skin's press animation play before the surprise opens; reduced-motion users get it straight away
    const wait = reduced() ? 0 : 800;
    timers.push(setTimeout(() => selectFn(item.id), wait));
    timers.push(setTimeout(() => { hero.dataset.state = 'idle'; }, wait + 1200));
  }

  /** The recipient has touched a role that was announcing itself as new: stop announcing it. */
  function markSeen(name) {
    if (seen.has(name)) return;
    seen.add(name);
    opts.store?.set('seenRoles', [...seen]);
    if (roles[name]?.dataset.hint === 'new') delete roles[name].dataset.hint;
  }

  /** Days the hub shows: everything finished, the one that is open, and a single locked teaser. The rest stay out of sight. */
  function visibleDays() {
    const list = days();
    if (!progressive) return list;
    const firstTodo = list.findIndex((d) => d.status !== 'done');
    return firstTodo < 0 ? list : list.slice(0, firstTodo + 2);
  }

  /** Show or hide a role; a role that appears after the first render announces itself (data-reveal "in", data-hint "new"). */
  function setVisible(name, visible) {
    const el = roles[name];
    if (!el) return;
    el.hidden = !visible;
    if (visible && !shown.has(name)) {
      shown.add(name);
      if (!firstRender && !seen.has(name)) {
        el.dataset.reveal = 'in';
        timers.push(setTimeout(() => { delete el.dataset.reveal; }, 1800));
      }
      if (PROGRESS_ORDER.includes(name) && !seen.has(name) && progressive) el.dataset.hint = 'new';
    }
  }

  // ---- state coming from the engine
  function renderState() {
    if (spark) return;
    const list = days();
    const doneCount = list.filter((d) => d.status === 'done').length;
    const live = (role) => allowed(role) && (!progressive || doneCount >= unlockAfter(role));
    roles.hub.dataset.hint = list.some((d) => d.status === 'open') ? 'yes' : 'no';
    const fin = finale();
    setVisible('vault', !!fin);
    roles.vault.dataset.status = fin?.status ?? 'locked';
    roles.vault.dataset.hint = fin?.status === 'open' ? 'yes' : 'no';
    setVisible('jar', live('jar') && hasExtra('coupons'));
    setVisible('board', live('board') && (hasExtra('memories') || fragments.total > 0));
    setVisible('scenic', allowed('scenic'));
    setVisible('light', live('light'));
    const marks = visibleDays();
    setVisible('tally', allowed('tally') && marks.length > 0);
    roles.tally.replaceChildren(...slotSpans(), ...marks.map((d, i) => part('span', 'tally-mark', { 'data-status': d.status, style: `--i:${i}` })));
    roles['board-notes'].replaceChildren(...Array.from({ length: fragments.total }, (_, i) => {
      const ch = fragments.collected[i];
      return part('span', 'note', { 'data-state': ch ? 'filled' : 'empty', style: `--i:${i}` }, ch ?? '');
    }));
    if (signature) {
      setVisible('app-music', live('app-music') && hasExtra('music'));
      setVisible('app-gallery', live('app-gallery') && hasExtra('gallery'));
      setVisible('app-notes', live('app-notes') && hasExtra('notes'));
      for (const name of ['pet', 'toy', 'ambient-a', 'ambient-b']) setVisible(name, live(name));
    }
    firstRender = false;
    if (hubSheet) renderHub(hubSheet.container);
  }

  // ---- the hub: a sheet with one icon per day, and (Signature) a taskbar with the apps
  function appButton(id, status, label, glyph, ariaLabel) {
    const app = part('button', 'app', {
      type: 'button', 'data-status': status, 'aria-disabled': status === 'locked' ? 'true' : null, 'aria-label': ariaLabel ?? label,
    }, part('span', 'app-glyph', { 'aria-hidden': 'true' }, glyph), part('span', 'app-label', {}, label));
    app.addEventListener('click', () => selectFn(id));
    return app;
  }

  function renderHub(container) {
    const dayApps = visibleDays().map((d, i) => appButton(d.id, d.status, d.label, DAY_GLYPHS[i % DAY_GLYPHS.length], [d.label, d.unlockLabel].filter(Boolean).join('. ')));
    const tools = TOOLS.filter(hasExtra);
    const taskbar = tools.length
      ? part('div', 'taskbar', { role: 'toolbar', 'aria-label': copy('hub', vars) }, tools.map((id) => {
        const app = appButton(id, 'open', extras.find((ex) => ex.id === id).label, TOOL_GLYPHS[id]);
        app.dataset.tool = id;
        return app;
      }))
      : null;
    container.replaceChildren(part('div', 'desktop', {}, part('div', 'apps', { role: 'list' }, dayApps), taskbar));
  }

  function openHub() {
    if (hubSheet) return;
    hubSheet = sheets.present('hub', { title: copy('hub', vars) });
    hubSheet.onClose(() => { hubSheet = null; });
    renderHub(hubSheet.container);
  }

  renderState();
  // let the skin add purely decorative DOM (a window, a cabinet, a moon) now that the roles exist
  opts.decorateWorld?.({ tier, room, stage, roles, copy, vars, world });

  return {
    setItems(next) { items = next; renderState(); },
    setFragments(next) { fragments = next; renderState(); },
    onSelect(fn) { selectFn = fn; },
    present: (id, o) => sheets.present(id, o),
    presentFinale: (o) => sheets.presentFinale(o),
    destroy() { timers.forEach(clearTimeout); root.removeEventListener('pointerdown', lockLandscape); rotateHint.remove(); room.remove(); },
  };
}
