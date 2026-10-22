// Pure-logic tests (no browser). Run: npm test
import assert from 'node:assert/strict';
import { validate } from '../core/validate.js';
import { assignFragments, deriveCode, FRAGMENT_ALPHABET } from '../core/fragments.js';
import { itemStatus, todayIn, addDays } from '../core/schedule.js';
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

test('fragments: unique, unambiguous, deterministic per seed, code derived in order', () => {
  const days = Array.from({ length: 10 }, (_, i) => ({ day: i + 1 }));
  const a = assignFragments(days, seededRandom('gift-1'));
  const b = assignFragments(days, seededRandom('gift-1'));
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 10);
  assert.ok(a.every((c) => FRAGMENT_ALPHABET.includes(c) && !'IO01'.includes(c)));
  assert.equal(deriveCode(a), a.join(''));
});

test('fragments: explicit values honored, duplicates and look-alikes rejected', () => {
  assert.deepEqual(assignFragments([{ fragment: 'h' }, { fragment: 'K' }], seededRandom('x')), ['H', 'K']);
  assert.throws(() => assignFragments([{ fragment: 'H' }, { fragment: 'H' }]), /Duplicate/);
  assert.throws(() => assignFragments([{ fragment: 'O' }]), /Invalid/);
});

test('schedule: date mode unlocks day N on startDate + N-1 in the given timezone', () => {
  const base = { mode: 'date', startDate: '2026-12-01', tz: 'Asia/Kolkata', flags: [false, false, false] };
  const at = (iso) => new Date(iso);
  assert.equal(itemStatus({ ...base, index: 0, now: at('2026-12-01T00:00:00+05:30') }).status, 'open');
  assert.equal(itemStatus({ ...base, index: 1, now: at('2026-12-01T23:59:00+05:30') }).status, 'locked');
  assert.equal(itemStatus({ ...base, index: 1, now: at('2026-12-02T00:00:00+05:30') }).status, 'open');
  assert.equal(itemStatus({ ...base, index: 2, now: at('2026-12-01T00:00:00+05:30') }).unlocksOn, '2026-12-03');
  // timezone matters: 2026-12-01 20:00 UTC is already Dec 2 in Kolkata
  assert.equal(todayIn('Asia/Kolkata', at('2026-12-01T20:00:00Z')), '2026-12-02');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('schedule: sequential waits for the previous item; all is always open; done wins', () => {
  assert.equal(itemStatus({ mode: 'sequential', index: 1, flags: [false, false] }).status, 'locked');
  assert.equal(itemStatus({ mode: 'sequential', index: 1, flags: [true, false] }).status, 'open');
  assert.equal(itemStatus({ mode: 'all', index: 5, flags: [] }).status, 'open');
  assert.equal(itemStatus({ mode: 'date', startDate: '2099-01-01', index: 0, flags: [true] }).status, 'done');
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

console.log(`\n${n} tests passed`);
