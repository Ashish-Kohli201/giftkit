// The guided builder: one small question per screen, a live phone above that changes as you answer, a price that counts to the total.
// It reads everything from the product's manifest (options, price, shop.steps), so a new product needs no change here.
// The customer's words and files go to the live preview by postMessage; nothing is sent to a server until they pay.
import { normalizeOptions, priceFor } from '../core/options.js';
import { createPhone } from './lib/preview.js';
import { createShop } from './lib/api.js';
import { shrinkImage } from './lib/image.js';
import { rupees } from './lib/catalog.js';
import { qrSvg } from './lib/qr.js';
import { upiUri, RULES } from '../core/payments/upi.js';
import { buzz, confetti, reduced, tween } from './lib/motion.js';

const SKINS = {
  nightsky: { mood: 'Soft, dreamy, gold stars', a: '#0e1434', b: '#ffd479' },
  arcade: { mood: 'Neon, playful, a little loud', a: '#0b0420', b: '#ff4fb0' },
};
const LIMITS = { video: { mb: 30, accept: 'video/mp4,video/quicktime,video/webm', name: 'video' }, audio: { mb: 15, accept: 'audio/*', name: 'song' } };

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.flat().filter((k) => k != null && k !== false));
  return n;
};
/** Append children, skipping the empty ones (a missing hint, an absent counter). */
const put = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
/** "2 minutes", "5 minutes": a length of time, in words. */
const minutes = (seconds) => { const m = Math.max(1, Math.round(seconds / 60)); return `${m} minute${m === 1 ? '' : 's'}`; };
/** A link to one of the policy pages, opened in a new tab so the gift being made is not lost. */
const policyLink = (page, label) => el('a', { href: `./policies/${page}.html`, target: '_blank', rel: 'noopener' }, label);
const root = document.getElementById('builder');
const saved = new Map(); // product id -> { values, media, step }: closing and reopening keeps what was typed
let session = null;

export function openBuilder({ catalog, productId, config }) {
  if (session) return;
  const product = catalog.find((p) => p.id === productId) ?? catalog[0];
  const shop = createShop(config);
  const memory = saved.get(product.id) ?? { values: {}, media: {}, step: 0 };
  const state = { product, values: memory.values, media: memory.media, step: memory.step, contact: { phone: '', email: '' }, draft: null, pending: [], busy: false };
  const steps = [...product.shop.steps, { id: 'pay', title: 'Almost there', hint: 'Where should we send the link?', keys: [] }];
  const fields = new Map(); // option key -> { setError(msg) }
  let shownPrice = priceFor(product, normalizeOptions(product, {}).options);
  let previewTimer;
  const timers = {}; // intervals that must stop when the builder closes: the UPI countdown and the thank-you status check

  // ---------------------------------------------------------------- the frame
  root.hidden = false;
  root.className = 'builder';
  root.style.setProperty('--accent', product.shop.accent);
  root.style.setProperty('--ink', product.shop.ink);
  const close = el('button', { class: 'b-icon', type: 'button', 'aria-label': 'Close', onclick: () => closeBuilder() }, el('span', { class: 'x', 'aria-hidden': 'true' }));
  const segments = steps.map(() => el('i'));
  const priceValue = el('b', {}, rupees(shownPrice));
  const top = el('header', { class: 'b-top' }, close, el('div', { class: 'b-progress', 'aria-hidden': 'true' }, segments), el('p', { class: 'b-price' }, el('span', {}, 'Total'), priceValue));
  const phoneBox = el('div', { class: 'b-phone-box' });
  const preview = el('section', { class: 'b-preview', 'aria-label': 'Live preview' }, el('div', { class: 'b-glow', 'aria-hidden': 'true' }), phoneBox, el('button', { class: 'b-replay', type: 'button', onclick: () => phone.restart() }, 'Replay'));
  const stepHost = el('div', { class: 'b-step-host', 'aria-live': 'polite' });
  const back = el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => go(-1) }, 'Back');
  const next = el('button', { class: 'btn btn-ink btn-big b-next', type: 'button', onclick: () => advance() });
  const sheet = el('section', { class: 'b-sheet' }, stepHost, el('footer', { class: 'b-foot' }, back, next));
  root.replaceChildren(top, preview, sheet);
  document.body.classList.add('is-building');
  history.pushState({ builder: true }, '');

  const phone = createPhone(phoneBox, { productId: product.id });
  const onPop = () => closeBuilder(true);
  addEventListener('popstate', onPop);

  // the keyboard on a phone covers half the screen: size the builder to what is really visible and shrink the phone while typing
  const vv = window.visualViewport;
  const fitViewport = () => root.style.setProperty('--vvh', `${vv ? vv.height : innerHeight}px`);
  vv?.addEventListener('resize', fitViewport);
  fitViewport();
  const onFocusIn = (e) => { if (e.target.matches('input, textarea')) root.classList.add('is-typing'); };
  const onFocusOut = () => root.classList.remove('is-typing');
  sheet.addEventListener('focusin', onFocusIn);
  sheet.addEventListener('focusout', onFocusOut);
  const onKey = (e) => { if (e.key === 'Escape') closeBuilder(); };
  addEventListener('keydown', onKey);

  session = { destroy };

  function destroy() {
    clearInterval(timers.upi);
    clearInterval(timers.status);
    saved.set(product.id, { values: state.values, media: state.media, step: state.step });
    clearTimeout(previewTimer);
    phone.destroy();
    removeEventListener('popstate', onPop);
    removeEventListener('keydown', onKey);
    vv?.removeEventListener('resize', fitViewport);
    document.body.classList.remove('is-building');
    root.hidden = true;
    root.replaceChildren();
    session = null;
  }
  function closeBuilder(fromHistory = false) {
    if (!fromHistory && history.state?.builder) history.back(); // popstate then calls this again
    else destroy();
  }

  // ---------------------------------------------------------------- what the live phone shows
  /** The customer's values, with the product's sample words and pictures standing in until they have typed their own. */
  function previewOptions() {
    const out = { ...product.sample };
    for (const [k, v] of Object.entries(state.values)) if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) out[k] = v;
    for (const k of ['video', 'music']) if (!(k in state.values)) delete out[k];
    return out;
  }
  function pushPreview(soon = true) {
    clearTimeout(previewTimer);
    const send = () => phone.update(previewOptions(), state.media);
    if (soon) previewTimer = setTimeout(send, 220); else send();
    refreshPrice();
  }
  function total() { return priceFor(product, normalizeOptions(product, state.values).options); }
  function refreshPrice() {
    const to = total();
    if (to === shownPrice) return;
    tween(priceValue, shownPrice, to, rupees);
    priceValue.parentElement.classList.remove('bump');
    void priceValue.offsetWidth; // restart the animation
    priceValue.parentElement.classList.add('bump');
    shownPrice = to;
  }

  // ---------------------------------------------------------------- steps
  function render(direction = 1) {
    const step = steps[state.step];
    fields.clear();
    const node = step.id === 'pay' ? payStep(step) : formStep(step);
    stepHost.replaceChildren(node);
    segments.forEach((s, i) => s.classList.toggle('done', i < state.step));
    segments.forEach((s, i) => s.classList.toggle('now', i === state.step));
    back.hidden = state.step === 0;
    updateNext();
    if (!reduced()) node.animate([{ opacity: 0, transform: `translateX(${direction * 38}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    phoneBox.classList.remove('nudge');
    void phoneBox.offsetWidth;
    phoneBox.classList.add('nudge');
    // on a computer the first field is ready to type in; on a phone the keyboard would hide the preview, so the person taps when ready
    const first = node.querySelector('input:not([type=file]), textarea');
    if (first && matchMedia('(hover: hover)').matches) first.focus({ preventScroll: true });
    else node.querySelector('h2')?.focus({ preventScroll: true });
    stepHost.scrollTop = 0;
  }

  /** "Continue", or "Skip for now" on an optional step nothing has been added to. */
  function updateNext() {
    const step = steps[state.step];
    if (step.id === 'pay') { next.replaceChildren(`Pay ${rupees(total())}`, el('span', { class: 'arrow', 'aria-hidden': 'true' })); return; }
    const empty = step.keys.every((k) => !hasValue(k));
    next.replaceChildren(step.optional && empty ? 'Skip for now' : 'Continue', el('span', { class: 'arrow', 'aria-hidden': 'true' }));
    next.classList.toggle('is-skip', !!step.optional && empty);
  }
  const hasValue = (k) => { const v = state.values[k]; return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '' && v !== false; };

  function formStep(step) {
    const node = el('div', { class: 'b-step' },
      el('h2', { tabindex: '-1' }, step.title),
      el('p', { class: 'b-hint' }, step.hint));
    for (const key of step.keys) {
      const option = product.options.find((o) => o.key === key);
      if (option) node.append(field(option, step));
    }
    if (step.starters) node.append(starters());
    return node;
  }

  async function advance() {
    if (state.busy) return;
    const step = steps[state.step];
    if (step.id === 'pay') return pay();
    const errors = normalizeOptions(product, state.values).errors;
    const mine = step.keys.filter((k) => errors[k]);
    if (mine.length) {
      mine.forEach((k) => fields.get(k)?.setError(errors[k]));
      buzz([20, 40, 20]);
      stepHost.querySelector('.f.has-error')?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      return;
    }
    buzz();
    go(1);
  }
  function go(delta) {
    state.step = Math.max(0, Math.min(steps.length - 1, state.step + delta));
    render(delta);
  }

  // ---------------------------------------------------------------- one option -> one control
  function field(option, step) {
    const wrap = el('div', { class: 'f', 'data-key': option.key });
    const error = el('p', { class: 'f-error', role: 'alert' });
    fields.set(option.key, { setError(msg) { error.textContent = msg; wrap.classList.toggle('has-error', !!msg); } });
    const clearError = () => fields.get(option.key).setError('');
    const label = el('label', { class: 'f-label' }, option.label, option.price ? el('em', { class: 'chip' }, `+${rupees(option.price)}`) : null);
    const set = (value) => { state.values[option.key] = value; clearError(); pushPreview(); updateNext(); };

    if (option.type === 'text' || option.type === 'longtext') {
      const long = option.type === 'longtext';
      const input = el(long ? 'textarea' : 'input', { id: `f-${option.key}`, class: long ? 'f-input f-long' : 'f-input', rows: long ? 7 : null, type: long ? null : 'text', maxlength: option.maxLength ?? (long ? 1200 : 60), autocomplete: 'off', autocapitalize: long ? 'sentences' : 'words', placeholder: placeholderFor(option) });
      label.setAttribute('for', input.id);
      input.value = state.values[option.key] ?? (option.key === 'title' ? option.default ?? '' : '');
      if (option.key === 'title' && state.values.title === undefined && option.default) state.values.title = option.default;
      const count = long ? el('span', { class: 'f-count' }) : null;
      const showCount = () => { if (count) count.textContent = `${input.value.length} / ${input.maxLength}`; };
      input.addEventListener('input', () => { set(input.value); showCount(); });
      showCount();
      put(wrap, label, input, count, option.hint ? el('p', { class: 'f-hint' }, option.hint) : null, error);
      if (long) fieldInputs.set(step.id, input);
    } else if (option.type === 'choice' && option.key === 'skin') {
      const current = state.values.skin ?? option.default;
      state.values.skin ??= current;
      const group = el('div', { class: 'looks', role: 'radiogroup', 'aria-label': option.label });
      for (const c of option.choices) {
        const look = SKINS[c.value] ?? { mood: '', a: '#222', b: '#fff' };
        const card = el('button', { class: 'look', type: 'button', role: 'radio', 'aria-checked': String(c.value === current), style: `--a:${look.a};--b:${look.b}`, onclick: () => { buzz(); group.querySelectorAll('.look').forEach((n) => n.setAttribute('aria-checked', String(n === card))); set(c.value); pushPreview(false); } },
          el('i', { class: 'look-swatch', 'aria-hidden': 'true' }), el('b', {}, c.label), el('small', {}, look.mood));
        group.append(card);
      }
      put(wrap, label, group, error);
    } else if (option.type === 'choice') {
      const current = state.values[option.key] ?? option.default;
      state.values[option.key] ??= current;
      const group = el('div', { class: 'pills', role: 'radiogroup', 'aria-label': option.label });
      for (const c of option.choices) {
        const pill = el('button', { class: 'pill', type: 'button', role: 'radio', 'aria-checked': String(c.value === current), onclick: () => { buzz(); group.querySelectorAll('.pill').forEach((n) => n.setAttribute('aria-checked', String(n === pill))); set(c.value); pushPreview(false); } }, c.label, c.price ? el('em', {}, `+${rupees(c.price)}`) : null);
        group.append(pill);
      }
      put(wrap, label, group, error);
    } else if (option.type === 'images') {
      put(wrap, label, imageGrid(option, set), option.hint ? el('p', { class: 'f-hint' }, option.hint) : null, error);
    } else if (option.type === 'video' || option.type === 'audio' || option.type === 'image') {
      put(wrap, label, fileCard(option, set), option.hint ? el('p', { class: 'f-hint' }, option.hint) : null, error);
    } else if (option.type === 'toggle') {
      state.values[option.key] ??= !!option.default;
      const box = el('input', { type: 'checkbox', id: `f-${option.key}`, role: 'switch' });
      box.checked = !!state.values[option.key];
      box.addEventListener('change', () => set(box.checked));
      put(wrap, el('label', { class: 'switch' }, box, el('span', { class: 'switch-track' }, el('i')), option.label), error);
    }
    return wrap;
  }
  const fieldInputs = new Map();

  function placeholderFor(option) {
    if (option.key === 'recipient') return 'For example: Aria';
    if (option.key === 'sender') return 'Your name';
    if (option.key === 'message') return 'Write it like you are talking to them...';
    if (option.key === 'title') return 'A line to open with';
    return '';
  }

  /** Three tappable lines to start from, for anyone who is staring at an empty box. */
  function starters() {
    const input = () => fieldInputs.get('words');
    const row = el('div', { class: 'starters' }, el('p', { class: 'f-hint' }, 'Not sure what to write? Tap one and make it yours.'));
    for (const text of product.shop.starters) {
      const filled = text.replaceAll('{{recipient}}', state.values.recipient || 'you').replaceAll('{{sender}}', state.values.sender || '').trim();
      const chip = el('button', { class: 'starter', type: 'button', onclick: () => {
        const box = input();
        if (!box) return;
        box.value = filled;
        box.dispatchEvent(new Event('input'));
        buzz();
      } }, `${filled.split('\n')[0].slice(0, 46)}...`);
      row.append(chip);
    }
    return row;
  }

  // ---------------------------------------------------------------- files
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  // one draft per gift, even when several uploads ask for it at the same moment (they all wait for the same request)
  function ensureDraft() { state.draftRequest ??= shop.createDraft(product.id).then((draft) => { state.draft = draft; return draft; }); return state.draftRequest; }

  function imageGrid(option, set) {
    const max = option.max ?? 6;
    const grid = el('div', { class: 'tiles' });
    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const errorOf = (msg) => fields.get(option.key)?.setError(msg);

    function paint() {
      const ids = state.values[option.key] ?? [];
      const tiles = ids.map((id, i) => el('div', { class: 'tile', style: `--i:${i}` },
        el('img', { src: state.media[id]?.url ?? '', alt: `Photo ${i + 1}` }),
        el('button', { class: 'tile-x', type: 'button', 'aria-label': `Remove photo ${i + 1}`, onclick: () => { set(ids.filter((x) => x !== id)); paint(); } }, '×')));
      const busy = state.pending.filter((p) => p.key === option.key).map(() => el('div', { class: 'tile is-busy' }, el('i', { class: 'spinner' })));
      const add = ids.length + busy.length < max ? el('button', { class: 'tile tile-add', type: 'button', onclick: () => input.click() }, el('span', { 'aria-hidden': 'true' }, '+'), el('small', {}, ids.length ? 'Add more' : 'Add photos')) : null;
      grid.replaceChildren(...[...tiles, ...busy, add, el('p', { class: 'tiles-count' }, `${ids.length} / ${max}`)].filter(Boolean));
    }
    input.addEventListener('change', async () => {
      const room = max - (state.values[option.key]?.length ?? 0);
      const files = [...input.files].filter((f) => f.type.startsWith('image/')).slice(0, room);
      input.value = '';
      if (!files.length) { errorOf('Please choose pictures from your gallery.'); return; }
      errorOf('');
      // each upload takes a few seconds, so three go at once; they are added in the order they were chosen
      const tokens = files.map(() => ({ key: option.key }));
      state.pending.push(...tokens);
      paint();
      const BATCH = 3;
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(async (file) => {
          try {
            const blob = await shrinkImage(file);
            return await shop.uploadFile(await ensureDraft(), blob, 'image');
          } catch (e) { errorOf(e.message); return null; }
        }));
        for (const up of results) if (up) { state.media[up.id] = { type: 'image', url: up.url }; set([...(state.values[option.key] ?? []), up.id]); }
        for (const token of tokens.slice(i, i + BATCH)) state.pending.splice(state.pending.indexOf(token), 1);
        pushPreview(false);
        paint();
      }
    });
    paint();
    return el('div', {}, grid, input);
  }

  function fileCard(option, set) {
    const limit = LIMITS[option.type] ?? { mb: 8, accept: `${option.type}/*`, name: option.type };
    const input = el('input', { type: 'file', accept: limit.accept, hidden: true });
    const box = el('div', { class: 'file-card' });
    const errorOf = (msg) => fields.get(option.key)?.setError(msg);
    function paint(progress) {
      const id = state.values[option.key];
      if (progress !== undefined) {
        box.replaceChildren(el('i', { class: 'spinner' }), el('span', {}, `Adding your ${limit.name}... ${Math.round(progress * 100)}%`));
      } else if (id) {
        box.replaceChildren(el('i', { class: 'file-icon is-on', 'aria-hidden': 'true' }), el('span', {}, `Your ${limit.name} is added`),
          el('button', { class: 'btn btn-quiet btn-small', type: 'button', onclick: () => { set(undefined); delete state.values[option.key]; pushPreview(false); paint(); } }, 'Remove'));
      } else {
        box.replaceChildren(el('i', { class: 'file-icon', 'aria-hidden': 'true' }), el('span', {}, `Add a ${limit.name}`),
          el('button', { class: 'btn btn-ink btn-small', type: 'button', onclick: () => input.click() }, 'Choose file'));
      }
      updateNext();
    }
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      if (file.size > limit.mb * 1048576) { errorOf(`That ${limit.name} is ${kb(file.size)}. Please keep it under ${limit.mb} MB.`); return; }
      errorOf('');
      paint(0);
      try {
        const up = await shop.uploadFile(await ensureDraft(), file, option.type, (p) => paint(p));
        state.media[up.id] = { type: option.type, url: up.url };
        set(up.id);
        pushPreview(false);
      } catch (e) { errorOf(e.message); }
      paint();
    });
    paint();
    return el('div', {}, box, input);
  }

  // ---------------------------------------------------------------- the last step: contact and payment
  const byWhatsapp = !!config.delivery?.whatsapp;

  function payStep(step) {
    const options = normalizeOptions(product, state.values).options;
    const wasPrice = product.price.compareAt ? [el('s', { class: 'was' }, rupees(product.price.compareAt)), ' '] : [];
    const lines = [el('li', {}, el('span', {}, product.name), el('b', {}, ...wasPrice, rupees(product.price.base)))];
    for (const o of product.options) {
      const v = options[o.key];
      if (v === undefined || v === false) continue;
      const amount = o.type === 'choice' ? o.choices.find((c) => c.value === v)?.price : o.price;
      if (amount) lines.push(el('li', {}, el('span', {}, o.label.replace(/ \(optional\)/, '')), el('b', {}, `+${rupees(amount)}`)));
    }
    const phoneError = el('p', { class: 'f-error', role: 'alert' });
    const emailError = el('p', { class: 'f-error', role: 'alert' });
    const phoneInput = el('input', { class: 'f-input', id: 'f-phone', type: 'tel', inputmode: 'numeric', autocomplete: 'tel-national', maxlength: 14, placeholder: '98765 43210' });
    const emailInput = el('input', { class: 'f-input', id: 'f-email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    phoneInput.value = state.contact.phone;
    emailInput.value = state.contact.email;
    phoneInput.addEventListener('input', () => { state.contact.phone = phoneInput.value; phoneError.textContent = ''; });
    emailInput.addEventListener('input', () => { state.contact.email = emailInput.value; emailError.textContent = ''; });
    fields.set('_phone', { setError: (m) => { phoneError.textContent = m; } });
    fields.set('_email', { setError: (m) => { emailError.textContent = m; } });
    const failure = el('p', { class: 'b-failure', role: 'alert' });
    state.showFailure = (m) => { failure.textContent = m; };
    return el('div', { class: 'b-step' },
      el('h2', { tabindex: '-1' }, step.title), el('p', { class: 'b-hint' }, step.hint),
      el('ul', { class: 'receipt' }, lines, el('li', { class: 'receipt-total' }, el('span', {}, 'Total'), el('b', {}, rupees(total())))),
      el('p', { class: 'consent' }, 'By paying you agree to the ', policyLink('terms', 'Terms'), ', the ', policyLink('refunds', 'Refund policy'), ' and the ', policyLink('privacy', 'Privacy policy'), '.'),
      el('div', { class: 'f' }, el('label', { class: 'f-label', for: 'f-email' }, byWhatsapp ? 'Email (optional)' : 'Your email'), emailInput,
        el('p', { class: 'f-hint' }, byWhatsapp ? 'A copy of the link, in case WhatsApp is slow.' : 'Your private link is sent here.'), emailError),
      el('div', { class: 'f' }, el('label', { class: 'f-label', for: 'f-phone' }, byWhatsapp ? 'Your WhatsApp number' : 'Mobile number (optional)'), el('div', { class: 'phone-field' }, el('span', {}, '+91'), phoneInput),
        el('p', { class: 'f-hint' }, byWhatsapp ? 'Your private link is sent here.' : 'Only so we can help if something goes wrong.'), phoneError),
      shop.demo ? el('p', { class: 'demo-note' }, 'Demo mode: nothing is charged and no link is created. This is exactly where payment happens.') : null,
      failure);
  }

  const cleanPhone = (v) => v.replace(/[\s-]/g, '').replace(/^(\+?91|0)/, '');

  async function pay() {
    const phoneDigits = cleanPhone(state.contact.phone);
    const email = state.contact.email.trim();
    let ok = true;
    // the link is sent to the email (always) and to WhatsApp (only when that is switched on); the mobile number is otherwise just for help
    if ((byWhatsapp || phoneDigits) && !/^[6-9]\d{9}$/.test(phoneDigits)) { fields.get('_phone').setError('Please enter a 10-digit mobile number.'); ok = false; }
    if ((!byWhatsapp || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fields.get('_email').setError(email ? 'That email does not look right.' : 'Please enter your email, that is where your link is sent.'); ok = false; }
    // everything must be complete, not just this step: if an earlier answer is missing, take them back to it
    const { options, errors } = normalizeOptions(product, state.values);
    const bad = Object.keys(errors)[0];
    if (bad) {
      const at = steps.findIndex((s) => s.keys.includes(bad));
      state.step = Math.max(0, at);
      render(-1);
      fields.get(bad)?.setError(errors[bad]);
      return;
    }
    if (!ok) { buzz([20, 40, 20]); return; }
    state.busy = true;
    next.classList.add('is-loading');
    next.disabled = true;
    state.showFailure('');
    try {
      const contact = { phone: phoneDigits ? `+91${phoneDigits}` : '', email };
      const draft = await ensureDraft();
      const order = await shop.createOrder(draft, { options, contact, quote: total() });
      const result = await shop.pay(order, { contact, ui: { upi: upiSheet } });
      done(result, contact);
    } catch (e) {
      state.showFailure(e.message || 'Something went wrong. Nothing was charged. Please try again.');
    } finally {
      state.busy = false;
      next.classList.remove('is-loading');
      next.disabled = false;
    }
  }

  // ---------------------------------------------------------------- paying by UPI: the sheet with the QR and "I have paid"
  /** Shows what to pay and where; resolves when the customer says they have paid, rejects if they cancel or the time runs out. */
  function upiSheet(order) {
    return new Promise((resolve, reject) => {
      const policy = { minSeconds: RULES.minSeconds, payWindowSeconds: RULES.payWindowMs / 1000, remindAfterSeconds: RULES.remindAfterMs / 1000, ...order.upi };
      state.policy = policy; // the thank-you screen quotes the same times
      const uri = upiUri({ vpa: policy.vpa, name: policy.name, amountPaise: order.amount, orderId: order.orderId });
      const exact = `₹${(order.amount / 100).toFixed(2)}`;
      let left = policy.payWindowSeconds;
      let waited = 0;
      const clock = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
      const finish = (fn, value) => { clearInterval(timers.upi); sheetNode.remove(); fn(value); };

      const copy = (text, button) => {
        navigator.clipboard?.writeText(text).then(() => { button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy'; }, 1500); }, () => {});
        buzz();
      };
      const copyButton = (text) => el('button', { class: 'btn btn-quiet btn-small', type: 'button', onclick: (e) => copy(text, e.currentTarget) }, 'Copy');
      const phoneLike = matchMedia('(pointer: coarse)').matches;
      const timeLeft = el('b', {}, clock(left));
      const bar = el('i', { class: 'upi-bar-fill' });
      const paid = el('button', { class: 'btn btn-ink btn-big', type: 'button', disabled: true, onclick: () => { buzz([20, 40, 20]); finish(resolve); } });
      // "I have paid" stays off for a few seconds: paying takes about that long, a mindless tap does not
      const showPaid = () => {
        const wait = policy.minSeconds - waited;
        paid.replaceChildren(wait > 0 ? `I have paid (in ${wait}s)` : 'I have paid');
        paid.disabled = wait > 0;
      };
      showPaid();

      const sheetNode = el('section', { class: 'b-upi', role: 'dialog', 'aria-label': 'Pay by UPI' },
        el('button', { class: 'b-icon b-upi-close', type: 'button', 'aria-label': 'Cancel the payment', onclick: () => finish(reject, new Error('The payment was not completed.')) }, el('span', { class: 'x', 'aria-hidden': 'true' })),
        el('h2', { tabindex: '-1' }, `Pay ${exact}`),
        el('p', { class: 'b-hint' }, 'Pay exactly this amount with any UPI app. The extra paise (if any) are how we find your payment.'),
        el('a', { class: 'btn btn-gold btn-big', href: uri }, 'Open my UPI app', el('span', { class: 'arrow', 'aria-hidden': 'true' })),
        el('p', { class: 'upi-tip' }, 'Nothing opened? Copy the UPI ID below, or open this page in Chrome or Safari. Instagram sometimes blocks payment apps.'),
        el('div', { class: 'upi-id' }, el('span', {}, 'UPI ID'), el('b', {}, policy.vpa), copyButton(policy.vpa)),
        el('div', { class: 'upi-id' }, el('span', {}, 'Amount'), el('b', {}, exact), copyButton((order.amount / 100).toFixed(2))),
        el('details', { class: 'upi-qr', open: !phoneLike }, el('summary', {}, phoneLike ? 'Paying from another phone? Scan this' : 'Scan with any UPI app'), qrSvg(uri)),
        el('div', { class: 'upi-clock' }, el('span', {}, 'Time left'), timeLeft, el('div', { class: 'upi-bar' }, bar)),
        paid,
        el('p', { class: 'upi-fine' }, `Your gift opens as soon as you tap this. If we cannot find your payment within ${minutes(policy.remindAfterSeconds)} we will remind you, and if it still has not arrived the link stops working.`));
      root.append(sheetNode);
      sheetNode.querySelector('h2').focus({ preventScroll: true });

      timers.upi = setInterval(() => {
        left -= 1;
        waited += 1;
        timeLeft.textContent = clock(Math.max(0, left));
        bar.style.transform = `scaleX(${Math.max(0, left) / policy.payWindowSeconds})`;
        showPaid();
        if (left <= 0) finish(reject, new Error('The payment time ran out. Nothing was charged. Please try again.'));
      }, 1000);
    });
  }

  // ---------------------------------------------------------------- the end
  function done(result, contact) {
    saved.delete(product.id);
    const sentTo = byWhatsapp ? `${contact.phone} on WhatsApp` : contact.email;
    const name = state.values.recipient;
    const options = previewOptions();
    const provisional = result.status === 'provisional' && !shop.demo;
    const say = {
      demo: ['That is how it feels.', 'This was a demo, so nothing was charged. With the backend connected, this is where your gift link opens and the bank check starts.'],
      paid: [`It is on its way${name ? `, with love for ${name}` : ''}.`, `Your private link is on its way to ${sentTo}. It stays alive for a full year.`],
      provisional: ['Your gift is ready.', `It is open now. We are checking your payment: if we cannot find it within ${minutes(state.policy?.remindAfterSeconds ?? RULES.remindAfterMs / 1000)} we will remind you, and if it still has not arrived the link stops working. Already paid? Do nothing, it becomes permanent by itself. The link is also on its way to ${sentTo}.`],
      revoked: ['We could not find your payment.', 'The link has been switched off. If you did pay, message us with the order number below and a screenshot of the payment and we will switch it straight back on.'],
    };
    const key = shop.demo ? 'demo' : provisional ? 'provisional' : result.status === 'revoked' ? 'revoked' : 'paid';
    const title = el('h2', { tabindex: '-1' }, say[key][0]);
    const body = el('p', {}, say[key][1]);
    const link = result.link ? el('p', { class: 'link-box' }, result.link) : null;
    const play = el('button', { class: 'btn btn-gold btn-big', type: 'button', onclick: () => player(product, options, state.media) }, 'Play it now');
    const screen = el('section', { class: 'b-done' },
      el('div', { class: 'tick', 'aria-hidden': 'true' }, el('span')),
      title, body,
      result.orderId && !shop.demo ? el('p', { class: 'order-no' }, `Order ${result.orderId}`) : null,
      link,
      play,
      el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { state.values = {}; state.media = {}; state.step = 0; closeBuilder(); } }, 'Make another'));
    root.append(screen);
    root.classList.add('is-done');
    title.focus({ preventScroll: true });
    if (key !== 'revoked') confetti();
    buzz([30, 50, 30]);

    // while the payment is still being checked, keep asking: it turns permanent, or it is switched off, and the customer should see which
    if (provisional) {
      timers.status = setInterval(async () => {
        try {
          const now = await shop.status(result.orderId);
          if (now.status === 'paid' || now.status === 'ready' || now.status === 'delivered') {
            title.textContent = say.paid[0];
            body.textContent = say.paid[1];
            clearInterval(timers.status);
          } else if (now.status === 'revoked') {
            title.textContent = say.revoked[0];
            body.textContent = say.revoked[1];
            play.hidden = true;
            screen.querySelector('.link-box')?.remove();
            clearInterval(timers.status);
          }
        } catch { /* a missed check is fine, the next one asks again */ }
      }, 5000);
    }
  }

  render(1);
  pushPreview(false);
}

/** The finished gift, full screen, exactly as the person receiving it will see it. */
function player(product, options, media) {
  const frame = el('iframe', { class: 'player-frame', title: 'Your gift', src: `../host/index.html?product=${encodeURIComponent(product.id)}&preview=1` });
  const shut = el('button', { class: 'b-icon player-close', type: 'button', 'aria-label': 'Close the gift', onclick: () => { removeEventListener('message', onMessage); layer.remove(); } }, el('span', { class: 'x', 'aria-hidden': 'true' }));
  const layer = el('div', { class: 'player' }, frame, shut);
  const onMessage = (e) => {
    if (e.source === frame.contentWindow && e.origin === location.origin && e.data?.type === 'gift' && e.data.event === 'ready') frame.contentWindow.postMessage({ type: 'options', options, media }, location.origin);
  };
  addEventListener('message', onMessage);
  root.append(layer);
}
