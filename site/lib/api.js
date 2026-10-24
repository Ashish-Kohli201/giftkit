// The storefront's only door to the backend (backend/, an Apps Script web app). Everything the site needs from a server goes through here,
// so the screens never know whether they are talking to the real backend or to DEMO MODE.
//
//   const shop = createShop(config);
//   const draft = await shop.createDraft(productId);                      -> { id, token }
//   const file  = await shop.uploadFile(draft, blob, 'image', onProgress) -> { id, type, url }
//   const order = await shop.createOrder(draft, { options, contact })     -> { orderId, amount, upi: { vpa, name, minSeconds, payWindowSeconds } }
//   const done  = await shop.pay(order, { ui })                           -> { status: 'provisional' | 'paid' | 'revoked', link, orderId }
//   const now   = await shop.status(orderId)                              -> { status, link }   (the thank-you screen keeps asking)
//
// `ui.upi(order)` is the screen that shows the UPI QR and waits for the customer to say "I have paid" (the builder provides it).
//
// DEMO MODE (config.api is empty): files stay on this phone as blob: URLs, "payment" is a short pause and no link exists.
// REAL MODE: talks to the Apps Script web app at config.api. Apps Script cannot read headers or send HTTP errors, so every call is plain
// HTTP 200 with JSON { ok, ... }, and POSTs are sent as text/plain (a "simple" request: the browser needs no CORS preflight).
// The price is never sent: the server works it out from the product's manifest.
import { getIp } from './ip.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function createShop(config) {
  return config.api ? createRealShop(config.api) : createDemoShop();
}

// ---------------------------------------------------------------- demo
function createDemoShop() {
  return {
    demo: true,
    async createDraft(productId) { return { id: newId('d'), token: '', productId }; },
    async uploadFile(_draft, file, type, onProgress) {
      for (const p of [0.3, 0.7, 1]) { onProgress?.(p); await sleep(120); }
      return { id: newId('m'), type, url: URL.createObjectURL(file) };
    },
    // quote: the price, only so the demo has an amount to show. The real backend ignores anything like it and prices the order itself.
    async createOrder(_draft, { quote }) {
      return { orderId: newId('o'), amount: quote, upi: { vpa: 'demo@upi', name: 'Demo only - no money moves', minSeconds: 2, payWindowSeconds: 300 } };
    },
    async pay(order, { ui }) {
      await ui.upi(order);
      await sleep(900);
      return { status: 'provisional', link: '', orderId: order.orderId };
    },
    async status() { return { status: 'provisional', link: '' }; },
  };
}

// ---------------------------------------------------------------- real backend (Apps Script)
const UNREACHABLE = 'We could not reach the server. Check your connection and try again.';

function createRealShop(base) {
  async function unwrap(request) {
    let json;
    try { json = await (await request).json(); } catch { throw new Error(UNREACHABLE); }
    if (!json.ok) throw new Error(json.message || 'Something went wrong. Nothing was charged. Please try again.');
    return json;
  }
  const post = (action, payload = {}) => unwrap(fetch(base, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...payload }) }));
  const get = (action, params = {}) => unwrap(fetch(`${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams({ action, ...params })}`));

  /** A chunk of a file as base64 text (what travels inside the JSON). */
  const base64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(blob);
  });

  return {
    demo: false,
    createDraft: (productId) => post('createDraft', { productId }),
    /** Files go up in chunks of about 1.5 MB (the backend says exactly how big); the last chunk finishes the file. */
    async uploadFile(draft, file, type, onProgress) {
      const start = await post('uploadStart', { draftId: draft.id, token: draft.token, type, mime: file.type, bytes: file.size });
      let offset = 0;
      let last;
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + start.chunkBytes);
        last = await post('uploadChunk', { uploadId: start.uploadId, token: draft.token, offset, data: await base64(chunk) });
        offset += chunk.size;
        onProgress?.(offset / file.size);
      }
      return { id: last.id, type, url: URL.createObjectURL(file) };
    },
    // the buyer's own address travels with the order only so "tell me when it is opened" can tell it is someone else opening the gift
    createOrder: async (draft, { options, contact }) => post('createOrder', { draftId: draft.id, token: draft.token, options, contact, ip: await getIp() }),
    status: (orderId) => get('status', { orderId }),
    /** The customer pays our UPI ID and says so; the backend opens the link on trust and checks the bank's email (docs/spark/UPI.md). */
    async pay(order, { ui }) {
      await ui.upi(order);
      const claim = await post('claim', { orderId: order.orderId });
      return { status: claim.status, link: claim.link, orderId: order.orderId };
    },
  };
}
