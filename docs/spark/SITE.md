# The storefront (site/)

The phone-first website customers use to buy a product. Plain HTML, CSS and ES modules: no build step and no dependencies (the backend and the payment window are the only outside parties). Open it with `npm run dev`, then http://localhost:5173/site/.

## The journey

1. **Landing**: a dark opening with a live phone, a scroll story (the phone changes as you scroll: pick a moment, make it yours, send the link), and colour cards that stack, one per product.
2. **Builder**: a full-screen guided flow. One small question per screen, a live phone above that updates as the customer types, a price that counts to the total. The steps come from each product's `shop.steps`.
3. **Pay**: a receipt, the WhatsApp number the link goes to, then payment.
4. **Thank you**: confetti, and "Play it now" opens the finished gift full screen.

An Instagram reel can link straight to a product: `/site/#make=cake` opens the builder on the cake.

## Data-driven

Nothing about a product is written in the site. `products/index.json` is the order they appear in, and each `product.json` carries:

- `options` and `price` (shared with the backend through `core/options.js`)
- `shop`: `accent`, `ink`, `headline`, `blurb`, `starters` (writing prompts) and `steps` (`id`, `title`, `hint`, `keys`, `optional`)

`npm run check` makes sure every option is asked in exactly one step and a required option never sits on an optional step.

## The seam to the backend: `site/lib/api.js`

Every call to a server goes through `createShop(config)`:

| Method | Real mode (`config.api` set) | Demo mode (`config.api` empty) |
|---|---|---|
| `createDraft` | `POST /api/drafts` | local id |
| `uploadFile` | `POST /api/drafts/:id/uploads`, then `PUT` to the signed URL | the file stays on the phone as a `blob:` URL |
| `createOrder` | `POST /api/orders` (the server prices it; the browser sends no price) | local id |
| `pay` | opens the configured gateway (YouPI by default, Razorpay optional), then polls `GET /api/orders/:id/status` until the backend has confirmed it; if not in time, the customer sees "we are confirming your payment" | a short pause, no charge, no link |

Set `api`, `payments` and `supportWhatsapp` in `site/config.js`. Payments are covered in `docs/spark/PAYMENTS.md`. Real mode follows `docs/spark/BACKEND.md` but has not been run against a live backend or Razorpay yet.

## Where things are

```
site/index.html       the page
site/app.js           landing: hero, scroll story, cards, the way into the builder
site/builder.js       the guided builder (steps, fields, uploads, price, payment, thank-you)
site/lib/             api.js (backend seam), preview.js (the live phone), catalog.js, image.js (shrink photos), motion.js
site/css/             base.css, landing.css, builder.css
```

## Phone rules this page keeps

- 390 x 844 first, also 360 x 640; the page is exactly as wide as the phone (a rotated marquee once widened it, and `npm run test:site` now catches that).
- `100dvh` and `visualViewport`: the builder resizes to what is really visible, so the on-screen keyboard never hides the Continue button, and the phone preview shrinks while typing.
- The preview never steals focus (`host/host.js` ignores code-driven focus in preview mode), so the keyboard stays open while typing.
- Photos are shrunk to 1600 px on the phone before upload; a video is limited to 60 MB, a song to 15 MB.
- Motion respects `prefers-reduced-motion`; haptics are a light buzz where supported.

## Test

`npm run test:site` (Playwright) drives the landing page and, for every product, the whole purchase with real file uploads, on 390 x 844 and 360 x 640.
