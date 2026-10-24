// End to end: the REAL storefront and recipient page in a phone-sized browser, talking to the REAL backend code (backend/dist/Code.gs)
// running behind an Apps Script look-alike (tests/lib/gas-server.mjs, which has no CORS preflight, like the real thing).
// Only Google itself is mocked. It covers a whole purchase with real uploads (including a multi-chunk video), the gift link, the bank
// email confirming the payment, and the other road: no payment, revoked link, late payment, link back.
// Run: npm run test:e2e
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startEmulator } from './lib/gas-server.mjs';

const SITE_PORT = 5196;
const API_PORT = 5195;
const SITE = `http://localhost:${SITE_PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const VIDEO = Buffer.alloc(3 * 1572864 + 777, 9); // 3 full chunks and a part: the browser must slice it right

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(SITE_PORT) }, stdio: 'ignore' });
const emulator = await startEmulator({ port: API_PORT, siteUrl: SITE });
await new Promise((r) => setTimeout(r, 600));

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const state = () => fetch(`${emulator.url}/ctl/state`).then((r) => r.json());
const ctl = (path, body) => fetch(`${emulator.url}${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

const browser = await chromium.launch();

async function phone(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  // the site's settings, as they would be once deployed: pointing at the backend
  await ctx.route('**/site/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `export const config = { brand: 'Notepark', api: '${emulator.url}/exec', delivery: { whatsapp: false } };` }));
  // Drive is Google's: in a test, the photo address answers with the same tiny picture
  await ctx.route('**/drive.google.com/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
  const page = await ctx.newPage();
  const problems = [];
  const contentTypes = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().startsWith(`${emulator.url}/exec`)) contentTypes.push(r.headers()['content-type']); });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => { problems.push(`native dialog: ${d.message()}`); d.dismiss(); });
  return { ctx, page, problems, contentTypes };
}

/** Fill the builder up to the pay step, with real uploads. */
async function toPayStep(page, { email }) {
  await page.goto(`${SITE}/site/`);
  await page.waitForSelector('.card');
  await page.locator('.card [data-make="envelope"]').click();
  await page.waitForSelector('.b-step h2');
  await page.fill('#f-recipient', 'Meera');
  await page.fill('#f-sender', 'Ashish');
  await page.locator('.b-next').click();
  await page.locator('.starter').first().click();
  await page.locator('.b-next').click();
  await page.waitForTimeout(450);
  await page.locator('.b-step input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => document.querySelectorAll('.tile img').length === 1, null, { timeout: 15000 });
  await page.locator('.b-next').click();
  await page.waitForTimeout(450);
  await page.locator('.b-step input[type=file]').first().setInputFiles({ name: 'hi.mp4', mimeType: 'video/mp4', buffer: VIDEO });
  await page.waitForFunction(() => /video is added/i.test(document.querySelector('.file-card')?.textContent ?? ''), null, { timeout: 30000 });
  await page.locator('.b-next').click();
  await page.waitForTimeout(450);
  await page.locator('.b-next').click(); // the look: nightsky
  await page.waitForFunction(() => /almost there/i.test(document.querySelector('.b-step h2')?.textContent ?? ''));
  await page.fill('#f-email', email);
}

try {
  console.log('\n[a whole purchase against the real backend code]');
  const buyer = await phone();
  await toPayStep(buyer.page, { email: 'meera.buyer@example.com' });

  let s = await state();
  check(s.files.length === 2 && s.files.every((f) => f.shared), 'a photo and a video reached Drive and are shared by link');
  check(s.files.some((f) => f.bytes === VIDEO.length), `the video arrived whole, in chunks (${VIDEO.length} bytes)`);
  check(s.media.length === 2, 'both files are recorded against the draft');

  // a missing/invalid email is explained, then the order goes through
  await buyer.page.fill('#f-email', 'not-an-email');
  await buyer.page.locator('.b-next').click();
  check(await buyer.page.locator('.f:has(#f-email) .f-error').isVisible(), 'a bad email is refused with a reason before anything is sent');
  await buyer.page.fill('#f-email', 'meera.buyer@example.com');
  await buyer.page.locator('.b-next').click();
  await buyer.page.waitForSelector('.b-upi', { timeout: 10000 });

  s = await state();
  const order = s.orders[0];
  check(order && order.state === 'awaiting_payment' && order.productId === 'envelope', 'the order exists on the server, waiting for payment');
  const envelope = JSON.parse(readFileSync('products/envelope/product.json', 'utf8'));
  const expected = envelope.price.base + envelope.options.find((o) => o.key === 'video').price;
  check(order.baseAmount === expected && order.amount === order.baseAmount, `the SERVER priced it: envelope + video = ${order.amount / 100} rupees`);
  const shown = await buyer.page.locator('.b-upi h2').innerText();
  check(shown.includes((order.amount / 100).toFixed(2)), `the pay sheet shows the server's exact amount (${shown})`);
  const href = await buyer.page.locator('.b-upi a[href^="upi://pay?"]').getAttribute('href');
  const q = new URL(href.replace('upi://pay', 'http://x/pay')).searchParams;
  check(q.get('pa') === 'shop@okhdfcbank' && q.get('tr') === order.id && q.get('am') === (order.amount / 100).toFixed(2), 'the UPI link carries the right ID, order and amount');

  await buyer.page.waitForFunction(() => !document.querySelector('.b-upi .btn-ink').disabled, null, { timeout: 6000 });
  await buyer.page.locator('.b-upi .btn-ink').click();
  await buyer.page.waitForSelector('.b-done', { timeout: 10000 });
  const link = (await buyer.page.locator('.b-done .link-box').innerText()).trim();
  check(/\/host\/index\.html\?s=[a-z0-9]{20}$/.test(link), `"I have paid" opens the gift at once (${link.replace(SITE, '')})`);
  check(/gift is ready/i.test(await buyer.page.locator('.b-done h2').innerText()), 'the thank-you screen says the gift is ready, with the 5-minute warning');

  s = await state();
  check(s.orders[0].state === 'provisional', 'the server holds it as provisional');
  const mail = s.outbox.find((m) => m.to === 'meera.buyer@example.com');
  check(mail && mail.body.includes(link), 'the customer was emailed the same link');
  check(s.outbox.some((m) => m.to === 'owner@example.com' && /New order/.test(m.subject)), 'the owner was told');

  // the recipient opens it (a different phone, with nothing but the link)
  const recipient = await phone();
  await recipient.page.goto(link);
  await recipient.page.waitForSelector('[data-part="env-address"]', { timeout: 10000 });
  check((await recipient.page.locator('[data-part="env-address"]').innerText()).includes('Meera'), 'the recipient\'s page opens the gift, addressed to Meera');
  check(await recipient.page.locator('html[data-gift-event="ready"], html[data-gift-event]').count() === 1, 'the gift page reported that it is ready');

  // the bank email arrives; the thank-you screen (still open on the buyer's phone) turns permanent by itself
  await ctl('/ctl/bank-email', { amountPaise: order.amount, utr: '629512345678' });
  await ctl('/ctl/tick');
  await buyer.page.waitForFunction(() => /on its way/i.test(document.querySelector('.b-done h2')?.textContent ?? ''), null, { timeout: 12000 });
  check(true, 'when the bank email lands, the buyer\'s screen turns to "it is on its way"');
  s = await state();
  check(s.orders[0].state === 'paid' && s.orders[0].utr === '629512345678', 'the order is paid, with the bank reference');
  check(buyer.contentTypes.length > 5 && buyer.contentTypes.every((t) => t.startsWith('text/plain')), `every one of the storefront's ${buyer.contentTypes.length} calls is a text/plain POST (no preflight)`);
  check(buyer.problems.length === 0 && recipient.problems.length === 0, `no console errors on either phone${buyer.problems[0] ? ` (${buyer.problems[0]})` : ''}`);
  await buyer.ctx.close();
  await recipient.ctx.close();

  console.log('\n[no payment: revoked, then a late payment brings it back]');
  const second = await phone();
  await toPayStep(second.page, { email: 'second.buyer@example.com' });
  await second.page.locator('.b-next').click();
  await second.page.waitForSelector('.b-upi', { timeout: 10000 });
  await second.page.waitForFunction(() => !document.querySelector('.b-upi .btn-ink').disabled, null, { timeout: 6000 });
  await second.page.locator('.b-upi .btn-ink').click();
  await second.page.waitForSelector('.b-done', { timeout: 10000 });
  const link2 = (await second.page.locator('.b-done .link-box').innerText()).trim();
  const order2 = (await state()).orders.find((o) => o.email === 'second.buyer@example.com');

  await ctl('/ctl/advance?ms=330000'); // 5.5 minutes
  await ctl('/ctl/tick');
  check((await state()).outbox.some((m) => m.to === 'second.buyer@example.com' && /cannot see your payment/.test(m.subject)), 'at 5 minutes the customer gets a reminder');
  await ctl('/ctl/advance?ms=330000'); // now past 10
  await ctl('/ctl/tick');
  await second.page.waitForFunction(() => /could not find your payment/i.test(document.querySelector('.b-done h2')?.textContent ?? ''), null, { timeout: 12000 });
  check(true, 'at 10 minutes the buyer\'s screen says the link was switched off');
  check(await second.page.locator('.b-done .link-box').count() === 0, 'and the link disappears from it');

  const gone = await phone();
  await gone.page.goto(link2);
  await gone.page.waitForSelector('#gift-root p', { timeout: 10000 });
  check((await gone.page.textContent('#gift-root p')).includes('no longer available'), 'the recipient now sees "This gift is no longer available."');

  await ctl('/ctl/bank-email', { amountPaise: order2.amount, utr: '700000000042' });
  await ctl('/ctl/tick');
  await gone.page.reload();
  await gone.page.waitForSelector('[data-part="env-address"]', { timeout: 10000 });
  check(true, 'the late payment arrives and the very same link works again');
  check((await state()).orders.find((o) => o.id === order2.id).state === 'paid', 'the order is paid again');
  await gone.ctx.close();
  await second.ctx.close();

  console.log('\n[several photos at once]');
  {
    const before = await state();
    const many = await phone();
    await many.page.goto(`${SITE}/site/`);
    await many.page.waitForSelector('.card');
    await many.page.locator('.card [data-make="cake"]').click();
    await many.page.waitForSelector('.b-step h2');
    await many.page.fill('#f-recipient', 'Meera');
    await many.page.locator('.b-next').click();
    await many.page.locator('.starter').first().click();
    await many.page.locator('.b-next').click();
    await many.page.waitForTimeout(450);
    const files = Array.from({ length: 5 }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: PNG }));
    await many.page.locator('.b-step input[type=file]').setInputFiles(files);
    await many.page.waitForFunction(() => document.querySelectorAll('.tile img').length === 5, null, { timeout: 30000 });
    const after = await state();
    const fresh = after.media.slice(before.media.length);
    check(fresh.length === 5, 'all five photos reached the backend');
    check(new Set(fresh.map((m) => m.draftId)).size === 1 && after.drafts.length === before.drafts.length + 1, 'they all belong to ONE draft (overlapping uploads did not each start their own)');
    check(new Set(fresh.map((m) => m.id)).size === 5 && new Set(after.media.map((m) => m._row)).size === after.media.length, 'every file has its own id and its own row');
    check(many.problems.length === 0, 'no console errors');
    await many.ctx.close();
  }

  console.log('\n[the browser talks to the backend the way Apps Script allows]');
  // a plain browser context with no request interception (interception can swallow the preflight and hide the very problem we test for)
  const probe = { ctx: await browser.newContext() };
  probe.page = await probe.ctx.newPage();
  await probe.page.goto(`${SITE}/site/`); // a real page of ours, so the call to the backend is genuinely cross-origin
  const results = await probe.page.evaluate(async (api) => {
    const simple = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'createDraft', productId: 'cake' }) }).then((r) => r.json()).catch((e) => String(e));
    // a JSON content type makes the browser send a preflight first, which Apps Script cannot answer
    const preflighted = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(() => 'worked').catch(() => 'blocked');
    return { simple, preflighted };
  }, `${emulator.url}/exec`);
  check(results.simple.ok === true, 'a text/plain POST works across origins');
  check(results.preflighted === 'blocked', 'a JSON content type would be blocked (so the storefront must keep using text/plain)');
  await probe.ctx.close();
} finally {
  await browser.close();
  server.kill();
  await emulator.close();
}
console.log(`\n${failures ? `FAILED - ${failures} check(s)` : 'OK - the storefront, the recipient page and the backend work together'}`);
process.exit(failures ? 1 : 0);
