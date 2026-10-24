# Paying by UPI, with the gift opened first and checked after

No payment gateway. The customer pays our own UPI ID, taps "I have paid", and the gift link opens at once. The backend then looks for the bank's credit email. Found: the link becomes permanent. Not found: a reminder, then the link is switched off.

The site side is built and tested (`site/builder.js`, `site/lib/api.js`, `site/lib/qr.js`). The rules the backend needs are in `core/payments/upi.js` (pure functions, tested). **The backend does not exist yet**; this page is its spec.

## The flow

```
1  customer taps Pay          site  -> POST /api/orders            backend prices it, picks a UNIQUE amount, returns the order
2  pay sheet                  site shows: exact amount, "Open my UPI app", UPI ID, QR, a 5:00 clock
3  customer pays in their app (the money goes straight to our account)
4  "I have paid" (after 15s)  site  -> POST /api/orders/:id/claim  backend: state provisional, link opens, WhatsApp + email the link
5  every minute               backend reads the bank's emails (Gmail API), matches credits to orders by exact amount
6  match found                state paid: link permanent, "payment confirmed"
7  5 min, no match            reminder email + WhatsApp: "we cannot see your payment yet"
8  10 min, no match           state revoked: gift page answers 410, customer told, Telegram alert to us
9  money turns up late        the match restores a revoked order within 24 hours and switches the link back on
```

## Order states

`awaiting_payment` -> `provisional` -> `paid` | `revoked` (-> `paid` again if the money arrives late), and `awaiting_payment` -> `expired` if nobody taps "I have paid" (its amount is freed). `linkIsLive(order)` is true only for `paid` and `provisional`.

## Why the amount is unique

The bank's email says "Rs 149.37 credited" and a reference number (UTR), not who paid. So **no two open orders may have the same amount**: `uniqueAmount(basePaise, takenAmounts)` adds the smallest free number of paise (0 to 99) to the price. A credit of exactly that amount can only be one order (`matchCredit`). If all 100 are taken the backend answers 503 "lots of people paying right now, try again in a minute".

## API the site calls

| Call | Does |
|---|---|
| `POST /api/orders` | re-checks the options, prices the order itself, picks the unique amount, returns `{ orderId, amount (paise), upi: { vpa, name, minSeconds, payWindowSeconds } }`. The browser sends no price. |
| `POST /api/orders/:id/claim` | the customer says they have paid. Only from `awaiting_payment` and inside the pay window. Moves to `provisional` (sets `claimedAt`), creates the gift link, sends it, returns `{ status: 'provisional', link }`. Safe to call twice. |
| `GET /api/orders/:id/status` | `{ status: 'provisional' or 'paid' or 'revoked', link }`. The thank-you screen asks every 5 seconds. |
| `GET /api/gifts/:slug` | `410 Gone` when the order is not `linkIsLive`. The gift page then says "This gift is no longer available." |

## The clock (a job every minute)

For each order, `nextAction(order, now)` says what to do: `remind` once at 5 minutes after the claim, `revoke` at 10, `expire` for an unclaimed order past its pay window. Times live in `RULES` in `core/payments/upi.js`.

## Finding the payment: Gmail

- Connect a Gmail account that receives the bank's credit alerts (a dedicated one, not your personal mailbox). Use the Gmail API with read-only access and a refresh token. **Publish the Google Cloud app to production**: an app left in "Testing" has its token expire after 7 days and payments silently stop being found.
- Every minute, read new emails from the bank's alert address, run `parseCreditEmail(text)`, then `matchCredit(credit, orders, usedUtrs)`.
- **`parseCreditEmail` is written from common wordings, not from your bank's real emails.** Before launch: send yourself Rs 1 a few times, save the emails, and add them as test cases in `tests/unit.mjs`. If the bank does not email for small credits, or emails late, this design needs another source (YouPI's observers, or the bank's own statement API).
- Keep every email's id, the parsed amount and UTR, and what was decided. Store the UTR with a unique constraint: **one UTR settles at most one order**.
- Anything the code will not decide (no match, two orders with one amount, an amount that matches nothing) goes to a Telegram message for a person.

## What the customer reads

Keep the tone friendly; they paid, or they are about to.

- **Reminder (5 min):** "Hi, we cannot see your payment for order ORD-123 yet. If you have paid, it can take a few minutes to reach us, and you do not need to do anything. If not, please pay Rs 149.37 to shop@bank so your gift keeps working. The link will switch off in 5 minutes if we still cannot find it."
- **Revoked:** "We could not find a payment for order ORD-123, so the gift link has been switched off. If you did pay, reply with a screenshot of the payment and we will switch it straight back on."
- **Confirmed:** "Payment received, thank you. Your gift link will work for a year."

## Risks to know about (and what limits them)

- **Free use during the window.** Someone can tap "I have paid" without paying and use the gift for up to 10 minutes. It is a small digital gift, the window is short, and the link is revoked. Limit abuse: at most one provisional order per phone number at a time, a daily cap per phone and per IP, and no new provisional order for a phone whose last one was revoked.
- **Instagram's in-app browser may block `upi://` links.** The sheet always shows the UPI ID with a Copy button and a QR for another phone, plus a tip to open the page in Chrome or Safari.
- **A personal account used for sales.** Banks can restrict it. Ask the bank whether business collection on this account is allowed, and whether you need a current account or a merchant UPI ID. This is also a tax matter (GST applies above the threshold).
- **Bank emails are slow or missing sometimes.** That is the 5 and 10 minute design: a late payment still restores the link. A longer revoke time is safer for customers and costs more free use.
- **Amounts like 149.37.** Explain once on the sheet (it does). Never round, because the paise are how we find the payment.

## Test plan

1. Unit tests exist (`npm test`) for the link, unique amounts, matching, email parsing and the clock.
2. Before launch, with real money: pay Rs 1 to yourself three times, and check the emails arrive and parse.
3. Tap "I have paid" without paying and confirm the reminder at 5 minutes and the revoke at 10.
4. Pay after a revoke and confirm the link comes back.
5. Two phones paying at once: each gets its own amount, each settles its own order.
