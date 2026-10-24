// Storefront test (Playwright). Starts the dev server, then on phone-sized screens:
//  - the landing page loads with no console errors, no third-party requests and no sideways scrolling
//  - for every product: open it from its card, answer each question (with real file uploads), see the price move,
//    be stopped and told what is missing, choose a look, pay in demo mode, and reach the thank-you screen
// Run: npm i && npx playwright install chromium && npm run test:site     (SHOTS=1 saves screenshots to tests/shots)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
const PRODUCTS = JSON.parse(readFileSync('products/index.json', 'utf8'));
const SCREENS = [{ width: 390, height: 844 }, { width: 360, height: 640 }];
// a real 1x1 PNG, so the picture shrinker has something to decode
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
if (process.env.SHOTS) mkdirSync('tests/shots', { recursive: true });

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const price = (page) => page.locator('.b-price b').textContent();
const shot = async (page, name) => { if (process.env.SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `tests/shots/site-${name}.png` }); } };

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  // these tests are about DEMO MODE: whatever site/config.js points at, they must never reach a real backend
  await ctx.route('**/site/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export const config = { brand: 'Notepark', api: '', delivery: { whatsapp: false } };" }));
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('request', (r) => { if (r.url().includes('script.google.com')) problems.push(`a demo test reached the real backend: ${r.url()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  page.on('dialog', (d) => { problems.push(`native dialog: ${d.message()}`); d.dismiss(); });
  return { ctx, page, problems, external };
}

/** Answer whatever the current step asks, using the product's own step definition. */
async function answerStep(page, title) {
  if (/for\?$/.test(title)) {
    await page.fill('#f-recipient', 'Meera');
    await page.fill('#f-sender', 'Ashish');
  } else if (/say it/i.test(title)) {
    await page.locator('.starter').first().click();
  } else if (/photos/i.test(title)) {
    await page.locator('.b-step input[type=file]').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
    await page.waitForFunction(() => document.querySelectorAll('.tile img').length === 2);
  } else if (/unforgettable/i.test(title)) {
    // nothing is required here: the next button offers "Skip for now" until something is added
  } else if (/feel/i.test(title)) {
    await page.locator('.look', { hasText: 'Arcade' }).click();
  }
}

const browser = await chromium.launch();
try {
  // ---------------------------------------------------------------- the landing page
  for (const screen of SCREENS) {
    console.log(`\n[landing ${screen.width}x${screen.height}]`);
    const { ctx, page, problems, external } = await newPage(browser, screen);
    await page.goto(`${BASE}/site/`);
    await page.waitForSelector('.card');
    await page.waitForTimeout(1800);
    // a phone widens its layout when something sticks out, so the width itself must stay put
    check(await page.evaluate((w) => innerWidth === w && document.documentElement.scrollWidth <= w, screen.width), 'the page is exactly as wide as the phone (nothing sticks out)');
    check(await page.locator('.card').count() === PRODUCTS.length, `one card per product (${PRODUCTS.length})`);
    check(await page.locator('.hero .display .word').count() > 3, 'the headline is split into rising words');
    await shot(page, `landing-${screen.width}`);
    // the scroll story swaps the phone as the page moves
    const steps = [];
    for (const f of [0.1, 0.45, 0.8]) {
      await page.evaluate((frac) => { const s = document.querySelector('#how'); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * frac); }, f);
      await page.waitForTimeout(500);
      steps.push(await page.locator('.story-steps li.is-active h2').textContent());
    }
    check(new Set(steps).size === 3, `the story shows three different moments (${steps.join(' / ')})`);
    check(problems.length === 0, `no console errors${problems.length ? ` (${problems[0]})` : ''}`);
    check(external.length === 0, `no third-party requests${external.length ? ` (${external[0]})` : ''}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- every product, start to finish
  for (const id of PRODUCTS) {
    console.log(`\n[buy ${id}]`);
    const { ctx, page, problems, external } = await newPage(browser, SCREENS[0]);
    await page.goto(`${BASE}/site/`);
    await page.waitForSelector('.card');
    await page.locator(`.card [data-make="${id}"]`).click();
    await page.waitForSelector('.b-step h2');
    const start = await price(page);

    // stopped, with a reason, when the first answer is missing
    await page.locator('.b-next').click();
    check(await page.locator('.f-error').first().isVisible(), 'a missing name is explained, and you stay on the step');

    let guard = 0;
    let sawPhotos = false;
    while (guard++ < 8) {
      const title = (await page.locator('.b-step h2').textContent()).trim();
      if (/almost there/i.test(title)) break;
      await answerStep(page, title);
      if (/photos/i.test(title)) sawPhotos = true;
      if (/unforgettable/i.test(title)) {
        check(/skip/i.test(await page.locator('.b-next').textContent()), 'an optional step offers "Skip for now"');
        // a video is a paid extra: the price must move
        await page.waitForTimeout(700);
        const before = await price(page);
        await page.locator('.b-step input[type=file]').first().setInputFiles({ name: 'hi.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(2048, 1) });
        await page.waitForFunction((b) => document.querySelector('.b-price b').textContent !== b, before, { timeout: 4000 });
        await page.waitForTimeout(700);
        check(true, `adding a video moves the price (${before} -> ${await price(page)})`);
      }
      await shot(page, `${id}-${title.replace(/\W+/g, '-').slice(0, 20)}`);
      await page.locator('.b-next').click();
      await page.waitForTimeout(450);
    }
    check(sawPhotos, 'the photo step was reached and photos were added');
    check(await page.locator('.b-step h2').textContent().then((t) => /almost there/i.test(t)), 'reached the payment step');

    // the preview really is the gift, in the chosen look, with the typed name
    const frame = page.frameLocator('.b-phone-box iframe');
    const skin = await page.locator('.b-phone-box iframe').evaluate((f) => f.contentDocument?.getElementById('gift-root')?.dataset.skin);
    check(skin === 'arcade', `the live phone wears the look that was chosen (${skin})`);
    check((await frame.locator('body').innerText()).length > 0, 'the live phone is showing the gift');

    // payment: the link goes to an email, so a missing or wrong one is refused with a reason; the mobile number is optional but checked if given
    await page.locator('.b-next').click();
    check(await page.locator('.f:has(#f-email) .f-error').first().isVisible(), 'a missing email is explained');
    await page.fill('#f-email', 'not-an-email');
    await page.fill('#f-phone', '12345');
    await page.locator('.b-next').click();
    check(await page.locator('.f:has(#f-phone) .f-error').first().isVisible(), 'a wrong mobile number is refused with a reason');
    await page.fill('#f-phone', '');
    await page.fill('#f-email', 'meera@example.com');
    await shot(page, `${id}-pay`);
    await page.locator('.b-next').click();
    await page.waitForSelector('.b-upi', { timeout: 6000 });
    check(/Pay \u20B9\d+\.\d\d/.test(await page.locator('.b-upi h2').innerText()), 'the pay sheet shows the exact amount');
    check(await page.locator('.b-upi svg path').count() === 1, 'the pay sheet shows a QR code');
    check(await page.locator('.b-upi a[href^="upi://pay?"]').count() === 1, 'there is a button that opens the UPI app');
    check(await page.locator('.b-upi .btn-ink').isDisabled(), '"I have paid" is off for the first few seconds');
    await shot(page, `${id}-upi`);
    await page.waitForFunction(() => !document.querySelector('.b-upi .btn-ink').disabled, null, { timeout: 8000 });
    await page.locator('.b-upi .btn-ink').click();
    await page.waitForSelector('.b-done', { timeout: 8000 });
    check(true, 'demo payment completes and the thank-you screen appears');
    await shot(page, `${id}-done`);
    await page.locator('.b-done .btn-gold').click();
    await page.waitForSelector('.player-frame');
    check(await page.locator('.player-frame').isVisible(), '"Play it now" opens the gift full screen');
    check(problems.length === 0, `no console errors${problems.length ? ` (${problems[0]})` : ''}`);
    check(external.length === 0, `no third-party requests${external.length ? ` (${external[0]})` : ''}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- the page a recipient opens
  console.log('\n[a recipient opens the gift]');
  {
    const t = await newPage(browser, SCREENS[0]);
    const gift = { product: 'envelope', options: { recipient: 'Meera', sender: 'Ashish', title: 'Happy Birthday, {{recipient}}!', message: 'A real message for {{recipient}}.', skin: 'nightsky' }, media: {} };
    await t.page.route('**/gifts/live.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(gift) }));
    await t.page.route('**/gifts/off.json', (route) => route.fulfill({ status: 410, contentType: 'application/json', body: '{}' }));
    await t.page.goto(`${BASE}/host/index.html?gift=${encodeURIComponent(`${BASE}/gifts/live.json`)}`);
    await t.page.waitForSelector('[data-part="env-address"]');
    check((await t.page.locator('[data-part="env-address"]').innerText()).includes('Meera'), 'a live gift opens, addressed to the recipient');
    await t.page.goto(`${BASE}/host/index.html?gift=${encodeURIComponent(`${BASE}/gifts/off.json`)}`);
    await t.page.waitForSelector('#gift-root p');
    check((await t.page.textContent('#gift-root p')).includes('no longer available'), 'a switched-off gift (410) says it is no longer available');
    await t.ctx.close();
  }

  // ---------------------------------------------------------------- the small phone: the builder still fits
  console.log('\n[builder on a 360x640 phone]');
  const small = await newPage(browser, SCREENS[1]);
  await small.page.goto(`${BASE}/site/`);
  await small.page.locator('.nav [data-make]').click();
  await small.page.waitForSelector('.b-step h2');
  await small.page.waitForTimeout(900); // the builder slides in
  const fit = await small.page.evaluate(() => {
    const next = document.querySelector('.b-next').getBoundingClientRect();
    const phone = document.querySelector('.b-phone-box').getBoundingClientRect();
    return { nextInside: next.bottom <= innerHeight && next.top >= 0, phoneH: phone.height, sideways: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  check(fit.nextInside, 'the Continue button is on screen');
  check(fit.phoneH > 150, `the live phone is big enough to see (${Math.round(fit.phoneH)}px tall)`);
  check(!fit.sideways, 'no sideways scrolling');
  await small.page.focus('#f-recipient');
  await small.page.waitForTimeout(600);
  check(await small.page.locator('.builder.is-typing').count() === 1, 'the phone makes room while typing');
  await small.ctx.close();
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${failures ? `FAILED - ${failures} check(s)` : 'OK - all storefront checks passed'}`);
process.exit(failures ? 1 : 0);
