// NORMALIZE: turn the gift.json a person wrote by hand into the full config the runtime needs.
//
// A gift owner writes as little as possible, so this module fills in the obvious:
//   - defaults (theme, skin, tier, locale ...)
//   - media shorthands:   "@all" = every picture / song in the media folder,  "@us_at_goa" = one file by its name,
//                         a plain list of names instead of objects ("tracks": ["@song_one", "@song_two"])
//   - asset slots: every file in media/ becomes a slot automatically (the config never lists files)
//   - a game that needs a picture can say "@any" (the first picture in media/), and a memory game's "faces": "@all"
//     uses your pictures as the card faces
//   - forgiving references: "@US-at-Goa" finds the slot us_at_goa
//   - "drop files in and they appear": songs in media/ add a Music app, pictures add a Photos app, a pinboard and a photo
//     block in the ending, a video becomes a video block in the ending. Each of these is reported as a note, never silent,
//     and the config can say no: "auto": false, or "apps": { "music": false }.
// It never judges: problems it meets (a slot that does not exist) are returned for validate-gift.js to report.
import { humanize, slugify } from './media.js';

const REF = /^@[A-Za-z0-9_-]+$/;
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const idsOf = (slots, type) => Object.values(slots).filter((s) => s.type === type).map((s) => s.id).sort(byName);
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Edit distance, for "did you mean ...?" */
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** The closest slot name to a mistyped one, or null when nothing is close. */
export function suggest(id, names) {
  let best = null;
  for (const n of names) {
    const d = n.includes(id) || id.includes(n) ? 1 : distance(id, n);
    if (d <= Math.max(2, Math.floor(id.length / 3)) && (!best || d < best.d)) best = { n, d };
  }
  return best?.n ?? null;
}

// the most each element can show; "@all" and the automatic rules stop there (and say so)
const CAPS = { gallery: 24, music: 12, corkboard: 8, photos: 8 };

/** Expand a list shorthand: "@all", or an array whose plain strings become objects. `notes` collects what was trimmed. */
function expandList(value, allIds, fromId, cap, what, notes) {
  if (value === '@all') {
    if (allIds.length > cap) notes.push(`${what}: using the first ${cap} of ${allIds.length} files (the most it can show). List the ones you want to choose.`);
    return allIds.slice(0, cap).map(fromId);
  }
  if (!Array.isArray(value)) return value;
  return value.map((v) => (typeof v === 'string' ? fromId(slugify(v.replace(/^@/, ''))) : v));
}

/**
 * @param raw    the parsed gift.json
 * @param slots  from scanMedia()
 * @param defaults { giftId, recipientHint } supplied by the caller
 * @returns { config, assets, refProblems, notes }
 *   config       the full config (assets metadata attached by the build step, not here)
 *   assets       { slotId: { type, alt, file, posterFile? } } for the build step to copy
 *   refProblems  [{ path, ref, suggestion }] references to slots that do not exist
 *   notes        plain-language lines about what was added or trimmed automatically
 */
export function normalizeGift(raw, slots, defaults = {}) {
  const config = structuredClone(raw ?? {});
  config.schemaVersion ??= 1;
  config.meta = { theme: 'desk', skin: 'nightsky', tier: 'countdown', locale: 'en', timezone: 'UTC', giftId: defaults.giftId, ...config.meta };
  config.schedule = { mode: 'sequential', ...config.schedule };
  config.days ??= [];
  const images = idsOf(slots, 'image');
  const songs = idsOf(slots, 'audio');
  const notes = [];
  const videos = idsOf(slots, 'video');
  const auto = config.auto !== false;
  const apps = (config.apps ??= {});

  // ---- "drop files in and they appear" (each step reports itself in `notes`; "auto": false or "apps": { "music": false } turns it off)
  const rooms = config.meta.tier !== 'spark'; // a Spark gift has no hub or board to hold apps
  if (auto) {
    if (rooms && apps.music === undefined && songs.length) { apps.music = { tracks: '@all' }; notes.push(`auto: added the Music app (${songs.length} song${songs.length > 1 ? 's' : ''} found in media/)`); }
    if (rooms && apps.gallery === undefined && images.length) { apps.gallery = { items: '@all' }; notes.push(`auto: added the Photos app (${images.length} picture${images.length > 1 ? 's' : ''} found in media/)`); }
    config.scene ??= {};
    if (rooms && config.scene.corkboard === undefined && images.length) { config.scene.corkboard = '@all'; notes.push('auto: pinned your pictures to the memories board'); }
    config.finale ??= {};
    const blocks = config.finale.reveal;
    if (Array.isArray(blocks)) {
      if (images.length && !blocks.some((b) => b?.type === 'photos')) { blocks.push({ type: 'photos', items: '@all' }); notes.push('auto: added your pictures to the ending'); }
      if (videos.length && !blocks.some((b) => b?.type === 'video')) {
        blocks.splice(Math.min(1, blocks.length), 0, { type: 'video', ref: `@${videos[0]}` });
        notes.push(`auto: added your video @${videos[0]} to the ending${videos.length > 1 ? ` (you have ${videos.length} videos; add the others yourself)` : ''}`);
      }
    }
  }
  for (const id of ['music', 'gallery', 'notes', 'coupons']) if (apps[id] === false) delete apps[id];

  // ---- media shorthands
  if (apps.gallery) {
    apps.gallery.items = expandList(apps.gallery.items, images, (id) => ({ photo: `@${id}` }), CAPS.gallery, 'Photos app', notes);
    apps.gallery.enabled ??= true;
  }
  if (apps.music) {
    apps.music.tracks = expandList(apps.music.tracks, songs, (id) => ({ title: humanize(id), src: `@${id}` }), CAPS.music, 'Music app', notes);
    apps.music.tracks = (apps.music.tracks ?? []).map((t) => (isObject(t) && t.title == null && t.src ? { ...t, title: humanize(String(t.src).replace(/^@/, '')) } : t));
    apps.music.enabled ??= true;
  }
  if (apps.notes) apps.notes.enabled ??= true;
  if (apps.coupons) apps.coupons.enabled ??= true;
  if (config.scene?.corkboard) config.scene.corkboard = expandList(config.scene.corkboard, images, (id) => ({ photo: `@${id}` }), CAPS.corkboard, 'memories board', notes);
  if (Array.isArray(config.finale?.reveal)) {
    config.finale.reveal = config.finale.reveal.filter((block) => {
      if (block?.type !== 'photos') return true;
      block.items = expandList(block.items, images, (id) => `@${id}`, CAPS.photos, 'ending photos', notes);
      if (Array.isArray(block.items) && block.items.length === 0) { notes.push('the ending has a photos block but there are no pictures in media/, so it was left out'); return false; }
      return true;
    });
  }

  // ---- games that use pictures: "image": "@any" and "faces": "@all"
  for (const day of config.days) {
    const p = day?.game?.params;
    if (!p) continue;
    if (p.image === '@any') p.image = images.length ? `@${images[0]}` : p.image;
    if (p.faces === '@all') p.faces = images.slice(0, Math.min(p.pairs ?? 6, 15)).map((id) => `@${id}`);
  }

  // ---- forgiving references: canonicalise every "@name" outside the people and the story text
  const refProblems = [];
  const canon = (value, path) => {
    if (typeof value === 'string') {
      if (!REF.test(value)) return value;
      const id = slugify(value.slice(1));
      if (!slots[id]) refProblems.push({ path, ref: value, suggestion: suggest(id, Object.keys(slots)) });
      return `@${id}`;
    }
    if (Array.isArray(value)) return value.map((v, i) => canon(v, `${path}[${i}]`));
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, canon(v, path ? `${path}.${k}` : k)]));
    return value;
  };
  for (const key of Object.keys(config)) {
    if (['people', 'story', 'meta'].includes(key)) continue;
    config[key] = canon(config[key], key);
  }

  // ---- the owner's own notes about a file (alt text for pictures) merge into the slot list
  const given = isObject(raw?.assets) ? raw.assets : {};
  const assets = {};
  for (const slot of Object.values(slots)) {
    const note = given[slot.id] ?? {};
    assets[slot.id] = { type: slot.type, alt: note.alt ?? humanize(slot.id), file: slot.file, posterFile: slot.poster };
  }
  for (const id of Object.keys(given)) if (!slots[id]) refProblems.push({ path: `assets.${id}`, ref: `@${id}`, suggestion: suggest(id, Object.keys(slots)), listed: true });
  delete config.assets; // the build step writes the real list (with hashed file names) from `assets`

  return { config, assets, refProblems, notes };
}
