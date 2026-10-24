# The backend (Google Apps Script)

One Google Apps Script project is the whole server:

- a **web app** the storefront calls (drafts, file uploads, orders, "I have paid", status, the gift itself),
- a **Google Sheet** as the database (created for you),
- a **Drive folder** for customers' photos, videos and songs (created for you),
- **Gmail** read access, to find the bank's credit alerts,
- **email** to customers (their link, the reminder, the confirmation) and to you,
- a **trigger every minute** that looks for payments, sends reminders and switches off links nobody paid for.

While testing, the gifts cost Rs 2 (add-ons Rs 1) and the clock is 2 minutes to the reminder and 3 to the revoke; `npm run check` warns until the real prices are back in `products/*/product.json`.

How a payment works is in [`docs/spark/UPI.md`](../docs/spark/UPI.md). The code is in `src/`, bundled with the shared rules into `dist/Code.gs`.

## What you need before you start

| You need | Example | Where it goes |
|---|---|---|
| The Google account that **receives the bank's credit emails**. The script runs as this account | `shop@gmail.com` | you sign in with it |
| Your **UPI ID** (the one customers pay) | `shop@okhdfcbank` | `UPI_VPA` |
| The **name** shown in customers' UPI apps | `Notepark` | `UPI_NAME` |
| The address(es) the bank sends **credit alerts from** (open one and check). HDFC now uses `alerts@hdfcbank.bank.in`; list the old `alerts@hdfcbank.net` too, comma separated | `alerts@hdfcbank.bank.in,alerts@hdfcbank.net` | `BANK_SENDER` |
| Where the storefront is hosted, no trailing slash | `https://ashish-kohli201.github.io/giftkit` | `SITE_URL` |
| Optional: how long to wait before the reminder and the revoke. Blank means 5 and 10 minutes; use **2 and 3 while testing** | `2`, `3` | `REMIND_AFTER_MINUTES`, `REVOKE_AFTER_MINUTES` |
| Optional: a Telegram bot for alerts on your phone | token and chat id | `TELEGRAM_*` |

To save typing, `npm run build:paste` builds `dist/Code.paste.gs` with the values from your own `backend/my-settings.json` already filled in (neither file is committed). Paste that one.

## Set it up (about 15 minutes)

1. **Create the project.** Sign in to the Google account above, open <https://script.google.com>, choose **New project**, and name it (for example "Spark backend").
2. **Paste the code.** Delete what is in `Code.gs`, then paste the whole of [`dist/Code.gs`](dist/Code.gs). Open **Project Settings** and tick **Show "appsscript.json" manifest file in editor**, then replace that file's content with [`dist/appsscript.json`](dist/appsscript.json). (It lists the permissions the script needs and makes it a public web app.)
3. **Fill in the settings.** Near the top of `Code.gs`, find `function settings_()` and fill in the values from the table. These stay in the editor; never put them in git.
4. **Run `setup`.** In the toolbar pick the function **setup** and press **Run**. Google asks you to allow access. Because this is your own script, it says "Google hasn't verified this app": choose **Advanced**, then **Go to (your project) (unsafe)**, then **Allow**. `setup` creates the sheet and the Drive folder, saves your settings and starts the every-minute trigger. Its log shows the sheet's link.
5. **Run `selfTest`.** It writes a row, uploads a tiny picture to Drive the same way a customer's photo is uploaded, searches Gmail, sends you an email and checks the trigger. **Every line must say `OK`.** A `FAIL` line names the part that is wrong. Do not go on until it is clean.
6. **Deploy the web app.** **Deploy**, **New deployment**, type **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Deploy and copy the **Web app URL** (it ends in `/exec`). Put it in [`site/config.js`](../site/config.js) as `api`, then publish the site.
7. **Check your bank's wording.** The reader of bank emails is tested against a real HDFC alert (`tests/fixtures/hdfc-credit-email.txt`: "Rs.1.00 has been successfully credited ... UPI Reference No.: ...", from `alerts@hdfcbank.bank.in`). Another bank, or a different HDFC email, may word it differently: send me the text (hide your account number) and I will add it as a test. A credit it cannot read is emailed to you as "matched no order", and you settle it with `markPaid`.
8. **First real order.** Buy the cheapest gift on your own site with a second phone, pay the exact amount, tap "I have paid", and watch: the email with the link, then (within a minute or two of the bank email) the confirmation.

After changing the code later, rebuild (`npm run build:backend`), paste again, then **Deploy**, **Manage deployments**, edit the deployment and choose **New version**. The URL stays the same.

## Running it day to day

- **The sheet** has one tab per table. **Orders** is the one to watch: `state` is `awaiting_payment`, `provisional`, `paid`, `revoked` or `expired`. **Events** logs everything that happened to every order. **Credits** records every bank email it looked at and what it decided.
- **A payment it could not match** (you get an email): find the order, check the amount and bank reference against your statement, then run `markPaid('ORD-XXXXXX', 'UTR')` from the editor (type it in a small function or the editor's run box). The link opens, and the customer is emailed.
- **Problems** (Gmail unreachable, a failing step) email you, at most once an hour per kind.
- With Telegram set up, new-order and paid alerts go there only, so your email quota is kept for customers.

## Limits to know

- **Emails:** a free Gmail account may send **100 a day** (a Workspace account 1,500). Each order sends the customer 2 or 3. About 30 orders a day is the ceiling on a free account; `selfTest` shows what is left.
- **Trigger time:** a free account gets about **90 minutes a day**. The clock stops at once when no order is waiting, so it normally uses very little.
- **Files:** photos up to 8 MB (the site shrinks them to about 300 KB first), a song up to 15 MB, a video up to **30 MB**. A video is the slow one: it goes up in 1.5 MB pieces.
- **Apps Script cannot** answer HTTP errors, read request headers or take large uploads in one go. This design works around each: answers are always HTTP 200 with JSON, requests are `text/plain` (no CORS preflight), files go in chunks.
- **Not wired:** WhatsApp. Links go by email. A WhatsApp sender (a provider's API) can be added in `30-mail.js`; then set `delivery.whatsapp` in `site/config.js`.

## What is tested, and what is not

Tested automatically (`npm run test:backend`, `npm run test:e2e`): this exact code, running against a mock of Google's services: every rule, every refusal, the whole life of an order, and the real storefront and recipient page working with it in a phone-sized browser.

**Not tested: Google itself.** These are the parts that can only be checked on your account, which is what `selfTest` is for:

1. Uploading to Drive through a resumable session from `UrlFetchApp` (the least certain part: Drive answers `308` between chunks).
2. Whether a shared Drive file plays as a `<video>`/`<audio>` for the recipient on a phone (photos use Drive's thumbnail address and should be fine). If video playback is poor, only `mediaUrl_()` in `src/40-media.js` needs to change (for example to a different store).
3. Your bank's real email wording (step 7).
4. How late the bank's emails arrive in practice.

## Privacy

The sheet holds customers' emails and phone numbers, and the Drive folder holds their photos, videos and songs (each file shared "anyone with the link", with an unguessable address, so a recipient's phone can show it). Keep the sheet and folder private to you, and do not share the script's editor link.
