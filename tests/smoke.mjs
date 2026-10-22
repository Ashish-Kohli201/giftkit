// Browser smoke test (Playwright). Starts the dev server, then:
//  - mounts every element standalone for every skin and fails on any console error / invalid params
//  - for every THEME x SKIN combination (the matrix): plays a whole Countdown gift on a phone viewport
//    (wordle -> memory -> quiz -> quiz -> wordle -> vault -> reveal), taps the Spark hero, and exercises every Signature role
//  - verifies no third-party requests and no native dialogs
// Roles (hub, vault, board, light, pet, ...) are the stable contract between worlds and skins (docs/WORLD_CONTRACT.md),
// so the same test runs unchanged for every world and every skin.
// Run: npm i && npx playwright install chromium && npm run test:browser
//      (SHOTS=1 saves screenshots to tests/shots; THEMES=desk SKINS=arcade narrows the matrix)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const THEMES = (process.env.THEMES || 'desk,outdoors').split(',');
const SKINS = (process.env.SKINS || 'nightsky,arcade').split(',');
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
if (process.env.SHOTS) mkdirSync('tests/shots', { recursive: true });
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(500); await page.screenshot({ path: `tests/shots/${name}.png` }); };

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };

/** A page with console / dialog / request watchers. */
async function newPage(browser, viewport = { width: 390, height: 844 }, touch = true) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch });
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('dialog', (d) => { problems.push(`native dialog: ${d.message()}`); d.dismiss(); });
  return { ctx, page, problems, external };
}

const browser = await chromium.launch();
try {
  // ---------------------------------------------------------- 1. every element x every skin
  for (const skin of [...SKINS, '_neutral']) {
    console.log(`\n[elements] skin=${skin}`);
    const { ctx, page, problems, external } = await newPage(browser, { width: 390, height: 800 }, false);
    await page.goto(`${BASE}/playground/?skin=${skin}`);
    await page.waitForSelector('.pg-card');
    await page.waitForTimeout(500);
    check((await page.locator('.pg-error').count()) === 0, 'all elements mount with placeholderParams');
    check((await page.locator('.pg-card').count()) === 13, '13 elements rendered');
    check(problems.length === 0, `no console errors ${problems.join(' | ')}`);
    check(external.length === 0, `no third-party requests ${external.join(', ')}`);
    await shot(page, `elements-${skin}`);
    await ctx.close();
  }

  // ---------------------------------------------------------- 2-4. the matrix: every theme x every skin
  for (const theme of THEMES) for (const skin of SKINS) {
    const combo = `${theme} x ${skin}`;
    const q = `theme=${theme}&skin=${skin}`;

    // ------------------------------------------------------ 2. Countdown, played end to end
    console.log(`\n[full gift] ${combo}, countdown, sequential, phone`);
    {
      const { ctx, page, problems } = await newPage(browser);
      await page.goto(`${BASE}/playground/?${q}&tab=gift`);
      await page.locator('#frame').selectOption('phone');
      await page.waitForSelector('[data-part="hub"]');
      const root = page.locator('#gift-root');
      // The hub keeps the days on its sheet: each day is an app icon. day-N -> Nth icon.
      const sheetCount = () => root.locator('[data-part="sheet"]').count();
      const openHub = async () => { if ((await sheetCount()) === 0) await root.locator('[data-part="hub"]').click(); await root.locator('[data-part="app"]').first().waitFor(); };
      const closeHub = async () => { if ((await sheetCount()) > 0) await root.locator('[data-part="sheet-close"]').click(); await root.locator('[data-part="sheet"]').waitFor({ state: 'detached' }); };
      const day = (n) => { const icon = root.locator('[data-part="app"]').nth(n - 1); return { click: async () => { await openHub(); await icon.click({ force: true }); }, status: async () => { await openHub(); return icon.getAttribute('data-status'); } }; };
      const dismissReward = async () => {
        await page.locator('[data-part="dialog"]').waitFor();
        const msg = await page.locator('[data-part="dialog-message"]').innerText();
        await page.locator('[data-part="dialog-button"]').click();
        // the day's sheet closes; the hub's own sheet stays underneath
        await page.waitForFunction(() => document.querySelectorAll('#gift-root [data-part="sheet"]').length <= 1);
        return msg;
      };
      const typeWord = async (w) => { for (const c of w) await root.locator(`[data-part="key"][data-key="${c}"]`).click(); await root.locator('[data-part="key"][data-key="Enter"]').click(); };

      await shot(page, `${theme}-${skin}-room`);
      check((await day(2).status()) === 'locked', 'sequential: day 2 starts locked');
      await day(2).click();
      check((await page.locator('[data-part="dialog-message"]').innerText()).length > 0, 'tapping a locked day shows an in-world dialog');
      await page.locator('[data-part="dialog-button"]').click();

      await day(1).click(); // wordle
      await page.locator('[data-element="wordle"]').waitFor();
      await typeWord('LIGHT');
      const reward = await dismissReward();
      check(reward.length > 0 && !/fragment/i.test(reward), 'day 1 completes and a reward message appears (no "fragment" wording)');
      check((await day(2).status()) === 'open', 'day 2 unlocks after day 1');

      await day(2).click(); // memory: solve by reading faces
      await page.locator('[data-element="memory"] [data-part="card"]').first().waitFor();
      const faces = await page.locator('[data-element="memory"] [data-part="card-front"]').allInnerTexts();
      const groups = {};
      faces.forEach((f, i) => (groups[f] ||= []).push(i));
      const cards = page.locator('[data-element="memory"] [data-part="card"]');
      for (const idxs of Object.values(groups)) { for (const i of idxs) await cards.nth(i).click(); await page.waitForTimeout(80); }
      await dismissReward();

      await day(3).click(); // quiz: correct answers are index 1,1,2
      for (const correct of [1, 1, 2]) {
        await page.locator('[data-element="quiz"] [data-part="option"]').nth(correct).click();
        await page.locator('[data-element="quiz"] [data-part="next"]').click();
      }
      await dismissReward();

      await day(4).click(); // whosaid: neutral answers
      for (let i = 0; i < 3; i++) {
        await page.locator('[data-element="quiz"] [data-part="option"]').first().click();
        await page.locator('[data-element="quiz"] [data-part="next"]').click();
      }
      await dismissReward();

      await day(5).click(); // wordle with {{recipient}} as the answer
      await typeWord('ARIA');
      await dismissReward();

      await closeHub();
      check((await root.locator('[data-part="note"][data-state="filled"]').count()) === 5, 'the board shows 5 notes, one per finished day');
      check((await root.locator('[data-part="tally-mark"][data-status="done"]').count()) === 5, 'the tally marks 5 finished days');
      check(!/fragment|star \d/i.test(await root.innerText()), 'the room never says "fragment" or "star N"');
      const code = (await page.locator('#codeout').innerText()).split(': ')[1];
      check(code.length === 5 && new Set(code).size === 5, `vault code derived from fragments, all unique (${code})`);
      check((await root.locator('[data-part="vault"]').getAttribute('data-status')) === 'open', 'the vault opens after all days');

      await root.locator('[data-part="vault"]').click(); // wrong code then right
      await root.locator('[data-element="vault"]').waitFor();
      for (const c of 'AAAAA') await root.locator(`[data-part="key"][data-key="${c}"]`).click();
      await root.locator('[data-part="submit"]').click();
      await page.waitForTimeout(150);
      check((await root.locator('[data-element="vault"] [data-part="message"]').innerText()).length > 0, 'wrong code gives feedback');
      await page.waitForTimeout(700);
      for (const c of code) await root.locator(`[data-part="key"][data-key="${c}"]`).click();
      await root.locator('[data-part="submit"]').click();
      await root.locator('[data-part="finale"]').waitFor({ timeout: 6000 });
      await root.locator('[data-element="reveal"] [data-part="letter"][data-state="visible"]').waitFor({ timeout: 6000 });
      await page.waitForTimeout(900);
      await shot(page, `${theme}-${skin}-finale`);
      check(/aria/i.test(await root.locator('[data-part="headline"]').innerText()), 'finale headline is personalised from config');
      check(problems.length === 0, `no console errors / native dialogs in full run ${problems.join(' | ')}`);
      await ctx.close();
    }

    // ------------------------------------------------------ 3. Spark: one hero, no vault
    console.log(`\n[full gift] ${combo}, spark (one thing to tap)`);
    {
      const { ctx, page, problems } = await newPage(browser);
      await page.goto(`${BASE}/playground/gift.html?tier=spark&${q}`);
      const root = page.locator('#gift-root');
      await root.locator('[data-part="hero"]').waitFor();
      check((await root.locator('[data-part="hub"], [data-part="vault"], [data-part="tally"]').count()) === 0, 'spark has no hub, vault or tally');
      await root.locator('[data-part="hero"]').tap();
      await root.locator('[data-element="reveal"] [data-part="letter"][data-state="visible"]').waitFor({ timeout: 8000 });
      check(/aria/i.test(await root.locator('[data-part="headline"]').innerText()), 'tapping the hero opens a personalised surprise');
      check(problems.length === 0, `no console errors in spark run ${problems.join(' | ')}`);
      await ctx.close();
    }

    // ------------------------------------------------------ 4. Signature: every role reacts
    console.log(`\n[full gift] ${combo}, signature (apps + things to touch)`);
    {
      const { ctx, page, problems } = await newPage(browser);
      await page.goto(`${BASE}/playground/gift.html?tier=signature&mode=all&${q}`);
      const g = page.locator('#gift-root');
      await g.locator('[data-part="hub"]').waitFor();
      const room = g.locator('[data-part="room"]');
      check(!/fragment|star \d/i.test(await g.innerText()), 'signature room never says "fragment" or "star N"');
      check((await g.locator('[data-part="tally-mark"]').count()) === 10, 'the tally has 10 marks');

      // Some roles move on their own (a pet, a toy), so Playwright never sees them as "stable": check that nothing covers
      // the role's centre, then click it.
      const touch = async (role) => {
        const target = g.locator(`[data-part="${role}"]`);
        const reachable = await target.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); });
        check(reachable, `the ${role} is not covered by anything`);
        await target.click({ force: true });
        return target;
      };
      // scenic first: a skin may cover the backdrop on purpose when an ambient toggle is on (drawn curtains)
      check((await (await touch('scenic')).getAttribute('data-state')) === 'pop', 'the scenic backdrop reacts when touched');
      await touch('light');
      check((await room.getAttribute('data-ambient')) === 'off', 'the light switches the ambience off');
      await touch('ambient-a');
      check((await room.getAttribute('data-ambient-a')) === 'off', 'ambient-a toggles (on -> off)');
      await touch('ambient-b');
      check((await room.getAttribute('data-ambient-b')) === 'on', 'ambient-b toggles (off -> on)');
      check((await (await touch('pet')).getAttribute('data-state')) === 'happy', 'the pet is happy when touched');
      check((await (await touch('toy')).getAttribute('data-state')) === 'play', 'the toy plays when touched');

      // direct launchers open their app; the board and jar open the extras
      for (const [role, element] of [['app-music', 'music'], ['app-gallery', 'gallery'], ['app-notes', 'notes'], ['jar', 'coupons']]) {
        await touch(role);
        await g.locator(`[data-element="${element}"]`).waitFor();
        check(true, `${role} opens ${element}`);
        await g.locator('[data-part="sheet-close"]').last().click();
        await g.locator(`[data-element="${element}"]`).waitFor({ state: 'detached' });
      }
      await touch('board');
      await g.locator('[data-element="polaroid"]').first().waitFor();
      check(true, 'the board opens the memories');
      await g.locator('[data-part="sheet-close"]').last().click();
      await g.locator('[data-part="sheet"]').waitFor({ state: 'detached' });

      // the hub: day icons + a taskbar whose tools open the same apps
      await g.locator('[data-part="hub"]').click();
      await g.locator('[data-part="taskbar"]').waitFor();
      for (const tool of ['music', 'gallery', 'notes']) {
        await g.locator(`[data-part="taskbar"] [data-tool="${tool}"]`).click();
        await g.locator(`[data-element="${tool}"]`).waitFor();
        check(true, `the hub taskbar opens ${tool}`);
        await g.locator('[data-part="sheet-close"]').last().click();
        await g.locator(`[data-element="${tool}"]`).waitFor({ state: 'detached' });
      }
      check(problems.length === 0, `no console errors in signature run ${problems.join(' | ')}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
