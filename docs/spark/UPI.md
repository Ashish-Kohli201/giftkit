# Paying by UPI, with the gift opened first and checked after

No payment gateway. The customer pays our own UPI ID, taps "I have paid", and the gift link opens at once. The backend then looks for the bank's credit email. Found: the link becomes permanent. Not found: a reminder, then the link is switched off.

It is built: the site (`site/builder.js`, `site/lib/api.js`, `site/lib/qr.js`), the shared rules (`core/payments/upi.js`, pure and tested) and the backend (`backend/`, a Google Apps Script project: see `backend/README.md` to set it up and `docs/spark/BACKEND.md` for how it is built). This page is how a payment is decided.

## The flow

```
1  customer taps Pay          site  -> createOrder                backend prices it, picks a UNIQUE amount, returns the order
2  pay sheet                  site shows: exact amount, "Open my UPI app", UPI ID, QR, a 5:00 clock
3  customer pays in their app (the money goes straight to our account)
4  "I have paid" (after 15s)  site  -> claim                      backend: state provisional, link opens, the link is emailed
5  every minute               backend reads the bank's emails (Gmail), matches credits to orders by exact amount
6  match found                state paid: link permanent, "payment confirmed"
7  5 min, no match            reminder email: "we cannot see your payment yet"
8  10 min, no match           state revoked: gift page answers 410, customer told, Telegram alert to us
9  money turns up late        the match restores a revoked order within 24 hours and switches the link back on
```

## Order states

`awaiting_payment` -> `provisional` -> `paid` | `revoked` (-> `paid` again if the money arrives late), and `awaiting_payment` -> `expired` if nobody taps "I have paid" (its amount is freed). `linkIsLive(order)` is true only for `paid` and `provisional`.

## Why the amount is unique

The bank's email says "Rs 149.37 credited" and a reference number (UTR), not who paid. So **no two open orders may have the same amount**: `uniqueAmount(basePaise, takenAmounts)` adds the smallest free number of paise (0 to 99) to the price. A credit of exactly that amount can only be one order (`matchCredit`). If all 100 are taken the backend answers 503 "lots of people paying right now, try again in a minute".

## What the site calls (see `site/lib/api.js`, `backend/src/50-orders.js`)

| Call | Does |
|---|---|
| `createOrder` | re-checks the options, prices the order itself, picks the unique amount, returns `{ orderId, amount (paise), upi: { vpa, name, minSeconds, payWindowSeconds } }`. The browser sends no price. |
| `claim` | the customer says they have paid. Only from `awaiting_payment`, inside the pay window and not before `minSeconds` (enforced here too). Moves to `provisional`, makes the link, emails it, returns `{ status: 'provisional', link }`. Safe to call twice. |
| `status` | `{ status, link }` with the state (`awaiting_payment`, `provisional`, `paid`, `revoked`, `expired`); the link only while it is live. The thank-you screen asks every 5 seconds. |
| `gift` | the recipient's page asks for a gift by its slug; a switched-off one answers `{ ok: false, error: 'gone' }` and the page says "This gift is no longer available." |

Apps Script cannot send HTTP error codes, so every answer is HTTP 200 with `ok` true or false.

## The clock (a job every minute)

For each order, `nextAction(order, now)` says what to do: `remind` once at 5 minutes after the claim, `revoke` at 10 (both are settings: `REMIND_AFTER_MINUTES` and `REVOKE_AFTER_MINUTES`; use 2 and 3 while testing), `expire` for an unclaimed order past its pay window. Times live in `RULES` in `core/payments/upi.js`.

## Finding the payment: Gmail

- The backend runs as the Google account that receives the bank's credit alerts, so it can read them with no password or token (use a dedicated Gmail, not a personal mailbox: the script can read the whole account).
- Every minute (only while an order is waiting) it searches for new mail from `BANK_SENDER`, runs `parseCreditEmail(text)`, then `matchCredit(credit, orders, usedUtrs)`, and settles the one order that matches.
- **`parseCreditEmail` is tested against one real HDFC alert** (`tests/fixtures/hdfc-credit-email.txt`, from `alerts@hdfcbank.bank.in`: "Rs.1.00 has been successfully credited ... UPI Reference No.: ..."), plus common wordings of other banks. Another bank, or another kind of HDFC email, may word it differently: add a real sample as a test before relying on it. If the bank does not email for small credits, or emails late, this design needs another source.
- Every email looked at is recorded in the Credits tab with its decision. A UTR settles at most one order.
- Anything the code will not decide (no match, an amount that matches nothing) emails you; settle it by hand with `markPaid('ORD-XXXXXX', 'UTR')` after checking the bank statement.

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

1. Automatic: `npm test` (the rules and the whole backend against a mock of Google) and `npm run test:e2e` (the real site and backend in a phone-sized browser). `selfTest()` in the Apps Script editor checks the real Google services.
2. Before launch, with real money: pay Rs 1 to yourself three times, and check the emails arrive and parse.
3. Tap "I have paid" without paying and confirm the reminder at 5 minutes and the revoke at 10.
4. Pay after a revoke and confirm the link comes back.
5. Two phones paying at once: each gets its own amount, each settles its own order.
