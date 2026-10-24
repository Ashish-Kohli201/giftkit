# Spark: the website, payments and automation

Everything the business needs behind the products. Goal: a customer pays on their phone and gets their private link within seconds, with nobody doing anything by hand.

## The stack in one table

| Part | Choice | Why |
|---|---|---|
| Hosting for the website and the gift pages | Cloudflare Pages | Static, global, free to start; a gift page is a static bundle |
| Backend (API, webhooks) | Cloudflare Workers with Hono (TypeScript) | One small codebase, no servers, scales to zero, cheap |
| Database | Cloudflare D1 (SQLite) | Orders and drafts are small relational data; free tier is generous |
| Media storage | Cloudflare R2 | No egress fees (videos are the expensive part); direct uploads from the phone |
| Payments | YouPI-PG, self-hosted UPI (see `PAYMENTS.md`); Razorpay stays a drop-in alternative | No gateway fee, paid straight to our bank; confirmation comes from a signed webhook that must be checked (and reconciled, because it reads bank alerts) |
| Delivery | Thank-you page + email (Resend) + WhatsApp (a provider such as AiSensy or Interakt) | The link is shown first, then sent, so a failed message never loses a customer |
| Instagram to website | ManyChat (comment or DM to an automatic reply) to a Superprofile link | Already in your plan; no code |
| Website (storefront) | A small mobile-first app: Astro or Next.js, pages read each product's `product.json` | Pick what the website builder knows; the API contract below is what matters |
| Errors and alerts | Sentry free plan + a Telegram bot message per order | You see every order and every failure on your phone |

Alternative if you would rather stay in familiar territory: Next.js on Vercel with Supabase (Postgres and storage) and Inngest for background jobs. Same design, slightly higher cost, more moving parts. The design below does not depend on the choice.

## How it fits together

```
Instagram -> ManyChat DM -> Superprofile link
                              |
                              v
         Storefront (Pages)  --reads-->  /products/<id>/product.json   (the options, the price)
              |   live preview iframe  <-- postMessage(options)  -->  product bundle
              |
              | 1. POST /api/drafts            (create a draft, get a draft token)
              | 2. PUT  R2 (signed URLs)       (photos, video, song go straight to storage)
              | 3. POST /api/orders            (server prices it, creates a Razorpay order)
              | 4. Razorpay Checkout (UPI)     (opens on the phone)
              v
   Worker: POST /api/razorpay/webhook  (payment.captured)  ->  mark paid, create the gift, send the link
              |
              v
   https://gifts.<domain>/g/<slug>   = the product bundle + gift config + media (no build per order)
```

The important idea: **there is no build step per order.** A gift is a row in the database, its media in R2, and the unguessable slug in the link. The gift page loads the product bundle (already deployed), fetches `/api/gifts/<slug>` (the customer's values and media URLs), and runs it. This is why it is fast, cheap and fully automatic.

## Data model (D1)

| Table | Holds |
|---|---|
| `drafts` | `id`, `token` (secret, in the browser), `product_id`, `options` (JSON), `created_at`, `expires_at`. Lets a customer on a flaky Instagram browser come back and resume. |
| `media` | `id`, `draft_id` or `order_id`, `kind` (image, video, audio), `key` (R2 path), `bytes`, `mime`, `status` (uploading, ready) |
| `orders` | `id`, `draft_id`, `product_id`, `options` (JSON copy), `amount_paise`, `currency`, `status`, `razorpay_order_id`, `razorpay_payment_id`, `contact` (phone, email), `slug`, `created_at`, `paid_at`, `delivered_at` |
| `events` | an append-only log: `order_id`, `type`, `detail`, `at` (payment captured, link sent, refund ...). Makes every problem traceable. |

Order status: `draft` -> `awaiting_payment` -> `paid` -> `ready` -> `delivered`, plus `failed`, `refunded`. The only way to `paid` is a verified Razorpay event.

## The API (small and boring)

| Call | What it does |
|---|---|
| `GET /api/products` | every product's manifest (name, price, poster, options) |
| `POST /api/drafts` | start a draft for a product; returns the draft token |
| `PATCH /api/drafts/:id` | save option values as the customer types (debounced) |
| `POST /api/drafts/:id/uploads` | for each file, returns a signed R2 upload URL; checks type and size limits from the manifest |
| `POST /api/orders` | validates the options against the manifest, **computes the price on the server**, creates the Razorpay order |
| `POST /api/razorpay/webhook` | verifies the signature, is idempotent, marks paid, creates the gift, sends the link |
| `GET /api/gifts/:slug` | the gift page's data (public by link, no listing, no search) |
| `GET /api/orders/:id/status` | the thank-you page polls this until the link is ready |

## Payment rules (do not skip)

1. The browser never sends a price. The server prices from the manifest.
2. Never trust the checkout success callback alone. Confirm with the webhook (`payment.captured`), and verify the signature with the webhook secret.
3. Webhooks arrive twice and out of order sometimes: make the handler idempotent (keyed on the Razorpay payment id).
4. Store the Razorpay order id on the order before opening checkout, so a payment can always be matched to an order.
5. Refunds go through the Razorpay dashboard or API and set the order to `refunded` (the gift page then shows a polite "this gift is no longer available").
6. Keep a thin payment adapter (`createOrder`, `verifyWebhook`, `refund`), so switching to Easebuzz or Cashfree later is one file.

## Media

- The phone uploads straight to R2 with a signed URL, with a progress bar. The Worker never carries the bytes.
- Limits come from the manifest (pictures resized on the phone to 1600 px before upload, video up to 50 MB, song up to 15 MB). The Worker re-checks type and size after upload.
- iPhone photos in HEIC are converted by the browser on upload where possible; otherwise ask the customer to switch the camera to "Most Compatible".
- Gift pages read media through R2's public bucket URL with unguessable keys, or through a Worker route that checks the slug; start with unguessable keys.
- Delete media for unpaid drafts after 7 days (a scheduled Worker).

## Delivery without human friction

On `payment.captured` the Worker: creates the slug (12+ random characters), marks the order `ready`, shows the link on the thank-you page (it polls the status), sends the email, and sends the WhatsApp template message. If one channel fails, the others still go, and the failure is logged and sent to your Telegram. The customer can always get the link again from the thank-you page or by messaging the WhatsApp number.

## What you check by hand

Almost nothing. A Telegram message per order (product, amount, link) and a daily summary. Refunds and the odd "resend my link" are done from a tiny admin page protected by a login (or straight in the D1 console at first).

## Not decided yet

- GST invoice and the exact tax line on the receipt.
- How long a gift link stays alive (a year is a sensible default; the thank-you page should say so).
- Content rules for uploaded media (what you refuse, and who looks at a report).
- WhatsApp provider and template approval (needs business verification; do this early, it takes days).
- The domain, and whether gifts live on a separate domain from the shop (recommended: separate, so a problem with one never affects the other).
- Prices and add-ons.
