// The product host: the one place a product is started. It checks the customer's options against the product's manifest,
// loads the look (skin), builds the ctx a product mounts with, and re-renders when the options change (live preview).
//
//   const gift = await startProduct({ root, productId: 'envelope', options, media, skinId, base });
//   gift.setOptions({ ...options, message: 'new words' });   // live preview: the product updates (or remounts)
//   gift.destroy();
//
// A product is products/<id>/product.json (what the customer fills in, the price) plus products/<id>/index.js whose default
// export is `{ mount(root, ctx) }` (see docs/spark/PRODUCT_GUIDE.md). Products never fetch, never build URLs and never read storage:
// everything arrives on ctx.
import { loadLook } from './look.js';
import { createStore } from './store.js';
import { createResolver } from './resolver.js';
import { checkManifest, normalizeOptions } from './options.js';
import { part, reducedMotion } from './util.js';

const PRODUCTS_BASE = new URL('../products/', import.meta.url);
const placeholders = createResolver({ placeholders: true });

/** Only same-site paths and https/http URLs are ever used as a file address (never javascript: or data: from a customer). A preview may also use blob: (a file just picked on this phone). */
const safeUrl = (url, base, allowBlob = false) => {
  try { const u = new URL(url, base); return (/^https?:$/.test(u.protocol) || (allowBlob && u.protocol === 'blob:')) ? u.href : ''; } catch { return ''; }
};

/**
 * @param opts.root       element that hosts the gift (gets data-gift + data-skin)
 * @param opts.productId  folder name under products/
 * @param opts.options    the customer's values (see core/options.js)
 * @param opts.media      { [id]: { type, url, alt?, poster? } } the customer's uploaded files
 * @param opts.skinId     the look; defaults to the product's first listed skin
 * @param opts.preview    true = lenient (missing pictures get stand-ins, nothing is saved)
 * @param opts.hooks      { onReady, onOpened, onFinished } for the page around the product (analytics-free: it is only the host's messages)
 */
export async function startProduct({ root, productId, options = {}, media = {}, skinId, base = location.href, preview = false, hooks = {} }) {
  const folder = new URL(`${productId}/`, PRODUCTS_BASE);
  const res = await fetch(new URL('product.json', folder));
  if (!res.ok) throw new Error(`Product "${productId}" not found (product.json missing)`);
  const manifest = await res.json();
  const problems = checkManifest(manifest);
  if (problems.length) throw new Error(`Product "${productId}" is not valid:\n - ${problems.join('\n - ')}`);
  const module = (await import(new URL('index.js', folder).href)).default;

  const store = createStore(`product:${productId}`, { persist: !preview });
  // the look is chosen by the customer's "skin" option (if the product has one), else by opts.skinId, else the product's first skin
  let look;
  const wantedSkin = (opts) => (manifest.skins.includes(opts.skin) ? opts.skin : skinId ?? manifest.skins[0]);

  // ---- files: the product asks for an id, the host answers with a checked URL (or, in a preview, a stand-in)
  const files = {};
  function setFiles(map) {
    for (const id of Object.keys(files)) delete files[id];
    for (const [id, f] of Object.entries(map)) {
      const url = safeUrl(f.url, base, preview);
      if (url) files[id] = { id, type: f.type || 'image', url, alt: f.alt || '', poster: f.poster ? safeUrl(f.poster, base, preview) : undefined };
    }
  }
  setFiles(media);
  const mediaApi = {
    get: (id) => files[id],
    url: (id) => files[id]?.url ?? '',
    /** Async lookup that also gives previews a stand-in picture or tune, so a product can be built before any upload exists. */
    async resolve(id, opts = {}) {
      if (files[id]) return files[id];
      if (preview) return placeholders.resolve(id, opts);
      throw new Error(`File "${id}" is not available`);
    },
  };

  let current = normalize(options);
  look = await loadLook(wantedSkin(current), { root, store });
  let instance;
  let optionHandler = null;
  const stage = part('div', 'stage');
  root.replaceChildren(stage);

  function normalize(raw) {
    const { options: clean, errors } = normalizeOptions(manifest, raw);
    // a real gift must be complete; a preview shows whatever the customer has typed so far
    if (!preview && Object.keys(errors).length) throw new Error(`Options are not valid: ${Object.values(errors).join('; ')}`);
    return clean;
  }

  async function mount() {
    optionHandler = null;
    if (wantedSkin(current) !== look.id) look = await loadLook(wantedSkin(current), { root, store });
    const ctx = {
      options: current,
      media: mediaApi,
      look: { id: look.id, copy: look.copy, fx: look.fx },
      reducedMotion: reducedMotion(),
      preview,
      store,
      /** Register a function that applies new options in place; without one, the host remounts the product. */
      onOptions(fn) { optionHandler = fn; },
      ready() { hooks.onReady?.(); },
      opened() { hooks.onOpened?.(); },
      finished() { hooks.onFinished?.(); },
    };
    stage.replaceChildren();
    instance = await module.mount(stage, ctx);
  }
  await mount();

  return {
    manifest,
    get skinId() { return look.id; },
    get options() { return current; },
    /** Replace the customer's uploaded files (live preview: a file was just picked). Call setOptions afterwards to redraw. */
    setMedia: setFiles,
    async setOptions(raw) {
      current = normalize(raw);
      if (optionHandler && wantedSkin(current) === look.id) optionHandler(current);
      else { instance?.destroy?.(); await mount(); }
    },
    destroy() { instance?.destroy?.(); root.replaceChildren(); },
  };
}
