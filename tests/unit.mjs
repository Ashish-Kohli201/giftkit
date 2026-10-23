// Pure-logic tests (no browser). Run: npm test
import assert from 'node:assert/strict';
import { validate } from '../core/validate.js';
import { checkManifest, normalizeOptions, priceFor, mediaIdsIn } from '../core/options.js';
import { readFileSync, readdirSync } from 'node:fs';
import { template, deepTemplate, seededRandom } from '../core/util.js';
import { registry } from '../elements/registry.js';
import { createResolver, placeholderWav, WAV_RATE, WAV_SECONDS } from '../core/resolver.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

test('template fills known vars and leaves unknown visible', () => {
  assert.equal(template('Hi {{recipient}} {{oops}}', { recipient: 'Aria' }), 'Hi Aria {{oops}}');
  assert.deepEqual(deepTemplate({ a: ['{{x}}'] }, { x: 1 }), { a: ['1'] });
});

test('validator: required, type, bounds, nullable', () => {
  const s = { type: 'object', required: ['a'], properties: { a: { type: 'integer', minimum: 1 }, b: { type: ['integer', 'null'] } } };
  assert.equal(validate(s, { a: 2, b: null }).length, 0);
  assert.ok(validate(s, {}).some((e) => e.includes('required')));
  assert.ok(validate(s, { a: 0 }).some((e) => e.includes('minimum')));
  assert.ok(validate(s, { a: 1.5 }).length > 0);
});

test('every element: placeholderParams satisfy its own schema', () => {
  for (const el of Object.values(registry)) assert.deepEqual(validate(el.paramsSchema, el.placeholderParams), [], el.id);
});

test('placeholder audio: valid mono 16-bit WAV, about 10s, deterministic per slot id', () => {
  const a = placeholderWav('track_01');
  const text = (o, len) => String.fromCharCode(...a.subarray(o, o + len));
  const view = new DataView(a.buffer);
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(text(36, 4), 'data');
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint16(34, true), 16); // 16-bit
  assert.equal(view.getUint32(40, true), a.length - 44);
  assert.equal((a.length - 44) / 2 / WAV_RATE, WAV_SECONDS);
  assert.deepEqual(a, placeholderWav('track_01'));
  assert.notDeepEqual(a, placeholderWav('track_02'));
});

{
  // resolver: audio requests get a WAV data URI in preview mode; everything else behaves as before
  const preview = createResolver({ placeholders: true, assets: { song: { type: 'audio' }, real: { type: 'audio', src: 'media/a.mp3' } }, base: 'http://localhost/gift/' });
  const byOption = await preview.resolve('@track_01', { type: 'audio' });
  assert.equal(byOption.type, 'audio');
  assert.ok(byOption.url.startsWith('data:audio/wav;base64,'));
  assert.equal((await preview.resolve('@song')).type, 'audio'); // slot type alone is enough
  assert.equal((await preview.resolve('@real', { type: 'audio' })).url, 'http://localhost/gift/media/a.mp3'); // real files win
  const photo = await preview.resolve('@photo_01');
  assert.equal(photo.type, 'image');
  assert.ok(photo.url.startsWith('data:image/svg+xml'));
  await assert.rejects(createResolver({ assets: {} }).resolve('@track_01', { type: 'audio' }), /missing/); // no placeholders outside previews
  n++; console.log('  ok  resolver: audio placeholders only in preview, real files and images unchanged');
}

test('reveal: every finale variant validates, a bad variant or candle count is rejected', () => {
  const { paramsSchema, placeholderParams } = registry.reveal;
  for (const variant of ['scroll', 'envelope', 'slideshow', 'cake']) assert.deepEqual(validate(paramsSchema, { ...placeholderParams, variant }), [], variant);
  assert.ok(validate(paramsSchema, { ...placeholderParams, variant: 'confetti' }).length > 0);
  assert.ok(validate(paramsSchema, { ...placeholderParams, variant: 'cake', candles: 12 }).length > 0);
  assert.ok(validate(paramsSchema, { ...placeholderParams, variant: 'slideshow', slideMs: 500 }).length > 0);
  assert.deepEqual(validate(paramsSchema, { ...placeholderParams, variant: 'cake', candles: 7 }), []);
});

// ---------------------------------------------------------------- products: options and price
const load = (id) => JSON.parse(readFileSync(new URL(`../products/${id}/product.json`, import.meta.url), 'utf8'));
const products = readdirSync(new URL('../products/', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);

test('every product manifest is valid and its sample is a complete order', () => {
  assert.ok(products.length >= 4);
  for (const id of products) {
    const m = load(id);
    assert.deepEqual(checkManifest(m), [], id);
    const sample = JSON.parse(readFileSync(new URL(`../products/${id}/sample.json`, import.meta.url), 'utf8'));
    assert.deepEqual(normalizeOptions(m, sample.options).errors, {}, id);
  }
});

test('options: required, length, choice, media ids and defaults are checked', () => {
  const m = load('cake');
  const ok = { recipient: 'Aria', message: 'Hi' };
  const r = normalizeOptions(m, ok);
  assert.deepEqual(r.errors, {});
  assert.equal(r.options.candles, '5'); // default filled in
  assert.equal(r.options.title, 'Happy Birthday, {{recipient}}!');
  assert.ok(normalizeOptions(m, {}).errors.recipient); // required
  assert.ok(normalizeOptions(m, { ...ok, recipient: 'x'.repeat(31) }).errors.recipient);
  assert.ok(normalizeOptions(m, { ...ok, candles: '4' }).errors.candles); // not one of the choices
  assert.ok(normalizeOptions(m, { ...ok, skin: 'wordle' }).errors.skin);
  assert.ok(normalizeOptions(m, { ...ok, photos: ['a/../b'] }).errors.photos); // not a file id
  assert.ok(normalizeOptions(m, { ...ok, photos: Array(7).fill('p') }).errors.photos); // too many
  assert.equal(normalizeOptions(m, { ...ok, recipient: '  Aria  ' }).options.recipient, 'Aria'); // trimmed
});

test('price: computed from the manifest only, a client-sent price is ignored', () => {
  const m = load('envelope');
  const base = normalizeOptions(m, { recipient: 'Aria', message: 'Hi' }).options;
  assert.equal(priceFor(m, base), m.price.base);
  const withExtras = normalizeOptions(m, { recipient: 'Aria', message: 'Hi', video: 'v1', music: 'm1', price: 1 }).options;
  assert.equal(withExtras.price, undefined); // unknown keys are dropped
  const extras = m.options.find((o) => o.key === 'video').price + m.options.find((o) => o.key === 'music').price;
  assert.equal(priceFor(m, withExtras), m.price.base + extras);
  assert.deepEqual(mediaIdsIn(m, withExtras).sort(), ['m1', 'v1']);
});

console.log(`\n${n} tests passed`);
