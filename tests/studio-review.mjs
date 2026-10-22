// Studio Review screen: what is wrong (with jump buttons), the checklist, the phone address, and building + downloading the gift.
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { startHarness, runner } from './lib/studio-harness.mjs';

const { test, section, finish } = runner('studio-review');
const h = await startHarness({ port: 5205 });
const put = (name, config) => fetch(`${h.base}/api/gifts/${name}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify(config) });
const readCfg = async (name) => JSON.parse(await readFile(h.giftPath(name, 'gift.json'), 'utf8'));

try {
  const { name } = await h.newGift({ name: 'review-one', tier: 'signature', recipient: 'Aria', sender: 'Sam' });

  section('what is wrong, and where to fix it');
  let page = await h.open(name, 'review');
  await test('a fresh template gift has things to fix and things worth a look', async () => {
    await page.getByRole('heading', { name: /to fix first/ }).waitFor();
    await page.getByText(/still the sample names/).waitFor();
    await page.getByText(/still look like instructions/).waitFor();
    assert.equal(await page.getByRole('button', { name: /Build the gift/ }).isDisabled(), true);
    await page.getByText(/Fix the \d+ problems? above first/).waitFor();
  });
  await test('the sample-names warning comes first among the warnings, and its button goes to Setup', async () => {
    const first = page.locator('summary', { hasText: 'Worth a look' }).locator('xpath=..').locator('.rv-item').first();
    assert.match(await first.innerText(), /sample names|instructions/);
    await page.locator('.rv-item', { hasText: /sample names/ }).getByRole('button', { name: /Go to Setup/ }).click();
    await page.waitForFunction(() => location.hash.endsWith('/setup'));
  });
  await test('text still saying "Write your..." goes to Nights; a missing picture goes to Media', async () => {
    await page.goto(`${h.base}/#/g/${name}/review`);
    await page.locator('.rv-item', { hasText: /still look like instructions/ }).getByRole('button', { name: /Go to Nights/ }).click();
    await page.waitForFunction(() => location.hash.endsWith('/nights'));
    await page.goto(`${h.base}/#/g/${name}/review`);
    await page.locator('.rv-item', { hasText: /needs a picture/ }).getByRole('button', { name: /Go to Media/ }).click();
    await page.waitForFunction(() => location.hash.endsWith('/media'));
  });

  section('fixing it');
  await test('after real names, real words and a picture, the status is ready', async () => {
    let text = await readFile(h.giftPath(name, 'gift.json'), 'utf8');
    text = text.replace(/Write your[^"]*/g, 'Real words from me.').replace(/"Aria"/g, '"Priya"').replace(/"Sam"/g, '"Rohan"');
    await mkdir(h.giftPath(name, 'media'), { recursive: true });
    await copyFile(await h.files.png('goa.png'), h.giftPath(name, 'media', 'goa.png'));
    const res = await put(name, JSON.parse(text));
    assert.equal(res.status, 200);
    await page.goto(`${h.base}/#/g/${name}/review`);
    await page.reload();
    await page.getByRole('heading', { name: /^Ready/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Build the gift/ }).isDisabled(), false);
  });
  await test('the studio\'s own notes are there but folded away', async () => {
    const notes = page.locator('details', { hasText: 'What the studio did for you' });
    assert.equal(await notes.getAttribute('open'), null);
    await notes.locator('summary').click();
    await page.getByText(/auto: added the Photos app/).waitFor();
  });
  await test('a look at the gift shows who, size, look, nights and files', async () => {
    const summary = await page.locator('.rv-summary').innerText();
    assert.match(summary, /Priya, from Rohan/); assert.match(summary, /Signature/); assert.match(summary, /10 nights/); assert.match(summary, /1 picture/);
  });

  section('the checklist and the phone');
  await test('ticked boxes are remembered after a reload', async () => {
    await page.getByLabel('I played through every night').check();
    await page.reload();
    assert.equal(await page.getByLabel('I played through every night').isChecked(), true);
    assert.equal(await page.getByLabel('The ending made me smile').isChecked(), false);
  });
  await test('"Show me the address" opens the phone dialog with an address, or says there is no Wi-Fi', async () => {
    await page.getByRole('button', { name: /Show me the address/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/|does not seem to be on a Wi-Fi/);
    await page.keyboard.press('Escape');
  });

  section('building');
  await test('Build makes the gift, the zip downloads and is a valid zip, and the folder is on disk', async () => {
    await page.getByRole('button', { name: /Build the gift/ }).click();
    await page.getByRole('heading', { name: 'Your gift is ready' }).waitFor({ timeout: 60000 });
    const slug = (await page.locator('.rv-result code').first().innerText()).replace(/\//g, '');
    assert.match(slug, /^[a-z0-9]+$/);
    assert.ok(existsSync(join(h.work, 'dist', slug, 'index.html')), 'the built folder exists');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download the zip' }).click()]);
    const file = join(h.work, 'downloaded.zip');
    await download.saveAs(file);
    const zip = await readFile(file);
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = zip.readUInt16LE(eocd + 10);
    assert.ok(count > 50, `${count} entries`);
    let p = zip.readUInt32LE(eocd + 16), seenIndex = false;
    for (let i = 0; i < count; i++) {
      const csize = zip.readUInt32LE(p + 20), nlen = zip.readUInt16LE(p + 28), n = zip.toString('utf8', p + 46, p + 46 + nlen), local = zip.readUInt32LE(p + 42);
      if (n === 'index.html') { const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28); const d = zip.subarray(start, start + csize); const html = zip.readUInt16LE(p + 10) === 8 ? inflateRawSync(d) : d; assert.match(html.toString(), /A gift for Priya/); seenIndex = true; }
      p += 46 + nlen;
    }
    assert.ok(seenIndex, 'index.html is in the zip');
    await page.getByText(/Netlify Drop/).waitFor();
  });
  await test('changes after a build mark the result as older', async () => {
    await page.goto(`${h.base}/#/g/${name}/setup`);
    await page.getByLabel('Her name').fill('Priyaa');
    await page.getByText('All changes saved').waitFor();
    await page.goto(`${h.base}/#/g/${name}/review`);
    await page.getByText('Older than your latest changes').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Build again' && !b.disabled), null, { timeout: 8000 });
  });
  await test('screenshots look right at desktop and tablet width', async () => {
    if (process.env.SHOTS) {
      await page.screenshot({ path: join(h.work, 'review-1440.png'), fullPage: true });
      console.log('       shots in', h.work);
    }
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.waitForTimeout(300);
    // (the studio's own top bar is wider than 820px; this screen's content must still fit inside its column)
    const spill = await page.evaluate(() => { const box = document.querySelector('.page').getBoundingClientRect(); return [...document.querySelectorAll('.page *')].filter((e) => e.getBoundingClientRect().right > box.right + 1).map((e) => e.className || e.tagName); });
    assert.deepEqual(spill, [], 'nothing on this screen spills out of its column at 820px');
  });
  await test('a gift with errors is not buildable and shows the problems', async () => {
    const other = (await h.newGift({ name: 'review-two', tier: 'countdown' })).name;
    const cfg = await readCfg(other); cfg.days = [];
    assert.equal((await put(other, cfg)).status, 200);
    const before = existsSync(join(h.work, 'dist')) ? (await readdir(join(h.work, 'dist'))).length : 0;
    const p2 = await h.open(other, 'review');
    await p2.getByRole('heading', { name: /to fix first/ }).waitFor();
    await p2.locator('main').getByText(/at least one night/).waitFor();
    assert.equal(await p2.getByRole('button', { name: /Build the gift/ }).isDisabled(), true);
    assert.equal(await p2.getByText('Your gift is ready').count(), 0);
    const after = existsSync(join(h.work, 'dist')) ? (await readdir(join(h.work, 'dist'))).length : 0;
    assert.equal(after, before, 'nothing was built');
    assert.deepEqual(p2.problems, []);
  });
  await test('no errors in the page', () => assert.deepEqual(page.problems, []));
} finally {
  await h.close();
}
finish();
