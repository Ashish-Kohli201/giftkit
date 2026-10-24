// YouPI-PG webhook checking (https://github.com/youpi-pg/YouPI-PG). Pure functions on Web Crypto: no DOM, no Node-only imports,
// so the very same file runs in the backend Worker and in the tests.
//
// YouPI confirms a payment by reading the bank's SMS or email alert, so a confirmation is only as good as that alert. These checks
// are the safeguards we control: the signature proves the message came from our own YouPI server, and the order check proves it is
// for THIS order and for exactly the amount WE priced. Browser events from youpi.js are never used to deliver a gift.
//
//   const ok = await verifySignature(rawBody, headers['x-gateway-signature'], env.YOUPI_WEBHOOK_SECRET);
//   const result = checkPayment(JSON.parse(rawBody), order);   // { ok: true, utr } or { ok: false, reason }
//
// The backend must also: use the raw request bytes for the signature (never re-serialised JSON), ignore a paymentId it has already
// handled (webhooks repeat), and keep every webhook it received so a payment can be reconciled against the bank statement by hand.
const encoder = new TextEncoder();

/** Hex of HMAC-SHA256(secret, body). */
export async function sign(rawBody, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, typeof rawBody === 'string' ? encoder.encode(rawBody) : rawBody));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare two strings in time that does not depend on where they differ. */
function sameString(a, b) {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Is `header` ("sha256=<hex>", the X-Gateway-Signature header) the signature of `rawBody` under `secret`?
 * An empty secret never verifies, so a forgotten setting cannot let every request through.
 */
export async function verifySignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  return sameString(header, `sha256=${await sign(rawBody, secret)}`);
}

/**
 * Does a (signature-verified) webhook payload settle our order?
 * @param payload  the parsed webhook body: { event, orderId, paymentId, amountPaise, currency, method, utr }
 * @param order    OUR record: { id, amountPaise } where amountPaise is what the server priced (never what the browser said)
 */
export function checkPayment(payload, order) {
  if (payload?.event !== 'SUCCESS') return { ok: false, reason: `event is ${payload?.event ?? 'missing'}, not SUCCESS` };
  if (payload.orderId !== order.id) return { ok: false, reason: 'the payment is for a different order' };
  if (!payload.paymentId) return { ok: false, reason: 'the payment has no id' };
  if ((payload.currency ?? 'INR') !== 'INR') return { ok: false, reason: `unexpected currency ${payload.currency}` };
  if (!Number.isInteger(payload.amountPaise) || payload.amountPaise !== order.amountPaise) {
    return { ok: false, reason: `paid ${payload.amountPaise} paise, order is ${order.amountPaise}` };
  }
  if (!payload.utr) return { ok: false, reason: 'no bank reference (UTR), so it cannot be reconciled' };
  return { ok: true, paymentId: payload.paymentId, utr: payload.utr, method: payload.method ?? 'UPI' };
}
