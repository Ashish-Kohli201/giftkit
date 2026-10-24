# The backend: how it is built

The whole server is one Google Apps Script project (`backend/`). Setup and day-to-day running are in [`backend/README.md`](../../backend/README.md); how a payment is decided is in [`UPI.md`](UPI.md).

## Why Apps Script

It is free, needs no server, already has the three things we need (Sheets as a database, Gmail to read the bank's alerts, MailApp to send email), and runs as your own Google account, so there are no passwords or tokens to look after.

## The stack

| Part | Choice |
|---|---|
| Storefront | static site on GitHub Pages (`site/`) |
| API | an Apps Script web app (`doGet`, `doPost`) |
| Database | a Google Sheet: Orders, Drafts, Media, Credits, Events |
| Files | a Google Drive folder, shared by unguessable link |
| Payments | the customer pays our UPI ID; the backend finds the credit in Gmail ([`UPI.md`](UPI.md)) |
| Email | MailApp to the customer and the owner; Telegram optional for the owner |
| Clock | a time-driven trigger, every minute |

## How the pieces talk

```
storefront --(POST text/plain, GET)--> web app --> Sheet, Drive
                                          ^
trigger every minute: Gmail (bank alerts) --> match to an order --> Sheet --> MailApp
recipient --> host page (?s=slug) --GET--> web app --> the gift (options + file addresses)
```

Apps Script cannot read request headers, send HTTP error codes or answer a CORS preflight, so:

- every answer is HTTP 200 with JSON `{ ok: true, ... }` or `{ ok: false, message }` (a switched-off gift answers `{ ok: false, error: 'gone' }`),
- the storefront sends its POSTs as `text/plain` (a "simple" request needs no preflight; a test proves a JSON content type would be blocked),
- files go up in chunks of about 1.5 MB, handed to a Drive resumable upload.

Because of the missing headers, a gateway that signs webhooks in a header (YouPI, Razorpay) cannot be verified here; that is one reason payment is checked from the bank's own emails. (The earlier YouPI integration is kept on the git branch `youpi`.)

## One set of rules

The rules that must never disagree live once, in `core/`, and run in the browser, in the backend and in the tests:

- `core/options.js`: what a customer may enter, and the price (`normalizeOptions`, `priceFor`),
- `core/payments/upi.js`: the UPI link, unique amounts, matching a bank credit to one order, parsing a credit email, the 5 and 10 minute clock.

`npm run build:backend` bundles them with `products/*/product.json` and `backend/src/*.js` into `backend/dist/Code.gs` (Apps Script has no modules). A test fails if `dist/` is out of date.

## The API

| Call | Does |
|---|---|
| `createDraft` | starts a draft for a product, returns `{ id, token }` |
| `uploadStart`, `uploadChunk` | one file, in chunks; checks type and size; returns a media id |
| `createOrder` | re-checks everything, prices it, picks the unique amount, returns the UPI details |
| `claim` | "I have paid": opens the link on trust (safe to repeat) |
| `status` | the order's state and, while live, its link |
| `gift` | what the recipient's page needs, or `gone` / `missing` |

## Tests

- `npm run test:backend`: the real built code against a mock of Google (every rule, refusal and failure).
- `npm run test:e2e`: the real storefront and recipient page in a phone-sized browser against that backend.
- Not testable here: Google itself. `selfTest()` in the editor checks the real services on your account.
