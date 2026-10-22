// Playground: (1) every element standalone, (2) the reference runtime on sample/config.json.
// This file is a dev tool - it is not part of the product.
import { registry } from '../elements/registry.js';
import { loadTheme } from '../core/theme-loader.js';
import { mountElement } from '../core/mount.js';
import { createResolver } from '../core/resolver.js';
import { createStore } from '../core/store.js';
import { startGift } from '../core/runtime.js';
import { TIER_FILES } from './tiers.js';
import { OPTIONAL_ROLES, FINALE_VARIANTS } from './roles.js';

const $ = (s) => document.querySelector(s);
const themeSelect = $('#theme');
const skinSelect = $('#skin');
const elementsRoot = $('#elements-root');
const giftRoot = $('#gift-root');
let current = { theme: null, instances: [], gift: null };

const themes = await (await fetch('../themes/themes.json')).json();
const skins = await (await fetch('../skins/skins.json')).json();
const url = new URL(location.href);
themeSelect.innerHTML = themes.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
themeSelect.value = url.searchParams.get('theme') || themes[0].id;
skinSelect.innerHTML = skins.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
skinSelect.value = url.searchParams.get('skin') || skins[0].id;
const finaleSelect = $('#finale-style');
finaleSelect.innerHTML = FINALE_VARIANTS.map((v) => `<option value="${v}">${v}</option>`).join('');
finaleSelect.value = url.searchParams.get('finale') || 'scroll';
$('#roles-list').innerHTML = OPTIONAL_ROLES.map((r) => `<label><input type="checkbox" data-role="${r.id}" checked> ${r.label}</label>`).join('');
const tierSelect = $('#tier');
tierSelect.innerHTML = Object.keys(TIER_FILES).map((t) => `<option value="${t}">${t}</option>`).join('');
tierSelect.value = url.searchParams.get('tier') || 'countdown';

const vars = { recipient: 'Aria', sender: 'Sam' };
const assets = createResolver({ placeholders: true });

// ------------------------------------------------------------ elements tab
async function renderElements() {
  current.instances.forEach((i) => i.destroy());
  current.instances = [];
  elementsRoot.replaceChildren();
  elementsRoot.dataset.theme = '';
  const theme = await loadTheme(themeSelect.value, { skinId: skinSelect.value, root: elementsRoot, store: createStore('playground', { persist: false }) });
  current.theme = theme;

  for (const el of Object.values(registry)) {
    const card = document.createElement('section');
    card.className = 'pg-card';
    card.innerHTML = `<header><strong>${el.id}</strong><span class="kind">${el.kind} - v${el.version}</span></header>
      <div class="pg-stage"></div>
      <div class="pg-tools"><textarea spellcheck="false"></textarea><button type="button">Remount</button><pre class="pg-log"></pre></div>`;
    elementsRoot.append(card);
    const stage = card.querySelector('.pg-stage');
    const area = card.querySelector('textarea');
    const log = card.querySelector('.pg-log');
    area.value = JSON.stringify(el.placeholderParams, null, 2);
    const say = (name) => (data) => { log.textContent += `${name} ${JSON.stringify(data ?? {})}\n`; log.scrollTop = log.scrollHeight; };

    const mount = async () => {
      card.querySelector('.pg-error')?.remove();
      log.textContent = '';
      current.instances = current.instances.filter((i) => i.el !== el.id || (i.destroy(), false));
      try {
        const inst = await mountElement(el, stage, {
          theme, params: JSON.parse(area.value), assets, vars,
          store: createStore(`pg-${el.id}`, { persist: false }),
          hooks: { onComplete: say('onComplete'), onFail: say('onFail'), emit: (n, d) => say(`emit:${n}`)(d), onExit: say('onExit') },
        });
        inst.el = el.id;
        current.instances.push(inst);
      } catch (e) {
        const pre = document.createElement('pre'); pre.className = 'pg-error'; pre.textContent = e.message;
        card.append(pre);
      }
    };
    card.querySelector('button').addEventListener('click', mount);
    await mount();
  }
}

// ------------------------------------------------------------ full gift tab
async function renderGift() {
  current.gift?.destroy();
  giftRoot.replaceChildren();
  const config = await (await fetch(`../sample/${TIER_FILES[tierSelect.value]}`)).json();
  config.schedule.mode = $('#mode').value;
  // which roles the gift has, and how it ends
  config.roles = { ...config.roles, exclude: [...document.querySelectorAll('#roles-list input:not(:checked)')].map((i) => i.dataset.role) };
  config.finale = { ...config.finale, variant: finaleSelect.value };
  const today = $('#today').value;
  const gift = await startGift({
    root: giftRoot, config, themeId: themeSelect.value, skinId: skinSelect.value, base: location.href, preview: true,
    unlockAll: $('#unlock').checked,
    now: () => new Date(`${today}T09:00:00+05:30`),
  });
  current.gift = gift;
  $('#codeout').textContent = config.finale?.type === 'reveal' ? 'no vault in this tier' : `vault code (derived): ${gift.code}`;
  $('#live-link').href = `./gift.html?tier=${tierSelect.value}&theme=${themeSelect.value}&skin=${skinSelect.value}&mode=${$('#mode').value}`;
}

// ------------------------------------------------------------ wiring
function show(tab) {
  const isGift = tab === 'gift';
  $('#elements-view').hidden = isGift;
  $('#gift-view').hidden = !isGift;
  $('#tab-elements').setAttribute('aria-selected', String(!isGift));
  $('#tab-gift').setAttribute('aria-selected', String(isGift));
  (isGift ? renderGift : renderElements)();
}
$('#tab-elements').onclick = () => show('elements');
$('#tab-gift').onclick = () => show('gift');
skinSelect.onchange = themeSelect.onchange = () => show($('#gift-view').hidden ? 'elements' : 'gift');
for (const id of ['#tier', '#mode', '#today', '#unlock', '#finale-style']) $(id).onchange = renderGift;
$('#roles-list').onchange = renderGift;
$('#reset').onclick = () => current.gift?.reset();
$('#frame').onchange = (e) => { $('#gift-frame').dataset.size = e.target.value; };

show(url.searchParams.get('tab') === 'gift' ? 'gift' : 'elements');
