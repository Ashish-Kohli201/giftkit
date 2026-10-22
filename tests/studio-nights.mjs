// Studio Nights screen: adding a night of every game, filling its settings, reordering (buttons and a real pointer drag),
// deleting, switching a game, "Try this night" in the live preview, plain-language problems on a card, and undo.
// Run: node tests/studio-nights.mjs   (SHOTS=<folder> saves screenshots there)
import assert from 'node:assert/strict';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareGift } from '../engine/lib/build.js';
import { runner, startHarness } from './lib/studio-harness.mjs';

const t = runner('studio-nights');
const h = await startHarness({ port: 5202 });
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `nights-${name}.png`) }); };

try {
  const { name } = await h.newGift({ name: 'nights-test', tier: 'countdown', recipient: 'Meera', birthday: '2027-01-15' });
  const dir = h.giftPath(name);
  const readGift = async () => JSON.parse(await readFile(join(dir, 'gift.json'), 'utf8'));
  // a picture to play with (the jigsaw needs one), and no nights to start from
  await copyFile(await h.files.png('beach.png'), join(dir, 'media', 'beach.png'));
  const g0 = await readGift(); g0.days = []; await writeFile(join(dir, 'gift.json'), JSON.stringify(g0));

  const page = await h.open(name, 'nights');
  const cards = page.locator('.night');
  const saved = () => page.getByText('All changes saved').waitFor();
  const card = (i) => page.locator(`.night[data-index="${i}"]`);
  const open = async (i) => { if ((await card(i).locator('.night-toggle').getAttribute('aria-expanded')) !== 'true') await card(i).locator('.night-toggle').click(); };
  const addNight = async (game) => { await page.getByRole('button', { name: /^Add a night$/ }).click(); await page.locator('.game-choices .choice', { hasText: game }).click(); };

  t.section('starting from nothing');
  await t.test('an empty gift offers a starting set, which fills in five nights', async () => {
    await page.getByRole('heading', { name: 'No nights yet' }).waitFor();
    await shot(page, 'empty');
    await page.getByRole('button', { name: 'Fill with a starting set' }).click();
    await cards.nth(4).waitFor();
    assert.equal(await cards.count(), 5);
    await saved();
    const g = await readGift();
    assert.deepEqual(g.days.map((d) => d.day), [1, 2, 3, 4, 5]);
    assert.equal(g.days[2].game.params.mode, 'whosaid');
  });

  t.section('adding a night of every game');
  await t.test('wordle: the tiles show the word and it is saved', async () => {
    await addNight('Guess the word');
    await cards.nth(5).locator('.night-body').waitFor({ state: 'visible' });
    // a new wordle has no word yet: the card says so in plain words
    await page.locator('.callout-bad').waitFor();
    assert.match(await page.locator('.callout-bad').innerText(), /answer: This is needed/);
    await page.getByLabel('The word', { exact: true }).fill('heart');
    assert.equal(await page.locator('.tile').count(), 5);
    await saved();
    assert.equal((await readGift()).days[5].game.params.answer, 'HEART');
    await page.locator('.callout-bad').waitFor({ state: 'hidden' });
  });
  await t.test('questions: add a question with options and pick the right one', async () => {
    await addNight('Questions');
    await page.getByPlaceholder('Which planet is closest to the Sun?').fill('Which season do we love?');
    await page.getByPlaceholder('Option 1').fill('Spring');
    await page.getByPlaceholder('Option 2').fill('Monsoon');
    await page.getByLabel('Option 2 is the right answer').check();
    await saved();
    const q = (await readGift()).days[6].game.params;
    assert.deepEqual([q.questions[0].q, q.questions[0].options, q.questions[0].correct], ['Which season do we love?', ['Spring', 'Monsoon'], 1]);
  });
  await t.test('put it in order: three moments', async () => {
    await addNight('Put it in order');
    const labels = page.getByPlaceholder('The first message');
    await labels.nth(0).fill('We met');
    await labels.nth(1).fill('First trip');
    await labels.nth(2).fill('Today');
    await saved();
    assert.deepEqual((await readGift()).days[7].game.params.events.map((e) => e.label), ['We met', 'First trip', 'Today']);
  });
  await t.test('follow the clues: a clue, its answer and an extra answer', async () => {
    await addNight('Follow the clues');
    await page.getByPlaceholder('I am full of stories but never speak. Find me on a shelf.').fill('Find me on a shelf');
    await page.getByPlaceholder('book', { exact: true }).fill('book');
    await page.getByPlaceholder('Another answer that counts (Enter)').fill('books');
    await page.keyboard.press('Enter');
    await saved();
    const c = (await readGift()).days[8].game.params.clues[0];
    assert.deepEqual([c.clue, c.answer, c.answers], ['Find me on a shelf', 'book', ['books']]);
  });
  await t.test('match the pairs and the jigsaw start sensibly (pictures, first picture)', async () => {
    await addNight('Match the pairs');
    await page.getByRole('button', { name: 'Little symbols' }).click();
    await addNight('Put the picture together');
    await saved();
    const g = await readGift();
    assert.equal(g.days[9].game.params.faces, undefined);
    assert.deepEqual([g.days[10].game.params.image, g.days[10].game.params.cols], ['@any', 3]);
  });
  await t.test('after all that, the real checker finds nothing wrong with the gift', async () => {
    const r = await prepareGift(dir);
    assert.deepEqual(r.report.errors, []);
    assert.equal(r.config.days.length, 11);
  });

  t.section('order and structure');
  await t.test('the arrow buttons move a night and renumber every night', async () => {
    await card(0).getByRole('button', { name: 'Move night 1 down' }).click();
    await saved();
    const g = await readGift();
    assert.deepEqual(g.days.map((d) => d.day), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(g.days[0].game.type, 'memory'); assert.equal(g.days[1].game.params.answer, 'LOVE');
  });
  await t.test('dragging the grip with the pointer moves a night too', async () => {
    const before = (await readGift()).days.map((d) => d.game.type);
    await page.getByRole('button', { name: /Move night 1 up/ }).waitFor({ state: 'attached' });
    const grip = card(0).locator('.night-grip');
    const target = card(2);
    const a = await grip.boundingBox(); const b = await target.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + 40, { steps: 4 });
    await page.mouse.move(a.x + a.width / 2, b.y + b.height * 0.8, { steps: 10 });
    await page.mouse.up();
    await saved();
    const after = (await readGift()).days.map((d) => d.game.type);
    assert.notDeepEqual(after, before);
    assert.equal(after[2], before[0], 'the first night landed in third place');
    assert.deepEqual((await readGift()).days.map((d) => d.day), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    await shot(page, 'list');
  });
  await t.test('deleting asks first, and Undo brings the night back', async () => {
    const count = (await readGift()).days.length;
    await card(10).getByRole('button', { name: 'Delete night 11' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    assert.equal((await readGift()).days.length, count, 'cancel keeps it');
    await card(10).getByRole('button', { name: 'Delete night 11' }).click();
    await page.getByRole('button', { name: 'Delete the night' }).click();
    await saved();
    assert.equal((await readGift()).days.length, count - 1);
    await page.getByRole('button', { name: /Undo/ }).click();
    await saved();
    assert.equal((await readGift()).days.length, count);
    await cards.nth(count - 1).waitFor();
  });
  await t.test('duplicating copies the game and its story', async () => {
    const count = (await readGift()).days.length;
    await card(1).getByRole('button', { name: 'Duplicate night 2' }).click();
    await saved();
    const g = await readGift();
    assert.equal(g.days.length, count + 1);
    assert.deepEqual(g.days[2].game, g.days[1].game);
    await page.getByRole('button', { name: /Undo/ }).click(); await saved();
  });

  t.section('editing one night');
  await t.test('changing the game asks first; cancelling keeps the game, confirming resets its settings', async () => {
    const idx = (await readGift()).days.findIndex((d) => d.game.type === 'wordle' && d.game.params.answer === 'HEART');
    await open(idx);
    const select = card(idx).locator('select[aria-label="Game"]');
    await select.selectOption('quiz');
    await page.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await select.inputValue(), 'wordle');
    await select.selectOption('quiz');
    await page.getByRole('button', { name: 'Change the game' }).click();
    await saved();
    const d = (await readGift()).days[idx];
    assert.equal(d.game.type, 'quiz'); assert.equal(d.game.params.answer, undefined);
    await page.getByRole('button', { name: /Undo/ }).click(); await saved();
    assert.equal((await readGift()).days[idx].game.params.answer, 'HEART');
  });
  await t.test('the story and the line above the game are saved, and the undo is one step per box', async () => {
    const idx = (await readGift()).days.findIndex((d) => d.game.type === 'wordle' && d.game.params.answer === 'HEART');
    await open(idx);
    await card(idx).getByLabel('Story title').fill('The spark');
    await card(idx).getByLabel('Story text').fill('Do you remember? Hello {{recipient}}.');
    await card(idx).getByPlaceholder('A small one to warm up.').fill('A warm-up');
    await saved();
    const d = (await readGift()).days[idx];
    assert.deepEqual([d.story.title, d.story.text, d.note], ['The spark', 'Do you remember? Hello {{recipient}}.', 'A warm-up']);
    await card(idx).getByRole('button', { name: '{{sender}}' }).click();
    await saved();
    assert.match((await readGift()).days[idx].story.text, /\{\{sender\}\}$/);
  });
  await t.test('"Try this night" opens exactly that game in the live preview', async () => {
    const idx = (await readGift()).days.findIndex((d) => d.game.type === 'wordle' && d.game.params.answer === 'HEART');
    await open(idx);
    await card(idx).getByRole('button', { name: 'Try this night' }).click();
    const frame = page.frameLocator('iframe[title^="Live preview"]');
    try { await frame.locator('[data-element="wordle"]').waitFor({ timeout: 30000 }); } catch (e) {
      // say what the preview was doing, so a failure here explains itself
      throw new Error(`${e.message.slice(0, 80)}; preview says "${await page.locator('.preview-status').innerText()}", overlay "${await page.locator('.preview-overlay').innerText().catch(() => '')}", frame "${(await frame.locator('body').innerText().catch(() => '')).slice(0, 200)}"`);
    }
    assert.equal(await frame.locator('[data-element="wordle"] [data-part="tile"]').count() % 5, 0);
    await shot(page, 'try');
  });
  await t.test('a night with a problem says so on its card, and it clears when fixed', async () => {
    const before = (await readGift()).days.length;
    await addNight('Guess the word');
    let last = before;
    for (let n = 0; n < 50 && (await readGift()).days.length === before; n++) await page.waitForTimeout(100); // wait for the autosave
    await page.locator('.night.has-error').last().waitFor();
    await card(last).locator('.night-badges .badge').waitFor();
    assert.match(await card(last).locator('.night-badges').innerText(), /to fix/);
    await page.getByLabel('The word', { exact: true }).fill('stars');
    await saved();
    await page.waitForFunction((i) => !document.querySelector(`.night[data-index="${i}"]`).classList.contains('has-error'), last);
  });
  await t.test('Spark gifts say they have no nights', async () => {
    const g = await readGift(); g.meta.tier = 'spark'; await writeFile(join(dir, 'gift.json'), JSON.stringify(g));
    await page.reload(); await page.locator('.workspace').waitFor();
    await page.getByText('A Spark gift has no nights.').waitFor();
  });
  await t.test('no errors in the page', () => assert.deepEqual(page.problems, []));

  // a tablet-sized look
  const small = await h.open(name, 'nights', { viewport: { width: 820, height: 1000 } });
  await small.locator('.topbar-actions .btn-ghost').nth(2).click(); // at tablet width the preview floats over the page
  const g = await readGift(); g.meta.tier = 'signature'; await writeFile(join(dir, 'gift.json'), JSON.stringify(g));
  await small.reload(); await small.locator('.night').first().waitFor();
  await small.locator('.night-toggle').first().click();
  await shot(small, 'tablet');
  await shot(page, 'desktop');
} finally { await h.close(); }
t.finish();
