// The product playground (dev tool): pick a product, fill in its form, watch it live in a phone-sized frame.
// The form is made from the product's own product.json, so a new product shows up here with no extra code.
// Files picked here become blob: URLs inside the preview only; nothing is uploaded anywhere.
import { normalizeOptions, priceFor } from '../core/options.js';

const $ = (id) => document.getElementById(id);
const products = ['envelope', 'cake', 'film', 'credits'];
const picker = $('product');
const form = $('form');
const frame = $('gift');
const query = new URL(location.href).searchParams;

let manifest;
let values = {};
let media = {};     // id -> { type, url }, from files picked in the form
let ready = false;

for (const id of products) picker.append(new Option(id, id));
picker.value = products.includes(query.get('product')) ? query.get('product') : products[0];

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  n.append(...kids.filter((k) => k != null));
  return n;
};
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;

async function load() {
  ready = false;
  manifest = await (await fetch(`../products/${picker.value}/product.json`)).json();
  const sample = await (await fetch(`../products/${picker.value}/sample.json`)).json();
  values = { ...sample.options };
  media = {};
  buildForm();
  const url = `../host/index.html?product=${picker.value}&preview=1`;
  frame.src = url;
  $('open').href = url;
  size();
}

function buildForm() {
  form.replaceChildren();
  for (const o of manifest.options) {
    const id = `f-${o.key}`;
    let control;
    if (o.type === 'longtext') control = el('textarea', { id, rows: 6 });
    else if (o.type === 'choice') control = el('select', { id }, ...o.choices.map((c) => new Option(`${c.label}${c.price ? ` (+${rupees(c.price)})` : ''}`, c.value)));
    else if (o.type === 'toggle') control = el('input', { id, type: 'checkbox' });
    else if (['image', 'images', 'video', 'audio'].includes(o.type)) control = el('input', { id, type: 'file', accept: `${o.type === 'images' ? 'image' : o.type}/*`, multiple: o.type === 'images' });
    else control = el('input', { id, type: o.type === 'color' ? 'color' : o.type === 'date' ? 'date' : 'text' });

    const isFile = control.type === 'file';
    if (!isFile && o.type !== 'toggle') control.value = values[o.key] ?? '';
    if (o.type === 'toggle') control.checked = !!values[o.key];
    control.addEventListener(isFile ? 'change' : 'input', () => {
      if (isFile) pickFiles(o, control);
      else values[o.key] = o.type === 'toggle' ? control.checked : control.value;
      push();
    });
    form.append(el('div', { class: 'field', 'data-key': o.key },
      el('label', { for: id }, o.label + (o.price ? ` (+${rupees(o.price)})` : '')),
      control,
      o.hint ? el('p', { class: 'hint' }, o.hint) : null,
      el('p', { class: 'error', role: 'alert', hidden: true })));
  }
}

function pickFiles(o, input) {
  const files = [...input.files];
  const ids = files.map((f, i) => {
    const id = `${o.key}_${i + 1}`;
    media[id] = { type: f.type.split('/')[0], url: URL.createObjectURL(f) };
    return id;
  });
  if (!ids.length) delete values[o.key];
  else values[o.key] = o.type === 'images' ? ids : ids[0];
}

/** Check the values, show what is wrong next to each field, show the price, and send everything to the preview. */
function push() {
  const { options, errors } = normalizeOptions(manifest, values);
  for (const f of form.querySelectorAll('.field')) {
    const p = f.querySelector('.error');
    p.textContent = errors[f.dataset.key] ?? '';
    p.hidden = !errors[f.dataset.key];
  }
  $('price').textContent = `Price: ${rupees(priceFor(manifest, options))}`;
  if (ready) frame.contentWindow.postMessage({ type: 'options', options: values, media }, location.origin);
}

function size() {
  const [w, h] = $('frame').value.split('x').map(Number);
  // fit the device on short screens: scale the frame, never change its logical size (so what you see is what a phone sees)
  const scale = Math.min(1, (innerHeight - 190) / h);
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  $('device').style.transform = `scale(${scale})`;
  $('device').style.transformOrigin = 'top center';
  $('device').style.marginBottom = `${-(h * (1 - scale))}px`;
}

addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'gift') return;
  if (e.data.event === 'ready') { ready = true; push(); }
  $('events').textContent = e.data.event === 'error' ? `Problem: ${e.data.message}` : `Last event: ${e.data.event}`;
});
picker.addEventListener('change', load);
$('frame').addEventListener('change', size);
addEventListener('resize', size);
$('restart').addEventListener('click', () => { ready = false; frame.src = frame.src; });

await load();
