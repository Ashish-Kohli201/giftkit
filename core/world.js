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

/**
 * @param opts   shell options from the engine: { title, items, extras, copy, tier, vars, decorateWorld }
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

  // ---- building blocks. Every role gets four empty decorative slots for the skin to paint.
  const slotSpans = () => SLOTS.map((s) => part('span', `slot-${s}`, { 'aria-hidden': 'true' }));
  const register = (name, el) => { roles[name] = el; return el; };
  const hotspot = (name, labelKey, onClick, ...extraChildren) => {
    const el = part('button', name, { type: 'button', 'aria-label': copy(labelKey, vars) }, slotSpans(), extraChildren);
    if (onClick) el.addEventListener('click', onClick);
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

  // ---- state coming from the engine
  function renderState() {
    if (spark) return;
    const list = days();
    roles.hub.dataset.hint = list.some((d) => d.status === 'open') ? 'yes' : 'no';
    const fin = finale();
    roles.vault.hidden = !fin;
    roles.vault.dataset.status = fin?.status ?? 'locked';
    roles.vault.dataset.hint = fin?.status === 'open' ? 'yes' : 'no';
    roles.jar.hidden = !hasExtra('coupons');
    roles.board.hidden = !hasExtra('memories') && fragments.total === 0;
    roles.tally.hidden = list.length === 0;
    roles.tally.replaceChildren(...slotSpans(), ...list.map((d, i) => part('span', 'tally-mark', { 'data-status': d.status, style: `--i:${i}` })));
    roles['board-notes'].replaceChildren(...Array.from({ length: fragments.total }, (_, i) => {
      const ch = fragments.collected[i];
      return part('span', 'note', { 'data-state': ch ? 'filled' : 'empty', style: `--i:${i}` }, ch ?? '');
    }));
    if (signature) {
      roles['app-music'].hidden = !hasExtra('music');
      roles['app-gallery'].hidden = !hasExtra('gallery');
      roles['app-notes'].hidden = !hasExtra('notes');
    }
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
    const dayApps = days().map((d, i) => appButton(d.id, d.status, d.label, DAY_GLYPHS[i % DAY_GLYPHS.length], [d.label, d.unlockLabel].filter(Boolean).join('. ')));
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
    destroy() { timers.forEach(clearTimeout); room.remove(); },
  };
}
