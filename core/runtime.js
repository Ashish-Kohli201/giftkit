// REFERENCE RUNTIME - a small, readable example of how config + theme + elements fit together.
// It exists so the playground can run a whole gift and so you can see the glue.
// The production engine replaces/extends this (schema validation, hashed answers, preview bridge, ...)
// but keeps the same seams: loadTheme -> shell.mount -> mountElement.
import { loadTheme } from './theme-loader.js';
import { mountElement } from './mount.js';
import { registry } from '../elements/registry.js';
import { createStore } from './store.js';
import { createResolver } from './resolver.js';
import { assignFragments, deriveCode } from './fragments.js';
import { itemStatus, todayIn, formatDate } from './schedule.js';
import { part, seededRandom } from './util.js';

/**
 * @param opts.root       element that will get data-theme + data-skin and host the gift
 * @param opts.themeId    the world (default config.meta.theme) and opts.skinId the look (default config.meta.skin)
 * @param opts.config     gift config (see sample/config.json)
 * @param opts.preview    true = placeholder assets + no persistence
 * @param opts.unlockAll  ignore the schedule (preview scrubber)
 * @param opts.now        () => Date, so tests/demos can fake "today"
 */
export async function startGift({ root, config, themeId = config.meta.theme, skinId = config.meta.skin, base, preview = false, unlockAll = false, now = () => new Date() }) {
  const store = createStore(config.meta.giftId, { persist: !preview });
  const theme = await loadTheme(themeId, { skinId, root, store });
  const assets = createResolver({ assets: config.assets, base, placeholders: preview });
  const vars = { recipient: config.people.recipient, sender: config.people.sender };
  root.dataset.tier = config.meta.tier || '';
  const { days, schedule, meta } = config;
  const tz = meta.timezone || 'UTC';

  const fragments = assignFragments(days, seededRandom(meta.giftId));
  const code = deriveCode(fragments);
  // finale.type "vault" (default) gates the reveal behind the fragment code; "reveal" opens it directly (small tiers).
  const useVault = (config.finale?.type ?? 'vault') === 'vault';
  let done = store.get('done', {});
  const flags = () => days.map((d) => !!done[d.day]);
  const collected = () => days.map((d, i) => (done[d.day] ? fragments[i] : null));

  function buildItems() {
    const f = flags();
    const items = days.map((d, i) => {
      const s = unlockAll ? { status: f[i] ? 'done' : 'open' } : itemStatus({ mode: schedule.mode, startDate: schedule.startDate, tz, now: now(), index: i, flags: f });
      const unlockLabel = s.unlocksOn ? theme.shellCopy('lockedOn', { date: formatDate(s.unlocksOn, meta.locale) }) : s.waitingForPrevious ? theme.shellCopy('lockedPrev') : '';
      return { id: `day-${d.day}`, label: theme.shellCopy('dayLabel', { n: d.day }), status: s.status, unlockLabel };
    });
    const allDone = f.every(Boolean);
    const dateOk = unlockAll || schedule.mode !== 'date' || todayIn(tz, now()) >= schedule.finaleDate;
    items.push({
      id: 'finale',
      label: theme.shellCopy(useVault ? 'finaleLabel' : 'revealLabel'),
      status: done.finale ? 'done' : allDone && dateOk ? 'open' : 'locked',
      unlockLabel: !allDone ? theme.shellCopy(useVault ? 'finaleLocked' : 'revealLocked') : !dateOk ? theme.shellCopy('lockedOn', { date: formatDate(schedule.finaleDate, meta.locale) }) : '',
    });
    return items;
  }

  const extras = [];
  if (config.apps?.coupons?.enabled) extras.push({ id: 'coupons', label: theme.shellCopy('coupons') });
  if (config.scene?.corkboard?.length) extras.push({ id: 'memories', label: theme.shellCopy('memories') });
  // laptop apps: each one is an element opened with its own list from config.apps.<id>
  const APP_PARAMS = { music: (a) => ({ tracks: a.tracks }), gallery: (a) => ({ items: a.items }), notes: (a) => ({ items: a.items }) };
  for (const id of Object.keys(APP_PARAMS)) if (config.apps?.[id]?.enabled) extras.push({ id, label: theme.shellCopy(id) });
  const EXTRA_IDS = ['coupons', 'memories', ...Object.keys(APP_PARAMS)];

  const shell = theme.shell.mount(root, {
    title: theme.shellCopy('title', vars),
    subtitle: theme.shellCopy('subtitle', vars),
    items: buildItems(),
    extras,
    copy: theme.shellCopy,
    tier: config.meta.tier,
    vars,
  });
  const refresh = () => { shell.setItems(buildItems()); shell.setFragments({ collected: collected(), total: useVault ? days.length : 0 }); };
  refresh();

  const fail = (err) => theme.dialogs.alert({ title: theme.shellCopy('errorTitle'), message: String(err.message || err), tone: 'error' });

  async function open(sheet, elementId, params, hooks = {}, elStore = 'misc') {
    const element = registry[elementId];
    if (!element) throw new Error(`Unknown element type "${elementId}"`);
    const host = part('div', 'element-host');
    sheet.container.append(host);
    const inst = await mountElement(element, host, { theme, params, assets, vars, store: store.scope(elStore), hooks, usePlaceholders: preview });
    sheet.onClose(() => inst.destroy());
    return inst;
  }

  async function runDay(day) {
    const sheet = shell.present(`day-${day.day}`, { title: theme.shellCopy('dayLabel', { n: day.day }) });
    if (day.note) sheet.container.append(part('p', 'day-note', {}, day.note));
    try {
      await open(sheet, day.game.type, day.game.params, {
        onComplete: async () => {
          if (done[day.day]) return;
          done = { ...done, [day.day]: true };
          store.set('done', done);
          refresh();
          theme.fx.unlock();
          await new Promise((r) => setTimeout(r, 900));
          if (useVault) {
            await theme.dialogs.alert({
              title: theme.shellCopy('fragmentTitle'),
              message: theme.shellCopy('fragmentFound', { fragment: fragments[days.indexOf(day)] }),
            });
          }
          sheet.close();
        },
      }, `day${day.day}`);
    } catch (e) { sheet.close(); fail(e); }
  }

  async function playReveal() {
    const fin = shell.presentFinale({ title: 'Finale' });
    try {
      theme.fx.reveal();
      await open(fin, 'reveal', { blocks: config.finale.reveal }, { onExit: () => fin.close() }, 'finale');
    } catch (e) { fin.close(); fail(e); }
  }

  async function runFinale() {
    if (done.finale) return playReveal();
    if (!useVault) {
      done = { ...done, finale: true };
      store.set('done', done);
      refresh();
      return playReveal();
    }
    const sheet = shell.present('finale', { title: theme.shellCopy('finaleLabel') });
    try {
      await open(sheet, 'vault', { code }, {
        onComplete: async () => {
          done = { ...done, finale: true };
          store.set('done', done);
          refresh();
          await new Promise((r) => setTimeout(r, 1200));
          sheet.close();
          playReveal();
        },
      }, 'vault');
    } catch (e) { sheet.close(); fail(e); }
  }

  async function runExtra(id) {
    const sheet = shell.present(id, { title: theme.shellCopy(id) });
    try {
      if (id === 'coupons') await open(sheet, 'coupons', { items: config.apps.coupons.items }, {}, 'coupons');
      if (id in APP_PARAMS) await open(sheet, id, APP_PARAMS[id](config.apps[id]), {}, id);
      if (id === 'memories') {
        for (const [i, p] of config.scene.corkboard.entries()) await open(sheet, 'polaroid', { photo: p.photo, caption: p.caption, back: p.back, tilt: p.tilt }, {}, `memory${i}`);
      }
    } catch (e) { sheet.close(); fail(e); }
  }

  shell.onSelect(async (id) => {
    if (EXTRA_IDS.includes(id)) return runExtra(id);
    const item = buildItems().find((i) => i.id === id);
    if (item.status === 'locked') {
      return theme.dialogs.alert({ title: theme.shellCopy('lockedTitle'), message: item.unlockLabel || theme.shellCopy('lockedPrev') });
    }
    if (id === 'finale') return runFinale();
    return runDay(days.find((d) => `day-${d.day}` === id));
  });

  return {
    theme, shell, code, fragments,
    refresh,
    reset() { store.clear(); done = {}; refresh(); },
    destroy() { shell.destroy(); },
  };
}
