// Loads a THEME (the world's setup) combined with a SKIN (the look). See docs/WORLD_CONTRACT.md.
//   theme: themes/<id>/theme.json -> layout.css + index.js (world copy and mount)
//   skin : skins/<id>/skin.json   -> tokens.css, parts.css, index.js (fx, copy, decorate)
//          + the paint for this theme: skin.worlds[<theme>] = { styles: [...], module: "decorate-<theme>.js" }
// Sets data-theme and data-skin on the gift root, wires fx + dialogs, and returns the combined object the engine uses.
import { ensureCss, template } from './util.js';
import { createFx } from './fx.js';
import { createDialogs } from './dialogs.js';
import { CONTRACT_VERSION, DEFAULT_SHELL_COPY, FX_EVENTS } from './contract.js';

const THEMES_BASE = new URL('../themes/', import.meta.url);
const SKINS_BASE = new URL('../skins/', import.meta.url);

async function fetchManifest(kind, id, base) {
  const folder = new URL(`${id}/`, base);
  const res = await fetch(new URL(`${kind}.json`, folder));
  if (!res.ok) throw new Error(`${kind === 'theme' ? 'Theme' : 'Skin'} "${id}" not found (${kind}.json missing)`);
  const manifest = await res.json();
  if (manifest.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`${kind} "${id}" targets contract v${manifest.contractVersion}, engine is v${CONTRACT_VERSION}`);
  }
  return { folder, manifest };
}

export async function loadTheme(themeId, { skinId, root, store, themesBase = THEMES_BASE, skinsBase = SKINS_BASE } = {}) {
  if (!root) throw new Error('loadTheme: { root } is required');
  if (!skinId) throw new Error('loadTheme: { skinId } is required (a gift config needs meta.skin)');
  const theme = await fetchManifest('theme', themeId, themesBase);
  const skin = await fetchManifest('skin', skinId, skinsBase);

  // order matters: core defaults, the shared world base, then the theme's geometry, then the skin (tokens, element parts, paint for this theme)
  await ensureCss(new URL('../core/core.css', import.meta.url).href);
  await ensureCss(new URL('../core/world.css', import.meta.url).href);
  for (const f of theme.manifest.styles) await ensureCss(new URL(f, theme.folder).href);
  for (const f of skin.manifest.styles) await ensureCss(new URL(f, skin.folder).href);
  const paint = skin.manifest.worlds?.[themeId];
  for (const f of paint?.styles ?? []) await ensureCss(new URL(f, skin.folder).href);

  const skinMod = (await import(new URL(skin.manifest.entry, skin.folder).href)).default;
  const themeMod = (await import(new URL(theme.manifest.entry, theme.folder).href)).default;
  const decorateWorld = paint?.module ? (await import(new URL(paint.module, skin.folder).href)).default : undefined;

  for (const ev of FX_EVENTS) if (!(ev in (skinMod.fx || {}))) console.warn(`[skin ${skinId}] fx.${ev} not defined (silent)`);
  root.dataset.theme = theme.manifest.id;
  root.dataset.skin = skin.manifest.id;

  const copy = skinMod.copy || {};
  return {
    id: theme.manifest.id,
    skinId: skin.manifest.id,
    manifest: skin.manifest,
    themeManifest: theme.manifest,
    /** The world's shell interface; the skin's decorateWorld hook (if any) is handed to the engine. */
    shell: { mount: (shellRoot, opts) => themeMod.mount(shellRoot, { ...opts, decorateWorld }) },
    /** Element copy ("wordle.win" ...) comes from the skin. */
    copy,
    decorate: skinMod.decorate,
    fx: createFx(skinMod.fx, root, store),
    dialogs: skinMod.dialogs || createDialogs(root),
    /** Shell microcopy: skin "shell.<theme>.<key>" > skin "shell.<key>" > theme "shell.<key>" > core default. */
    shellCopy: (key, vars = {}) => template(
      copy[`shell.${themeId}.${key}`] ?? copy[`shell.${key}`] ?? themeMod.copy?.[`shell.${key}`] ?? DEFAULT_SHELL_COPY[key] ?? key, vars),
  };
}
