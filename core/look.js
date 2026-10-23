// Loads a SKIN (the look) onto a gift root: core base styles, the skin's tokens and part rules, its fx and copy.
//   skins/<id>/skin.json -> tokens.css + parts.css + index.js (fx, copy)
// Sets data-gift and data-skin on the root. Returns what a product needs: fx and the skin's copy overrides.
import { ensureCss } from './util.js';
import { createFx } from './fx.js';
import { CONTRACT_VERSION, FX_EVENTS } from './contract.js';

const SKINS_BASE = new URL('../skins/', import.meta.url);

export async function loadLook(skinId, { root, store, skinsBase = SKINS_BASE } = {}) {
  if (!root) throw new Error('loadLook: { root } is required');
  const folder = new URL(`${skinId}/`, skinsBase);
  const res = await fetch(new URL('skin.json', folder));
  if (!res.ok) throw new Error(`Skin "${skinId}" not found (skin.json missing)`);
  const manifest = await res.json();
  if (manifest.contractVersion !== CONTRACT_VERSION) throw new Error(`skin "${skinId}" targets contract v${manifest.contractVersion}, the core is v${CONTRACT_VERSION}`);

  // order matters: core defaults first, then the skin on top
  await ensureCss(new URL('./core.css', import.meta.url).href);
  for (const f of manifest.styles) await ensureCss(new URL(f, folder).href);
  const skin = (await import(new URL(manifest.entry, folder).href)).default;
  for (const ev of FX_EVENTS) if (!(ev in (skin.fx || {}))) console.warn(`[skin ${skinId}] fx.${ev} not defined (silent)`);

  root.dataset.gift = '';
  root.dataset.skin = manifest.id;
  return { id: manifest.id, manifest, copy: skin.copy || {}, fx: createFx(skin.fx, root, store) };
}
