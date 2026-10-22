// BUILD: read a gift folder, check it, and produce one self-contained static folder that works on any host.
//
//   gifts/<name>/gift.json + media/   ->   <out>/index.html, entry.js, gift.json, media/<name>.<hash>.<ext>,
//                                            core/, elements/, skins/<skin>/, themes/<theme>/
//
// No bundler and no dependencies: the runtime is plain ES modules, so the build is "check, then copy what this gift uses".
// Media files get a content hash in their name (cache-friendly, and a new photo can never be shown from an old cache).
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from '../../elements/registry.js';
import { scanMedia, slugify } from './media.js';
import { normalizeGift } from './gift-normalize.js';
import { validateGift } from './gift-validate.js';
import { writeZip } from './zip.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const ENGINE_VERSION = 1;

/** A problem the owner has to fix; carries the full report so the CLI can print it. */
export class GiftError extends Error {
  constructor(message, report) { super(message); this.name = 'GiftError'; this.report = report; }
}

/** Which themes and skins exist, and which themes each skin has artwork for. */
export async function loadCatalog() {
  const themes = JSON.parse(await readFile(join(ROOT, 'themes/themes.json'), 'utf8')).map((t) => t.id);
  const skins = JSON.parse(await readFile(join(ROOT, 'skins/skins.json'), 'utf8')).map((t) => t.id);
  const skinWorlds = {};
  for (const id of skins) skinWorlds[id] = Object.keys(JSON.parse(await readFile(join(ROOT, 'skins', id, 'skin.json'), 'utf8')).worlds ?? {});
  return { themes, skins, skinWorlds };
}

async function readGiftJson(giftDir) {
  const path = join(giftDir, 'gift.json');
  let text;
  try { text = await readFile(path, 'utf8'); } catch { throw new GiftError(`There is no gift.json in ${giftDir}.`, { errors: ['gift.json: the file is missing.'], warnings: [], notes: [] }); }
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch (e) {
    // turn "Unexpected token } in JSON at position 812" into a line number a person can find
    const pos = Number(/position (\d+)/.exec(e.message)?.[1]);
    const line = Number.isFinite(pos) ? text.slice(0, pos).split('\n').length : null;
    throw new GiftError('gift.json is not valid JSON.', {
      errors: [`gift.json${line ? `, around line ${line}` : ''}: ${e.message}. Check for a missing comma, a missing quote, or a comma after the last item.`], warnings: [], notes: [],
    });
  }
}

/**
 * Read, normalize and validate a gift folder without building anything.
 * @returns { name, config, assets, slots, report: { errors, warnings, notes }, ok }
 */
export async function prepareGift(giftDir, { lenient = false } = {}) {
  const name = basename(giftDir);
  const raw = await readGiftJson(giftDir);
  const { slots, issues } = await scanMedia(join(giftDir, 'media'));
  const { config, assets, refProblems, notes: autoNotes } = normalizeGift(raw, slots, { giftId: slugify(name) });
  const report = validateGift(config, { registry, catalog: await loadCatalog(), assets, refProblems, issues, lenient });
  report.notes.unshift(...autoNotes);
  return { name, config, assets, slots, report, ok: report.errors.length === 0 };
}

const referencedSlots = (config) => new Set([...JSON.stringify(config).matchAll(/"@([a-z0-9_]+)"/g)].map((m) => m[1]));

async function hashFile(path) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex').slice(0, 10);
}

/** Copy a source folder, leaving out reference leftovers and anything that is not part of a running gift. */
const copyTree = (from, to) => cp(from, to, { recursive: true, filter: (src) => !/[\\/](legacy|node_modules|\.git)([\\/]|$)/.test(src) && !/[\\/]_tmp/.test(src) });

/** The private link folder name for a gift: made once, kept in the gift folder so rebuilding gives the same link. */
export async function slugFor(giftDir, requested) {
  const file = join(giftDir, '.slug');
  if (requested) { await writeFile(file, requested); return requested; }
  try { return (await readFile(file, 'utf8')).trim(); } catch { /* first build */ }
  const slug = randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x');
  await writeFile(file, slug);
  return slug;
}

/**
 * Build a gift folder into `outDir`.
 * @param opts { giftDir, outDir, preview (use the preview entry: query helpers, live reload, nothing saved), zip (also write <outDir>.zip) }
 * @returns { outDir, files, bytes, report, config, zipPath? }
 * @throws GiftError when the gift has errors (the report says what to fix)
 */
export async function buildGift({ giftDir, outDir, preview = false, zip = false }) {
  const gift = await prepareGift(giftDir, { lenient: preview });
  if (!gift.ok) throw new GiftError(`${gift.name} has ${gift.report.errors.length} problem(s) to fix.`, gift.report);
  const { config, assets } = gift;

  // build in a side folder and swap it in at the end: a preview that is open never sees a half-built gift
  const dest = `${outDir}.building`;
  await rm(dest, { recursive: true, force: true });
  await mkdir(join(dest, 'media'), { recursive: true });

  // ---- the runtime this gift uses (and only that: one skin, one theme)
  await copyTree(join(ROOT, 'core'), join(dest, 'core'));
  await copyTree(join(ROOT, 'elements'), join(dest, 'elements'));
  await copyTree(join(ROOT, 'skins', config.meta.skin), join(dest, 'skins', config.meta.skin));
  await copyTree(join(ROOT, 'themes', config.meta.theme), join(dest, 'themes', config.meta.theme));

  // ---- media: only the files the gift actually uses, named by content hash
  const used = referencedSlots(config);
  const manifest = {};
  for (const [id, a] of Object.entries(assets)) {
    if (!used.has(id)) continue;
    const ext = a.file.slice(a.file.lastIndexOf('.')).toLowerCase();
    const src = `media/${id}.${await hashFile(a.file)}${ext}`;
    await copyFile(a.file, join(dest, src));
    manifest[id] = { type: a.type, src, alt: a.alt };
    if (a.posterFile) {
      const pext = a.posterFile.slice(a.posterFile.lastIndexOf('.')).toLowerCase();
      manifest[id].poster = `media/${id}.poster.${await hashFile(a.posterFile)}${pext}`;
      await copyFile(a.posterFile, join(dest, manifest[id].poster));
    }
  }
  await writeFile(join(dest, 'gift.json'), `${JSON.stringify({ ...config, assets: manifest }, null, 2)}\n`);

  // ---- the page
  const title = `A gift for ${config.people.recipient}`;
  const html = (await readFile(join(ROOT, 'engine/template/index.html'), 'utf8')).replace('{{title}}', title.replace(/[<>&"]/g, ''));
  await writeFile(join(dest, 'index.html'), html);
  await copyFile(join(ROOT, 'engine/template', preview ? 'entry-preview.js' : 'entry.js'), join(dest, 'entry.js'));
  if (!preview) {
    // keep search engines and link previews out; hosts that understand _headers send the same instruction as a header
    await writeFile(join(dest, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    await writeFile(join(dest, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  Cache-Control: public, max-age=0, must-revalidate\n/media/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  }

  // ---- what was built
  const files = [];
  const walk = async (dir, rel = '') => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path, `${rel}${e.name}/`);
      else files.push({ path: `${rel}${e.name}`, full: path, bytes: (await stat(path)).size });
    }
  };
  await walk(dest);
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  await writeFile(join(dest, 'manifest.json'), `${JSON.stringify({
    engine: ENGINE_VERSION, giftId: config.meta.giftId, tier: config.meta.tier, theme: config.meta.theme, skin: config.meta.skin,
    files: files.map((f) => ({ path: f.path, bytes: f.bytes })), totalBytes: bytes,
  }, null, 2)}\n`);

  // swap the finished folder into place
  await rm(outDir, { recursive: true, force: true });
  await rename(dest, outDir);
  for (const f of files) f.full = join(outDir, f.path);

  const result = { outDir, files: files.length + 1, bytes, report: gift.report, config };
  if (zip) {
    result.zipPath = `${outDir}.zip`;
    const entries = [];
    for (const f of [...files, { path: 'manifest.json', full: join(outDir, 'manifest.json') }]) {
      // media is already compressed: stream it from disk; everything else is small text that is deflated in memory
      entries.push(f.path.startsWith('media/') ? { name: f.path, path: f.full } : { name: f.path, data: await readFile(f.full) });
    }
    await writeZip(result.zipPath, entries);
  }
  return result;
}
