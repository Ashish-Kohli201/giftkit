// Studio core test: the server's safety rules, the home screen, starting a gift, the Setup screen, saving, undo, and the live preview.
// Run: node tests/studio-core.mjs   (npm run test:studio runs every tests/studio-*.mjs)
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const work = await mkdtemp(join(tmpdir(), 'giftkit-studio-'));
process.env.GIFT_DIR = join(work, 'gifts');
process.env.GIFT_OUT = join(work, 'dist');
const { startStudio } = await import('../engine/studio/server.js');

let passed = 0;
let failures = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`); }
};

const studio = await startStudio({ port: 5191, open: false });
const base = studio.url.replace(/\/$/, '');
const browser = await chromium.launch();
try {
  console.log('\n[studio server] only this computer, only the studio\'s own page');
  await test('reads need nothing special; writes need the studio header', async () => {
    assert.equal((await fetch(`${base}/api/gifts`)).status, 200);
    const noHeader = await fetch(`${base}/api/gifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    const foreign = await fetch(`${base}/api/gifts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1', Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(foreign.status, 403, 'another website cannot write');
  });
  await test('the runtime files are readable, other repo files are not', async () => {
    assert.equal((await fetch(`${base}/repo/elements/registry.js`)).status, 200);
    assert.equal((await fetch(`${base}/repo/package.json`)).status, 403);
    assert.notEqual((await fetch(`${base}/repo/core/..%2F..%2Fpackage.json`)).status, 200);
  });

  console.log('\n[studio] starting a gift on screen');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(`${base}/`);
  await test('the first thing you see is an invitation to make a gift', async () => {
    await page.getByRole('heading', { name: 'Make your first gift' }).waitFor();
  });
  await test('the new-gift dialog asks for a name and starts the gift', async () => {
    await page.getByRole('button', { name: 'Start a gift' }).click();
    await page.getByRole('button', { name: /^Start$/ }).click();
    assert.match(await page.locator('.error').first().innerText(), /Who is the gift for/);
    await page.getByLabel('Who is it for?').fill('Meera');
    await page.getByLabel('Who is it from?').fill('Kabir');
    await page.getByLabel('When is the birthday?').fill('2027-01-15');
    await page.getByRole('button', { name: /Countdown/ }).click();
    await page.getByRole('button', { name: /^Start$/ }).click();
    await page.waitForURL(/#\/g\/meera-2027\/setup/);
    const config = JSON.parse(await readFile(join(process.env.GIFT_DIR, 'meera-2027', 'gift.json'), 'utf8'));
    assert.equal(config.people.recipient, 'Meera'); assert.equal(config.meta.tier, 'countdown'); assert.equal(config.schedule.finaleDate, '2027-01-15');
    assert.ok(existsSync(join(process.env.GIFT_DIR, 'meera-2027', 'media', 'README.txt')));
  });

  console.log('\n[studio] the Setup screen');
  await test('the page shows the gift\'s own words and a live preview of the real gift', async () => {
    await page.getByRole('heading', { name: 'Set up the gift' }).waitFor();
    assert.equal(await page.getByLabel('Her name').inputValue(), 'Meera');
    const frame = page.frameLocator('iframe[title^="Live preview"]');
    await frame.locator('#gift-root [data-part="hub"]').waitFor({ timeout: 20000 });
    assert.equal(await frame.locator('#gift-root').getAttribute('data-theme'), 'desk');
  });
  await test('typing saves to gift.json by itself, and the preview follows', async () => {
    await page.getByLabel('Her name').fill('Meera Rao');
    await page.getByText('All changes saved').waitFor();
    assert.equal(JSON.parse(await readFile(join(process.env.GIFT_DIR, 'meera-2027', 'gift.json'), 'utf8')).people.recipient, 'Meera Rao');
    // the preview rebuilt: the page title inside the frame carries the new name
    await page.waitForFunction(async () => { const r = await fetch('/preview/meera-2027/'); return (await r.text()).includes('A gift for Meera Rao'); }, null, { timeout: 15000 });
  });
  await test('undo puts the old name back (and keeps the file in step)', async () => {
    await page.getByRole('button', { name: /Undo/ }).click();
    await page.getByText('All changes saved').waitFor();
    assert.equal(await page.getByLabel('Her name').inputValue(), 'Meera');
    assert.equal(JSON.parse(await readFile(join(process.env.GIFT_DIR, 'meera-2027', 'gift.json'), 'utf8')).people.recipient, 'Meera');
    assert.ok((await readdir(join(process.env.GIFT_DIR, 'meera-2027', '.history'))).length >= 1, 'old versions are kept');
  });
  await test('size, world and look are changed by clicking, and saved', async () => {
    await page.getByRole('button', { name: /Signature/ }).click();
    await page.getByRole('button', { name: /Outdoors/ }).click();
    await page.getByRole('button', { name: /Arcade/ }).click();
    await page.getByText('All changes saved').waitFor();
    const c = JSON.parse(await readFile(join(process.env.GIFT_DIR, 'meera-2027', 'gift.json'), 'utf8'));
    assert.deepEqual([c.meta.tier, c.meta.theme, c.meta.skin], ['signature', 'outdoors', 'arcade']);
  });
  await test('the schedule explains itself in plain dates', async () => {
    await page.getByText(/Night 1 opens .* and the surprise on Fri 15 Jan 2027/).waitFor();
  });
  await test('no errors in the page', () => assert.deepEqual(problems, []));
  await ctx.close();
} finally {
  await browser.close();
  await studio.close();
  await rm(work, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} studio-core check(s) FAILED (${passed} passed)` : `\nall ${passed} studio-core checks passed`);
process.exit(failures ? 1 : 0);
