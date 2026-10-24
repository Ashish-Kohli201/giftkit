// The storefront's entry: the landing page (hero, scroll story, gift cards) and the doorway into the guided builder.
// Everything is data-driven from products/*/product.json, so a new product appears here with no change to this file.
import { config } from './config.js';
import { loadCatalog, rupees } from './lib/catalog.js';
import { createPhone } from './lib/preview.js';
import { reduced, revealOnScroll, splitWords } from './lib/motion.js';
import { openBuilder } from './builder.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  n.append(...kids.filter((k) => k != null));
  return n;
};

document.querySelectorAll('[data-brand]').forEach((n) => { n.textContent = config.brand; });
document.title = `${config.brand} - gifts they open on their phone`;

const catalog = await loadCatalog();
const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));

// ---------------------------------------------------------------- opening: headline words rise, then the rest
splitWords($('[data-split]'));
requestAnimationFrame(() => document.body.classList.add('is-loaded'));
document.querySelectorAll('[data-hero-in]').forEach((n, i) => n.style.setProperty('--d', `${0.5 + i * 0.12}s`));

// the hero phone plays a real product (the cake), slowly tilting with the scroll
const heroPhone = createPhone($('#hero-phone'), { productId: 'cake' });
heroPhone.update({ ...byId.cake.sample, message: 'You make every ordinary day feel like a celebration.\n\nHappy birthday, {{recipient}}.\n\n{{sender}}' });

// ---------------------------------------------------------------- the scroll story: one phone, three moments
const story = $('#how');
const stepEls = [...story.querySelectorAll('.story-steps li')];
const dots = [...story.querySelectorAll('.story-dots i')];
const storyIds = ['envelope', 'cake', 'film'];
const storyHost = $('#story-phone');
const storyPhones = storyIds.map((id) => {
  const holder = el('div', { class: 'story-slot' });
  storyHost.append(holder);
  const phone = createPhone(holder, { productId: id });
  phone.update(byId[id].sample);
  return holder;
});
let activeStep = -1;

function setStep(i) {
  if (i === activeStep) return;
  activeStep = i;
  stepEls.forEach((n, k) => n.classList.toggle('is-active', k === i));
  dots.forEach((n, k) => n.classList.toggle('on', k === i));
  storyPhones.forEach((n, k) => n.classList.toggle('is-active', k === i));
}
setStep(0);

function onScroll() {
  const vh = innerHeight;
  const r = story.getBoundingClientRect();
  const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - vh)));
  setStep(Math.min(storyIds.length - 1, Math.floor(p * storyIds.length)));
  story.style.setProperty('--p', p.toFixed(3));
  // the hero phone leans back as the page moves on
  const hero = $('.hero').getBoundingClientRect();
  const t = Math.max(0, Math.min(1, -hero.top / hero.height));
  $('.hero-stage').style.setProperty('--lean', t.toFixed(3));
  $('#nav').classList.toggle('is-solid', scrollY > 40);
}
if (!reduced()) addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
onScroll();

// ---------------------------------------------------------------- the gift cards (they stack as you scroll)
const cards = $('#cards');
catalog.forEach((p, i) => {
  const holder = el('div', { class: 'card-phone', 'aria-hidden': 'true' });
  const card = el('article', { class: 'card', style: `--accent:${p.shop.accent};--ink:${p.shop.ink};--i:${i}`, 'data-reveal': '' },
    el('div', { class: 'card-copy' },
      el('p', { class: 'eyebrow' }, 'From ', rupees(p.price.base), p.price.compareAt ? ' ' : null, p.price.compareAt ? el('s', { class: 'was' }, rupees(p.price.compareAt)) : null),
      el('h3', { class: 'display display-m' }, p.name),
      el('p', { class: 'card-headline' }, p.shop.headline),
      el('p', { class: 'card-blurb' }, p.shop.blurb),
      el('button', { class: 'btn btn-ink btn-big', type: 'button', 'data-make': p.id }, 'Make this one', el('span', { class: 'arrow', 'aria-hidden': 'true' }))),
    holder);
  cards.append(card);
  // each card's phone only starts once the card is near the screen (saves the visitor's data)
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    createPhone(holder, { productId: p.id }).update(p.sample);
  }, { rootMargin: '60% 0px' });
  io.observe(card);
});

// ---------------------------------------------------------------- the marquee of promises
const promises = ['No app to install', 'Pay with UPI', 'Link on WhatsApp in a minute', 'Opens inside Instagram', 'Private by link', 'Your photos, your words'];
const track = $('.marquee-track');
[...promises, ...promises].forEach((t) => track.append(el('span', {}, t)));

revealOnScroll();

// ---------------------------------------------------------------- doorway to the builder
function make(productId) {
  openBuilder({ catalog, productId: productId in byId ? productId : 'cake', config });
}
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-make]');
  if (!trigger) return;
  make(trigger.dataset.make || 'cake');
});
// an Instagram reel can link straight to one product: /site/#make=cake
const fromLink = /^#make=([\w-]+)$/.exec(location.hash);
if (fromLink) make(fromLink[1]);
