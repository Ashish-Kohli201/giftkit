// MEDIA: find the files a gift owner dropped into a gift's media folder and turn each into a named slot.
//
// The whole idea is "drop files in, use their names": media/us-at-goa.jpg becomes the slot @us_at_goa. No manifest to write,
// no paths to type. This module only looks at files and judges them; nothing here copies or changes anything.
import { readdir, stat } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';

const MB = 1024 * 1024;

export const KINDS = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'],
  video: ['.mp4', '.webm', '.m4v', '.mov'],
  audio: ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav'],
};

/** Size limits in bytes. Above `warn` the file is slow on a phone; above `error` it is refused. */
export const LIMITS = {
  image: { warn: 5 * MB, error: 25 * MB },
  video: { warn: 60 * MB, error: 400 * MB },
  audio: { warn: 15 * MB, error: 60 * MB },
};

/** Formats people commonly have that browsers cannot play, with what to do about them. */
const CONVERT_HINTS = {
  '.heic': 'iPhone HEIC photos do not open in most browsers. Export or share them as JPG (iPhone: Settings > Camera > Formats > Most Compatible).',
  '.heif': 'HEIF photos do not open in most browsers. Export them as JPG.',
  '.tif': 'TIFF images are huge and do not open in browsers. Save them as JPG.',
  '.tiff': 'TIFF images are huge and do not open in browsers. Save them as JPG.',
  '.bmp': 'BMP images are huge. Save them as JPG or PNG.',
  '.mkv': 'MKV videos do not play in most phones. Convert to MP4 (H.264).',
  '.avi': 'AVI videos do not play in browsers. Convert to MP4 (H.264).',
  '.wmv': 'WMV videos do not play in browsers. Convert to MP4 (H.264).',
  '.flv': 'FLV videos do not play in browsers. Convert to MP4 (H.264).',
  '.3gp': '3GP videos are tiny and low quality. Convert to MP4 (H.264).',
  '.flac': 'FLAC songs are very large and not supported on every phone. Convert to MP3 or M4A.',
  '.wma': 'WMA songs do not play in browsers. Convert to MP3 or M4A.',
  '.amr': 'AMR voice notes do not play in browsers. Convert to MP3 or M4A.',
};

/** Files that are normal clutter in a media folder and are skipped without a word. */
const IGNORED = /^(\.|thumbs\.db$|desktop\.ini$|readme)/i;

/** "Us at Goa (1).JPG" -> "us_at_goa_1": lowercase letters, digits and underscores, safe in a URL and in a config. */
export function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'file';
}

/** "us_at_goa" -> "Us at goa": a readable title/alt text made from a slot name. */
export function humanize(slot) {
  const words = String(slot).replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

/** Why a file type is refused and what to do instead (used by the scanner and by `add`). */
export function unsupportedHint(ext) {
  return CONVERT_HINTS[ext.toLowerCase()] ?? `"${ext}" is not a supported file type. Use JPG, PNG or WEBP for pictures, MP4 for video, MP3 or M4A for songs.`;
}

export function kindOf(ext) {
  const e = ext.toLowerCase();
  return Object.keys(KINDS).find((k) => KINDS[k].includes(e)) ?? null;
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORED.test(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Scan a media folder (sub-folders are fine: photos/, songs/ ...).
 * @returns {{ slots: Record<string, Slot>, issues: Issue[] }}
 *   Slot  = { id, type, file (absolute path), name (original file name), ext, size, poster? (absolute path) }
 *   Issue = { level: 'error' | 'warning', file, message }
 * A video can have a poster picture named `<video>.poster.jpg` next to it; the poster is not a slot of its own.
 */
export async function scanMedia(dir) {
  const slots = {};
  const issues = [];
  const posters = [];
  let files = [];
  try { files = await walk(dir); } catch { return { slots, issues: [{ level: 'error', file: dir, message: 'The media folder is missing.' }] }; }
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const file of files) {
    const name = basename(file);
    const ext = extname(name).toLowerCase();
    const stem = name.slice(0, name.length - ext.length);
    const kind = kindOf(ext);
    const rel = name;
    if (!kind) {
      issues.push({ level: 'error', file: rel, message: unsupportedHint(ext || name) });
      continue;
    }
    const size = (await stat(file)).size;
    if (size === 0) { issues.push({ level: 'error', file: rel, message: 'The file is empty.' }); continue; }
    const limit = LIMITS[kind];
    if (size > limit.error) { issues.push({ level: 'error', file: rel, message: `${(size / MB).toFixed(1)} MB is too large for a ${kind} (the limit is ${limit.error / MB} MB). Compress or trim it.` }); continue; }
    if (size > limit.warn) issues.push({ level: 'warning', file: rel, message: `${(size / MB).toFixed(1)} MB is heavy for a phone on mobile data (aim for under ${limit.warn / MB} MB).` });
    if (ext === '.mov') issues.push({ level: 'warning', file: rel, message: 'MOV videos only play on Apple devices. Export as MP4 (H.264) so it plays everywhere.' });

    if (kind === 'image' && /\.poster$/i.test(stem)) { posters.push({ base: slugify(stem.replace(/\.poster$/i, '')), file }); continue; }
    const id = slugify(stem);
    if (slots[id]) {
      issues.push({ level: 'error', file: rel, message: `"${rel}" and "${slots[id].name}" both become @${id}. Rename one of them.` });
      continue;
    }
    slots[id] = { id, type: kind, file, name, ext, size };
    if (id !== stem) issues.push({ level: 'note', file: rel, message: `use it as @${id}` });
  }

  for (const p of posters) {
    if (slots[p.base]?.type === 'video') slots[p.base].poster = p.file;
    else issues.push({ level: 'warning', file: basename(p.file), message: `A poster picture needs a video called "${p.base}" next to it, and there is none.` });
  }
  return { slots, issues };
}
