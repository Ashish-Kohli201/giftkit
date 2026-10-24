// Drafts, orders and gifts: the customer-facing half of the backend. The rules live in the shared core files that are built in above
// (normalizeOptions, priceFor, uniqueAmount, linkIsLive ...), so the browser and this backend can never disagree about a price.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+91[6-9]\d{9}$/;
const minSeconds_ = () => Number(prop_('MIN_SECONDS', RULES.minSeconds));

function product_(id) {
  const product = PRODUCTS[String(id || '')];
  if (!product) throw new UserError('That gift is not available.');
  return product;
}

function createDraft_(p) {
  const product = product_(p.productId);
  const draft = locked_(() => add_('Drafts', { id: `d_${token_(8)}`, token: token_(24), productId: product.id, createdAt: now_() }));
  return { id: draft.id, token: draft.token };
}

/** Is this person allowed another gift right now? Stops one person opening many free gifts. `ignoreId` is the order being decided. */
function contactBlocked_(contactKey, ignoreId, now) {
  const mine = rows_('Orders').filter((o) => o.contactKey === contactKey && o.id !== ignoreId);
  if (mine.some((o) => o.state === 'provisional')) return 'You already have a gift waiting for its payment to be confirmed. Please wait for that first.';
  const lastDay = mine.filter((o) => o.claimedAt && now - o.claimedAt < 24 * 60 * 60 * 1000);
  if (lastDay.some((o) => o.state === 'revoked')) return 'We could not find your last payment, so please contact us before making another gift.';
  if (lastDay.length >= MAX_CLAIMS_PER_CONTACT_PER_DAY) return 'That is a lot of gifts for one day. Please try again tomorrow, or contact us.';
  return '';
}

function createOrder_(p) {
  const draft = authDraft_(p.draftId, p.token);
  const product = product_(draft.productId);
  const email = String((p.contact && p.contact.email) || '').trim().toLowerCase();
  const phone = String((p.contact && p.contact.phone) || '').replace(/\s/g, '');
  const ip = String(p.ip || '').trim(); // the browser's own report: used only to tell "opened from somewhere else", never to decide anything about money
  const buyerIp = IP_ADDRESS.test(ip) ? ip : '';
  if (!EMAIL.test(email)) throw new UserError('Please enter a valid email, that is where your link is sent.');
  if (phone && !PHONE.test(phone)) throw new UserError('That mobile number does not look right.');

  const { options, errors } = normalizeOptions(product, p.options || {});
  const first = Object.keys(errors)[0];
  if (first) throw new UserError(errors[first]);

  // every file the order uses must be one this draft really uploaded
  const mine = new Set(rows_('Media').filter((m) => m.draftId === draft.id).map((m) => m.id));
  for (const id of mediaIdsIn(product, options)) if (!mine.has(id)) throw new UserError('One of your files is missing. Please add it again.');

  return locked_(() => {
    const now = now_();
    const blocked = contactBlocked_(email, '', now);
    if (blocked) throw new UserError(blocked);
    const orders = rows_('Orders');
    // an amount stays reserved for every order a bank credit could still settle (including a revoked one: a late payment restores it)
    const taken = reservedAmounts(orders.map((o) => ({ amountPaise: o.amount, state: o.state, createdAt: o.createdAt })), now);
    const base = priceFor(product, options); // the ONLY price: whatever the browser sent is ignored
    const amount = uniqueAmount(base, taken);
    if (amount === null) throw new UserError('Lots of people are paying right now. Please try again in a minute.');
    const order = add_('Orders', { id: `ORD-${token_(6).toUpperCase()}`, productId: product.id, options, baseAmount: base, amount, state: 'awaiting_payment', createdAt: now, phone, email, draftId: draft.id, contactKey: email, buyerIp });
    log_(order.id, 'order', `${product.id} ${rupees_(amount)}`);
    return {
      orderId: order.id,
      amount,
      upi: { vpa: requireProp_('UPI_VPA'), name: requireProp_('UPI_NAME'), minSeconds: minSeconds_(), payWindowSeconds: RULES.payWindowMs / 1000, remindAfterSeconds: rules_().remindAfterMs / 1000, revokeAfterSeconds: rules_().revokeAfterMs / 1000 },
    };
  });
}

/** "I have paid": open the link now on trust; the clock and the bank email settle it later. Safe to call twice. */
function claim_(p) {
  return locked_(() => {
    const now = now_();
    let order = find_('Orders', 'id', String(p.orderId || ''));
    if (!order) throw new UserError('We could not find that order.');
    if (order.state === 'provisional' || order.state === 'paid') return { status: order.state, link: giftLink_(order.slug) };
    if (order.state !== 'awaiting_payment') return { status: 'revoked', link: '' };

    if (now - order.createdAt > RULES.payWindowMs + 60 * 1000) {
      patch_('Orders', order, { state: 'expired' });
      throw new UserError('The payment time ran out. Nothing was charged. Please start again.');
    }
    // "I have paid" is off for the first seconds on screen; the server enforces it too so a script cannot skip the wait
    if (now - order.createdAt < (minSeconds_() - 3) * 1000) throw new UserError('Please complete the payment first, then tap "I have paid".');
    const blocked = contactBlocked_(order.contactKey, order.id, now);
    if (blocked) throw new UserError(blocked);

    order = patch_('Orders', order, { state: 'provisional', claimedAt: now, slug: order.slug || token_(20) });
    log_(order.id, 'claimed', giftLink_(order.slug));
    mailLive_(order);
    notify_(`New order ${order.id}: ${rupees_(order.amount)}`, `${order.productId} for ${order.email}\nWaiting for ${rupees_(order.amount)} to appear in the bank emails.`);
    return { status: 'provisional', link: giftLink_(order.slug) };
  });
}

function status_(p) {
  const order = find_('Orders', 'id', String(p.orderId || ''));
  if (!order) throw new UserError('We could not find that order.');
  return { status: order.state, link: linkIsLive(order) && order.slug ? giftLink_(order.slug) : '' };
}

/** Is this gift's link allowed to open right now? Paid and provisional orders open; a paid one stops after a year. */
const giftLive_ = (order) => linkIsLive(order) && !(order.state === 'paid' && order.paidAt && now_() - order.paidAt > GIFT_LIFETIME_MS);

/** What the recipient's page needs. A switched-off gift answers { error: 'gone' } (the host page shows "no longer available"). */
function gift_(p) {
  const order = find_('Orders', 'slug', String(p.slug || ''));
  if (!order || !order.slug) return { ok: false, error: 'missing' };
  if (!giftLive_(order)) return { ok: false, error: 'gone' };
  const product = product_(order.productId);
  const files = rows_('Media');
  const media = {};
  for (const id of mediaIdsIn(product, order.options)) {
    const m = files.find((f) => f.id === id);
    if (m) media[id] = { type: m.type, url: mediaUrl_(m) };
  }
  return { product: order.productId, options: order.options, media };
}

/** The person who got the gift writes back. We email it to the buyer as a postcard. A few per gift, so nobody can be flooded. */
function reply_(p) {
  const order = find_('Orders', 'slug', String(p.slug || ''));
  if (!order || !order.slug || !giftLive_(order)) throw new UserError('This gift is no longer available.');
  const message = String(p.message || '').replace(/\r\n/g, '\n').trim();
  if (!message) throw new UserError('Please write a message first.');
  if (message.length > MAX_REPLY_CHARS) throw new UserError(`Please keep it under ${MAX_REPLY_CHARS} characters.`);
  const name = String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return locked_(() => {
    const fresh = find_('Orders', 'id', order.id);
    if (fresh.replies >= MAX_REPLIES_PER_GIFT) throw new UserError('You have already sent a few messages. Thank you!');
    add_('Replies', { at: now_(), orderId: fresh.id, name, message });
    const updated = patch_('Orders', fresh, { replies: fresh.replies + 1 });
    log_(updated.id, 'reply', `${message.length} characters`);
    mailReply_(updated, { name, message });
    notify_(`Reply on ${updated.id}`, `${name || 'someone'} wrote back (${message.length} characters)`);
    return { sent: true };
  });
}

/**
 * The gift was opened. If the buyer asked to be told, and the opener's internet address is not the buyer's (so it is someone else), email the
 * buyer, at most MAX_OPEN_NOTICES times, and never twice for the same address. The browser reports the addresses; it always answers ok.
 */
function opened_(p) {
  const order = find_('Orders', 'slug', String(p.slug || ''));
  const ip = String(p.ip || '').trim();
  if (!order || !giftLive_(order) || !order.options.notifyOpen) return {};
  if (!IP_ADDRESS.test(ip) || !order.buyerIp || ip === order.buyerIp || ip === order.lastOpenIp) return {};
  return locked_(() => {
    const fresh = find_('Orders', 'id', order.id);
    if (fresh.openNotices >= MAX_OPEN_NOTICES || ip === fresh.lastOpenIp) return {};
    const count = fresh.openNotices + 1;
    patch_('Orders', fresh, { openNotices: count, lastOpenIp: ip });
    log_(fresh.id, 'opened', `notice ${count}`);
    mailOpened_(fresh, count);
    return {};
  });
}
