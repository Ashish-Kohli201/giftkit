// The page a recipient (or the live preview) opens. It starts one product with one gift's values.
//   ?product=<id>          which product (folder under products/)
//   ?gift=<url>            a JSON file { product, options, media } (production: the backend's /api/gifts/<slug>)
//   ?skin=<id>             preview only: try another look
//   ?preview=1             preview mode: the product's sample values, stand-ins for missing files, and it listens for
//                          postMessage({ type: 'options', options, media }) from the page that embeds it (the storefront or the playground)
// It tells the embedding page what happened: postMessage({ type: 'gift', event: 'ready' | 'opened' | 'finished' | 'error', message? }).
import { startProduct } from '../core/product.js';

const query = new URL(location.href).searchParams;
const root = document.getElementById('gift-root');
const preview = query.get('preview') === '1';
// the page around (if any) hears it by postMessage; the page itself also records the last event, so tests can read it
const tell = (event, extra = {}) => {
  document.documentElement.dataset.giftEvent = event;
  if (parent !== window) parent.postMessage({ type: 'gift', event, ...extra }, location.origin);
};

async function readJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

try {
  let gift = query.get('gift') ? await readJson(query.get('gift')) : {};
  const productId = gift.product ?? query.get('product');
  if (!productId) throw new Error('Open this page with ?product=<id> (or ?gift=<url>)');
  if (!gift.options && preview) gift = { ...gift, ...(await readJson(new URL(`../products/${productId}/sample.json`, location.href))) };

  const options = { ...(gift.options ?? {}), ...(preview && query.get('skin') ? { skin: query.get('skin') } : {}) };
  const running = await startProduct({
    root, productId, options, media: gift.media ?? {}, preview,
    hooks: { onReady: () => tell('ready'), onOpened: () => tell('opened'), onFinished: () => tell('finished') },
  });

  // live preview: the embedding page sends new values as the customer types
  if (preview) {
    addEventListener('message', async (e) => {
      if (e.origin !== location.origin || e.source !== parent || e.data?.type !== 'options') return;
      try {
        if (e.data.media) running.setMedia?.(e.data.media);
        await running.setOptions(e.data.options ?? {});
      } catch (err) { tell('error', { message: String(err.message || err) }); }
    });
  }
} catch (err) {
  console.error(err);
  tell('error', { message: String(err.message || err) });
  const p = document.createElement('p');
  p.textContent = preview ? String(err.message || err) : 'This gift cannot be opened right now.';
  p.style.cssText = 'color:#fff;font:16px system-ui;padding:24px;text-align:center';
  root.replaceChildren(p);
}
