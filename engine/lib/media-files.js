// Putting a file into a gift's media folder: a tidy name, never overwriting something that is already there.
import { readdir } from 'node:fs/promises';
import { extname, basename, join } from 'node:path';
import { kindOf, slugify, unsupportedHint } from './media.js';

/**
 * Decide what an incoming file should be called inside media/.
 * @returns { ok: true, target: 'us_at_goa.jpg', slot: 'us_at_goa', kind } or { ok: false, message }
 */
export async function planMediaFile(mediaDir, originalName) {
  const name = basename(String(originalName));
  const ext = extname(name);
  const stem = basename(name, ext);
  const kind = kindOf(ext);
  if (!kind) return { ok: false, message: unsupportedHint(ext || name) };
  // keep ".poster" in a name so a video's cover picture stays attached
  const clean = /\.poster$/i.test(stem) ? `${slugify(stem.replace(/\.poster$/i, ''))}.poster` : slugify(stem);
  const taken = new Set((await readdir(mediaDir).catch(() => [])).map((f) => f.toLowerCase()));
  let target = `${clean}${ext.toLowerCase()}`;
  for (let n = 2; taken.has(target.toLowerCase()); n++) target = `${clean}_${n}${ext.toLowerCase()}`;
  return { ok: true, target, slot: slugify(basename(target, extname(target)).replace(/\.poster$/i, '')), kind, path: join(mediaDir, target) };
}
