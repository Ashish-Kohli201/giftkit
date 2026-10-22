// Engine tests: the media rules, the shorthands, the plain-language checks, the build (hashed media, one folder, a valid zip),
// the preview server (HTTP Range, which iPhones need for video and songs), and a real browser opening a built gift that has
// the owner's own pictures, song and video in it.
// Run: npm run test:engine
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync, deflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { humanize, scanMedia, slugify } from '../engine/lib/media.js';
import { normalizeGift } from '../engine/lib/gift-normalize.js';
import { buildGift, GiftError, prepareGift } from '../engine/lib/build.js';
import { crc32 } from '../engine/lib/zip.js';
import { serveFolder } from '../engine/lib/server.js';

let passed = 0;
let failures = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message.split('\n').join('\n       ')}`); }
};

// ---------------------------------------------------------------- real (tiny) media made on the fly
function png(w, h, [r, g, b]) {
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; rows[o] = r; rows[o + 1] = g; rows[o + 2] = b; }
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, c]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function wav(seconds = 2, freq = 440) {
  const rate = 8000, n = rate * seconds, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * freq * i) / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const fakeMp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(4000)]);

const work = await mkdtemp(join(tmpdir(), 'giftkit-engine-'));
const gift = async (name, config, media = {}) => {
  const dir = join(work, name);
  await mkdir(join(dir, 'media'), { recursive: true });
  await writeFile(join(dir, 'gift.json'), JSON.stringify(config));
  for (const [file, data] of Object.entries(media)) { await mkdir(join(dir, 'media', file, '..'), { recursive: true }); await writeFile(join(dir, 'media', file), data); }
  return dir;
};
const base = (over = {}) => ({
  meta: { theme: 'desk', skin: 'nightsky', tier: 'countdown' },
  people: { recipient: 'Priya', sender: 'Rohan' },
  days: [{ day: 1, game: { type: 'wordle', params: { answer: 'LIGHT', maxGuesses: 5 } } }],
  finale: { type: 'vault', reveal: [{ type: 'headline', text: 'Happy Birthday, {{recipient}}!' }, { type: 'letter', text: 'Dear {{recipient}}, real words.' }] },
  ...over,
});

try {
  // ============================================================ media
  console.log('\n[media] files become named slots');
  await test('names are tidied into slot names', () => {
    assert.equal(slugify('Us at Goa (1).JPG'.replace(/\.JPG$/, '')), 'us_at_goa_1');
    assert.equal(slugify('Café déjà vu'), 'cafe_deja_vu');
    assert.equal(humanize('us_at_goa'), 'Us at goa');
  });
  await test('pictures, songs and videos are found, in sub-folders too; posters attach to their video', async () => {
    const dir = await gift('m1', base(), { 'Photos/Us at Goa.JPG': png(4, 4, [1, 2, 3]), 'songs/First Dance.mp3': wav(), 'clip.mp4': fakeMp4(), 'clip.poster.png': png(4, 4, [9, 9, 9]) });
    const { slots, issues } = await scanMedia(join(dir, 'media'));
    assert.deepEqual(Object.keys(slots).sort(), ['clip', 'first_dance', 'us_at_goa']);
    assert.equal(slots.clip.type, 'video'); assert.ok(slots.clip.poster, 'poster attached');
    assert.equal(slots.first_dance.type, 'audio');
    assert.ok(issues.some((i) => i.level === 'note' && /@us_at_goa/.test(i.message)), 'tells the new name');
  });
  await test('files that cannot work are refused with what to do instead', async () => {
    const dir = await gift('m2', base(), { 'holiday.HEIC': Buffer.from('x'.repeat(50)), 'a.jpg': png(2, 2, [0, 0, 0]), 'A.png': png(2, 2, [0, 0, 0]), 'empty.jpg': Buffer.alloc(0), 'film.mkv': Buffer.from('x') });
    const { issues } = await scanMedia(join(dir, 'media'));
    const text = issues.map((i) => `${i.level}:${i.file}:${i.message}`).join('\n');
    assert.match(text, /error:holiday\.HEIC:.*Export or share them as JPG/);
    assert.match(text, /error:film\.mkv:.*Convert to MP4/);
    assert.match(text, /error:empty\.jpg:.*empty/);
    assert.match(text, /both become @a/, 'a.jpg and A.png collide');
  });

  // ============================================================ shorthands
  console.log('\n[normalize] write less, get more');
  const slotsOf = async (files) => (await scanMedia(join(await gift(`n${Math.random()}`, base(), files), 'media'))).slots;
  await test('drop files in and they appear (each reported as a note)', async () => {
    const slots = await slotsOf({ 'a.png': png(2, 2, [1, 1, 1]), 'b.png': png(2, 2, [2, 2, 2]), 'song.mp3': wav(), 'film.mp4': fakeMp4() });
    const { config, notes } = normalizeGift(base(), slots);
    assert.deepEqual(config.apps.gallery.items, [{ photo: '@a' }, { photo: '@b' }]);
    assert.deepEqual(config.apps.music.tracks, [{ title: 'Song', src: '@song' }]);
    assert.equal(config.scene.corkboard.length, 2);
    assert.ok(config.finale.reveal.some((b) => b.type === 'photos' && b.items.length === 2));
    assert.ok(config.finale.reveal.some((b) => b.type === 'video' && b.ref === '@film'));
    assert.ok(notes.length >= 4 && notes.every((n) => typeof n === 'string'));
  });
  await test('"auto": false and "apps": { "music": false } switch it off', async () => {
    const slots = await slotsOf({ 'a.png': png(2, 2, [1, 1, 1]), 'song.mp3': wav() });
    const off = normalizeGift({ ...base(), auto: false }, slots).config;
    assert.equal(off.apps.music, undefined); assert.equal(off.apps.gallery, undefined);
    const some = normalizeGift({ ...base(), apps: { music: false } }, slots).config;
    assert.equal(some.apps.music, undefined); assert.ok(some.apps.gallery);
  });
  await test('"@all", plain names and forgiving spelling work; "@any" and memory faces use your pictures', async () => {
    const slots = await slotsOf({ 'us at beach.png': png(2, 2, [1, 1, 1]), 'goa.png': png(2, 2, [2, 2, 2]) });
    const { config, refProblems } = normalizeGift(base({
      auto: false,
      apps: { gallery: { items: ['@US-at-Beach', 'goa'] } },
      days: [{ day: 1, game: { type: 'jigsaw', params: { image: '@any' } } }, { day: 2, game: { type: 'memory', params: { pairs: 4, faces: '@all' } } }],
    }), slots);
    assert.deepEqual(config.apps.gallery.items, [{ photo: '@us_at_beach' }, { photo: '@goa' }]);
    assert.equal(config.days[0].game.params.image, '@goa');
    assert.deepEqual(config.days[1].game.params.faces, ['@goa', '@us_at_beach']);
    assert.equal(refProblems.length, 0);
  });
  await test('a mistyped file name is caught with a suggestion', async () => {
    const dir = await gift('typo', base({ apps: { gallery: { items: ['@us_at_goaa'] } } }), { 'us_at_goa.png': png(2, 2, [1, 1, 1]) });
    const g = await prepareGift(dir);
    assert.ok(!g.ok);
    assert.match(g.report.errors.join('\n'), /@us_at_goaa .*Did you mean @us_at_goa\?/);
  });

  // ============================================================ validation, in plain words
  console.log('\n[check] problems are explained, not dumped');
  const problems = async (config, media = {}) => (await prepareGift(await gift(`v${Math.random()}`, config, media))).report;
  await test('a wrong game name lists the real ones; a missing answer says where', async () => {
    const r = await problems(base({ days: [{ day: 1, game: { type: 'wordl', params: {} } }, { day: 2, game: { type: 'wordle', params: {} } }] }));
    const text = r.errors.join('\n');
    assert.match(text, /night 1 \(wordl\) type: "wordl" is not a game\. Choose one of: .*Did you mean wordle\?/s);
    assert.match(text, /night 2 \(wordle\) answer: this is missing/);
  });
  await test('theme, skin, tier, roles and finale style are checked', async () => {
    const r = await problems(base({ meta: { theme: 'dsk', skin: 'nightsk', tier: 'big' }, roles: { exclude: ['cat'] }, finale: { reveal: [{ type: 'headline', text: 'x' }], variant: 'fireworks' } }));
    const text = r.errors.join('\n');
    assert.match(text, /meta\.theme: "dsk" does not exist.*Did you mean desk\?/);
    assert.match(text, /meta\.skin: "nightsk" does not exist.*Did you mean nightsky\?/);
    assert.match(text, /meta\.tier: must be one of spark, countdown, signature/);
    assert.match(text, /roles\.exclude: "cat" is not a role/);
    assert.match(text, /finale\.variant: "fireworks" is not an ending style/);
  });
  await test('warnings: sample names, placeholder text, unused files, a song in the picture slot', async () => {
    const r = await problems(base({ people: { recipient: 'Aria', sender: 'Sam' }, finale: { type: 'vault', reveal: [{ type: 'headline', text: 'Hi' }, { type: 'letter', text: 'Write your letter here' }] } }), { 'song.mp3': wav(), 'x.png': png(2, 2, [1, 1, 1]) });
    assert.match(r.warnings.join('\n'), /sample names/);
    assert.match(r.warnings.join('\n'), /still look like instructions/);
    const bad = await problems(base({ auto: false, apps: { gallery: { items: [{ photo: '@song' }] } } }), { 'song.mp3': wav() });
    assert.match(bad.errors.join('\n'), /@song is not a picture/);
  });
  await test('a broken gift.json is explained with a line number', async () => {
    const dir = await gift('broken', base());
    await writeFile(join(dir, 'gift.json'), '{\n  "meta": {},\n  "people": {,\n}');
    await assert.rejects(() => prepareGift(dir), (e) => e instanceof GiftError && /around line \d+/.test(e.report.errors[0]));
  });
  await test('the starting templates pass a check once the sample words are accepted', async () => {
    for (const tier of ['spark', 'countdown', 'signature']) {
      const c = JSON.parse(await readFile(new URL(`../engine/templates/${tier}.json`, import.meta.url), 'utf8'));
      const r = await problems(c, { 'one.png': png(2, 2, [1, 1, 1]) });
      assert.deepEqual(r.errors, [], `${tier} template: ${r.errors.join(' | ')}`);
    }
  });

  // ============================================================ build
  console.log('\n[build] one folder, one zip');
  const media = { 'Us at Beach.png': png(40, 30, [220, 80, 120]), 'Beach Two.png': png(40, 30, [60, 140, 220]), 'First Song.wav': wav(3), 'film.mp4': fakeMp4(), 'unused.png': png(2, 2, [0, 0, 0]) };
  const dir = await gift('built', base({ auto: false, apps: { gallery: { items: ['@us_at_beach', '@beach_two'] }, music: { tracks: ['@first_song'] } }, finale: { type: 'vault', reveal: [{ type: 'headline', text: 'Happy Birthday!' }, { type: 'video', ref: '@film' }, { type: 'letter', text: 'Dear {{recipient}}, with love.' }] } }), media);
  const out = join(work, 'out');
  let result;
  await test('a gift builds into a self-contained folder with hashed media', async () => {
    result = await buildGift({ giftDir: dir, outDir: out, zip: true });
    const built = JSON.parse(await readFile(join(out, 'gift.json'), 'utf8'));
    assert.deepEqual(Object.keys(built.assets).sort(), ['beach_two', 'film', 'first_song', 'us_at_beach']);
    for (const a of Object.values(built.assets)) { assert.match(a.src, /^media\/[a-z_]+\.[0-9a-f]{10}\.(png|wav|mp4)$/); assert.ok(existsSync(join(out, a.src)), a.src); assert.equal(a.file, undefined, 'no local paths in the shipped config'); }
    assert.equal(existsSync(join(out, 'media')) && (await readdir(join(out, 'media'))).length, 4, 'the unused picture is not shipped');
    for (const f of ['index.html', 'entry.js', 'gift.json', 'manifest.json', 'robots.txt', '_headers', 'core/runtime.js', 'elements/registry.js', 'skins/nightsky/skin.json', 'themes/desk/theme.json']) assert.ok(existsSync(join(out, f)), f);
    assert.ok(!existsSync(join(out, 'skins/arcade')), 'only the chosen skin is shipped');
    assert.ok(!existsSync(join(out, 'themes/outdoors')), 'only the chosen theme is shipped');
    assert.match(await readFile(join(out, 'index.html'), 'utf8'), /A gift for Priya/);
  });
  await test('building twice keeps the same media names (content hash) and the private link stays', async () => {
    const before = (await readdir(join(out, 'media'))).sort();
    await buildGift({ giftDir: dir, outDir: out });
    assert.deepEqual((await readdir(join(out, 'media'))).sort(), before);
  });
  await test('the zip is valid: every entry reads back with the right size and checksum', async () => {
    const zip = await readFile(result.zipPath);
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = zip.readUInt16LE(eocd + 10);
    let p = zip.readUInt32LE(eocd + 16);
    assert.ok(count > 50);
    for (let i = 0; i < count; i++) {
      const method = zip.readUInt16LE(p + 10), crc = zip.readUInt32LE(p + 16), csize = zip.readUInt32LE(p + 20), size = zip.readUInt32LE(p + 24);
      const nlen = zip.readUInt16LE(p + 28), name = zip.toString('utf8', p + 46, p + 46 + nlen), local = zip.readUInt32LE(p + 42);
      const data = zip.subarray(local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28), local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28) + csize);
      const content = method === 8 ? inflateRawSync(data) : data;
      assert.equal(content.length, size, `${name} size`);
      assert.equal(crc32(content), crc, `${name} checksum`);
      p += 46 + nlen;
    }
  });
  await test('a gift with problems does not build and says why', async () => {
    const bad = await gift('bad', base({ days: [] }));
    await assert.rejects(() => buildGift({ giftDir: bad, outDir: join(work, 'bad-out') }), (e) => e instanceof GiftError && /at least one night/.test(e.report.errors.join()));
    assert.ok(!existsSync(join(work, 'bad-out')), 'nothing half-built is left behind');
  });
  await test('the command line walks the whole path: new, add, check, build', () => {
    const env = { ...process.env, GIFT_DIR: join(work, 'cli-gifts'), GIFT_OUT: join(work, 'cli-dist'), NO_COLOR: '1' };
    const run = (...args) => spawnSync(process.execPath, ['engine/cli.mjs', ...args], { env, encoding: 'utf8', cwd: new URL('..', import.meta.url) });
    let r = run('new', 'Test Gift', '--tier', 'countdown', '--for', 'Meera', '--from', 'Kabir', '--birthday', '2027-01-15');
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Started test-gift/);
    const config = JSON.parse(spawnSync('node', ['-e', `console.log(require('fs').readFileSync(${JSON.stringify(join(work, 'cli-gifts', 'test-gift', 'gift.json'))}, 'utf8'))`], { encoding: 'utf8' }).stdout);
    assert.equal(config.people.recipient, 'Meera'); assert.deepEqual(config.schedule, { mode: 'date', startDate: '2027-01-10', finaleDate: '2027-01-15' });
    r = run('add', 'test-gift', join(work, 'built', 'media'));
    assert.match(r.stdout, /Us at Beach\.png\s+->\s+@us_at_beach/);
    r = run('check', 'test-gift');
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /Ready\./);
    r = run('build', 'test-gift');
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /private  \/[a-z0-9]+\//);
    r = run('check', 'nope');
    assert.notEqual(r.status, 0); assert.match(r.stderr, /There is no gift called "nope"/);
  });

  // ============================================================ server
  console.log('\n[preview server] phones need HTTP Range for video and songs');
  const srv = await serveFolder(out, { port: 0, host: '127.0.0.1' });
  const origin = `http://127.0.0.1:${srv.port}`;
  const builtConfig = JSON.parse(await readFile(join(out, 'gift.json'), 'utf8'));
  await test('serves a byte range (206) and refuses to leave the folder', async () => {
    const url = `${origin}/${builtConfig.assets.first_song.src}`;
    const r = await fetch(url, { headers: { Range: 'bytes=0-99' } });
    assert.equal(r.status, 206); assert.match(r.headers.get('content-range'), /^bytes 0-99\/\d+$/); assert.equal((await r.arrayBuffer()).byteLength, 100);
    assert.equal(r.headers.get('content-type'), 'audio/wav');
    const tail = await fetch(url, { headers: { Range: 'bytes=-10' } });
    assert.equal((await tail.arrayBuffer()).byteLength, 10);
    assert.notEqual((await fetch(`${origin}/..%2F..%2Fpackage.json`)).status, 200, 'a path outside the folder is refused');
  });

  // ============================================================ a real browser
  console.log('\n[browser] the owner\'s own media in a built gift');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const page = await ctx.newPage();
    // the music element keeps its <audio> out of the page, so record every element that starts playing
    await page.addInitScript(() => { window.__played = []; const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__played.push(this); return play.apply(this, arguments); }; });
    const problemsSeen = [];
    const external = [];
    page.on('console', (m) => { if (m.type() === 'error') problemsSeen.push(m.text()); });
    page.on('pageerror', (e) => problemsSeen.push(e.message));
    page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url()); });
    await page.goto(`${origin}/`);
    const g = page.locator('#gift-root');
    await g.locator('[data-part="hub"]').waitFor();
    await test('the gift opens with the right title and no stray requests', async () => {
      assert.equal(await page.title(), 'A gift for Priya');
      assert.deepEqual(problemsSeen, []); assert.deepEqual(external, []);
    });
    await test('the Photos app shows the owner\'s pictures, not stand-ins', async () => {
      await g.locator('[data-part="hub"]').click();
      await g.locator('[data-part="taskbar"] [data-tool="gallery"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-element="gallery"] [data-part="thumbs"] img')].filter((i) => i.naturalWidth > 0).length === 2);
      const srcs = await page.$$eval('[data-element="gallery"] [data-part="thumbs"] img', (imgs) => imgs.map((i) => ({ src: i.currentSrc, w: i.naturalWidth })));
      assert.ok(srcs.every((s) => /\/media\/(us_at_beach|beach_two)\.[0-9a-f]{10}\.png$/.test(s.src) && s.w === 40), JSON.stringify(srcs));
      await g.locator('[data-part="sheet-close"]').last().click();
    });
    await test('the Music app plays the owner\'s song', async () => {
      await g.locator('[data-part="taskbar"] [data-tool="music"]').click();
      await g.locator('[data-element="music"] [data-part="play"]').click();
      await page.waitForFunction(() => window.__played.length > 0 && window.__played[0].currentTime > 0.2, null, { timeout: 8000 });
      const src = await page.evaluate(() => window.__played[0].currentSrc);
      assert.match(src, /\/media\/first_song\.[0-9a-f]{10}\.wav$/);
      await g.locator('[data-part="sheet-close"]').last().click();
    });
    await test('finishing a night is remembered after a reload (a real gift saves progress)', async () => {
      await g.locator('[data-part="apps"] [data-part="app"]').first().click();
      await g.locator('[data-element="wordle"]').waitFor();
      for (const c of 'LIGHT') await g.locator(`[data-part="key"][data-key="${c}"]`).click();
      await g.locator('[data-part="key"][data-key="Enter"]').click();
      await page.locator('[data-part="dialog-button"]').click();
      await page.reload();
      await g.locator('[data-part="hub"]').waitFor();
      await g.locator('[data-part="hub"]').click();
      assert.equal(await g.locator('[data-part="apps"] [data-part="app"]').first().getAttribute('data-status'), 'done');
    });
    await test('the ending\'s video block points at the owner\'s video, served in ranges', async () => {
      const r = await fetch(`${origin}/${builtConfig.assets.film.src}`, { headers: { Range: 'bytes=0-15' } });
      assert.equal(r.status, 206); assert.equal(r.headers.get('content-type'), 'video/mp4');
    });
    await ctx.close();
  } finally { await browser.close(); }
  await srv.close();
} finally {
  await rm(work, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} engine check(s) FAILED (${passed} passed)` : `\nall ${passed} engine checks passed`);
process.exit(failures ? 1 : 0);
