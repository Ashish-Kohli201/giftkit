// SETTINGS: the only part of the backend you edit. Fill this in inside the Apps Script editor (never commit real values), then run setup().
// setup() copies these into the project's Script Properties; after that the values live there and this object is only the template.
//
//   UPI_VPA        your UPI ID that customers pay, for example shop@okhdfcbank
//   UPI_NAME       the name shown in the customer's UPI app
//   OWNER_EMAIL    the main admin's email. It gets ONE kind of email: a customer's link was switched off (a payment may have been missed).
//                  Blank = the account that owns this script.
//
// Run this script as the Google account that SENDS the customer emails (for example fondyshop@gmail.com). It must also be able to read the
// bank's alerts: in the bank's mailbox, forward them to this account (backend/README.md, step 0).
//   BANK_SENDER    the address(es) your bank sends credit alerts from, comma separated, for example alerts@hdfcbank.net
//   SITE_URL       where the storefront is hosted, no trailing slash, for example https://ashish-kohli201.github.io/giftkit
//   BRAND          the name in customer emails
//   SUPPORT_NOTE   one line telling customers how to reach you, for example "reply to this email"
//   REMIND_AFTER_MINUTES / REVOKE_AFTER_MINUTES   how long after "I have paid" to remind and to switch the link off. Blank = 5 and 10.
//                  While testing use 2 and 3 (the clock looks once a minute).
//   TELEGRAM_*     optional: alerts on your phone. Create a bot with @BotFather, send it a message, and use its token and your chat id.
function settings_() {
  return {
    UPI_VPA: '',
    UPI_NAME: '',
    OWNER_EMAIL: '',
    BANK_SENDER: '',
    SITE_URL: '',
    BRAND: 'Fondly',
    SUPPORT_NOTE: 'reply to this email',
    REMIND_AFTER_MINUTES: '',
    REVOKE_AFTER_MINUTES: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
  };
}
