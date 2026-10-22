// HOME: every gift, and a friendly way to start a new one.
import { api } from '../api.js';
import { store } from '../store.js';
import { TIER_INFO, timeAgo } from '../catalog.js';
import { badge, btn, clear, field, h, icon, input, modal, plural, toast } from '../ui-kit.js';

const nameOf = (id, list) => list.find((x) => x.id === id)?.name ?? id;

function giftCard(g, open) {
  const { themes, skins } = store.catalog;
  const status = g.broken ? badge('Needs a fix', 'bad') : g.errors ? badge(`${g.errors} to fix`, 'bad') : g.warnings ? badge('Ready, with notes', 'warn') : badge('Ready', 'good');
  return h('button.gift-card', { type: 'button', onclick: () => open(g.name), 'aria-label': `Open ${g.recipient ? `${g.recipient}'s gift` : g.name}` },
    h('span.gift-card-art', {}, icon(TIER_INFO[g.tier]?.icon ?? 'gift', 26)),
    h('span.gift-card-main', {},
      h('strong', {}, g.recipient ? `${g.recipient}'s gift` : g.name),
      h('span.muted', {}, g.broken ? g.message : `${TIER_INFO[g.tier]?.title ?? g.tier} - ${nameOf(g.theme, themes)} in ${nameOf(g.skin, skins)}`),
      h('span.gift-card-meta', {}, g.broken ? null : [plural(g.nights, 'night'), ' - ', plural(g.media, 'file'), ' - '], `edited ${timeAgo(g.updatedAt)}`)),
    status);
}

/** The "new gift" dialog: who it is for, how big, and the look. Every choice has a good default and can be changed later. */
function newGiftDialog(open) {
  const { themes, skins } = store.catalog;
  const pick = { tier: 'signature', theme: themes[0].id, skin: skins[0].id };
  const recipient = input({ placeholder: 'Her name', autocomplete: 'off' });
  const sender = input({ placeholder: 'Your name', autocomplete: 'off' });
  const birthday = input({ type: 'date' });
  const err = h('p.error', { role: 'alert', hidden: true });
  const tierEls = Object.entries(TIER_INFO).map(([id, t]) => h('button.choice', { type: 'button', 'aria-pressed': String(id === pick.tier), onclick: () => { pick.tier = id; paint(); } },
    icon(t.icon, 22), h('strong', {}, t.title), h('span.muted', {}, t.line)));
  const themeEls = themes.map((t) => h('button.choice', { type: 'button', 'aria-pressed': String(t.id === pick.theme), onclick: () => { pick.theme = t.id; paint(); } }, h('strong', {}, t.name), h('span.muted', {}, (t.mood ?? []).join(', '))));
  const skinEls = skins.map((s) => h('button.choice', { type: 'button', 'aria-pressed': String(s.id === pick.skin), onclick: () => { pick.skin = s.id; paint(); } }, s.preview ? h('img', { src: s.preview, alt: '', width: 96, height: 60 }) : null, h('strong', {}, s.name), h('span.muted', {}, (s.mood ?? []).join(', '))));
  const paint = () => {
    tierEls.forEach((el, i) => el.setAttribute('aria-pressed', String(Object.keys(TIER_INFO)[i] === pick.tier)));
    themeEls.forEach((el, i) => el.setAttribute('aria-pressed', String(themes[i].id === pick.theme)));
    skinEls.forEach((el, i) => el.setAttribute('aria-pressed', String(skins[i].id === pick.skin)));
  };
  const create = async () => {
    if (!recipient.value.trim()) { err.textContent = 'Who is the gift for? Type their name.'; err.hidden = false; recipient.focus(); return; }
    err.hidden = true;
    const stamp = birthday.value ? `-${birthday.value.slice(0, 4)}` : '';
    try {
      const made = await api.post('/api/gifts', {
        name: `${recipient.value.trim()}${stamp}`, tier: pick.tier, theme: pick.theme, skin: pick.skin,
        recipient: recipient.value.trim(), sender: sender.value.trim() || undefined, birthday: birthday.value || undefined,
      });
      m.close();
      open(made.name);
    } catch (e) {
      // the name is taken: add a number rather than ask the person to think of another
      if (/already/.test(e.message)) {
        try { const made = await api.post('/api/gifts', { name: `${recipient.value.trim()}-${Date.now().toString(36).slice(-4)}`, tier: pick.tier, theme: pick.theme, skin: pick.skin, recipient: recipient.value.trim(), sender: sender.value.trim() || undefined, birthday: birthday.value || undefined }); m.close(); open(made.name); return; } catch (e2) { err.textContent = e2.message; err.hidden = false; return; }
      }
      err.textContent = e.message; err.hidden = false;
    }
  };
  const body = h('div.new-gift', {},
    h('div.grid-2', {}, field('Who is it for?', recipient), field('Who is it from?', sender)),
    field('When is the birthday?', birthday, { hint: 'The final surprise opens on this day, and the nights count down to it. You can set this later.' }),
    h('div.field', {}, h('label', {}, 'How big?'), h('div.choices', {}, tierEls), h('p.hint', {}, 'You can change this any time.')),
    h('div.grid-2', {},
      h('div.field', {}, h('label', {}, 'The world'), h('div.choices.choices-stack', {}, themeEls)),
      h('div.field', {}, h('label', {}, 'The look'), h('div.choices.choices-stack', {}, skinEls))),
    err);
  const m = modal({ title: 'Start a new gift', body, wide: true, actions: [btn('Cancel', { onClick: () => m.close() }), btn('Start', { variant: 'primary', icon: 'arrowRight', onClick: create })] });
  recipient.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
}

export default {
  id: 'home', title: 'Gifts', hint: '',
  render(root) {
    const open = (name) => { location.hash = `#/g/${name}/setup`; };
    const list = h('div.gift-grid');
    const paint = () => {
      clear(list);
      if (!store.gifts.length) {
        list.append(h('div.empty', {}, icon('gift', 44), h('h2', {}, 'Make your first gift'),
          h('p.muted', {}, 'Pick who it is for, how big, and the look. Then add photos, songs and a video, write the nights, and send it. It takes an evening.'),
          btn('Start a gift', { variant: 'primary', icon: 'plus', onClick: () => newGiftDialog(open) })));
        return;
      }
      list.append(...store.gifts.map((g) => giftCard(g, open)));
    };
    root.append(h('div.home', {},
      h('div.page-head', {}, h('h1', {}, 'Your gifts'), h('p', {}, 'Each gift is a folder on this computer. Everything you do here is saved to it as you go.')),
      h('div.home-actions', {}, btn('New gift', { variant: 'primary', icon: 'plus', onClick: () => newGiftDialog(open) })),
      list));
    paint();
    const stop = store.on('gifts', paint);
    store.loadGifts().catch((e) => toast(e.message, 'error'));
    return stop;
  },
};
