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

test('a struck-through "was" price must be above the real price', () => {
  const m = load('cake');
  assert.equal(m.price.compareAt, 10000, 'the shop shows 100 crossed out');
  assert.deepEqual(checkManifest(m), []);
  assert.match(checkManifest({ ...m, price: { ...m.price, compareAt: m.price.base } })[0], /compareAt/);
  assert.match(checkManifest({ ...m, price: { ...m.price, compareAt: 99.5 } })[0], /compareAt/);
  assert.equal(priceFor(m, normalizeOptions(m, { recipient: 'A', message: 'B' }).options), m.price.base, 'compareAt is display only: never charged');
});

test('options: required, length, choice, media ids and defaults are checked', () => {
  const m = load('cake');
  const ok = { recipient: 'Aria', message: 'Hi' };
  const r = normalizeOptions(m, ok);
  assert.deepEqual(r.errors, {});
  assert.equal(r.options.candles, '5'); // default filled in
  assert.equal(r.options.notifyOpen, true, 'tell me when it is opened is on unless switched off');
  assert.equal(normalizeOptions(m, { ...ok, notifyOpen: false }).options.notifyOpen, false);
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

// ---------------------------------------------------------------- payments: UPI with provisional delivery
{
  const { RULES, upiUri, uniqueAmount, matchCredit, parseCreditEmail, nextAction, linkIsLive, isOpen, reservedAmounts } = await import('../core/payments/upi.js');

  const uri = upiUri({ vpa: 'shop@okhdfcbank', name: 'Spark Gifts', amountPaise: 14937, orderId: 'o_1' });
  const q = new URL(uri.replace('upi://pay', 'http://x/pay')).searchParams;
  assert.ok(uri.startsWith('upi://pay?'));
  assert.deepEqual([q.get('pa'), q.get('pn'), q.get('am'), q.get('cu'), q.get('tr')], ['shop@okhdfcbank', 'Spark Gifts', '149.37', 'INR', 'o_1']);
  assert.throws(() => upiUri({ vpa: 'nope', name: 'x', amountPaise: 100, orderId: 'o' }), /UPI ID/);
  assert.throws(() => upiUri({ vpa: 'shop@okhdfcbank', name: 'x', amountPaise: 1.5, orderId: 'o' }), /paise/);
  assert.equal(new URL(upiUri({ vpa: 'shop@okhdfcbank', name: 'A&B = "C"', amountPaise: 100, orderId: 'o' }).replace('upi://pay', 'http://x/pay')).searchParams.get('pn'), 'A&B = "C"');
  n++; console.log('  ok  upi: the payment link carries the exact amount and survives awkward names; bad ids and amounts are refused');

  assert.equal(uniqueAmount(14900, []), 14900);
  assert.equal(uniqueAmount(14900, [14900]), 14901);
  assert.equal(uniqueAmount(14900, [14900, 14901, 14903]), 14902);
  assert.equal(uniqueAmount(14900, Array.from({ length: 100 }, (_, i) => 14900 + i)), null);
  n++; console.log('  ok  upi: every open order gets its own amount, at most 99 paise above the price');

  const orders = [
    { id: 'a', amountPaise: 14900, state: 'provisional', createdAt: 0 },
    { id: 'b', amountPaise: 14901, state: 'awaiting_payment', createdAt: 0 },
    { id: 'c', amountPaise: 19900, state: 'paid', createdAt: 0 },
    { id: 'd', amountPaise: 12900, state: 'revoked', createdAt: 0 },
    { id: 'e', amountPaise: 12950, state: 'revoked', createdAt: 0 },
  ];
  assert.deepEqual(matchCredit({ amountPaise: 14900, utr: '111111111111', at: 1000 }, orders), { orderId: 'a', restore: false });
  assert.deepEqual(matchCredit({ amountPaise: 14901, utr: '111111111112', at: 1000 }, orders), { orderId: 'b', restore: false });
  assert.equal(matchCredit({ amountPaise: 19900, utr: '1', at: 1000 }, orders).orderId, null, 'an already-paid order is not settled twice');
  assert.equal(matchCredit({ amountPaise: 14902, utr: '111111111113', at: 1000 }, orders).orderId, null, 'an unknown amount matches nothing');
  assert.equal(matchCredit({ amountPaise: 14900, utr: '111111111111', at: 1000 }, orders, ['111111111111']).orderId, null, 'one payment never settles two orders');
  assert.equal(matchCredit({ amountPaise: 14900, at: 1000 }, orders).orderId, null, 'no UTR, no match');
  assert.deepEqual(matchCredit({ amountPaise: 12900, utr: '111111111114', at: 5000 }, orders), { orderId: 'd', restore: true }, 'a late payment brings a revoked order back');
  assert.equal(matchCredit({ amountPaise: 12950, utr: '111111111115', at: RULES.restoreWindowMs + 1 }, orders).orderId, null, 'too late is left to a person');
  assert.match(matchCredit({ amountPaise: 14900, utr: '2', at: 1000 }, [...orders, { id: 'z', amountPaise: 14900, state: 'awaiting_payment', createdAt: 0 }]).reason, /more than one/);
  n++; console.log('  ok  upi: a bank credit settles exactly one order, or nothing; repeats, ties and unknown amounts need a person');

  assert.deepEqual(parseCreditEmail('Dear Customer, Rs. 149.37 has been credited to your a/c XX1234 on 22-10-26 by UPI. UPI Ref No 629512345678.'), { amountPaise: 14937, utr: '629512345678' });
  assert.deepEqual(parseCreditEmail('INR 1,299.00 received via UPI. UTR: 410123456789012'), { amountPaise: 129900, utr: '410123456789012' });
  assert.deepEqual(parseCreditEmail('₹ 149 credited. RRN 629512345678'), { amountPaise: 14900, utr: '629512345678' });
  // a real HDFC alert (a UPI credit of Rs 1, sent from alerts@hdfcbank.bank.in; name and account number redacted)
  const hdfc = readFileSync(new URL('./fixtures/hdfc-credit-email.txt', import.meta.url), 'utf8');
  assert.deepEqual(parseCreditEmail(hdfc), { amountPaise: 100, utr: '629000000001' }, 'the real HDFC wording gives the amount and the UPI reference');
  assert.deepEqual(parseCreditEmail(hdfc.replace('Rs.1.00', 'Rs.2.37')), { amountPaise: 237, utr: '629000000001' });
  assert.deepEqual(parseCreditEmail(hdfc.replace('Rs.1.00', 'Rs.1,299.50')), { amountPaise: 129950, utr: '629000000001' });
  assert.equal(parseCreditEmail('Your OTP is 123456. Rs. 149.00 will be debited'), null);
  assert.equal(parseCreditEmail('Rs. 149.37 credited to your account'), null, 'no reference, no guess');
  n++; console.log('  ok  upi: credit emails in the usual wordings give an amount and a bank reference; anything unclear gives nothing');

  // an amount is reserved for exactly the orders a credit could still settle, so a new order can never collide with a revoked one
  const mix = [
    { state: 'awaiting_payment', amountPaise: 100, createdAt: 0 }, { state: 'provisional', amountPaise: 101, createdAt: 0 },
    { state: 'revoked', amountPaise: 102, createdAt: 0 }, { state: 'paid', amountPaise: 103, createdAt: 0 }, { state: 'expired', amountPaise: 104, createdAt: 0 },
  ];
  assert.deepEqual(reservedAmounts(mix, 1000), [100, 101, 102]);
  assert.deepEqual(reservedAmounts(mix, RULES.restoreWindowMs + 1), [100, 101], 'a revoked order frees its amount after the restore window');
  assert.ok(isOpen(mix[2], 1000) && !isOpen(mix[3], 1000));
  assert.equal(uniqueAmount(100, reservedAmounts(mix, 1000)), 103, 'a new order skips a revoked order amount');
  n++; console.log('  ok  upi: amounts stay reserved for revoked orders for a day, so one payment can never match two orders');

  const base = { state: 'provisional', claimedAt: 1000, createdAt: 0 };
  const fast = { ...RULES, remindAfterMs: 2 * 60000, revokeAfterMs: 3 * 60000 };
  assert.equal(nextAction(base, 1000 + 2 * 60000 - 1, fast), null);
  assert.equal(nextAction(base, 1000 + 2 * 60000, fast), 'remind', 'the test timings (2 and 3 minutes) are honoured');
  assert.equal(nextAction({ ...base, remindedAt: 5 }, 1000 + 3 * 60000, fast), 'revoke');
  assert.equal(nextAction(base, 1000 + RULES.remindAfterMs - 1), null);
  assert.equal(nextAction(base, 1000 + RULES.remindAfterMs), 'remind');
  assert.equal(nextAction({ ...base, remindedAt: 5 }, 1000 + RULES.remindAfterMs + 10), null, 'the reminder is sent once');
  assert.equal(nextAction({ ...base, remindedAt: 5 }, 1000 + RULES.revokeAfterMs), 'revoke');
  assert.equal(nextAction(base, 1000 + RULES.revokeAfterMs), 'revoke', 'even if the reminder job was late');
  assert.equal(nextAction({ state: 'awaiting_payment', createdAt: 0 }, RULES.payWindowMs), null);
  assert.equal(nextAction({ state: 'awaiting_payment', createdAt: 0 }, RULES.payWindowMs + 60000), 'expire');
  assert.equal(nextAction({ state: 'paid', createdAt: 0 }, 1e12), null);
  assert.deepEqual(['paid', 'provisional', 'awaiting_payment', 'revoked', 'expired'].map((state) => linkIsLive({ state })), [true, true, false, false, false]);
  n++; console.log('  ok  upi: the clock reminds once after 5 minutes, revokes at 10, frees unpaid amounts, and only paid or provisional links open');
}

// ---------------------------------------------------------------- the QR code really decodes to the payment link
{
  const { default: jsQR } = await import('jsqr');
  const { qrMatrix } = await import('../site/lib/qr.js');
  const { upiUri } = await import('../core/payments/upi.js');
  const text = upiUri({ vpa: 'shop@okhdfcbank', name: 'Spark Gifts', amountPaise: 14937, orderId: 'ord_8f3k2' });
  const grid = qrMatrix(text);
  const scale = 6, border = 4, size = (grid.length + border * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  grid.forEach((row, r) => row.forEach((dark, c) => {
    if (!dark) return;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((r + border) * scale + y) * size + (c + border) * scale + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    }
  }));
  assert.equal(jsQR(pixels, size, size)?.data, text);
  n++; console.log(`  ok  qr: a ${grid.length}x${grid.length} code decodes back to exactly the payment link`);
}

console.log(`\n${n} tests passed`);
