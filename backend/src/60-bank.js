// Finding the payment: read the bank's credit alerts in Gmail and settle the order each one belongs to.
// The script runs as the Google account that receives those alerts, so no passwords or tokens are involved.

function bankSenders_() {
  return requireProp_('BANK_SENDER').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Read new alert emails; every email is looked at once (its id is kept in the Credits table). */
function scanBank_() {
  const query = `from:(${bankSenders_().join(' OR ')}) newer_than:3d`;
  const seen = new Set(rows_('Credits').map((c) => c.messageId));
  const unmatched = [];
  let settled = 0;

  for (const thread of GmailApp.search(query, 0, 50)) {
    for (const message of thread.getMessages()) {
      const id = message.getId();
      if (seen.has(id)) continue;
      seen.add(id);
      const credit = parseCreditEmail(`${message.getSubject()} ${message.getPlainBody()}`);
      if (!credit) { add_('Credits', { messageId: id, receivedAt: message.getDate().getTime(), amount: 0, utr: '', orderId: '', decision: 'not-a-credit' }); continue; }
      credit.at = message.getDate().getTime();

      const result = locked_(() => applyCredit_(credit, id));
      if (result.orderId) settled += 1; else unmatched.push(`${rupees_(credit.amountPaise)} ref ${credit.utr}: ${result.reason}`);
    }
  }
  if (unmatched.length) notify_(`${unmatched.length} bank credit(s) matched no order`, `${unmatched.join('\n')}\n\nIf one of these is a customer, find their order in the sheet and use markPaid('ORDER-ID', 'UTR').`);
  return { settled, unmatched: unmatched.length };
}

/** Settle one credit against the orders (under the lock). Records the decision either way. */
function applyCredit_(credit, messageId) {
  const orders = rows_('Orders');
  const usedUtrs = orders.map((o) => o.utr).filter(Boolean).concat(rows_('Credits').filter((c) => c.orderId).map((c) => c.utr));
  const match = matchCredit(credit, orders.map((o) => ({ id: o.id, amountPaise: o.amount, state: o.state, createdAt: o.createdAt })), usedUtrs, now_());
  add_('Credits', { messageId, receivedAt: credit.at, amount: credit.amountPaise, utr: credit.utr, orderId: match.orderId || '', decision: match.orderId ? (match.restore ? 'restored' : 'settled') : match.reason });
  if (!match.orderId) return match;
  settle_(orders.find((o) => o.id === match.orderId), credit.utr, match.restore);
  return match;
}

/** An order is paid: the link becomes permanent. No email is sent, because the customer already has the link (unless they never tapped "I have paid": then this is their booking email). Also used by markPaid() for the day an email never reads. */
function settle_(order, utr, restored) {
  const neverClaimed = !order.slug;
  const paid = patch_('Orders', order, { state: 'paid', paidAt: now_(), utr, slug: order.slug || token_(20) });
  log_(paid.id, restored ? 'restored' : 'paid', `utr ${utr}`);
  if (neverClaimed) mailLive_(paid, true);
  notify_(`${restored ? 'Restored' : 'Paid'}: ${paid.id} ${rupees_(paid.amount)}`, `${paid.productId} for ${paid.email}, UTR ${utr}`);
  return paid;
}

/** Owner tool (run from the editor): mark an order paid by hand after checking the bank statement. */
function markPaid(orderId, utr) {
  return locked_(() => {
    const order = find_('Orders', 'id', String(orderId));
    if (!order) throw new Error(`No order ${orderId}`);
    if (!utr) throw new Error('Give the bank reference (UTR) so the payment can be traced.');
    return settle_(order, String(utr), order.state === 'revoked');
  });
}
