// Backend test: the REAL built backend (backend/dist/Code.gs) running against a mock of Google's services (tests/lib/gas-mock.mjs).
// It covers the whole life of an order (draft, uploads, order, "I have paid", bank email, reminder, revoke, restore) and every refusal.
// What it cannot prove is that Google behaves as documented: run selfTest() in the Apps Script editor for that (backend/README.md).
// Run: npm run test:backend
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBackend, DEFAULT_SETTINGS } from './lib/gas-mock.mjs';
import { buildBackend } from '../scripts/build-backend.mjs';
import { normalizeOptions } from '../core/options.js';

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`  ok  ${name}`); };

const manifest = (id) => JSON.parse(readFileSync(`products/${id}/product.json`, 'utf8'));
const CAKE = manifest('cake').price.base;
const VIDEO = manifest('cake').options.find((o) => o.key === 'video').price;
const rs = (paise) => `Rs ${(paise / 100).toFixed(2)}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MIN = 60 * 1000;

async function fresh(settings = DEFAULT_SETTINGS) {
  const b = await createBackend({ settings });
  b.sandbox.setup();
  return b;
}
const mailsTo = (b, to) => b.world.outbox.filter((m) => m.to === to);
const orderRow = (b, id) => b.sheet('Orders').find((o) => o.id === id);

/** A complete order up to the pay sheet: draft, optional photo, order. Returns what the storefront would hold. */
function order(b, { product = 'cake', email = 'buyer@example.com', phone = '', photos = 0, extra = {}, ip } = {}) {
  const draft = b.call('createDraft', { productId: product });
  const ids = [];
  for (let i = 0; i < photos; i++) ids.push(b.upload(draft, { bytes: PNG }).id);
  const options = { recipient: 'Meera', sender: 'Ashish', message: 'Happy birthday!', ...(photos ? { photos: ids } : {}), ...extra };
  const placed = b.call('createOrder', { draftId: draft.id, token: draft.token, options, contact: { email, phone }, ...(ip !== undefined ? { ip } : {}) });
  return { draft, ids, options, placed };
}
const claim = (b, placed) => { b.advance(20 * 1000); return b.call('claim', { orderId: placed.orderId }); };

// ---------------------------------------------------------------- setup
await test('setup() builds the sheet, the folder and the one-minute clock; running it twice does not double the clock', async () => {
  const b = await createBackend({ settings: DEFAULT_SETTINGS });
  const summary = b.plain(b.sandbox.setup());
  b.sandbox.setup();
  assert.equal(b.world.triggers.length, 1);
  assert.equal(b.world.triggers[0].fn, 'tick');
  assert.equal(b.world.triggers[0].every, 1);
  assert.deepEqual(summary.bankSenders, ['alerts@hdfcbank.net']);
  assert.equal(b.world.folders.size, 1);
  assert.equal(b.world.spreadsheets.size, 1, 'the sheet is created once');
  for (const name of ['Orders', 'Drafts', 'Media', 'Credits', 'Events']) assert.ok([...b.world.spreadsheets.values()][0].getSheetByName(name), name);
});

await test('setup() refuses empty or wrong settings, and says which', async () => {
  const empty = await createBackend({ settings: {} });
  assert.throws(() => empty.sandbox.setup(), /Fill in UPI_VPA/);
  const wrong = await createBackend({ settings: { ...DEFAULT_SETTINGS, UPI_VPA: 'not a upi id' } });
  assert.throws(() => wrong.sandbox.setup(), /UPI_VPA/);
});

await test('selfTest() passes on a working setup, and reports a failing service by name', async () => {
  const b = await fresh();
  assert.ok(b.sandbox.selfTest().every((line) => line.startsWith('OK')), b.sandbox.selfTest().join('\n'));
  b.world.failDrive = true;
  assert.ok(b.sandbox.selfTest().some((line) => /FAIL\s+the Drive folder takes an upload/.test(line)));
  b.world.failDrive = false;
  b.world.failMail = true;
  assert.ok(b.sandbox.selfTest().some((line) => /FAIL\s+an email can be sent/.test(line)));
});

// ---------------------------------------------------------------- uploads
await test('a photo and a multi-chunk video upload to Drive intact and shared by link', async () => {
  const b = await fresh();
  const draft = b.call('createDraft', { productId: 'film' });
  const photo = b.upload(draft, { bytes: PNG });
  assert.ok(photo.ok && photo.done && photo.id.startsWith('m_'));
  const video = Buffer.alloc(b.CHUNK * 2 + 1234, 7);
  const v = b.upload(draft, { type: 'video', mime: 'video/mp4', bytes: video });
  assert.ok(v.ok && v.done, JSON.stringify(v));
  const files = [...b.world.files.values()];
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => f.shared && f.folder === 'folder_1'));
  assert.equal(files[1].bytes.length, video.length);
  assert.equal(Buffer.from(files[0].bytes).compare(PNG), 0, 'the bytes are the bytes that were sent');
  assert.equal(b.sheet('Media').length, 2);
});

await test('uploads are refused politely: wrong token, format, size, order of chunks, odd chunk, too many files, Drive down', async () => {
  const b = await fresh();
  const draft = b.call('createDraft', { productId: 'film' });
  const bad = (r, re) => assert.ok(r.ok === false && re.test(r.message), JSON.stringify(r));
  bad(b.call('uploadStart', { draftId: draft.id, token: 'wrong', type: 'image', mime: 'image/png', bytes: 10 }), /expired/);
  bad(b.call('uploadStart', { draftId: draft.id, token: draft.token, type: 'image', mime: 'application/pdf', bytes: 10 }), /format/);
  bad(b.call('uploadStart', { draftId: draft.id, token: draft.token, type: 'script', mime: 'text/plain', bytes: 10 }), /not supported/);
  bad(b.call('uploadStart', { draftId: draft.id, token: draft.token, type: 'video', mime: 'video/mp4', bytes: 31 * 1024 * 1024 }), /too big/);
  bad(b.call('uploadStart', { draftId: draft.id, token: draft.token, type: 'image', mime: 'image/png', bytes: 0 }), /empty/);

  const start = b.call('uploadStart', { draftId: draft.id, token: draft.token, type: 'image', mime: 'image/png', bytes: b.CHUNK * 2 });
  const chunk = Buffer.alloc(b.CHUNK, 1).toString('base64');
  bad(b.call('uploadChunk', { uploadId: start.uploadId, token: draft.token, offset: b.CHUNK, data: chunk }), /out of step/);
  bad(b.call('uploadChunk', { uploadId: start.uploadId, token: 'wrong', offset: 0, data: chunk }), /expired/);
  bad(b.call('uploadChunk', { uploadId: start.uploadId, token: draft.token, offset: 0, data: Buffer.alloc(1000, 1).toString('base64') }), /wrong size/);
  bad(b.call('uploadChunk', { uploadId: 'u_nope', token: draft.token, offset: 0, data: chunk }), /expired/);
  assert.ok(b.call('uploadChunk', { uploadId: start.uploadId, token: draft.token, offset: 0, data: chunk }).received);

  for (let i = 0; i < 20; i++) b.upload(draft, { bytes: PNG });
  bad(b.call('uploadStart', { draftId: draft.id, token: draft.token, type: 'image', mime: 'image/png', bytes: 10 }), /lot of files/);

  const other = b.call('createDraft', { productId: 'film' });
  b.world.failDrive = true;
  bad(b.call('uploadStart', { draftId: other.id, token: other.token, type: 'image', mime: 'image/png', bytes: 10 }), /Something went wrong/);
  assert.ok(b.sheet('Events').some((e) => e.type === 'error' && /Drive refused/.test(e.detail)), 'the real reason is logged, not shown');
});

// ---------------------------------------------------------------- the whole life of an order
await test('happy path: draft, photo, order, "I have paid" opens the link, the bank email makes it permanent', async () => {
  const b = await fresh();
  const { placed, ids } = order(b, { photos: 1 });
  assert.equal(placed.ok, true, JSON.stringify(placed));
  assert.equal(placed.amount, CAKE, 'cake base price, no add-ons, first order gets the plain price');
  assert.deepEqual(placed.upi, { vpa: 'shop@okhdfcbank', name: 'Fondly', minSeconds: 15, payWindowSeconds: 300, remindAfterSeconds: 300, revokeAfterSeconds: 600 });
  assert.equal(b.get('status', { orderId: placed.orderId }).status, 'awaiting_payment');

  const early = b.call('claim', { orderId: placed.orderId });
  assert.ok(!early.ok && /complete the payment first/.test(early.message), 'a script cannot claim in the first seconds');

  const claimed = claim(b, placed);
  assert.equal(claimed.status, 'provisional');
  assert.match(claimed.link, /^https:\/\/shop\.example\/giftkit\/host\/index\.html\?s=[a-z0-9]{20}$/);
  assert.deepEqual(b.call('claim', { orderId: placed.orderId }), claimed, 'claiming twice is safe and gives the same link');
  const live = mailsTo(b, 'buyer@example.com');
  assert.equal(live.length, 1);
  assert.match(live[0].subject, /Your gift is ready/);
  assert.ok(live[0].body.includes(claimed.link) && live[0].body.includes(rs(CAKE)));
  assert.equal(mailsTo(b, 'owner@example.com').length, 0, 'the main admin is NOT emailed about a new order');

  const slug = new URL(claimed.link).searchParams.get('s');
  const gift = b.get('gift', { slug });
  assert.equal(gift.ok, true);
  assert.equal(gift.product, 'cake');
  assert.deepEqual(gift.media[ids[0]].type, 'image');
  assert.match(gift.media[ids[0]].url, /^https:\/\/drive\.google\.com\/thumbnail\?id=file_1/);
  // the recipient's page checks options strictly: what the backend serves must pass the same check
  const manifest = JSON.parse(readFileSync('products/cake/product.json', 'utf8'));
  assert.deepEqual(normalizeOptions(manifest, gift.options).errors, {});

  b.bankEmail({ amountPaise: CAKE, utr: '629512345678' });
  const scan = b.tick();
  assert.deepEqual(scan, { settled: 1, unmatched: 0 });
  assert.equal(b.get('status', { orderId: placed.orderId }).status, 'paid');
  assert.equal(mailsTo(b, 'buyer@example.com').length, 1, 'no second email when the payment is found: they already have their link');
  assert.equal(mailsTo(b, 'owner@example.com').length, 0, 'and the main admin is not emailed about payments either');
  assert.equal(orderRow(b, placed.orderId).utr, '629512345678');
  const sent = b.world.outbox.length;
  b.tick();
  b.advance(30 * MIN);
  b.tick();
  assert.equal(b.world.outbox.length, sent, 'nothing is sent twice, and a paid order is never reminded or revoked');
  assert.equal(b.get('gift', { slug }).ok, true);
});

await test('no payment: a reminder at 5 minutes (once), the link is revoked at 10, and the gift answers "gone"', async () => {
  const b = await fresh();
  const { placed } = order(b);
  const claimed = claim(b, placed);
  const slug = new URL(claimed.link).searchParams.get('s');
  b.advance(4 * MIN);
  b.tick();
  assert.equal(mailsTo(b, 'buyer@example.com').length, 1, 'nothing yet before 5 minutes');
  b.advance(1 * MIN + 30 * 1000);
  b.tick();
  b.tick();
  const reminders = mailsTo(b, 'buyer@example.com').filter((m) => /cannot see your payment/.test(m.subject));
  assert.equal(reminders.length, 1, 'the reminder is sent once');
  assert.ok(reminders[0].body.includes(rs(CAKE)) && reminders[0].body.includes('shop@okhdfcbank'));
  assert.equal(b.get('gift', { slug }).ok, true, 'still open between 5 and 10 minutes');
  b.advance(5 * MIN);
  b.tick();
  assert.equal(b.get('status', { orderId: placed.orderId }).status, 'revoked');
  assert.deepEqual(b.get('gift', { slug }), { ok: false, error: 'gone' });
  assert.equal(b.get('status', { orderId: placed.orderId }).link, '', 'no link is handed out for a revoked order');
  assert.match(mailsTo(b, 'buyer@example.com').at(-1).subject, /switched off/);
  assert.ok(mailsTo(b, 'owner@example.com').some((m) => /Revoked/.test(m.subject)));
  assert.equal(b.call('claim', { orderId: placed.orderId }).status, 'revoked', 'claiming a revoked order does not reopen it');
});

await test('the real HDFC alert (from alerts@hdfcbank.bank.in) settles an order through the whole pipeline', async () => {
  const b = await fresh({ ...DEFAULT_SETTINGS, BANK_SENDER: 'alerts@hdfcbank.bank.in, alerts@hdfcbank.net' });
  const { placed } = order(b);
  claim(b, placed);
  const real = readFileSync('tests/fixtures/hdfc-credit-email.txt', 'utf8').split('\n\n').slice(1).join('\n\n').replace('Rs.1.00', `Rs.${(placed.amount / 100).toFixed(2)}`);
  b.bankEmail({ amountPaise: 0, utr: '', from: 'HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>', subject: 'View: Account update for your HDFC Bank A/c', body: real });
  assert.deepEqual(b.tick(), { settled: 1, unmatched: 0 });
  assert.equal(orderRow(b, placed.orderId).state, 'paid');
  assert.equal(orderRow(b, placed.orderId).utr, '629000000001');
});

await test('the clock timings are settings: 2 minutes to the reminder and 3 to the revoke, quoted in the emails and sent to the site', async () => {
  const b = await fresh({ ...DEFAULT_SETTINGS, REMIND_AFTER_MINUTES: '2', REVOKE_AFTER_MINUTES: '3' });
  const { placed } = order(b);
  assert.equal(placed.upi.remindAfterSeconds, 120);
  assert.equal(placed.upi.revokeAfterSeconds, 180);
  claim(b, placed);
  assert.match(mailsTo(b, 'buyer@example.com')[0].body, /within 3 minutes/);
  b.advance(1 * MIN);
  b.tick();
  assert.equal(mailsTo(b, 'buyer@example.com').length, 1, 'nothing before 2 minutes');
  b.advance(1 * MIN + 5000);
  b.tick();
  const reminder = mailsTo(b, 'buyer@example.com').at(-1);
  assert.match(reminder.subject, /cannot see your payment/);
  assert.match(reminder.body, /in about 1 minute /);
  b.advance(1 * MIN);
  b.tick();
  assert.equal(b.get('status', { orderId: placed.orderId }).status, 'revoked');
  const bad = await createBackend({ settings: { ...DEFAULT_SETTINGS, REMIND_AFTER_MINUTES: '5', REVOKE_AFTER_MINUTES: '3' } });
  assert.throws(() => bad.sandbox.setup(), /REVOKE_AFTER_MINUTES must be bigger/);
});

await test('a late payment brings a revoked link back, by itself', async () => {
  const b = await fresh();
  const { placed } = order(b);
  const slug = new URL(claim(b, placed).link).searchParams.get('s');
  b.advance(11 * MIN);
  b.tick();
  assert.equal(b.get('gift', { slug }).error, 'gone');
  b.bankEmail({ amountPaise: CAKE, utr: '700000000001' });
  b.tick();
  assert.equal(b.get('status', { orderId: placed.orderId }).status, 'paid');
  assert.equal(b.get('gift', { slug }).ok, true, 'the very same link works again');
  assert.equal(mailsTo(b, 'buyer@example.com').filter((m) => /back on|received/i.test(m.subject)).length, 0, 'no extra email: the five kinds of email are the only ones');
  assert.ok(b.sheet('Credits').some((c) => c.decision === 'restored'));
});

await test('paying without tapping "I have paid" still settles the order and sends the link', async () => {
  const b = await fresh();
  const { placed } = order(b);
  b.bankEmail({ amountPaise: placed.amount, utr: '800000000002' });
  b.tick();
  const row = orderRow(b, placed.orderId);
  assert.equal(row.state, 'paid');
  assert.match(row.slug, /^[a-z0-9]{20}$/);
  const booking = mailsTo(b, 'buyer@example.com');
  assert.equal(booking.length, 1, 'one booking email');
  assert.ok(booking[0].body.includes(row.slug) && /has reached us/.test(booking[0].body), 'it carries the link and says the payment arrived');
});

await test('an order nobody pays for expires and frees its amount; open orders always get different amounts', async () => {
  const b = await fresh();
  const a = order(b, { email: 'a@example.com' }).placed;
  const c = order(b, { email: 'c@example.com' }).placed;
  const d = order(b, { email: 'd@example.com' }).placed;
  assert.deepEqual([a.amount, c.amount, d.amount], [CAKE, CAKE + 1, CAKE + 2]);
  b.advance(7 * MIN);
  b.tick();
  assert.equal(orderRow(b, a.orderId).state, 'expired');
  assert.equal(order(b, { email: 'e@example.com' }).placed.amount, CAKE, 'the freed amount is handed out again');
  const e = b.call('claim', { orderId: a.orderId });
  assert.ok(e.status === 'revoked', 'an expired order cannot be claimed');
});

await test('every open order is found by its own amount: two customers paying at once settle their own orders', async () => {
  const b = await fresh();
  const a = order(b, { email: 'a@example.com' }).placed;
  const c = order(b, { email: 'c@example.com' }).placed;
  claim(b, a);
  b.call('claim', { orderId: c.orderId });
  b.bankEmail({ amountPaise: c.amount, utr: '900000000003' });
  b.bankEmail({ amountPaise: a.amount, utr: '900000000004' });
  b.tick();
  assert.equal(orderRow(b, a.orderId).utr, '900000000004');
  assert.equal(orderRow(b, c.orderId).utr, '900000000003');
});

// ---------------------------------------------------------------- the server does not trust the browser
await test('price, options and files are re-checked on the server; a price sent by the browser is ignored', async () => {
  const b = await fresh();
  const draft = b.call('createDraft', { productId: 'cake' });
  const base = { draftId: draft.id, token: draft.token, contact: { email: 'x@example.com' } };
  const ok = b.call('createOrder', { ...base, amount: 1, price: 1, quote: 1, options: { recipient: 'Meera', message: 'Hi', candles: '9' } });
  assert.equal(ok.amount, CAKE, 'the cake costs what the manifest says');
  const video = b.upload(draft, { type: 'video', mime: 'video/mp4', bytes: Buffer.alloc(1024, 2) });
  const withVideo = b.call('createOrder', { ...base, contact: { email: 'y@example.com' }, options: { recipient: 'Meera', message: 'Hi', video: video.id } });
  assert.equal(withVideo.amount, CAKE + VIDEO, 'a video adds its price, worked out here');

  const refuse = (extra, re) => { const r = b.call('createOrder', { ...base, contact: { email: 'z@example.com' }, ...extra }); assert.ok(!r.ok && re.test(r.message), JSON.stringify(r)); };
  refuse({ options: { message: 'Hi' } }, /needed/);
  refuse({ options: { recipient: 'x'.repeat(40), message: 'Hi' } }, /too long/);
  refuse({ options: { recipient: 'M', message: 'Hi', skin: 'wordle' } }, /pick one/);
  refuse({ options: { recipient: 'M', message: 'Hi', video: 'm_fake' } }, /files is missing/);
  const stranger = b.call('createDraft', { productId: 'cake' });
  const theirs = b.upload(stranger, { bytes: PNG }).id;
  refuse({ options: { recipient: 'M', message: 'Hi', photos: [theirs] } }, /files is missing/);
  refuse({ token: 'wrong', options: { recipient: 'M', message: 'Hi' } }, /expired/);
  refuse({ contact: { email: 'not-an-email' }, options: { recipient: 'M', message: 'Hi' } }, /valid email/);
  refuse({ contact: { email: 'z@example.com', phone: '12345' }, options: { recipient: 'M', message: 'Hi' } }, /mobile number/);
  assert.ok(!b.call('createDraft', { productId: 'nope' }).ok);
});

await test('unknown actions, writes over GET, garbage bodies and surprise errors all answer calmly', async () => {
  const b = await fresh();
  assert.deepEqual(b.callRaw('not json'), { ok: false, message: 'That request was not understood.' });
  assert.equal(b.call('dropEverything').ok, false);
  assert.equal(b.get('createDraft', { productId: 'cake' }).ok, false, 'a write cannot be done through GET');
  assert.equal(b.get('claim', { orderId: 'x' }).ok, false);
  assert.equal(b.get('gift', { slug: 'nothing' }).error, 'missing');
  assert.equal(b.sandbox.doGet({ parameter: {} }).text.includes('fondly-backend'), true, 'a health check with no action');
  assert.equal(b.get('status', { orderId: 'ORD-NOPE' }).ok, false);
  b.world.spreadsheets.clear(); // the sheet vanishes: an unexpected failure
  const r = b.call('createDraft', { productId: 'cake' });
  assert.deepEqual(r, { ok: false, message: 'Something went wrong. Nothing was charged. Please try again.' });
});

// ---------------------------------------------------------------- reading the bank
await test('bank emails: an unmatched credit goes to Telegram once (never to the owner\'s email); repeats and other senders are ignored; OTPs are not credits', async () => {
  const b = await fresh({ ...DEFAULT_SETTINGS, TELEGRAM_BOT_TOKEN: 'bot1', TELEGRAM_CHAT_ID: '7' });
  const { placed } = order(b);
  b.bankEmail({ amountPaise: 99999, utr: '111000000001' });                                  // matches nothing
  b.bankEmail({ amountPaise: CAKE, utr: '111000000002', from: 'someone@else.com' });        // not the bank
  b.bankEmail({ amountPaise: CAKE, utr: '111000000003', body: `Your OTP is 123456. ${rs(CAKE)} will be debited.` }); // not a credit
  b.bankEmail({ amountPaise: CAKE, utr: '111000000004', ageMs: 5 * 24 * 60 * MIN });        // too old to look at
  const first = b.tick();
  assert.deepEqual(first, { settled: 0, unmatched: 1 });
  assert.equal(orderRow(b, placed.orderId).state, 'awaiting_payment');
  const alerts = () => b.world.telegram.filter((m) => /matched no order/.test(m.text));
  assert.equal(alerts().length, 1);
  assert.ok(alerts()[0].text.includes('Rs 999.99') && alerts()[0].text.includes('markPaid'));
  assert.equal(mailsTo(b, 'owner@example.com').length, 0, 'the main admin is not emailed');
  b.tick();
  assert.equal(alerts().length, 1, 'the same email is never looked at twice');
  assert.equal(b.sheet('Credits').filter((c) => c.decision === 'not-a-credit').length, 1);
});

await test('one bank payment settles one order: the same UTR is never used twice', async () => {
  const b = await fresh();
  const a = order(b, { email: 'a@example.com' }).placed;
  b.bankEmail({ amountPaise: a.amount, utr: '222000000001' });
  b.tick();
  const c = order(b, { email: 'c@example.com' }).placed;
  b.bankEmail({ amountPaise: c.amount, utr: '222000000001' }); // a different email, the same reference
  b.tick();
  assert.equal(orderRow(b, c.orderId).state, 'awaiting_payment');
  assert.ok(b.sheet('Credits').some((c2) => /already used/.test(c2.decision)));
});

await test('the owner can mark an order paid by hand, and a revoked one comes back', async () => {
  const b = await fresh();
  const { placed } = order(b);
  const slug = new URL(claim(b, placed).link).searchParams.get('s');
  b.advance(11 * MIN);
  b.tick();
  assert.equal(b.get('gift', { slug }).error, 'gone');
  assert.throws(() => b.sandbox.markPaid(placed.orderId, ''), /UTR/);
  assert.throws(() => b.sandbox.markPaid('ORD-NOPE', '1'), /No order/);
  b.sandbox.markPaid(placed.orderId, '333000000001');
  assert.equal(b.get('gift', { slug }).ok, true);
  assert.equal(orderRow(b, placed.orderId).utr, '333000000001');
});

// ---------------------------------------------------------------- abuse
await test('one person cannot hold two unconfirmed gifts, retry after a revoke, or take more than 3 gifts a day', async () => {
  const b = await fresh();
  const first = order(b, { email: 'abuser@example.com' }).placed;
  claim(b, first);
  const second = b.call('createOrder', { ...b.call('createDraft', { productId: 'cake' }), draftId: undefined, contact: { email: 'abuser@example.com' }, options: { recipient: 'M', message: 'Hi' } });
  assert.ok(!second.ok);
  const d = b.call('createDraft', { productId: 'cake' });
  const again = b.call('createOrder', { draftId: d.id, token: d.token, contact: { email: 'Abuser@Example.com' }, options: { recipient: 'M', message: 'Hi' } });
  assert.ok(!again.ok && /waiting for its payment/.test(again.message), 'same person, different capitals: still blocked');
  b.advance(11 * MIN);
  b.tick();
  const d2 = b.call('createDraft', { productId: 'cake' });
  const afterRevoke = b.call('createOrder', { draftId: d2.id, token: d2.token, contact: { email: 'abuser@example.com' }, options: { recipient: 'M', message: 'Hi' } });
  assert.ok(!afterRevoke.ok && /could not find your last payment/.test(afterRevoke.message));

  // three honest purchases in a day are fine; the fourth is stopped
  for (let i = 0; i < 3; i++) {
    const o = order(b, { email: 'fan@example.com' }).placed;
    claim(b, o);
    b.bankEmail({ amountPaise: o.amount, utr: `44400000000${i}` });
    b.tick();
  }
  const d3 = b.call('createDraft', { productId: 'cake' });
  const fourth = b.call('createOrder', { draftId: d3.id, token: d3.token, contact: { email: 'fan@example.com' }, options: { recipient: 'M', message: 'Hi' } });
  assert.ok(!fourth.ok && /lot of gifts/.test(fourth.message), JSON.stringify(fourth));
  b.advance(25 * 60 * MIN);
  assert.ok(b.call('createOrder', { draftId: d3.id, token: d3.token, contact: { email: 'fan@example.com' }, options: { recipient: 'M', message: 'Hi' } }).ok, 'and allowed again the next day');
});

await test('the pay window is enforced: claiming after it ran out expires the order', async () => {
  const b = await fresh();
  const { placed } = order(b);
  b.advance(6 * MIN + 5000);
  const r = b.call('claim', { orderId: placed.orderId });
  assert.ok(!r.ok && /ran out/.test(r.message));
  assert.equal(orderRow(b, placed.orderId).state, 'expired');
});

// ---------------------------------------------------------------- when things break
await test('a failing mailbox or Gmail never breaks an order; Telegram is told once an hour (never an email)', async () => {
  const b = await fresh({ ...DEFAULT_SETTINGS, TELEGRAM_BOT_TOKEN: 'bot1', TELEGRAM_CHAT_ID: '7' });
  b.world.failMail = true;
  const { placed } = order(b);
  const claimed = claim(b, placed);
  assert.equal(claimed.status, 'provisional', 'the customer still gets their link on screen if the email fails');
  assert.ok(b.sheet('Events').some((e) => e.type === 'mail-failed'));
  b.world.failMail = false;

  b.sandbox.GmailApp.search = () => { throw new Error('Gmail is down'); };
  b.tick();
  b.tick();
  const problems = () => b.world.telegram.filter((m) => /Problem scanning/.test(m.text));
  assert.equal(mailsTo(b, 'owner@example.com').length, 0);
  assert.equal(problems().length, 1, 'one alert, not one a minute');
  b.advance(61 * MIN);
  b.tick();
  assert.equal(problems().length, 2, 'and another after an hour');
  assert.ok(b.sheet('Events').some((e) => e.type === 'error' && /Gmail is down/.test(e.detail)));
});

await test('Telegram alerts go out when it is set up, and not otherwise', async () => {
  const quiet = await fresh();
  const { placed } = order(quiet);
  claim(quiet, placed);
  assert.equal(quiet.world.telegram.length, 0);
  const b = await fresh({ ...DEFAULT_SETTINGS, TELEGRAM_BOT_TOKEN: 'bot123', TELEGRAM_CHAT_ID: '42' });
  const o = order(b).placed;
  claim(b, o);
  assert.equal(b.world.telegram.length, 1);
  assert.equal(b.world.telegram[0].chat_id, '42');
  assert.match(b.world.telegram[0].text, /New order/);
  assert.equal(mailsTo(b, 'owner@example.com').length, 0, 'Telegram carries the routine news; the main admin is not emailed');
  b.advance(11 * MIN);
  b.tick();
  assert.ok(mailsTo(b, 'owner@example.com').some((m) => /Revoked/.test(m.subject)), 'but a revoke is always emailed to the main admin');
});

await test('with nothing waiting the clock stops at once and reads no email (Apps Script has a daily trigger-time quota)', async () => {
  const b = await fresh();
  let searches = 0;
  const original = b.sandbox.GmailApp.search;
  b.sandbox.GmailApp.search = (...args) => { searches += 1; return original(...args); };
  assert.deepEqual(b.tick(), { settled: 0, unmatched: 0, idle: true });
  assert.equal(searches, 0);
  const { placed } = order(b);
  b.tick();
  assert.equal(searches, 1, 'one open order: now it looks');
  claim(b, placed);
  b.bankEmail({ amountPaise: placed.amount, utr: '555000000001' });
  b.tick();
  searches = 0;
  b.tick();
  assert.equal(searches, 0, 'paid and done: idle again');
});

await test('the main admin gets exactly one kind of email: a link was switched off', async () => {
  const b = await fresh();
  const a = order(b, { email: 'a@example.com' }).placed;
  claim(b, a);
  const c = order(b, { email: 'c@example.com' }).placed;
  claim(b, c);
  b.bankEmail({ amountPaise: a.amount, utr: '600000000001' });
  b.bankEmail({ amountPaise: 99999, utr: '600000000002' });
  b.tick();
  b.advance(6 * MIN);
  b.tick(); // the 5-minute reminder
  b.advance(5 * MIN);
  b.tick(); // the 10-minute revoke
  const adminMail = mailsTo(b, 'owner@example.com');
  assert.equal(adminMail.length, 1, JSON.stringify(adminMail.map((m) => m.subject)));
  assert.match(adminMail[0].subject, /Revoked: .*Rs /);
  assert.ok(adminMail[0].body.includes('c@example.com') && adminMail[0].body.includes('markPaid'));
  const kinds = new Set(b.world.outbox.filter((m) => m.to !== 'owner@example.com').map((m) => m.subject.replace(/ \(order .*\)/, '')));
  assert.deepEqual([...kinds].sort(), ['We cannot see your payment yet', 'Your gift is ready', 'Your gift link has been switched off'].sort(), 'customers get only the booking, the reminder and the revoke');
});

await test('the person who got the gift can write back: the buyer gets a postcard (HTML, escaped), a few per gift', async () => {
  const b = await fresh();
  const { placed } = order(b, { email: 'sender@example.com' });
  const slug = new URL(claim(b, placed).link).searchParams.get('s');
  const before = b.world.outbox.length;
  const nasty = '<script>alert(1)</script> Thank you & "love" you\nsecond line';
  const sent = b.call('reply', { slug, message: nasty, name: 'Meera <b>' });
  assert.deepEqual(sent, { ok: true, sent: true });
  const mail = b.world.outbox[before];
  assert.equal(mail.to, 'sender@example.com');
  assert.match(mail.subject, /Meera <b> sent you a message/);
  assert.ok(mail.htmlBody.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !mail.htmlBody.includes('<script>'), 'what the reader typed can never run in the email');
  assert.ok(mail.htmlBody.includes('Thank you &amp; &quot;love&quot; you<br>second line'), 'line breaks survive');
  assert.ok(mail.htmlBody.includes('Dear Ashish,') && mail.htmlBody.includes('Meera &lt;b&gt;'), 'addressed to the sender, signed by the reader');
  assert.ok(mail.body.includes('<script>alert(1)</script>'), 'the plain-text fallback carries the words as typed');
  assert.ok(mail.htmlBody.includes('https://shop.example/giftkit/site/'), 'a quiet link to make a gift of your own');
  assert.equal(b.sheet('Replies').length, 1);
  assert.equal(orderRow(b, placed.orderId).replies, 1);

  const refuse = (payload, re) => { const r = b.call('reply', { slug, ...payload }); assert.ok(!r.ok && re.test(r.message), JSON.stringify(r)); };
  refuse({ message: '   ' }, /write a message first/);
  refuse({ message: 'x'.repeat(601) }, /under 600/);
  assert.ok(b.call('reply', { slug, message: 'two' }).ok);
  assert.ok(b.call('reply', { slug, message: 'three' }).ok);
  refuse({ message: 'four' }, /already sent a few/);
  assert.ok(!b.call('reply', { slug: 'nope', message: 'hi' }).ok);

  b.advance(11 * MIN);
  b.tick();
  const gone = b.call('reply', { slug, message: 'too late' });
  assert.ok(!gone.ok && /no longer available/.test(gone.message), 'a switched-off gift cannot be replied to');
});

await test('"tell me when it is opened": an email to the buyer, only for another network, never twice for one address, at most two', async () => {
  const b = await fresh();
  const { placed } = order(b, { email: 'sender@example.com', ip: '1.1.1.1' });
  const slug = new URL(claim(b, placed).link).searchParams.get('s');
  const notices = () => b.world.outbox.filter((m) => /was just opened/.test(m.subject));
  assert.equal(orderRow(b, placed.orderId).buyerIp, '1.1.1.1');

  b.call('opened', { slug, ip: '1.1.1.1' });
  assert.equal(notices().length, 0, 'the buyer opening their own gift is not news');
  b.call('opened', { slug, ip: 'not an address' });
  b.call('opened', { slug, ip: '' });
  b.call('opened', { slug });
  assert.equal(notices().length, 0, 'an unreadable address is never guessed');
  b.call('opened', { slug, ip: '2.2.2.2' });
  assert.equal(notices().length, 1);
  assert.equal(notices()[0].to, 'sender@example.com');
  assert.match(notices()[0].subject, /Your gift for Meera was just opened/);
  assert.ok(notices()[0].htmlBody.includes('notice 1 of 2'));
  b.call('opened', { slug, ip: '2.2.2.2' });
  assert.equal(notices().length, 1, 'the same address twice is one notice');
  b.call('opened', { slug, ip: '3.3.3.3' });
  assert.equal(notices().length, 2);
  assert.ok(notices()[1].body.includes('notice 2 of 2'));
  b.call('opened', { slug, ip: '4.4.4.4' });
  assert.equal(notices().length, 2, 'two is the most');

  const off = order(b, { email: 'quiet@example.com', ip: '1.1.1.1', extra: { notifyOpen: false } }).placed;
  const offSlug = new URL(claim(b, off).link).searchParams.get('s');
  b.call('opened', { slug: offSlug, ip: '9.9.9.9' });
  assert.equal(notices().length, 2, 'switched off by the buyer: no email');

  const unknown = order(b, { email: 'nobuyerip@example.com' }).placed; // the buyer's address could not be read
  const unknownSlug = new URL(claim(b, unknown).link).searchParams.get('s');
  b.call('opened', { slug: unknownSlug, ip: '9.9.9.9' });
  assert.equal(notices().length, 2, 'without the buyer\'s address there is nothing to compare');
  assert.equal(orderRow(b, unknown.orderId).buyerIp, '');
  assert.equal(b.call('opened', { slug: 'missing', ip: '5.5.5.5' }).ok, true, 'it always answers ok and reveals nothing');
});

await test('a gift link works for a year after the payment is confirmed, then it is gone', async () => {
  const b = await fresh();
  const { placed } = order(b, { email: 'sender@example.com' });
  const slug = new URL(claim(b, placed).link).searchParams.get('s');
  b.bankEmail({ amountPaise: placed.amount, utr: '650000000001' });
  b.tick();
  const DAY = 24 * 60 * MIN;
  b.advance(364 * DAY);
  assert.equal(b.get('gift', { slug }).ok, true, 'still open on day 364');
  assert.ok(b.call('reply', { slug, message: 'hello' }).ok);
  b.advance(2 * DAY);
  assert.deepEqual(b.get('gift', { slug }), { ok: false, error: 'gone' });
  assert.ok(!b.call('reply', { slug, message: 'late' }).ok);
});

await test('the delivered Code.gs is up to date with its sources', async () => {
  const { code, manifest } = await buildBackend();
  assert.equal(readFileSync('backend/dist/Code.gs', 'utf8').replace(/\r\n/g, '\n'), code, 'run: npm run build:backend');
  assert.equal(readFileSync('backend/dist/appsscript.json', 'utf8').replace(/\r\n/g, '\n'), manifest);
  assert.ok(!/^\s*(import|export)\s/m.test(code), 'no module syntax is left for Apps Script to choke on');
  assert.ok(JSON.parse(manifest).webapp.access === 'ANYONE_ANONYMOUS');
});

console.log(`\nOK - ${passed} backend checks passed`);
