# The backend (Google Apps Script)

One Google Apps Script project is the whole server:

- a **web app** the storefront calls (drafts, file uploads, orders, "I have paid", status, replies, the gift itself),
- a **Google Sheet** as the database (created for you),
- a **Drive folder** for customers' photos, videos and songs (created for you),
- **Gmail** read access, to find the bank's credit alerts,
- **email** to customers, from the shop's own Gmail,
- a **trigger every minute** that looks for payments, sends the reminder and switches off links nobody paid for.

How a payment works is in [`docs/spark/UPI.md`](../docs/spark/UPI.md). The code is in `src/`, bundled with the shared rules into `dist/Code.gs`.

## Two Google accounts

| Account | Role |
|---|---|
| `kohliashish12@gmail.com` (the main admin) | Receives the HDFC alerts. Gets **one** kind of email from the shop: a customer's link was switched off. |
| `fondyshop@gmail.com` (the shop) | **Runs this script**, so every customer email comes from it. It reads the HDFC alerts, which the admin account forwards to it (step 0). |

## The emails Fondly sends (and no others)

| To | When |
|---|---|
| The customer | **Booking:** their gift link, the moment they say they have paid (or, if they paid and never tapped, when we find the payment) |
| The customer | **Reminder:** 5 minutes after "I have paid" if the payment cannot be found |
| The customer | **Revoked:** 10 minutes after, if it still cannot be found |
| The customer | **A reply:** what the person who got the gift wrote back, as an HTML postcard (up to 3 per gift) |
| The customer | **Opened:** only if they left "Tell me when it is opened" on, the first 2 times someone on a different network opens the gift |
| The main admin | Only when a link is **switched off** |

Nothing else sends email: not a new order, not a payment found, not a problem. Those go to Telegram if you set it up (`TELEGRAM_*`), and are always in the **Events** tab of the sheet.

The 5 and 10 minutes are settings (`REMIND_AFTER_MINUTES`, `REVOKE_AFTER_MINUTES`); leave them blank for 5 and 10, or use 2 and 3 while testing.

## What you need before you start

| You need | Example | Where it goes |
|---|---|---|
| Your **UPI ID** (the one customers pay) | `kohliashish12@okhdfcbank` | `UPI_VPA` |
| The **name** shown in customers' UPI apps | `Fondly` | `UPI_NAME` |
| The main admin's email | `kohliashish12@gmail.com` | `OWNER_EMAIL` |
| The address(es) the bank sends **credit alerts from**. HDFC now uses `alerts@hdfcbank.bank.in`; list the old `alerts@hdfcbank.net` too | `alerts@hdfcbank.bank.in,alerts@hdfcbank.net` | `BANK_SENDER` |
| Where the storefront is hosted, no trailing slash | `https://ashish-kohli201.github.io/giftkit` | `SITE_URL` |
| Optional: a Telegram bot for alerts on your phone | token and chat id | `TELEGRAM_*` |

To save typing, `npm run build:paste` builds `dist/Code.paste.gs` with the values from your own `backend/my-settings.json` already filled in (neither file is committed). Paste that one.

## Set it up (about 20 minutes)

0. **Send the bank alerts to the shop account.** In `kohliashish12@gmail.com`: Settings, **See all settings**, **Forwarding and POP/IMAP**, **Add a forwarding address**, `fondyshop@gmail.com`. Google emails a confirmation code to `fondyshop@gmail.com`: type it in. Then **Filters and Blocked Addresses**, **Create a new filter**, From `alerts@hdfcbank.bank.in OR alerts@hdfcbank.net`, **Create filter**, tick **Forward it to** `fondyshop@gmail.com` (and **Never send it to Spam**), and save. Then in `fondyshop@gmail.com` make the same filter and tick **Never send it to Spam**. Check it worked by sending yourself Rs 1: the HDFC email should appear in `fondyshop`'s inbox.
1. **Create the project.** Sign in to **`fondyshop@gmail.com`**, open <https://script.google.com>, choose **New project**, and name it (for example "Fondly backend").
2. **Paste the code.** Delete what is in `Code.gs`, then paste the whole of `dist/Code.paste.gs`. Open **Project Settings**, tick **Show "appsscript.json" manifest file in editor**, then replace that file's content with `dist/appsscript.json`.
3. **Check the settings.** Near the top of `Code.gs`, `function settings_()` should show your values.
4. **Run `setup`.** Pick the function **setup** and press **Run**. Google asks you to allow access. It says "Google hasn't verified this app": choose **Advanced**, then **Go to (your project) (unsafe)**, then **Allow**. `setup` creates the sheet and the Drive folder (in `fondyshop`'s Drive), saves the settings and starts the every-minute trigger.
5. **Run `selfTest`.** Every line must say `OK`, including Gmail search and sending (to this account). A `FAIL` line names the part that is wrong.
6. **Deploy the web app.** **Deploy**, **New deployment**, type **Web app**, **Execute as: Me**, **Who has access: Anyone**. Copy the **Web app URL** (it ends in `/exec`) and put it in [`site/config.js`](../site/config.js) as `api`.
7. **First real order.** Buy the cheapest gift on your own site with a second phone, pay the exact amount, tap "I have paid", and watch: the booking email, then (within a minute or two of the bank email) the order turns paid in the sheet.

After changing the code later, rebuild (`npm run build:paste`), paste again, then **Deploy**, **Manage deployments**, edit the deployment and choose **New version**. The URL stays the same.

## Running it day to day

- **The sheet** has one tab per table. **Orders**: `state` is `awaiting_payment`, `provisional`, `paid`, `revoked` or `expired`. **Events** logs everything that happened. **Credits** records every bank email it looked at and what it decided. **Replies** keeps what recipients wrote back.
- **A payment it could not match** (Telegram, if set up; otherwise look in **Credits**): find the order, check the amount and bank reference against your statement, then run `markPaid('ORD-XXXXXX', 'UTR')` from the editor.
- **A revoke** emails the main admin. If the customer did pay, `markPaid` switches the link back on.

## Limits to know

- **Emails:** a free Gmail account may send **100 a day** (Workspace 1,500). A normal order sends the customer 1 (booking), plus a reply, an opened notice or a reminder only when they happen. `selfTest` shows what is left.
- **Trigger time:** a free account gets about **90 minutes a day**. The clock stops at once when no order is waiting.
- **Files:** photos up to 8 MB (the site shrinks them first), a song up to 15 MB, a video up to **30 MB**.
- **"Opened" notices** compare internet (IP) addresses that the visitor's browser reports (via ipify), so someone switching between Wi-Fi and mobile data can trigger one. That is why it is capped at 2. Apps Script cannot see visitors' addresses itself.
- **Apps Script cannot** answer HTTP errors, read request headers or take large uploads in one go. This design works around each: answers are always HTTP 200 with JSON, requests are `text/plain` (no CORS preflight), files go in chunks.
- **Not wired:** WhatsApp. Links go by email.

## What is tested, and what is not

Tested automatically (`npm run test:backend`, `npm run test:e2e`): this exact code against a mock of Google's services (every rule, refusal and failure, the whole life of an order, replies, opened notices), and the real storefront and recipient page working with it in a phone-sized browser. `node tests/live-check.mjs <exec url>` checks a deployed backend on real Google without paying.

**Not tested: Google itself.** What can only be checked on your account: **`selfTest`**; the HDFC forwarding in step 0 (does the email arrive in `fondyshop`'s inbox, with the original sender kept); whether a shared Drive file plays as a `<video>` on a phone (only `mediaUrl_()` in `src/40-media.js` would change); how late the bank's emails arrive in practice; and Gmail's sending alias if the email is ever sent from a different address than the account's own.

## Privacy

The sheet holds customers' emails, phone numbers and IP addresses, and the Drive folder holds their photos, videos and songs (each file shared "anyone with the link", with an unguessable address). Keep the sheet and folder private to the shop account, and do not share the script's editor link. The public privacy policy (`site/policies/privacy.html`) describes this.
