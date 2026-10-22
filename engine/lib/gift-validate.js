// VALIDATE: check a normalized gift against everything the runtime will need, and say what is wrong in plain words.
//
// Errors stop a build (the gift would break or look wrong). Warnings are things a careful person would still want to know
// (the sample names are still in, a night has no story, a file is heavy). Every message names the place in gift.json and,
// where possible, how to fix it.
import { validate } from '../../core/validate.js';
import { deepTemplate } from '../../core/util.js';
import { assignFragments } from '../../core/fragments.js';
import { ALL_ROLE_IDS, FINALE_VARIANTS } from '../../core/roles.js';
import { suggest } from './gift-normalize.js';

const TIERS = ['spark', 'countdown', 'signature'];
const MODES = ['all', 'sequential', 'date'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Turn a schema validator message ("days[2].params.answer: required") into something a gift owner can act on. */
function plain(message) {
  return message
    .replace(/: required$/, ': this is missing')
    .replace(/: expected (\w+)(?: or \w+)*, got (\w+)/, (m, want, got) => `: should be ${want}, but it is ${got}`)
    .replace(/: allows at most (\d+) items/, ': too many (the most it can show is $1)')
    .replace(/: needs at least (\d+) items/, ': needs at least $1');
}

/**
 * @param config   the normalized config
 * @param context  { registry, catalog: { themes, skins, skinWorlds }, assets (from normalizeGift), refProblems, issues (media issues),
 *                   lenient (preview: missing media is a warning, not an error) }
 * @returns { errors: string[], warnings: string[], notes: string[] }
 */
export function validateGift(config, { registry, catalog, assets = {}, refProblems = [], issues = [], lenient = false }) {
  const errors = [];
  const warnings = [];
  const notes = [];
  // "days[5].game.params.image" -> "night 6 (jigsaw) image": say where in the gift's own words
  const nightOf = (path) => path.replace(/^days\[(\d+)\](.*)$/, (m, i, rest) => {
    const d = config.days[Number(i)];
    if (!d) return m;
    const tail = rest.replace(/^\.game\.params/, '').replace(/^\.game/, '').replace(/^\./, ' ').replace(/\./g, ' ');
    return `night ${d.day}${d.game?.type ? ` (${d.game.type})` : ''}${tail}`;
  });
  const err = (where, msg) => errors.push(`${nightOf(where)}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${nightOf(where)}: ${msg}`);

  // ---- media problems found while scanning the folder
  for (const i of issues) (i.level === 'error' ? errors : i.level === 'warning' ? warnings : notes).push(`media/${i.file}: ${i.message}`);
  for (const p of refProblems) {
    const hint = p.suggestion ? ` Did you mean @${p.suggestion}?` : '';
    const text = p.ref === '@any' ? 'this needs a picture, and there are no pictures in the media folder yet.'
      : p.listed ? `"${p.ref}" has notes in "assets" but there is no such file in the media folder.${hint}`
        : `${p.ref} is used here but there is no file with that name in the media folder.${hint}`;
    // a preview shows a placeholder picture for a missing file, so it only warns; a build refuses
    (lenient ? warn : err)(p.path, lenient ? `${text} (the preview shows a stand-in picture)` : text);
  }

  // ---- meta
  const { meta = {}, people = {}, schedule = {}, days = [], finale = {}, apps = {} } = config;
  if (!TIERS.includes(meta.tier)) err('meta.tier', `must be one of ${TIERS.join(', ')} (it is "${meta.tier}")`);
  if (!catalog.themes.includes(meta.theme)) err('meta.theme', `"${meta.theme}" does not exist. Choose one of: ${catalog.themes.join(', ')}.${suggest(String(meta.theme), catalog.themes) ? ` Did you mean ${suggest(String(meta.theme), catalog.themes)}?` : ''}`);
  if (!catalog.skins.includes(meta.skin)) err('meta.skin', `"${meta.skin}" does not exist. Choose one of: ${catalog.skins.join(', ')}.${suggest(String(meta.skin), catalog.skins) ? ` Did you mean ${suggest(String(meta.skin), catalog.skins)}?` : ''}`);
  else if (catalog.themes.includes(meta.theme) && !(catalog.skinWorlds[meta.skin] ?? []).includes(meta.theme)) {
    warn('meta.skin', `the "${meta.skin}" skin has no artwork for the "${meta.theme}" theme yet, so the room will look plain.`);
  }
  if (!meta.giftId) err('meta.giftId', 'is missing');

  // ---- people
  for (const who of ['recipient', 'sender']) if (typeof people[who] !== 'string' || !people[who].trim()) err(`people.${who}`, 'is missing. This is the name used throughout the gift.');
  if (people.recipient === 'Aria' && people.sender === 'Sam') warn('people', 'these are still the sample names (Aria and Sam).');
  const vars = { recipient: people.recipient ?? '', sender: people.sender ?? '' };

  // ---- schedule
  if (!MODES.includes(schedule.mode)) err('schedule.mode', `must be one of ${MODES.join(', ')}`);
  if (schedule.mode === 'date') {
    if (!DATE.test(schedule.startDate ?? '')) err('schedule.startDate', 'needs a date like 2026-12-01 when the schedule is "date"');
    if (!DATE.test(schedule.finaleDate ?? '')) err('schedule.finaleDate', 'needs a date like 2026-12-11 when the schedule is "date" (the day the final surprise opens)');
    if (DATE.test(schedule.startDate ?? '') && DATE.test(schedule.finaleDate ?? '')) {
      const span = (Date.parse(schedule.finaleDate) - Date.parse(schedule.startDate)) / 86400000;
      if (span < days.length) warn('schedule', `${days.length} nights starting ${schedule.startDate} run to ${days.length ? new Date(Date.parse(schedule.startDate) + (days.length - 1) * 86400000).toISOString().slice(0, 10) : schedule.startDate}, but the finale is ${schedule.finaleDate}: the finale would open before the last night.`);
    }
  }

  // ---- days
  if (meta.tier === 'spark' && days.length) warn('days', 'a Spark gift has no nights; these are ignored.');
  if (meta.tier !== 'spark' && days.length === 0) err('days', 'a Countdown or Signature gift needs at least one night.');
  if (meta.tier === 'signature' && days.length > 0 && days.length < 5) warn('days', `a Signature gift is meant for about ten nights (it has ${days.length}); the room grows once per night.`);
  const seen = new Set();
  days.forEach((d, i) => {
    const w = `days[${i}]`;
    if (!Number.isInteger(d?.day)) return err(w, '"day" must be a whole number (1, 2, 3 ...)');
    if (seen.has(d.day)) err(w, `night ${d.day} appears twice`);
    seen.add(d.day);
    const el = registry[d.game?.type];
    if (!d.game?.type) return err(`${w}.game`, 'needs a "type", for example "wordle"');
    if (!el || el.kind !== 'game') {
      const games = Object.values(registry).filter((e) => e.kind === 'game').map((e) => e.id);
      return err(`${w}.game.type`, `"${d.game.type}" is not a game. Choose one of: ${games.join(', ')}.${suggest(d.game.type, games) ? ` Did you mean ${suggest(d.game.type, games)}?` : ''}`);
    }
    for (const m of validate(el.paramsSchema, deepTemplate(d.game.params ?? {}, vars), `night ${d.day} (${el.id})`)) errors.push(plain(m).replace(/^(night \d+ \([\w-]+\))\./, '$1 '));
    if (meta.tier === 'signature' && !d.story) warn(w, `night ${d.day} has no "story" (the card shown when it is finished).`);
    else if (d.story && (!d.story.title || !d.story.text)) err(`${w}.story`, 'needs both a "title" and a "text"');
  });
  if (days.length) { try { assignFragments(days); } catch (e) { err('days', e.message); } }
  if (config.story?.intro && (!config.story.intro.title || !config.story.intro.text)) err('story.intro', 'needs both a "title" and a "text"');
  if (meta.tier === 'signature' && !config.story?.intro) warn('story', 'there is no opening "intro" for the ten nights.');

  // ---- finale
  if (!['vault', 'reveal'].includes(finale.type ?? 'vault')) err('finale.type', 'must be "vault" or "reveal"');
  if (!Array.isArray(finale.reveal) || !finale.reveal.length) err('finale.reveal', 'needs at least one block (a headline, a letter, photos or a video)');
  else {
    if (finale.variant && !FINALE_VARIANTS.includes(finale.variant)) err('finale.variant', `"${finale.variant}" is not an ending style. Choose one of: ${FINALE_VARIANTS.join(', ')}.`);
    const reveal = registry.reveal;
    for (const m of validate(reveal.paramsSchema, { blocks: finale.reveal, ...(finale.variant ? { variant: finale.variant } : {}) }, 'finale')) errors.push(plain(m));
    finale.reveal.forEach((b, i) => {
      if (b?.type === 'video' && b.ref && assets[b.ref.slice(1)] && assets[b.ref.slice(1)].type !== 'video') err(`finale.reveal[${i}].ref`, `${b.ref} is not a video file`);
      if (b?.type === 'video' && !b.ref) err(`finale.reveal[${i}]`, 'a video block needs a "ref" such as "@our_video"');
    });
  }

  // ---- apps and scene (each uses the matching element's own schema)
  for (const id of ['coupons', 'music', 'gallery', 'notes']) {
    const a = apps[id];
    if (!a?.enabled) continue;
    const key = id === 'music' ? 'tracks' : 'items';
    if (!Array.isArray(a[key]) || !a[key].length) {
      err(`apps.${id}.${key}`, id === 'music' ? 'there are no songs. Put MP3 or M4A files in the media folder, or list them.' : id === 'gallery' ? 'there are no photos. Put pictures in the media folder, or list them.' : 'has nothing in it.');
      continue;
    }
    for (const m of validate(registry[id].paramsSchema, { [key]: a[key] }, `apps.${id}`)) errors.push(plain(m));
    if (id === 'music') a.tracks.forEach((t, i) => { if (t?.src && assets[t.src.slice(1)] && assets[t.src.slice(1)].type !== 'audio') err(`apps.music.tracks[${i}].src`, `${t.src} is not a song (use MP3 or M4A)`); });
    if (id === 'gallery') a.items.forEach((t, i) => { if (t?.photo && assets[t.photo.slice(1)] && assets[t.photo.slice(1)].type !== 'image') err(`apps.gallery.items[${i}].photo`, `${t.photo} is not a picture`); });
  }
  for (const [i, p] of (config.scene?.corkboard ?? []).entries()) for (const m of validate(registry.polaroid.paramsSchema, { photo: p?.photo, caption: p?.caption, back: p?.back, tilt: p?.tilt }, `scene.corkboard[${i}]`)) errors.push(plain(m));

  // ---- roles
  const roles = config.roles ?? {};
  for (const key of ['exclude', 'include']) {
    for (const r of roles[key] ?? []) if (!ALL_ROLE_IDS.includes(r)) err(`roles.${key}`, `"${r}" is not a role. Roles are: ${ALL_ROLE_IDS.join(', ')}.`);
  }
  for (const r of Object.keys(roles.unlockDay ?? {})) if (!ALL_ROLE_IDS.includes(r)) err('roles.unlockDay', `"${r}" is not a role`);

  // ---- things a careful person would still want to know
  const leftovers = [];
  const scan = (v, path) => {
    if (typeof v === 'string') { if (/^Write your /i.test(v) || /placeholder/i.test(v)) leftovers.push(path); }
    else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`));
    else if (isObject(v)) for (const [k, x] of Object.entries(v)) scan(x, path ? `${path}.${k}` : k);
  };
  scan({ days, finale, apps, story: config.story, scene: config.scene }, '');
  if (leftovers.length) warn('text', `${leftovers.length} text(s) still look like instructions or placeholders, for example ${leftovers.slice(0, 3).map(nightOf).join(', ')}.`);

  const used = new Set(JSON.stringify(config).match(/@[a-z0-9_]+/g)?.map((s) => s.slice(1)));
  const unused = Object.keys(assets).filter((id) => !used.has(id));
  if (unused.length) notes.push(`${unused.length} file(s) in media/ are not used anywhere: ${unused.slice(0, 6).map((u) => `@${u}`).join(', ')}${unused.length > 6 ? ' ...' : ''}`);
  return { errors, warnings, notes };
}
