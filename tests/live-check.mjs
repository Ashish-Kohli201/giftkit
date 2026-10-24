// Checks a DEPLOYED backend (the real Apps Script web app on real Google) the way the storefront uses it.
//   node tests/live-check.mjs <exec url> [email]
// It creates a draft, uploads a tiny picture through the real Drive path, places an order and reads its status. It never taps
// "I have paid", so no gift link is made and no email is sent; the order simply expires. Rows it creates are visible in your sheet.
// a fresh address every run: the backend allows one unconfirmed gift per person, so a reused address would be (rightly) refused
const [api, email = `live-check+${Date.now()}@example.com`] = process.argv.slice(2);
if (!api || !api.startsWith('https://script.google.com/')) {
  console.error('Usage: node tests/live-check.mjs https://script.google.com/macros/s/.../exec [email]');
  process.exit(1);
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const t0 = Date.now();
const lap = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

// the storefront's own style of call: text/plain POST (no preflight), GET with query parameters
const post = async (action, payload) => {
  const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...payload }) });
  return { res, json: await res.json() };
};
const get = async (action, params = {}) => {
  const res = await fetch(`${api}?${new URLSearchParams({ action, ...params })}`);
  return { res, json: await res.json() };
};

console.log('\n[the deployed backend]');
const health = await fetch(api).then((r) => r.json());
check(health.ok && health.service === 'fondly-backend', `it answers a health check (${lap()})`);

const draft = (await post('createDraft', { productId: 'cake' })).json;
check(draft.ok && draft.id && draft.token, `a draft is created (${draft.id})`);
check(!(await post('createDraft', { productId: 'nope' })).json.ok, 'an unknown product is refused politely');

const start = (await post('uploadStart', { draftId: draft.id, token: draft.token, type: 'image', mime: 'image/png', bytes: PNG.length })).json;
check(start.ok && start.uploadId, `a Drive upload session opens (${lap()})`);
const chunk = (await post('uploadChunk', { uploadId: start.uploadId, token: draft.token, offset: 0, data: PNG.toString('base64') })).json;
check(chunk.ok && chunk.done && chunk.id, `the picture reaches Drive and is recorded (${chunk.id ?? JSON.stringify(chunk)}, ${lap()})`);

const placed = (await post('createOrder', { draftId: draft.id, token: draft.token, amount: 1, options: { recipient: 'Live Check', message: 'Hello', photos: [chunk.id] }, contact: { email } })).json;
check(placed.ok && placed.orderId, `an order is placed: ${placed.orderId}`);
const cake = JSON.parse((await import('node:fs')).readFileSync(new URL('../products/cake/product.json', import.meta.url), 'utf8'));
check(placed.amount >= cake.price.base && placed.amount < cake.price.base + 100, `the SERVER priced it from the manifest, ignoring the amount we sent (${placed.amount / 100} rupees)`);
check(placed.upi?.vpa?.includes('@') && placed.upi.remindAfterSeconds > 0, `the UPI details and timings come back (${placed.upi?.vpa}, remind ${placed.upi?.remindAfterSeconds}s, revoke ${placed.upi?.revokeAfterSeconds}s)`);

// FIRST thing after placing the order: "I have paid" is refused for the first seconds. (Do this before anything slow: after about 15 seconds the
// backend rightly accepts the claim, and that would open a real provisional order, send emails and, ten minutes later, a revoke notice to the admin.)
const early = (await post('claim', { orderId: placed.orderId })).json;
check(!early.ok && /payment first/i.test(early.message), 'claiming straight away (before paying) is refused');
const status = (await get('status', { orderId: placed.orderId })).json;
check(status.ok && status.status === 'awaiting_payment' && status.link === '', 'its status is "awaiting_payment", with no link yet');
check((await get('gift', { slug: 'doesnotexist' })).json.error === 'missing', 'an unknown gift link answers "missing"');
check(!(await get('claim', { orderId: placed.orderId })).json.ok, 'a write over GET is refused');
check((await post('reply', { slug: 'doesnotexist', message: 'hi' })).json.message === 'This gift is no longer available.', 'a reply to an unknown gift is refused politely');
check((await post('opened', { slug: 'doesnotexist', ip: '1.2.3.4' })).json.ok === true, 'an "opened" report for an unknown gift answers ok and reveals nothing');

console.log(`\n${failures ? `FAILED - ${failures} check(s)` : 'OK - the deployed backend works'}`);
console.log(`Order ${placed.orderId} will expire by itself. Pay exactly ${(placed.amount / 100).toFixed(2)} only if you want to test it for real.`);
process.exit(failures ? 1 : 0);
