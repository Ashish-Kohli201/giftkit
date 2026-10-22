// Studio Ending screen: the four styles and their options, how it opens, and the blocks editor (headline, letter, photos, video).
// Run: node tests/studio-ending.mjs   (npm run test:studio runs every tests/studio-*.mjs)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pngBytes, fakeMp4Bytes, runner, startHarness } from './lib/studio-harness.mjs';

const { test, section, finish } = runner('studio-ending');
const h = await startHarness({ port: 5204 });
const { prepareGift } = await import('../engine/lib/build.js');
const SHOTS = process.env.SHOTS_DIR;

try {
  const { name } = await h.newGift({ tier: 'signature', recipient: 'Meera', sender: 'Kabir' });
  const config = async () => JSON.parse(await readFile(h.giftPath(name, 'gift.json'), 'utf8'));
  const page = await h.open(name, 'setup');
  const put = (file, data) => page.request.put(`${h.base}/api/gifts/${name}/media/${file}`, { headers: { 'X-Studio': '1' }, data });
  for (const [f, c] of [['sunset.png', [220, 120, 60]], ['beach.png', [60, 140, 220]]]) assert.ok((await put(f, pngBytes(40, 30, c))).ok());
  assert.ok((await put('our-film.mp4', fakeMp4Bytes())).ok());
  await page.goto(`${h.base}/#/g/${name}/ending`);
  await page.reload();
  await page.getByRole('heading', { name: 'How it ends' }).waitFor();
  const saved = () => page.getByText('All changes saved').waitFor();
  const frame = page.frameLocator('iframe[title^="Live preview"]');

  section('how it opens');
  await test('a locked box or straight to the surprise, written to finale.type', async () => {
    assert.equal((await config()).finale.type, 'vault');
    await page.getByRole('button', { name: /Straight to the surprise/ }).click();
    await saved();
    assert.equal((await config()).finale.type, 'reveal');
    await page.getByRole('button', { name: /A locked box/ }).click();
    await saved();
    assert.equal((await config()).finale.type, 'vault');
    await page.getByText(/code is made for you automatically/).waitFor();
  });

  section('how it looks');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ending-1440.png`, fullPage: false });
  const parts = { scroll: 'scroll', envelope: 'env-stage', slideshow: 'film-stage', cake: 'cake-stage' };
  const titles = { scroll: 'Rolling credits', envelope: 'A sealed envelope', slideshow: 'A memory film', cake: 'Make a wish' };
  for (const [variant, title] of Object.entries(titles)) {
    await test(`${title}: choosing it saves "${variant}" and Play shows that ending in the preview`, async () => {
      await page.getByRole('button', { name: new RegExp(title) }).first().click();
      await saved();
      assert.equal((await config()).finale.variant, variant);
      await page.getByRole('button', { name: 'Play the ending' }).click();
      await frame.locator('[data-part="finale"]').waitFor({ timeout: 25000 });
      await frame.locator(`[data-part="finale"] [data-part="${parts[variant]}"]`).waitFor({ timeout: 15000 });
      assert.equal(await frame.locator('[data-part="finale"] [data-element="reveal"]').first().getAttribute('data-variant'), variant);
    });
  }

  await test('cake: the candles stepper stays between 1 and 9 and is saved', async () => {
    await page.getByRole('button', { name: new RegExp(titles.cake) }).first().click();
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'More candles' }).click();
    await saved();
    assert.equal((await config()).finale.candles, 7);
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'More candles' }).click();
    await saved();
    assert.equal((await config()).finale.candles, 9);
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Fewer candles' }).click();
    await saved();
    assert.equal((await config()).finale.candles, 1);
  });
  await test('slideshow: seconds per photo is saved in milliseconds', async () => {
    await page.getByRole('button', { name: new RegExp(titles.slideshow) }).first().click();
    await page.getByLabel('Seconds per photo').evaluate((el) => { el.value = '8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await saved();
    assert.equal((await config()).finale.slideMs, 8000);
  });
  await test('rolling credits: speed and drift-by-itself are saved', async () => {
    await page.getByRole('button', { name: new RegExp(titles.scroll) }).first().click();
    await page.getByLabel('Scroll speed').evaluate((el) => { el.value = '45'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.getByText('Drift by itself').click();
    await saved();
    const c = await config();
    assert.equal(c.finale.scrollSpeed, 45); assert.equal(c.finale.autoScroll, false);
  });

  section('what is in it');
  await test('the pictures and video the engine adds on its own are explained', async () => {
    await page.getByText(/Your pictures are added automatically; add a Photos block/).waitFor();
  });
  await test('editing the headline and the letter (with name chips) saves to the blocks', async () => {
    await page.getByLabel('The words').fill('Happy Birthday, {{recipient}}!!');
    const letter = page.getByLabel('The letter');
    await letter.fill('Dear ');
    await page.getByRole('button', { name: 'Her name' }).click();
    await letter.press('End');
    await letter.pressSequentially(',\n\nAll my love.');
    await page.getByRole('button', { name: 'Your name' }).click();
    await saved();
    const c = await config();
    assert.equal(c.finale.reveal[0].text, 'Happy Birthday, {{recipient}}!!');
    assert.equal(c.finale.reveal[1].text, 'Dear {{recipient}},\n\nAll my love.{{sender}}');
    await page.getByText(/\d+ words?/).first().waitFor();
    assert.equal(await page.getByText(/still looks like the sample/).first().isVisible(), false, 'real words clear the sample warning');
  });
  await test('sample text gets a gentle note', async () => {
    await page.getByLabel('The letter').fill('Write your letter here, in your own words.');
    await page.getByText(/still looks like the sample or an instruction/).waitFor();
    await page.getByLabel('The letter').fill('Dear {{recipient}}, with all my love.');
  });
  await test('choose pictures, caption them, reorder, take one out', async () => {
    await page.getByRole('button', { name: 'Choose pictures' }).click();
    await page.getByRole('button', { name: /Sunset/ }).click();
    await page.getByRole('button', { name: /Beach/ }).click();
    await page.getByRole('button', { name: 'Use these' }).click();
    await saved();
    let photos = (await config()).finale.reveal.find((b) => b.type === 'photos');
    assert.deepEqual([...photos.items].sort(), ['@beach', '@sunset'], 'chosen pictures are written by name');
    await page.getByLabel('Caption for Sunset').fill('Golden hour');
    await saved();
    assert.equal((await config()).finale.reveal.find((b) => b.type === 'photos').captions[0], 'Golden hour');
    await page.getByRole('button', { name: 'Move later' }).first().click();
    await saved();
    photos = (await config()).finale.reveal.find((b) => b.type === 'photos');
    assert.deepEqual(photos.items, ['@beach', '@sunset']);
    assert.equal(photos.captions[1], 'Golden hour', 'the caption travels with its picture');
    await page.getByRole('button', { name: 'Take this picture out' }).first().click();
    await saved();
    assert.equal((await config()).finale.reveal.find((b) => b.type === 'photos').items.length, 1);
  });
  await test('"Use all my pictures" writes @all', async () => {
    await page.getByRole('button', { name: 'Use all my pictures' }).click();
    await saved();
    assert.equal((await config()).finale.reveal.find((b) => b.type === 'photos').items, '@all');
  });
  await test('add a video block, choose the film, then move it up and delete it (and bring it back with Undo)', async () => {
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await page.getByRole('button', { name: 'Choose a video' }).click();
    await page.getByRole('button', { name: /Our film/ }).click();
    await saved();
    let reveal = (await config()).finale.reveal;
    assert.deepEqual(reveal.at(-1), { type: 'video', ref: '@our_film' });
    await page.getByRole('button', { name: 'Move up' }).last().click();
    await saved();
    reveal = (await config()).finale.reveal;
    assert.equal(reveal[reveal.length - 2].type, 'video');
    await page.getByRole('button', { name: 'Delete this block' }).nth(reveal.length - 2).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await saved();
    assert.ok(!(await config()).finale.reveal.some((b) => b.type === 'video'));
    await page.getByRole('button', { name: /Undo/ }).click();
    await saved();
    assert.ok((await config()).finale.reveal.some((b) => b.type === 'video'), 'undo brings the video block back');
  });
  await test('drag a block by its handle to a new place', async () => {
    const before = (await config()).finale.reveal.map((b) => b.type);
    const grip = page.getByRole('button', { name: 'Drag block 1 to move it' });
    await grip.scrollIntoViewIfNeeded();
    const gb = await grip.boundingBox();
    const second = await page.locator('.ending-block').nth(1).boundingBox();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, second.y + second.height - 8, { steps: 8 });
    await page.mouse.up();
    await saved();
    const after = (await config()).finale.reveal.map((b) => b.type);
    assert.deepEqual(after.slice(0, 2), [before[1], before[0]], `the first block moved below the second (${before} -> ${after})`);
  });
  await test('the saved gift has no errors', async () => {
    const g = await prepareGift(h.giftPath(name));
    assert.deepEqual(g.report.errors, [], g.report.errors.join(' | '));
  });
  await test('an empty ending shows an invitation to add blocks', async () => {
    for (let i = (await config()).finale.reveal.length; i > 0; i--) {
      await page.getByRole('button', { name: 'Delete this block' }).first().click();
      const confirm = page.getByRole('button', { name: 'Delete', exact: true });
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
    }
    await page.getByText('The ending is empty').waitFor();
    await saved();
    await page.getByRole('button', { name: 'Headline' }).click();
    await page.getByLabel('The words').waitFor();
    await page.getByRole('button', { name: /Undo/ }).click();
  });

  section('small screens and Spark');
  await test('a narrow window still works (820 wide)', async () => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.getByRole('heading', { name: 'What is in it?' }).scrollIntoViewIfNeeded();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/ending-820.png` });
    // the studio shell itself is slightly wider than 820px; this screen's own content must still fit
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.ending-block, .ending-style, .choice')].every((el) => el.getBoundingClientRect().right <= window.innerWidth + 1)), true, 'the ending screen content fits');
  });
  await test('Spark has no choice about opening', async () => {
    const spark = await h.newGift({ tier: 'spark', recipient: 'Asha' });
    await page.goto(`${h.base}/#/g/${spark.name}/ending`);
    await page.getByText(/A Spark gift opens straight to the surprise/).waitFor();
    assert.equal(await page.getByRole('button', { name: /A locked box/ }).count(), 0);
  });
  await test('no errors in the page', () => assert.deepEqual(page.problems.filter((p) => !/status of 404|dynamically imported module/.test(p)), []));
} finally {
  await h.close();
}
finish();
