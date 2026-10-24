// Paying by UPI to our own account, with the gift delivered straight away and checked afterwards ("provisional delivery").
// Pure functions: no DOM, no network, no Node-only imports, so the same file runs in the browser, the backend Worker and the tests.
//
// The idea in one breath: the customer pays a UNIQUE amount (for example 149.37 instead of 149.00) to our UPI ID, taps "I have paid",
// and gets the gift link at once. The backend then looks for the bank's credit email, and a credit with exactly that amount settles
// exactly that order. If nothing is found, the customer gets a reminder and the link is switched off. See docs/spark/UPI.md.
//
// Order states:  awaiting_payment -> provisional (tapped "I have paid": link is live)  -> paid
//                                                                                      -> revoked (no payment found in time)
//                awaiting_payment -> expired (never tapped, the unique amount is freed)
//                revoked -> paid again if the money turns up late (the link is switched back on)

export const RULES = Object.freeze({
  payWindowMs: 5 * 60 * 1000,        // time to pay after the QR appears
  minSeconds: 15,                    // "I have paid" stays disabled this long (paying takes about this long, mindless taps do not)
  remindAfterMs: 5 * 60 * 1000,      // after "I have paid": nothing found yet, send a reminder
  revokeAfterMs: 10 * 60 * 1000,     // after "I have paid": still nothing, switch the link off
  restoreWindowMs: 24 * 60 * 60 * 1000, // a payment this late still settles a revoked order
  maxAmountOffsetPaise: 99,          // the unique amount is at most 99 paise above the price
});

const VPA = /^[a-z0-9._-]{2,}@[a-z][a-z0-9]{1,}$/i;

/** The UPI deep link every UPI app understands (also what the QR code carries). Amount in paise, shown in rupees. */
export function upiUri({ vpa, name, amountPaise, orderId, note }) {
  if (!VPA.test(vpa ?? '')) throw new Error('upiUri: the UPI ID looks wrong');
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error('upiUri: the amount must be a positive whole number of paise');
  const params = [
    ['pa', vpa], ['pn', name], ['am', (amountPaise / 100).toFixed(2)], ['cu', 'INR'],
    ['tn', note ?? `Order ${orderId}`], ['tr', orderId],
  ].filter(([, v]) => v != null && v !== '');
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/**
 * The amount THIS order will pay: the price, plus the smallest number of paise (0 to 99) that no other open order is using.
 * Two open orders can never share an amount, so a credit of that amount can only mean one order.
 * @param takenPaise  amounts (in paise) of orders that are still waiting or provisional
 * @returns the amount in paise, or null if all 100 are taken (ask the customer to wait a minute)
 */
export function uniqueAmount(basePaise, takenPaise = []) {
  const taken = new Set(takenPaise);
  for (let offset = 0; offset <= RULES.maxAmountOffsetPaise; offset++) if (!taken.has(basePaise + offset)) return basePaise + offset;
  return null;
}

/**
 * Which order does a bank credit settle? Exactly one, or none (never a guess).
 * @param credit  { amountPaise, utr, at }  what the bank email said (at = ms timestamp)
 * @param orders  [{ id, amountPaise, state, createdAt }]  our orders (any state)
 * @param usedUtrs  UTRs already used to settle an order: one payment never settles two orders
 */
export function matchCredit(credit, orders, usedUtrs = [], now = credit.at) {
  if (!credit?.utr) return { orderId: null, reason: 'no bank reference (UTR)' };
  if (new Set(usedUtrs).has(credit.utr)) return { orderId: null, reason: 'this payment was already used' };
  const open = orders.filter((o) => (o.state === 'awaiting_payment' || o.state === 'provisional' || (o.state === 'revoked' && now - o.createdAt <= RULES.restoreWindowMs)) && o.amountPaise === credit.amountPaise);
  if (open.length === 0) return { orderId: null, reason: `no open order for ${credit.amountPaise} paise` };
  if (open.length > 1) return { orderId: null, reason: 'more than one open order has this amount, so it needs a person' };
  return { orderId: open[0].id, restore: open[0].state === 'revoked' };
}

/**
 * Pull the amount and the bank reference out of a bank's credit alert (plain text of the email).
 * Banks word these differently, so this accepts the common shapes and returns null rather than guess. It has been written from the
 * usual wording, NOT from your bank's real emails: check it against a few real ones before trusting it (see docs/spark/UPI.md).
 */
export function parseCreditEmail(text) {
  const body = String(text ?? '').replace(/\s+/g, ' ');
  if (!/(credited|received|credit)/i.test(body)) return null;
  const amount = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(body);
  const utr = /(?:utr|ref(?:erence)?(?:\s*(?:no|number|num))?\.?|rrn)\s*[:#-]?\s*([0-9]{9,16})/i.exec(body);
  if (!amount || !utr) return null;
  const [rupees, paise = ''] = amount[1].replace(/,/g, '').split('.');
  return { amountPaise: Number(rupees) * 100 + Number(paise.padEnd(2, '0')), utr: utr[1] };
}

/**
 * What should the clock do to an order now? One answer per call, so a job that runs every minute can act on it.
 * @returns 'remind' | 'revoke' | 'expire' | null
 */
export function nextAction(order, now) {
  if (order.state === 'awaiting_payment' && now - order.createdAt >= RULES.payWindowMs + 60 * 1000) return 'expire';
  if (order.state === 'provisional') {
    const waited = now - order.claimedAt;
    if (waited >= RULES.revokeAfterMs) return 'revoke';
    if (waited >= RULES.remindAfterMs && !order.remindedAt) return 'remind';
  }
  return null;
}

/** Is a gift link allowed to open? Paid and provisional orders open; everything else does not. */
export const linkIsLive = (order) => order.state === 'paid' || order.state === 'provisional';
