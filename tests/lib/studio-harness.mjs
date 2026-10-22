// Shared setup for the studio tests: a throw-away gifts folder, a running studio, a browser, and a few real (tiny) media files.
//
//   const h = await startHarness();                       // studio on a free port, empty gifts folder
//   const { name } = await h.newGift({ tier: 'signature', recipient: 'Meera' });
//   const page = await h.open(name, 'media');              // a page already on that screen
//   h.files.png('goa.png') / h.files.wav('song.wav')       // paths to real small files in the work folder
//   await h.close();
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return ~c >>> 0;
}

/** A real PNG of one colour. */
export function pngBytes(w = 40, h = 30, [r, g, b] = [220, 80, 120]) {
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; rows[o] = r; rows[o + 1] = g; rows[o + 2] = b; }
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, c]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** A real WAV tone. */
export function wavBytes(seconds = 2, freq = 440) {
  const rate = 8000, n = rate * seconds, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * freq * i) / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Not a playable video, but the right kind of file for every check that does not press play. */
export const fakeMp4Bytes = () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(4000)]);

export async function startHarness({ port = 5191, viewport = { width: 1440, height: 900 } } = {}) {
  const work = await mkdtemp(join(tmpdir(), 'giftkit-studio-'));
  process.env.GIFT_DIR = join(work, 'gifts');
  process.env.GIFT_OUT = join(work, 'dist');
  const { startStudio } = await import('../../engine/studio/server.js');
  const { createGift } = await import('../../engine/lib/create.js');
  const studio = await startStudio({ port, open: false });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const base = studio.url.replace(/\/$/, '');

  const filesDir = join(work, 'files');
  await mkdir(filesDir, { recursive: true });
  const make = (name, data) => async () => { const p = join(filesDir, name); await writeFile(p, data); return p; };
  const files = {
    png: async (name = 'photo.png', color) => { const p = join(filesDir, name); await writeFile(p, pngBytes(40, 30, color)); return p; },
    wav: async (name = 'song.wav', freq) => { const p = join(filesDir, name); await writeFile(p, wavBytes(2, freq)); return p; },
    mp4: async (name = 'clip.mp4') => { const p = join(filesDir, name); await writeFile(p, fakeMp4Bytes()); return p; },
    text: async (name, text) => { const p = join(filesDir, name); await writeFile(p, text); return p; },
    make,
  };

  return {
    base, work, studio, browser, files,
    giftsDir: process.env.GIFT_DIR,
    giftPath: (name, ...rest) => join(process.env.GIFT_DIR, name, ...rest),
    newGift: (opts = {}) => createGift({ name: opts.name ?? `test-${Math.random().toString(36).slice(2, 7)}`, tier: 'signature', recipient: 'Meera', sender: 'Kabir', ...opts }),
    /** A page already opened on one screen of a gift; console errors are collected in page.problems. */
    async open(name, step = 'setup', ctxOpts = {}) {
      const ctx = await browser.newContext({ viewport, ...ctxOpts });
      const page = await ctx.newPage();
      page.problems = [];
      page.on('console', (m) => { if (m.type() === 'error') page.problems.push(m.text()); });
      page.on('pageerror', (e) => page.problems.push(e.message));
      await page.goto(`${base}/#/g/${name}/${step}`);
      await page.locator('.workspace').waitFor();
      return page;
    },
    async close() { await browser.close(); await studio.close(); await rm(work, { recursive: true, force: true }); },
  };
}

/** A tiny test runner that prints like the other test files and sets the exit code. */
export function runner(title) {
  let passed = 0, failures = 0;
  return {
    async test(name, fn) {
      try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`); }
    },
    section: (s) => console.log(`\n[${s}]`),
    finish() { console.log(failures ? `\n${failures} ${title} check(s) FAILED (${passed} passed)` : `\nall ${passed} ${title} checks passed`); process.exit(failures ? 1 : 0); },
  };
}
