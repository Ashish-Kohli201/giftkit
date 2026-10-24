# Payments with YouPI-PG

We take payments through a self-hosted [YouPI-PG](https://github.com/youpi-pg/YouPI-PG) gateway: a UPI QR and app buttons on the phone, paid straight into our own bank account, no gateway fee. This page is the integration, and the things we have to get right because of how YouPI knows a payment arrived.

## Read this first: what YouPI can and cannot promise

YouPI does not talk to the bank. It **reads the bank's SMS or email alert** (an Android app on a phone we keep on, plus Gmail) and matches it to an order. So:

- A confirmation is only as good as that alert. A late, missing or unreadable alert means a customer **paid and nothing happened yet**.
- The project calls itself experimental, not bank or NPCI approved, and suggests at most about **20 payments a day per receiving account** while testing. That is its own cautious guideline, not a rule of the banks. Ask the bank what is allowed for business use of the account (Jio or HDFC).
- A personal account used for sales can be restricted by the bank. Ask the bank whether the account may be used for business collection, and whether a current account or merchant UPI ID is needed.
- Nothing here is legal advice. Collecting money for goods is a business activity; GST and the bank's terms apply.

We chose to run it live, so the site and the backend are built to cope with a late alert instead of losing the customer.

## The flow

```
customer taps Pay
  site -> backend  POST /api/orders          server prices the order, returns { orderId, amount (paise) }
  site -> youpi.js Youpi.pay({ order_id, amount })   YouPI opens its QR / app modal (an iframe from OUR gateway)
  customer pays in their UPI app
  bank SMS/email -> YouPI observer -> matched to the order
  YouPI -> backend  POST /api/youpi/webhook   signed SUCCESS   <- the ONLY thing that marks the order paid
  backend marks it paid, makes the gift link, sends WhatsApp + email
  site polls GET /api/orders/:id/status  ->  shows the link, or "we are confirming your payment"
```

The browser's own "success" event (`youpi:payment:success`) only closes the modal. It never decides anything.

## What the site does (done, in this repo)

- `site/lib/pay-youpi.js` opens the modal with the server's order id and price, and reports success, failure, closing, or "held for review".
- `site/lib/api.js` then asks the backend for the real status for up to `payments.waitSeconds` (90). If it is not confirmed by then the customer sees **"We are confirming your payment"** with their order number and what to do if the link is late. A payment held for a security check shows **"We are checking your payment"**. Neither looks like a failure.
- `site/config.js` holds `payments.provider: 'youpi'` and `payments.youpi: { host, key }` (the public merchant key). The webhook secret is never in the site.

## What the backend must do (checklist)

The helper `core/payments/youpi.js` does the checks that do not depend on a server, so the Worker only has to call it.

1. **Verify the signature on the raw bytes.** `verifySignature(rawBody, headers['x-gateway-signature'], env.YOUPI_WEBHOOK_SECRET)`. Never re-serialise the JSON first. Reject with 401 otherwise. An empty secret never verifies.
2. **Check it is our order and our amount.** `checkPayment(payload, { id, amountPaise })` where `amountPaise` is what the *server* priced. A different order id, amount, currency, or a missing bank reference (UTR) is not a settlement. Log it and alert, do not fulfil.
3. **Be idempotent.** YouPI repeats webhooks. Keep `paymentId` unique and ignore one already handled; answer 200 either way.
4. **Store every webhook** exactly as received (raw body, headers, time, our decision), so any payment can be matched to the bank statement by hand.
5. **Send a Telegram message** for every paid order, and for every webhook we rejected, with the order id, amount and UTR.
6. **A reconciliation job** (every few minutes): for orders still `awaiting_payment` that the customer reached the pay screen for, ask YouPI `GET /api/v1/payments/{id}` (see its `openapi.yaml`, authenticated with `X-Merchant-Key`) and settle any it reports as paid. This catches a webhook that never arrived. Also expose a tiny admin action "mark paid by UTR", checked against the bank statement, for the day the alert never reads.
7. **Amount uniqueness is YouPI's job**; we only refuse any amount that is not exactly what we priced.
8. **Gift links stay private**: unguessable slug, as in `BACKEND.md`.

## Setting up the gateway

1. Run YouPI on an always-on machine (Node 24+; its `docs/INSTALLATION.md` and `docs/DEPLOYMENT.md`) behind HTTPS, for example a Cloudflare Tunnel on `pay.yourdomain.com`. If it is down, nobody can pay.
2. Install its Android observer on a spare phone that stays charged, online, and keeps the bank's SMS and notifications. Add the Gmail observer as a backup (`docs/OBSERVERS_SETUP.md`).
3. In its admin panel: create the merchant, copy the **public merchant key** into `site/config.js`, and the **webhook secret** into the backend's secret store (`YOUPI_WEBHOOK_SECRET`). Set the merchant's webhook URL to the backend's `/api/youpi/webhook`.
4. Set `CHECKOUT_FRAME_ANCESTORS` on the gateway to the storefront's origin (`https://ashish-kohli201.github.io`, later your own domain). The `youpi.js` modal is an iframe, so a store on another origin is blocked unless it is listed.
5. White-label the checkout (name, colours) in its admin panel.
6. Test with a rupee or two and your own phone before any customer, then test a late alert by switching the observer phone to airplane mode for a minute.

## What is tested and what is not

| Tested here (automatic) | Not tested (needs the real thing) |
|---|---|
| Signature check: exact body, secret and format only; empty secret and missing header fail | YouPI itself, its modal, its observers and its webhook |
| Order check: wrong order, wrong or non-integer amount, wrong currency, missing id or UTR are refused | A real payment, a real bank alert and how late it can be |
| Site: sends the gateway the server's order id and price, no price from the browser, shows the link when confirmed | The backend (it does not exist yet), including idempotency and reconciliation |
| Site: shows "confirming" for an unconfirmed payment, "checking" for a review, a message and a retry for failure or closing the modal | The 20-a-day style limits, bank holds, and the bank's rules for business use |

The site tests use a stand-in for `youpi.js` that follows YouPI's documented browser API, and a stub backend. They prove our side, not YouPI's.
