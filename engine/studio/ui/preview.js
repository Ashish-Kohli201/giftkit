// THE LIVE PREVIEW: the gift itself, in a landscape phone, always beside what you are editing.
// It rebuilds on every change (the server tells the page inside the frame to reload) and the controls below it let you
// look at the gift the way the recipient will: after night 4, with everything unlocked, with another ending, on a tablet.
import { api } from './api.js';
import { store } from './store.js';
import { btn, copyText, h, icon, modal, select, toast, toggle } from './ui-kit.js';

const FRAMES = {
  phone: { label: 'Phone (844 x 390)', w: 844, h: 390 },
  small: { label: 'Small phone (667 x 375)', w: 667, h: 375 },
  tablet: { label: 'Tablet (1024 x 768)', w: 1024, h: 768 },
  laptop: { label: 'Laptop (1280 x 720)', w: 1280, h: 720 },
};

let current = null;

/** Ask the open preview to show something specific: previewGo({ play: 3 }) opens night 3's game, previewGo({ ending: true }) plays the ending. */
export function previewGo(params) { current?.go(params); }
export function previewReload() { current?.reload(); }

export function createPreview({ onFix } = {}) {
  let once = {}; // one-off parameters (play, ending), used for the next load only
  let nonce = 0;
  const frame = h('iframe', { title: 'Live preview of the gift', allow: 'autoplay; fullscreen', loading: 'eager' });
  const device = h('div.preview-device', {}, frame);
  const fit = h('div.preview-fit', {}, device);
  const overlay = h('div.preview-overlay', { hidden: true });
  const stage = h('div.preview-stage', {}, fit, overlay);
  const status = h('span.preview-status', { 'data-status': 'none' }, 'Starting');

  const urlParams = () => {
    const q = new URLSearchParams();
    if (store.ui.night > 0) q.set('night', store.ui.night);
    if (store.ui.unlock) q.set('unlock', '1');
    if (store.ui.finale) q.set('finale', store.ui.finale);
    for (const [k, v] of Object.entries(once)) if (v) q.set(k, v === true ? '1' : v);
    if (nonce) q.set('_', nonce);
    return q.toString();
  };
  const src = () => `/preview/${store.current.name}/?${urlParams()}`;
  const load = () => { frame.src = src(); };

  function layout() {
    const f = FRAMES[store.ui.frame] ?? FRAMES.phone;
    const border = 16;
    const w = f.w + border, hh = f.h + border;
    const scale = Math.min((stage.clientWidth - 24) / w, (stage.clientHeight - 24) / hh, 1.4);
    if (!(scale > 0)) return;
    device.style.width = `${w}px`; device.style.height = `${hh}px`; device.style.transform = `scale(${scale})`;
    fit.style.width = `${w * scale}px`; fit.style.height = `${hh * scale}px`;
  }
  const resize = new ResizeObserver(layout);
  resize.observe(stage);

  function paintStatus() {
    const p = store.current?.preview ?? { status: 'none' };
    status.dataset.status = p.status;
    status.textContent = { ready: 'Up to date', building: 'Updating...', error: 'Needs fixing', none: 'Starting' }[p.status] ?? '';
    overlay.hidden = p.status !== 'error';
    overlay.replaceChildren();
    if (p.status === 'error') {
      overlay.append(icon('alert', 28), h('strong', {}, 'The preview cannot show this yet'), h('p.muted', {}, (p.errors ?? [])[0] ?? 'Something needs fixing.'),
        onFix ? btn('See what to fix', { variant: 'primary', small: true, onClick: onFix }) : null);
    }
  }

  const nightChoices = () => {
    const n = store.current?.config?.days?.length ?? 0;
    return [['0', 'Start (night 1 is open)'], ...Array.from({ length: n }, (_, i) => [String(i + 1), `After night ${i + 1}`])];
  };
  const nightSelect = select(nightChoices(), { value: String(store.ui.night), onchange: (e) => { store.ui.night = Number(e.target.value); once = {}; load(); }, 'aria-label': 'How far through the nights to show' });
  const frameSelect = select(Object.entries(FRAMES).map(([k, v]) => [k, v.label]), { value: store.ui.frame, onchange: (e) => { store.ui.frame = e.target.value; layout(); }, 'aria-label': 'Screen size' });
  const unlockBox = toggle('Show everything', store.ui.unlock, (on) => { store.ui.unlock = on; once = {}; load(); });

  async function openPhone() {
    try {
      const r = await api.post(`/api/gifts/${store.current.name}/phone`);
      const body = h('div', { style: { display: 'grid', gap: '12px' } },
        r.url ? [h('p', {}, 'On your phone, connected to the same Wi-Fi as this computer, open this address:'),
          h('div.phone-url', { style: { fontSize: '1.3rem', fontWeight: '700', wordBreak: 'break-all', padding: '14px', background: 'var(--surface-2)', borderRadius: '10px' } }, r.url),
          h('p.muted', {}, 'It updates by itself as you make changes. If it does not open, allow Node.js through the Windows firewall for private networks, and check the phone is not on mobile data or a guest network.')]
          : h('p', {}, 'This computer does not seem to be on a Wi-Fi network, so a phone cannot reach it.'));
      const m = modal({ title: 'See it on your phone', body, actions: [r.url ? btn('Copy address', { icon: 'copy', onClick: () => copyText(r.url) }) : null, btn('Done', { variant: 'primary', onClick: () => m.close() })] });
    } catch (e) { toast(e.message, 'error'); }
  }

  const el = h('aside.preview', { 'aria-label': 'Live preview' },
    h('div.preview-head', {}, h('strong', {}, 'Live preview'), status),
    stage,
    h('div.preview-controls', {},
      h('div.preview-row', {}, h('label', {}, 'Show'), nightSelect, frameSelect),
      h('div.preview-row', {}, unlockBox),
      h('div.preview-row', {},
        btn('Reload', { small: true, icon: 'refresh', onClick: () => api_reload() }),
        btn('On my phone', { small: true, icon: 'phone', onClick: () => openPhone() }),
        btn('New tab', { small: true, icon: 'eye', onClick: () => window.open(src(), '_blank', 'noopener') }))));

  function api_reload() { nonce = Date.now(); load(); }
  const stops = [
    store.on('preview', paintStatus),
    store.on('report', () => { const n = store.current?.config?.days?.length ?? 0; nightSelect.replaceChildren(...nightChoices().map(([v, l]) => h('option', { value: v }, l))); nightSelect.value = String(Math.min(store.ui.night, n)); }),
  ];
  paintStatus();
  load();
  requestAnimationFrame(layout);

  const api_ = {
    el,
    go(params) { once = { ...params }; nonce = Date.now(); load(); once = {}; },
    reload: api_reload,
    destroy() { stops.forEach((s) => s()); resize.disconnect(); if (current === api_) current = null; },
  };
  current = api_;
  return api_;
}
