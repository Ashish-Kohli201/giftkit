// The storefront's only door to the backend (docs/spark/BACKEND.md). Everything the site needs from a server goes through here,
// so the screens never know whether they are talking to the real backend or to DEMO MODE.
//
//   const shop = createShop(config);
//   const draft = await shop.createDraft(productId);                      -> { id, token }
//   const file  = await shop.uploadFile(draft, blob, 'image', onProgress) -> { id, type, url }
//   const order = await shop.createOrder(draft, { options, contact })     -> { orderId, ... }
//   const done  = await shop.pay(order, { contact })                      -> { status: 'paid', link }
//
// DEMO MODE (config.api is empty): files stay on this phone as blob: URLs, "payment" is a short pause and no link exists.
// REAL MODE: the calls follow the API table in docs/spark/BACKEND.md. The price is never sent: the server works it out.
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
    async pay() { await sleep(1600); return { status: 'paid', link: '' }; },
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
    /** Opens Razorpay Checkout for the order, then waits for the backend to confirm it (the webhook is the only truth). */
    async pay(order, { contact }) {
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      await new Promise((resolve, reject) => {
        const rz = new window.Razorpay({
          key: order.razorpayKeyId, order_id: order.razorpayOrderId, amount: order.amount, currency: 'INR', name: config.brand,
          prefill: { contact: contact.phone, email: contact.email || undefined }, theme: { color: '#1b1410' },
          handler: () => resolve(),
          modal: { ondismiss: () => reject(new Error('The payment was not completed.')) },
        });
        rz.open();
      });
      // the thank-you screen waits until the webhook has marked the order paid and made the link
      for (let i = 0; i < 30; i++) {
        const s = await call(`/api/orders/${order.orderId}/status`);
        if (s.status === 'ready' || s.status === 'delivered') return { status: 'paid', link: s.link };
        await sleep(1500);
      }
      return { status: 'paid', link: '' };
    },
  };
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
