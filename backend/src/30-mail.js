// Messages. Fondly sends exactly these emails, and no others:
//   to the customer   1. the booking: their gift link, the moment they say they have paid (mailLive_)
//                     2. a reminder if we cannot see their payment (mailReminder_)
//                     3. the link switched off if it still has not arrived (mailRevoked_)
//                     4. a reply: what the person who got the gift wrote back, as a postcard (mailReply_)
//                     5. "your gift was opened", only if they asked for it, at most twice (mailOpened_)
//   to the owner      one email, only when a link is switched off (emailOwner_). Everything else the owner might want to know goes to
//                     Telegram if it is set up (notify_), and is always in the Events tab of the sheet.
// Mail is sent from the Google account that runs this script. A message that fails to send never breaks an order: it is logged and the order carries on.

/** Escape text for HTML: customers' words are never trusted. */
const esc_ = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function send_(orderId, to, subject, body, htmlBody) {
  if (!to) return false;
  try {
    const message = { to, subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 200), body, name: BRAND_() };
    if (htmlBody) message.htmlBody = htmlBody;
    MailApp.sendEmail(message);
    log_(orderId, 'mail', `${message.subject} -> ${to}`);
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

/** Something the owner may want to know (a new order, a payment, a problem). Telegram only, never email; always in the Events tab too. */
function notify_(subject, body) {
  telegram_(`${subject}\n${body}`);
}

/** The ONE email the owner gets: a link was switched off, so someone may have paid and not been found. */
function emailOwner_(subject, body) {
  send_('', ownerEmail_(), `[${BRAND_()}] ${subject}`, body);
  telegram_(`${subject}\n${body}`);
}

const rupees_ = (paise) => `Rs ${(paise / 100).toFixed(2)}`;
const SUPPORT_ = () => prop_('SUPPORT_NOTE', 'reply to this email');
const firstName_ = (full) => String(full || '').trim().split(/\s+/)[0] || '';

// ---------------------------------------------------------------- what customers read (friendly: they paid, or are about to)
function mailLive_(order, paymentFound) {
  if (paymentFound) {
    // they paid but never tapped "I have paid": the booking email is how they get the link at all
    send_(order.id, order.email, `Your gift is ready (order ${order.id})`,
      `Hi,\n\nYour payment of ${rupees_(order.amount)} has reached us, thank you, and your gift is ready. Here is the private link, which works for a full year:\n\n${giftLink_(order.slug)}\n\n` +
      `Questions? ${SUPPORT_()}, and quote order ${order.id}.\n\n${BRAND_()}`);
    return;
  }
  send_(order.id, order.email, `Your gift is ready (order ${order.id})`,
    `Hi,\n\nYour gift is ready. Here is the private link:\n\n${giftLink_(order.slug)}\n\n` +
    `We are checking your payment of ${rupees_(order.amount)}. If you have paid, you do not need to do anything: the link becomes permanent by itself. ` +
    `If we cannot find the payment within ${minutesText_(rules_().revokeAfterMs)} the link is switched off, and we will write to you first.\n\n` +
    `Questions? ${SUPPORT_()}, and quote order ${order.id}.\n\n${BRAND_()}`);
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

/** The person who got the gift wrote back. A postcard, in HTML, with the plain words as a fallback. */
function mailReply_(order, reply) {
  const who = reply.name || firstName_(order.options.recipient) || 'Someone';
  const site = SITE_();
  const message = esc_(reply.message).replace(/\n/g, '<br>');
  const html = `<div style="background:#f3ece0;padding:28px 12px;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffaf0;border:1px solid #e3d6c0;border-radius:8px">
<tr><td style="padding:24px 28px 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a08a64">A message back for you</td>
<td align="right" style="padding:20px 24px 0"><div style="display:inline-block;width:46px;height:56px;border:2px dashed #c9b48a;border-radius:3px;text-align:center;line-height:56px;font-size:11px;color:#b9a273">${esc_(BRAND_())}</div></td></tr>
<tr><td colspan="2" style="padding:10px 28px 4px;font-size:16px;color:#7a6a50">Dear ${esc_(firstName_(order.options.sender) || 'you')},</td></tr>
<tr><td colspan="2" style="padding:6px 28px 18px;font-size:21px;line-height:1.55;color:#2a1f12;font-style:italic">${message}</td></tr>
<tr><td colspan="2" style="padding:0 28px 26px;font-size:17px;color:#4a3a22;text-align:right">with love,<br><b>${esc_(who)}</b></td></tr>
</table>
<p style="text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#a08a64;margin:16px 0 0">Sent with ${esc_(BRAND_())} &middot; <a href="${esc_(site)}/site/" style="color:#a08a64">make a gift of your own</a></p>
</div>`;
  return send_(order.id, order.email, `${who} sent you a message`,
    `${who} wrote back:\n\n${reply.message}\n\n- ${who}\n\nSent with ${BRAND_()}`, html);
}

/** "Your gift was opened". Only if the buyer asked for it, and at most twice (see opened_). */
function mailOpened_(order, count) {
  const to = firstName_(order.options.recipient) || 'the person you sent it to';
  const html = `<div style="background:#f3ece0;padding:24px 12px;font-family:Georgia,serif"><table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fffaf0;border:1px solid #e3d6c0;border-radius:8px"><tr><td style="padding:26px 28px">
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a08a64">Opened</div>
<div style="font-size:22px;line-height:1.4;color:#2a1f12;margin-top:8px">Your gift for ${esc_(to)} was just opened.</div>
<div style="font-size:14px;color:#7a6a50;margin-top:10px;font-family:Arial,sans-serif">Order ${esc_(order.id)}. This is notice ${count} of 2; we do not send more.</div></td></tr></table></div>`;
  send_(order.id, order.email, `Your gift for ${to} was just opened`, `Your gift for ${to} was just opened (order ${order.id}). This is notice ${count} of 2; we do not send more.\n\n${BRAND_()}`, html);
}
