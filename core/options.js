// Customer options: checking what a customer filled in against a product's manifest, and pricing it.
// Pure functions, no DOM, no browser: the same file runs in the browser (live form + preview) and in the backend Worker
// (which must re-check everything and compute the price itself; the browser never sends a price).
//
// A manifest option is { key, type, label, required?, default?, hint?, ... } where type is one of OPTION_TYPES:
//   text / longtext   maxLength (default 60 / 1200)
//   choice            choices: [{ value, label, price? }]
//   color             "#rrggbb"
//   date              "YYYY-MM-DD"
//   toggle            true / false, price? (added when true)
//   image / video / audio   the id of an uploaded file ("m_x7k2"), price? (added when one is given)
// price: { base, compareAt? } where compareAt is the "was" price the shop shows struck through (display only; never charged)
//   images            a list of uploaded file ids, max (default 6), pricePerExtra? (for each one beyond `free`)
// Prices are integers in paise (1 rupee = 100 paise).
import { MEDIA_TYPES, OPTION_TYPES } from './contract.js';

const MEDIA_ID = /^[\w-]{1,64}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with a manifest itself (used by the checker, so a broken product never ships). */
export function checkManifest(manifest) {
  const problems = [];
  const keys = new Set();
  if (!manifest || typeof manifest !== 'object') return ['product.json must be an object'];
  for (const k of ['id', 'name', 'tagline', 'format', 'skins']) if (!manifest[k]) problems.push(`"${k}" is required`);
  if (!Number.isInteger(manifest.price?.base) || manifest.price.base < 0) problems.push('price.base must be a whole number of paise');
  if (manifest.price?.compareAt !== undefined && !(Number.isInteger(manifest.price.compareAt) && manifest.price.compareAt > manifest.price.base)) problems.push('price.compareAt (the struck-through price) must be a whole number of paise above price.base');
  if (!Array.isArray(manifest.options)) return [...problems, 'options must be a list'];
  for (const o of manifest.options) {
    const at = `option "${o?.key}"`;
    if (!o?.key || !/^[a-z][a-zA-Z0-9]*$/.test(o.key)) problems.push(`${at}: key must be camelCase letters and digits`);
    if (keys.has(o?.key)) problems.push(`${at}: duplicate key`);
    keys.add(o?.key);
    if (!OPTION_TYPES.includes(o?.type)) problems.push(`${at}: type must be one of ${OPTION_TYPES.join(', ')}`);
    if (!o?.label) problems.push(`${at}: label is required`);
    if (o?.type === 'choice' && !(o.choices?.length && o.choices.every((c) => c.value && c.label))) problems.push(`${at}: choices need a value and a label each`);
    if (o?.type === 'choice' && o.default !== undefined && !o.choices?.some((c) => c.value === o.default)) problems.push(`${at}: default is not one of the choices`);
    if (o?.required && MEDIA_TYPES.includes(o.type) && o.default !== undefined) problems.push(`${at}: a file option cannot have a default`);
  }
  return problems;
}

/**
 * Check a customer's raw values and fill in defaults.
 * @returns {{ options: object, errors: Record<string, string> }}  `errors` is keyed by option key (plain-language, for the form)
 */
export function normalizeOptions(manifest, raw = {}) {
  const options = {};
  const errors = {};
  for (const o of manifest.options) {
    const value = raw[o.key] ?? o.default;
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (o.required) errors[o.key] = `${o.label} is needed`;
      else if (o.type === 'toggle') options[o.key] = false;
      continue;
    }
    const problem = checkValue(o, value);
    if (problem) errors[o.key] = problem;
    else options[o.key] = typeof value === 'string' && !MEDIA_TYPES.includes(o.type) ? value.trim() : value;
  }
  return { options, errors };
}

function checkValue(o, v) {
  switch (o.type) {
    case 'text': case 'longtext': {
      const max = o.maxLength ?? (o.type === 'text' ? 60 : 1200);
      if (typeof v !== 'string') return `${o.label} must be text`;
      return v.trim().length > max ? `${o.label} is too long (at most ${max} characters)` : '';
    }
    case 'choice': return o.choices.some((c) => c.value === v) ? '' : `${o.label}: pick one of the choices`;
    case 'color': return typeof v === 'string' && COLOR.test(v) ? '' : `${o.label} must be a colour like #ff6a88`;
    case 'date': return typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v)) ? '' : `${o.label} must be a date`;
    case 'toggle': return typeof v === 'boolean' ? '' : `${o.label} must be on or off`;
    case 'image': case 'video': case 'audio': return typeof v === 'string' && MEDIA_ID.test(v) ? '' : `${o.label}: that file is not recognised`;
    case 'images': {
      const max = o.max ?? 6;
      if (!Array.isArray(v) || !v.every((id) => typeof id === 'string' && MEDIA_ID.test(id))) return `${o.label}: those files are not recognised`;
      return v.length > max ? `${o.label}: at most ${max} pictures` : '';
    }
    default: return `${o.label}: unknown kind of option`;
  }
}

/** The price in paise for a set of (already normalized) options. The only place a price is worked out. */
export function priceFor(manifest, options) {
  let total = manifest.price.base;
  for (const o of manifest.options) {
    const v = options[o.key];
    if (v === undefined || v === false) continue;
    if (o.type === 'toggle' || (MEDIA_TYPES.includes(o.type) && o.type !== 'images')) total += o.price ?? 0;
    if (o.type === 'choice') total += o.choices.find((c) => c.value === v)?.price ?? 0;
    if (o.type === 'images') total += Math.max(0, v.length - (o.free ?? v.length)) * (o.pricePerExtra ?? 0);
  }
  return total;
}

/** Every media id an order refers to (the backend checks each was uploaded for this draft). */
export function mediaIdsIn(manifest, options) {
  return manifest.options.filter((o) => MEDIA_TYPES.includes(o.type)).flatMap((o) => [options[o.key]].flat().filter(Boolean));
}
