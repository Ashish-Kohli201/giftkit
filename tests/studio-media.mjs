// Studio Media screen: adding files, the library, playing a song, removing, the "what gets added" switches, a video cover.
// Run: node tests/studio-media.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { startHarness, runner } from './lib/studio-harness.mjs';

const { test, section, finish } = runner('studio-media');
const h = await startHarness({ port: 5201 });
const readGift = async (name) => JSON.parse(await readFile(h.giftPath(name, 'gift.json'), 'utf8'));
const pageFor = async (name, hookAudio = false) => {
  const page = await h.open(name, 'media', { permissions: ['clipboard-read', 'clipboard-write'] });
  return page;
};
try {
  // a gift where nothing is added automatically, so "Not used yet" can be seen
  const plain = await h.newGift({ name: 'plain', tier: 'signature' });
  const cfg = await readGift('plain'); cfg.auto = false; await writeFile(h.giftPath('plain', 'gift.json'), JSON.stringify(cfg));

  section('adding files');
  let page = await h.open('plain', 'media', { permissions: ['clipboard-read', 'clipboard-write'] });
  // record every audio element that starts playing (the screen keeps its player out of the page)
  await page.addInitScript(() => { window.__audios = []; const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__audios.push(this); return p.apply(this, arguments); }; });
  await page.reload();
  await page.getByRole('heading', { name: 'Pictures, songs and videos' }).waitFor();
  await test('an empty gift invites you to drop files in, in plain words', async () => {
    await page.getByText('Nothing here yet').waitFor();
    assert.match(await page.locator('.media-empty').innerText(), /JPG, PNG or WEBP.*MP3 or M4A.*MP4.*used by its name/s);
  });
  const png = await h.files.png('Us at Goa.png');
  const wav = await h.files.wav('First Dance.wav');
  const mp4 = await h.files.mp4('Our Story.mp4');
  await test('files chosen through the drop zone become tiles with their slot names, and a success line', async () => {
    await page.locator('input[type="file"]').first().setInputFiles([png, wav, mp4]);
    await page.locator('.media-tile').nth(2).waitFor();
    assert.equal(await page.locator('.media-tile').count(), 3);
    for (const slot of ['@us_at_goa', '@first_dance', '@our_story']) await page.locator('.media-slot', { hasText: slot }).waitFor();
    assert.match(await page.locator('.media-success').innerText(), /1 picture, 1 song and 1 video added/);
    assert.ok(existsSync(h.giftPath('plain', 'media', 'us_at_goa.png')));
  });
  await test('with nothing using them yet, each file says so gently', async () => {
    // the jigsaw night uses "the first picture" by itself, so the picture counts as used; the song and the video do not
    assert.equal(await page.getByText('Not used yet').count(), 2);
    assert.equal(await page.locator('.media-tile[data-id="us_at_goa"]').getByText('Used', { exact: true }).count(), 1);
  });
  await test('the filter tabs count and narrow the library; search finds by name', async () => {
    assert.match(await page.getByRole('tab', { name: /Songs/ }).innerText(), /1/);
    await page.getByRole('tab', { name: /Songs/ }).click();
    assert.equal(await page.locator('.media-tile').count(), 1);
    await page.getByRole('tab', { name: /All/ }).click();
    await page.getByLabel('Search your files').fill('goa');
    assert.equal(await page.locator('.media-tile').count(), 1);
    await page.getByLabel('Search your files').fill('');
  });
  await test('a file that cannot work is explained, not just refused', async () => {
    const heic = await h.files.text('Holiday.HEIC', 'not really a photo');
    await page.locator('input[type="file"]').first().setInputFiles(heic);
    await page.locator('.media-problem').waitFor();
    assert.match(await page.locator('.media-problem').innerText(), /Holiday\.HEIC[\s\S]*Export or share them as JPG/);
    await page.locator('.media-problem button').click();
    assert.equal(await page.locator('.media-problem').count(), 0, 'the message can be dismissed');
    assert.equal(await page.locator('.media-tile').count(), 3, 'nothing was added');
  });
  await test('a picture opens large, a video opens in a player', async () => {
    await page.getByRole('button', { name: /Look at Us at goa/ }).click();
    await page.locator('.modal img').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Look at Our story/ }).click();
    await page.locator('.modal video[controls]').waitFor();
    await page.keyboard.press('Escape');
  });

  section('songs, names and removing');
  await test('a song plays and pauses, and the slot name copies', async () => {
    await page.getByRole('button', { name: 'Play first_dance' }).click();
    await page.waitForFunction(() => window.__audios.length && window.__audios[0].currentTime > 0.2, null, { timeout: 8000 });
    assert.match(await page.evaluate(() => window.__audios[0].currentSrc), /\/gift-media\/plain\/first_dance\.wav$/);
    await page.getByRole('button', { name: 'Pause first_dance' }).click();
    assert.equal(await page.evaluate(() => window.__audios[0].paused), true);
    await page.getByRole('button', { name: 'Copy @first_dance' }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '@first_dance');
  });
  await test('removing asks first, and the file leaves the media folder', async () => {
    await page.locator('.media-tile[data-id="us_at_goa"]').getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    assert.ok(existsSync(h.giftPath('plain', 'media', 'us_at_goa.png')), 'cancel keeps it');
    await page.locator('.media-tile[data-id="us_at_goa"]').getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await page.waitForFunction(() => !document.querySelector('.media-tile[data-id="us_at_goa"]'));
    assert.ok(!existsSync(h.giftPath('plain', 'media', 'us_at_goa.png')));
  });
  await test('removing a file that is in use says where', async () => {
    const used = await readGift('plain');
    used.apps = { gallery: { items: ['@our_story'] } };
    used.days[5].game.params.image = '@our_story';
    await writeFile(h.giftPath('plain', 'gift.json'), JSON.stringify(used));
    await page.reload();
    await page.locator('.media-tile[data-id="our_story"]').getByRole('button', { name: 'Remove' }).click();
    const text = await page.getByRole('dialog').innerText();
    assert.match(text, /night 6 \(jigsaw\)/); assert.match(text, /the Photos app/);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  await test('a video gets a cover picture, named so the engine attaches it', async () => {
    const cover = await h.files.png('anything.png', [10, 200, 90]);
    await page.locator('.media-tile[data-id="our_story"] input[type="file"]').setInputFiles(cover);
    await page.waitForFunction(() => document.querySelector('.media-tile[data-id="our_story"] img.media-thumb'));
    assert.ok(existsSync(h.giftPath('plain', 'media', 'our_story.poster.png')));
    assert.equal(await page.locator('.media-tile').count(), 2, 'the cover is not a tile of its own');
  });

  section('what gets added for you');
  const auto = await h.newGift({ name: 'auto', tier: 'signature' });
  page = await h.open('auto', 'media');
  await page.locator('input[type="file"]').first().setInputFiles([await h.files.png('beach.png'), await h.files.wav('theme-song.wav')]);
  await page.locator('.media-tile').nth(1).waitFor();
  await test('the switches show what was added on their own, with a live note', async () => {
    await page.locator('.toggle-text', { hasText: 'Music app' }).waitFor();
    await page.getByText(/1 song found/).waitFor();
    await page.getByText(/1 picture found/).first().waitFor();
    assert.equal(await page.getByText('Pinboard of memories').count(), 1);
  });
  await test('switching the Music app off is saved as apps.music: false, and the gift stops having it', async () => {
    await page.getByLabel('Music app').evaluate((el) => el.click());
    await page.getByText('All changes saved').waitFor();
    assert.equal((await readGift('auto')).apps.music, false);
    await page.waitForFunction(async () => { const r = await fetch('/preview/auto/gift.json'); const j = await r.json(); return !j.apps?.music; }, null, { timeout: 15000 });
    await page.getByLabel('Music app').evaluate((el) => el.click());
    await page.getByText('All changes saved').waitFor();
    assert.equal((await readGift('auto')).apps.music, undefined, 'on again goes back to automatic');
  });
  await test('the pinboard switch writes an empty board, and on removes it again', async () => {
    await page.getByLabel('Pinboard of memories').evaluate((el) => el.click());
    await page.getByText('All changes saved').waitFor();
    assert.deepEqual((await readGift('auto')).scene.corkboard, []);
    await page.getByLabel('Pinboard of memories').evaluate((el) => el.click());
    await page.getByText('All changes saved').waitFor();
    assert.equal((await readGift('auto')).scene?.corkboard, undefined);
  });
  await test('a Spark gift has no hub or board, so no switches', async () => {
    await h.newGift({ name: 'tiny', tier: 'spark' });
    const p2 = await h.open('tiny', 'media');
    await p2.getByRole('heading', { name: 'Pictures, songs and videos' }).waitFor();
    assert.equal(await p2.getByText('What gets added for you').count(), 0);
    await p2.context().close();
  });

  section('looks and safety');
  await test('no console errors, and nothing spills sideways at laptop or tablet width', async () => {
    assert.deepEqual(page.problems, []);
    for (const vp of [{ width: 1440, height: 900 }, { width: 820, height: 1000 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      // the screen's own content must fit (the shell's top bar is the app's, checked elsewhere)
      const over = await page.evaluate(() => [...document.querySelectorAll('main.page *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed').slice(0, 4).map((e) => `${e.tagName}.${e.className}`).join(', '));
      assert.equal(over, '', `scrolls sideways at ${vp.width}`);
      if (process.env.SHOTS) await page.screenshot({ path: `tests/shots/studio-media-${vp.width}.png`, fullPage: false });
    }
  });
} finally {
  await h.close();
}
finish();
