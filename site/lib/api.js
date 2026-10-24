// The storefront's only door to the backend (docs/spark/BACKEND.md). Everything the site needs from a server goes through here,
// so the screens never know whether they are talking to the real backend or to DEMO MODE.
//
//   const shop = createShop(config);
//   const draft = await shop.createDraft(productId);                      -> { id, token }
//   const file  = await shop.uploadFile(draft, blob, 'image', onProgress) -> { id, type, url }
//   const order = await shop.createOrder(draft, { options, contact })     -> { orderId, ... }
//   const done  = await shop.pay(order, { contact })                      -> { status: 'paid' | 'pending', link, orderId }
//
// DEMO MODE (config.api is empty): files stay on this phone as blob: URLs, "payment" is a short pause and no link exists.
// REAL MODE: the calls follow the API table in docs/spark/BACKEND.md. The price is never sent: the server works it out.
import { payWithYoupi } from './pay-youpi.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function createShop(config) {
  return config.api ? createRealShop(config.api.replace(/\/$/, ''), config) : createDemoShop();
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
    async createOrder(_draft, { options }) { return { orderId: newId('o'), options }; },
    async pay(order) { await sleep(1600); return { status: 'paid', link: '', orderId: order.orderId }; },
  };
}

// ---------------------------------------------------------------- real backend
function createRealShop(base, config) {
  async function call(path, init = {}) {
    const res = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Something went wrong (${res.status}). Please try again.`);
    }
    return res.json();
  }
  const auth = (draft) => ({ Authorization: `Bearer ${draft.token}` });

  /** PUT with progress (fetch cannot report upload progress, XHR can). */
  const put = (url, blob, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('The upload did not go through. Please try again.')));
    xhr.onerror = () => reject(new Error('The upload did not go through. Check your connection and try again.'));
    xhr.send(blob);
  });

  return {
    demo: false,
    createDraft: (productId) => call('/api/drafts', { method: 'POST', body: JSON.stringify({ productId }) }),
    async uploadFile(draft, file, type, onProgress) {
      const slot = await call(`/api/drafts/${draft.id}/uploads`, { method: 'POST', headers: auth(draft), body: JSON.stringify({ type, mime: file.type, bytes: file.size }) });
      await put(slot.uploadUrl, file, onProgress);
      return { id: slot.id, type, url: URL.createObjectURL(file) };
    },
    createOrder: (draft, { options, contact }) => call('/api/orders', { method: 'POST', headers: auth(draft), body: JSON.stringify({ draftId: draft.id, options, contact }) }),
    /**
     * Takes the payment with the configured provider (config.payments.provider: 'youpi' or 'razorpay'), then asks the backend
     * whether the order is confirmed. The backend decides, from the provider's signed webhook; the browser's own "success" never does.
     * Result: { status: 'paid', link } | { status: 'pending', review } (paid on screen, not confirmed yet), always with orderId.
     */
    async pay(order, { contact }) {
      const provider = config.payments?.provider ?? 'youpi';
      let review = false;
      if (provider === 'youpi') {
        const outcome = await payWithYoupi({ ...config.payments.youpi, order, contact, brand: config.brand });
        review = outcome === 'review';
      } else {
        await payWithRazorpay(order, contact);
      }
      if (review) return { status: 'pending', review: true, orderId: order.orderId, link: '' };
      // the webhook usually lands within seconds; YouPI reads a bank alert, which can take longer, so wait a while before saying "pending"
      const tries = Math.ceil((config.payments?.waitSeconds ?? 90) / 2);
      for (let i = 0; i < tries; i++) {
        const s = await call(`/api/orders/${order.orderId}/status`);
        if (s.status === 'ready' || s.status === 'delivered') return { status: 'paid', link: s.link, orderId: order.orderId };
        await sleep(2000);
      }
      return { status: 'pending', review: false, orderId: order.orderId, link: '' };
    },
  };
}

/** Razorpay Checkout: resolves when the customer has paid on screen, rejects if they close it. */
async function payWithRazorpay(order, contact) {
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  await new Promise((resolve, reject) => {
    const rz = new window.Razorpay({
      key: order.razorpayKeyId, order_id: order.razorpayOrderId, amount: order.amount, currency: 'INR', name: order.brand,
      prefill: { contact: contact.phone, email: contact.email || undefined }, theme: { color: '#1b1410' },
      handler: () => resolve(),
      modal: { ondismiss: () => reject(new Error('The payment was not completed.')) },
    });
    rz.open();
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not open the payment window. Check your connection.'));
    document.head.append(s);
  });
}
