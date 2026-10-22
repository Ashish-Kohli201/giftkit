// Studio Room screen: the growing-room timeline (drag, menu, leave out, reset, whole-room switch), the live preview at a chosen
// night, and the little extras (coupons, notes, music, photos, memories board) in their automatic and chosen modes.
// Run: node tests/studio-room.mjs
import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { startHarness, runner } from './lib/studio-harness.mjs';

const { test, section, finish } = runner('studio-room');
const h = await startHarness({ port: 5203 });
try {
  const { prepareGift } = await import('../engine/lib/build.js');
  const { name } = await h.newGift({ name: 'room-test', tier: 'signature' });
  // real files in the gift's media folder: two pictures and two songs
  await copyFile(await h.files.png('goa.png', [200, 80, 90]), h.giftPath(name, 'media', 'goa.png'));
  await copyFile(await h.files.png('sunset.png', [240, 170, 60]), h.giftPath(name, 'media', 'sunset.png'));
  await copyFile(await h.files.wav('first-song.wav', 440), h.giftPath(name, 'media', 'first-song.wav'));
  await copyFile(await h.files.wav('second-song.wav', 660), h.giftPath(name, 'media', 'second-song.wav'));

  const page = await h.open(name, 'room');
  // the first preview build races the iframe's first request (a known server quirk: the iframe can 404 once); wait for it
  await page.locator('.preview-status', { hasText: 'Up to date' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500); // a second, queued build usually follows the first; let it finish so the frame loads a settled folder
  await page.locator('.preview-status', { hasText: 'Up to date' }).waitFor({ timeout: 30000 });
  const config = async () => JSON.parse(await readFile(h.giftPath(name, 'gift.json'), 'utf8'));
  const saved = () => page.locator('.save-state', { hasText: 'All changes saved' }).waitFor();
  const col = (n) => page.locator(`.room-col[data-night="${n}"]`);
  const problems = async () => (await prepareGift(h.giftPath(name))).report.errors;

  section('the room timeline');
  await page.getByRole('heading', { name: 'The room', exact: true }).waitFor();
  await test('a Signature room starts almost empty: one thing is added after each night, in the usual order', async () => {
    await col(0).waitFor();
    assert.equal(await page.locator('.room-col').count(), 11, 'at the start + ten nights');
    const order = ['board', 'light', 'jar', 'app-music', 'pet', 'app-gallery', 'toy', 'app-notes', 'ambient-a', 'ambient-b'];
    for (const [i, role] of order.entries()) assert.equal(await col(i + 1).locator(`[data-role="${role}"]`).count(), 1, `${role} after night ${i + 1}`);
    assert.match(await col(0).innerText(), /Always there/);
  });
  await test('things are named the way this gift\'s own room names them (a desk has a record player)', async () => {
    assert.match(await col(4).innerText(), /Record player/);
  });
  await test('clicking "After night 3" shows exactly the room as it is then, in the live preview', async () => {
    await page.getByRole('button', { name: 'After night 3' }).click();
    const frame = page.frameLocator('iframe[title^="Live preview"]');
    await frame.locator('#gift-root [data-part="hub"]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(500);
    const state = await frame.locator('#gift-root [data-part="room-stage"]').evaluate((stage) => {
      const roles = ['hub', 'vault', 'board', 'light', 'jar', 'app-music', 'pet', 'app-gallery', 'toy', 'app-notes', 'ambient-a', 'ambient-b'];
      return Object.fromEntries(roles.map((r) => { const el = stage.querySelector(`[data-part="${r}"]`); return [r, !!el && !el.hidden]; }));
    });
    assert.deepEqual(Object.entries(state).filter(([, v]) => v).map(([k]) => k).sort(), ['board', 'hub', 'jar', 'light', 'vault']);
  });
  await test('dragging a thing to another night moves it, and only that is saved', async () => {
    const from = page.locator('.room-col[data-night="5"] [data-role="pet"] .room-chip-main');
    await from.scrollIntoViewIfNeeded();
    const a = await from.boundingBox();
    const b = await page.locator('.room-col[data-night="6"] .room-col-head').boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + 20, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 40, { steps: 8 });
    await page.mouse.up();
    await saved();
    assert.deepEqual((await config()).roles, { unlockDay: { pet: 6 } });
    assert.equal(await col(6).locator('[data-role="pet"]').count(), 1);
  });
  await test('the "Appears after night" menu does the same for keyboard and touch; the default is not written down', async () => {
    await page.locator('[data-role="toy"] select').selectOption('2');
    await saved();
    assert.deepEqual((await config()).roles.unlockDay, { pet: 6, toy: 2 });
    await page.locator('[data-role="toy"] select').selectOption('7'); // its automatic night again
    await saved();
    assert.deepEqual((await config()).roles.unlockDay, { pet: 6 });
    await col(6).locator('[data-role="pet"]').getByRole('button', { name: 'Back to automatic' }).click();
    await saved();
    assert.equal((await config()).roles, undefined, 'nothing left over');
  });
  await test('a thing can be left out (and put back); it leaves the timeline and sits in a "Left out" tray', async () => {
    await col(7).locator('[data-role="toy"]').getByRole('button', { name: 'Leave out' }).click();
    await saved();
    assert.deepEqual((await config()).roles.exclude, ['toy']);
    assert.equal(await page.locator('.room-timeline [data-role="toy"]').count(), 0);
    await page.locator('.room-out').getByRole('button', { name: 'Put back' }).click();
    await saved();
    assert.equal((await config()).roles, undefined);
    assert.equal(await page.locator('.room-timeline [data-role="toy"]').count(), 1);
  });
  await test('"Reset all" puts the whole room back to automatic', async () => {
    await page.locator('[data-role="pet"] select').selectOption('1');
    await col(1).locator('[data-role="ambient-b"]').count();
    await page.locator('.room-timeline [data-role="jar"]').getByRole('button', { name: 'Leave out' }).click();
    await saved();
    assert.ok((await config()).roles.unlockDay.pet === 1 && (await config()).roles.exclude.includes('jar'));
    await page.getByRole('button', { name: 'Reset all' }).click();
    await saved();
    assert.equal((await config()).roles, undefined);
  });
  await test('"Show the whole room from the start" switches the growing off and on', async () => {
    await page.getByLabel('Show the whole room from the start').check({ force: true });
    await saved();
    assert.equal((await config()).roles.progressive, false);
    await page.getByLabel('Show the whole room from the start').uncheck({ force: true });
    await saved();
    assert.equal((await config()).roles, undefined);
  });

  section('little extras: coupons and notes');
  await test('coupons: add, edit, reorder and remove, and the gift still checks out', async () => {
    const card = page.locator('#room-coupons');
    const before = (await config()).apps.coupons.items.length;
    await card.getByRole('button', { name: 'Add a coupon' }).click();
    await saved();
    let items = (await config()).apps.coupons.items;
    assert.equal(items.length, before + 1);
    assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'ids stay unique');
    await card.locator('.room-row').last().getByLabel('The promise').fill('A breakfast in bed');
    await saved();
    items = (await config()).apps.coupons.items;
    assert.equal(items.at(-1).title, 'A breakfast in bed');
    await card.locator('.room-row').last().getByRole('button', { name: 'Move up' }).click();
    await saved();
    assert.equal((await config()).apps.coupons.items.at(-2).title, 'A breakfast in bed');
    await card.locator('.room-row').nth(before - 1).getByRole('button', { name: 'Remove' }).click();
    await saved();
    assert.equal((await config()).apps.coupons.items.length, before);
    assert.deepEqual(await problems(), []);
  });
  await test('removing the last coupon switches the extra off instead of leaving something invalid', async () => {
    const card = page.locator('#room-coupons');
    while (await card.locator('.room-row').count()) { await card.locator('.room-row').first().getByRole('button', { name: 'Remove' }).click(); await saved(); }
    const apps = (await config()).apps;
    assert.equal(apps.coupons.enabled, false);
    assert.deepEqual(await problems(), []);
    assert.equal(await card.locator('input[type="checkbox"]').isChecked(), false);
    await card.locator('input[type="checkbox"]').check({ force: true });
    await saved();
    assert.equal((await config()).apps.coupons.items.length, 1, 'switching it back on starts with one coupon');
  });
  await test('notes: add with a date, edit the words, remove', async () => {
    const card = page.locator('#room-notes');
    const before = (await config()).apps.notes.items.length;
    await card.getByRole('button', { name: 'Add a note' }).click();
    await saved();
    const row = card.locator('.room-row').last();
    await row.getByLabel('Title').fill('For a rainy day');
    await row.getByLabel('The note').fill('Put the kettle on.');
    await row.getByLabel('Date (optional)').fill('2026-12-20');
    await saved();
    const last = (await config()).apps.notes.items.at(-1);
    assert.deepEqual([last.title, last.text, last.date], ['For a rainy day', 'Put the kettle on.', '2026-12-20']);
    assert.deepEqual(await problems(), []);
    await row.getByRole('button', { name: 'Remove' }).click();
    await saved();
    assert.equal((await config()).apps.notes.items.length, before);
  });

  section('little extras: music, photos and the memories board');
  await test('music is automatic by default, can be chosen and named, and can go back to automatic', async () => {
    const card = page.locator('#room-music');
    await card.getByText('All your songs (automatic)').waitFor();
    assert.equal((await config()).apps.music, undefined, 'nothing is written while it is automatic');
    await card.getByRole('button', { name: 'Choose and name them' }).click();
    await saved();
    let tracks = (await config()).apps.music.tracks;
    assert.deepEqual(tracks.map((t) => t.src), ['@first_song', '@second_song']);
    await card.locator('.room-row').first().getByLabel('Song title').fill('Our first dance');
    await card.locator('.room-row').first().getByRole('button', { name: 'Move down' }).click();
    await saved();
    tracks = (await config()).apps.music.tracks;
    assert.deepEqual(tracks.map((t) => t.title), ['Second song', 'Our first dance']);
    assert.deepEqual(await problems(), []);
    await card.getByRole('button', { name: 'Back to automatic' }).click();
    await saved();
    assert.equal((await config()).apps.music.tracks, '@all');
  });
  await test('photos: chosen with captions, then back to automatic; the switch turns it off without losing the list', async () => {
    const card = page.locator('#room-gallery');
    await card.getByRole('button', { name: 'Choose and name them' }).click();
    await saved();
    assert.equal((await config()).apps.gallery.items.length, 2);
    await card.locator('.room-row').first().getByLabel('Caption (optional)').fill('The night we got lost');
    await saved();
    assert.equal((await config()).apps.gallery.items[0].caption, 'The night we got lost');
    await card.locator('input[type="checkbox"]').first().uncheck({ force: true });
    await saved();
    const off = (await config()).apps.gallery;
    assert.equal(off.enabled, false); assert.equal(off.items.length, 2, 'the list is kept');
    await card.locator('input[type="checkbox"]').first().check({ force: true });
    await saved();
    assert.equal((await config()).apps.gallery.enabled, undefined);
    assert.equal((await config()).apps.gallery.items.length, 2);
    await card.getByRole('button', { name: 'Back to automatic' }).click();
    await saved();
    assert.equal((await config()).apps.gallery.items, '@all');
    assert.deepEqual(await problems(), []);
  });
  await test('the memories board has captions and a note on the back, and can be switched off', async () => {
    const card = page.locator('#room-board');
    assert.equal((await config()).scene, undefined, 'automatic writes nothing');
    await card.getByRole('button', { name: 'Choose and name them' }).click();
    await saved();
    await card.locator('.room-row').first().getByLabel('Caption').fill('Golden hour');
    await card.locator('.room-row').first().getByLabel('Written on the back').fill('Remember this day.');
    await saved();
    const first = (await config()).scene.corkboard[0];
    assert.deepEqual([first.caption, first.back], ['Golden hour', 'Remember this day.']);
    assert.deepEqual(await problems(), []);
    await card.getByRole('button', { name: 'Back to automatic' }).click();
    await saved();
    assert.equal((await config()).scene?.corkboard, undefined);
    await card.locator('input[type="checkbox"]').first().uncheck({ force: true });
    await saved();
    assert.deepEqual((await config()).scene.corkboard, []);
  });
  await test('no errors in the page (apart from one early 404 in the preview frame)', () => assert.deepEqual(page.problems.filter((p) => !/status of 404|dynamically imported module/.test(p)), []));

  section('other sizes');
  await test('Countdown shows a simple list; Spark has nothing to arrange', async () => {
    const small = await h.newGift({ name: 'room-small', tier: 'countdown' });
    const p2 = await h.open(small.name, 'room');
    await p2.getByText('shows its whole small room from the start').waitFor();
    assert.equal(await p2.locator('.room-timeline').count(), 0);
    await p2.locator('.room-simple [data-role="jar"]').waitFor();
    const spark = await h.newGift({ name: 'room-spark', tier: 'spark' });
    const p3 = await h.open(spark.name, 'room');
    await p3.getByText('Nothing to arrange here').waitFor();
    assert.deepEqual([...p2.problems, ...p3.problems], []);
  });

  section('looks');
  await test('screenshots at 1440x900 and 820x1000 (for a human to look at)', async () => {
    if (!process.env.SHOTS) return;
    await page.screenshot({ path: 'tests/shots/studio-room-1440.png', fullPage: true });
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.screenshot({ path: 'tests/shots/studio-room-820.png', fullPage: true });
  });
} finally {
  await h.close();
}
finish();
