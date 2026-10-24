// Messages: emails to customers, and alerts to the owner (email, and Telegram if it is set up).
// A message that fails to send never breaks an order: it is logged and the order carries on.

function send_(orderId, to, subject, body) {
  if (!to) return false;
  try {
    MailApp.sendEmail({ to, subject, body, name: BRAND_() });
    log_(orderId, 'mail', `${subject} -> ${to}`);
    return true;
  } catch (e) {
    log_(orderId, 'mail-failed', `${subject} -> ${to}: ${e}`);
    return false;
  }
}

function telegram_(text) {
  const token = prop_('TELEGRAM_BOT_TOKEN', '');
  const chat = prop_('TELEGRAM_CHAT_ID', '');
  if (!token || !chat) return;
  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 3500) }),
    });
  } catch (e) { Logger.log(`telegram failed: ${e}`); }
}

const telegramOn_ = () => !!(prop_('TELEGRAM_BOT_TOKEN', '') && prop_('TELEGRAM_CHAT_ID', ''));

/**
 * Tell the owner something happened. Short, with the order id, so it can be found in the sheet.
 * A free Gmail account can send only 100 emails a day, and every order already costs the customer 2 or 3. So a ROUTINE alert (a new
 * order, a payment) goes to Telegram only when Telegram is set up; a problem, a revoke or an unmatched credit always gets an email too.
 */
function alertOwner_(subject, body, routine) {
  if (!(routine && telegramOn_())) send_('', ownerEmail_(), `[${BRAND_()}] ${subject}`, body);
  telegram_(`${subject}\n${body}`);
}

const rupees_ = (paise) => `Rs ${(paise / 100).toFixed(2)}`;
const SUPPORT_ = () => prop_('SUPPORT_NOTE', 'reply to this email');

// ---------------------------------------------------------------- what customers read (friendly: they paid, or are about to)
function mailLive_(order) {
  send_(order.id, order.email, `Your gift is ready (order ${order.id})`,
    `Hi,\n\nYour gift is ready. Here is the private link:\n\n${giftLink_(order.slug)}\n\n` +
    `We are checking your payment of ${rupees_(order.amount)}. If you have paid, you do not need to do anything: the link becomes permanent by itself. ` +
    `If we cannot find the payment within ${minutesText_(rules_().revokeAfterMs)} the link is switched off, and we will write to you first.\n\n` +
    `Questions? ${SUPPORT_()}, and quote order ${order.id}.\n\n${BRAND_()}`);
}

function mailPaid_(order, restored) {
  send_(order.id, order.email, restored ? `Your gift link is back on (order ${order.id})` : `Payment received, thank you (order ${order.id})`,
    `Hi,\n\n${restored ? 'Your payment reached us, so your gift link is switched back on.' : 'Your payment has reached us, thank you.'} ` +
    `Your gift link will work for a full year:\n\n${giftLink_(order.slug)}\n\n${BRAND_()}`);
}

function mailReminder_(order) {
  send_(order.id, order.email, `We cannot see your payment yet (order ${order.id})`,
    `Hi,\n\nWe cannot see your payment for order ${order.id} yet. If you have paid, it can take a few minutes to reach us and you do not need to do anything. ` +
    `If not, please pay exactly ${rupees_(order.amount)} to ${prop_('UPI_VPA', 'our UPI ID')} so your gift keeps working.\n\n` +
    `The link will switch off in about ${minutesText_(rules_().revokeAfterMs - rules_().remindAfterMs)} if we still cannot find the payment. Questions? ${SUPPORT_()}.\n\n${BRAND_()}`);
}

function mailRevoked_(order) {
  send_(order.id, order.email, `Your gift link has been switched off (order ${order.id})`,
    `Hi,\n\nWe could not find a payment for order ${order.id}, so the gift link has been switched off.\n\n` +
    `If you did pay, ${SUPPORT_()} with a screenshot of the payment and we will switch it straight back on. If your payment reaches us later, it switches back on by itself.\n\n${BRAND_()}`);
}
