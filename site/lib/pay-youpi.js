// Checkout with a self-hosted YouPI-PG gateway (https://github.com/youpi-pg/YouPI-PG): its one-script modal shows the UPI QR and
// the app buttons on a phone. This file only opens that modal and reports what the browser saw.
//
// IMPORTANT: what the browser sees is NOT proof of payment. YouPI's own docs say browser events only update the screen. The gift is
// created by the backend when YouPI's signed webhook arrives (core/payments/youpi.js checks it); the site then asks the backend.
//
//   const outcome = await payWithYoupi({ host, key, order, contact });   // 'success' | 'review'; rejects on failed / closed
const loadingScripts = new Map();

function loadYoupi(host, key) {
  const src = `${host.replace(/\/$/, '')}/youpi.js`;
  if (!loadingScripts.has(src)) {
    loadingScripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.dataset.youpiKey = key; // the merchant key is public by design; the webhook secret never leaves the backend
      s.onload = resolve;
      s.onerror = () => { loadingScripts.delete(src); reject(new Error('Could not open the payment window. Check your connection and try again.')); };
      document.head.append(s);
    }));
  }
  return loadingScripts.get(src);
}

/** Wait (briefly) for the gateway's script to define window.Youpi after it has loaded. */
async function ready() {
  for (let i = 0; i < 50; i++) {
    if (typeof window.Youpi?.pay === 'function') return window.Youpi;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('The payment window did not start. Please try again.');
}

export async function payWithYoupi({ host, key, order, contact, brand }) {
  if (!host || !key) throw new Error('Payments are not set up yet. Please try again later.');
  await loadYoupi(host, key);
  const Youpi = await ready();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; removeEventListener('youpi:payment:suspicious', onReview); fn(value); };
    // a payment YouPI holds for a security check is not a failure: the customer paid, a person must look
    const onReview = (e) => { if (e.detail?.order_id === order.orderId) finish(resolve, 'review'); };
    addEventListener('youpi:payment:suspicious', onReview);

    Youpi.pay({
      order_id: order.orderId,
      amount: Number((order.amount / 100).toFixed(2)), // the server's price in paise, shown in rupees
      currency: 'INR',
      name: brand,
      customer: { phone: contact.phone.replace(/^\+91/, ''), email: contact.email || undefined },
      metadata: { orderId: order.orderId },
      handler: () => finish(resolve, 'success'),
      onFailed: (response) => finish(reject, new Error(response?.reason ? `The payment did not go through: ${response.reason}` : 'The payment did not go through. Nothing was charged.')),
      onClose: () => finish(reject, new Error('The payment was not completed.')),
    });
  });
}
