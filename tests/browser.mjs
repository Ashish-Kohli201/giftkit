// Browser test (Playwright). Starts the dev server, then for every product x skin on phone-sized portrait screens:
//  - the product opens with no console error, no native dialog and no third-party request
//  - it fills the screen without sideways scrolling, at 390x844 and at the small 360x640
//  - a recipient can play it through to the end (envelope, cake, film, credits) and the host reports "finished"
//  - the live preview applies new words and a new look without reloading, and a bad order is refused politely
// Run: npm i && npx playwright install chromium && npm run test:browser
//      (SHOTS=1 saves screenshots to tests/shots; PRODUCTS=cake SKINS=arcade narrows the matrix)
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const ALL = readdirSync('products', { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
const PRODUCTS = (process.env.PRODUCTS || ALL.join(',')).split(',');
const SKINS = (process.env.SKINS || 'nightsky,arcade').split(',');
const SCREENS = [{ width: 390, height: 844 }, { width: 360, height: 640 }];

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
if (process.env.SHOTS) mkdirSync('tests/shots', { recursive: true });

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };

/** A phone page with watchers for console errors, native dialogs and requests that leave this server. */
async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  page.on('dialog', (d) => { problems.push(`native dialog: ${d.message()}`); d.dismiss(); });
  return { ctx, page, problems, external };
}

/** The product page itself, full screen, exactly as a recipient's phone would load it. */
const open = async (page, product, skin) => {
  await page.goto(`${BASE}/host/index.html?product=${product}&preview=1&skin=${skin}`);
  await page.waitForFunction(() => document.documentElement.dataset.giftEvent);
  return page;
};

/** Play a product to its end the way a person would, tapping what it asks for. */
const playThrough = {
  async envelope(f) {
    await f.locator('[data-part="env-envelope"]').click();
    // every tap shows the next line; the last one shows the photos and the way out
    const next = f.locator('[data-part="env-next"]');
    for (let i = 0; i < 12; i++) {
      // the card takes a moment to open and to show each line; once no button appears the letter is over
      const shown = await next.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
      if (!shown) break;
      await next.click();
      await new Promise((r) => setTimeout(r, 200));
    }
  },
  async cake(f) {
    for (const c of await f.locator('[data-part="cake-candle"]').all()) await c.click();
  },
  async film(f) {
    await f.locator('[data-part="film-skip"], [data-part="skip"]').first().click({ timeout: 4000 }).catch(() => {});
  },
  async credits() { /* the credits roll by themselves */ },
};

const browser = await chromium.launch();
try {
  for (const product of PRODUCTS) for (const skin of SKINS) {
    console.log(`\n[${product} x ${skin}]`);
    for (const screen of SCREENS) {
      const { ctx, page, problems, external } = await newPage(browser, screen);
      await open(page, product, skin);
      const fit = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        h: document.querySelector('[data-element="reveal"]')?.getBoundingClientRect().height,
        vh: innerHeight,
      }));
      check(!fit.overflowX, `${screen.width}x${screen.height}: no sideways scrolling`);
      check(fit.h >= fit.vh - 2, `${screen.width}x${screen.height}: fills the screen (${Math.round(fit.h)} of ${fit.vh})`);
      if (process.env.SHOTS) await page.screenshot({ path: `tests/shots/${product}-${skin}-${screen.width}.png` });
      check(problems.length === 0, `${screen.width}x${screen.height}: no console errors${problems.length ? ` (${problems[0]})` : ''}`);
      check(external.length === 0, `${screen.width}x${screen.height}: no third-party requests${external.length ? ` (${external[0]})` : ''}`);
      await ctx.close();
    }

    // play it through on the standard phone
    const { ctx, page, problems } = await newPage(browser, SCREENS[0]);
    const f = await open(page, product, skin);
    await playThrough[product](f);
    await page.waitForFunction(() => document.documentElement.dataset.giftEvent === 'finished', null, { timeout: 40000 })
      .then(() => check(true, 'played through to the end ("finished" reported)'))
      .catch(async () => check(false, `never reached the end (last event: ${await page.evaluate(() => document.documentElement.dataset.giftEvent)})`));
    check(problems.length === 0, 'no console errors while playing');
    await ctx.close();
  }

  // ---------------------------------------------------------------- live preview and refusals
  console.log('\n[live preview]');
  const { ctx, page, problems } = await newPage(browser, { width: 1100, height: 900 });
  await page.goto(`${BASE}/playground/?product=credits`);
  await page.waitForFunction(() => document.getElementById('events').textContent.includes('ready'));
  const f = page.frameLocator('#gift');
  await page.fill('#f-message', 'Words typed a moment ago');
  await f.getByText('Words typed a moment ago').waitFor({ timeout: 4000 }).then(() => check(true, 'new words appear without a reload'), () => check(false, 'new words did not appear'));
  await page.selectOption('#f-skin', 'arcade');
  await page.waitForFunction(() => document.getElementById('gift').contentDocument.getElementById('gift-root').dataset.skin === 'arcade', null, { timeout: 4000 })
    .then(() => check(true, 'a new look applies without a reload'), () => check(false, 'the look did not change'));
  check(await f.getByText('Words typed a moment ago').count() > 0, 'the words survive a change of look');
  await page.fill('#f-recipient', '');
  check(await page.locator('[data-key="recipient"] .error').isVisible(), 'a missing name is explained next to its field');
  check(problems.length === 0, 'no console errors in the live preview');
  await ctx.close();

  // a real (non-preview) gift with a bad order shows a calm message, not a stack trace
  console.log('\n[a broken gift]');
  const bad = await newPage(browser, SCREENS[0]);
  await bad.page.goto(`${BASE}/host/index.html?product=envelope`);
  await bad.page.waitForSelector('#gift-root p');
  check((await bad.page.textContent('#gift-root p')).includes('cannot be opened'), 'a gift with no values says it cannot be opened');
  await bad.ctx.close();
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${failures ? `FAILED - ${failures} check(s)` : 'OK - all browser checks passed'}`);
process.exit(failures ? 1 : 0);
