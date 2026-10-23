# Building a product (guide for the frontend)

A **product** is one thing we sell: a very pretty, one-tap gift format that the customer personalises on their phone. This page is the contract. The playground shows every rule working: `npm run dev`, then http://localhost:5173/playground/.

## 1. The journey a product serves

1. Instagram reel, then a link, then the storefront page for the product.
2. The customer fills in the form (made from `product.json`) and watches a live preview.
3. They pay (UPI first). The backend creates the order and a private link (`docs/spark/BACKEND.md`).
4. The recipient opens the link on a phone and meets the product: an idle screen, one tap to open, a reveal.

A gift is **data, not a build**: the customer's options and file ids. The same deployed product runs for every order.

## 2. What a product is

```
products/<id>/
  product.json   what the customer fills in, and the price (read by the website AND the backend)
  index.js       default export { mount(root, ctx) }
  sample.json    a complete valid order (the playground and the tests use it)
```

Today's four (`envelope`, `cake`, `film`, `credits`) are thin: `index.js` names a format and its settings, and `products/_shared/reveal.js` turns the options into the `reveal` element's blocks. A brand-new format can instead draw itself directly in `mount`.

## 3. product.json

```json
{
  "contractVersion": 2,
  "id": "cake",
  "name": "Make a wish",
  "tagline": "A cake with candles. Make a wish, blow them out, and the surprise appears.",
  "format": "cake",
  "skins": ["nightsky", "arcade"],
  "price": { "base": 14900, "currency": "INR" },
  "options": [
    { "key": "recipient", "type": "text", "label": "Who is it for?", "required": true, "maxLength": 30 },
    { "key": "message", "type": "longtext", "label": "Your message", "required": true, "maxLength": 1200 },
    { "key": "photos", "type": "images", "label": "Photos", "max": 6 },
    { "key": "video", "type": "video", "label": "A video (optional)", "price": 9900 },
    { "key": "candles", "type": "choice", "label": "Candles", "default": "5", "choices": [{ "value": "3", "label": "3" }, { "value": "5", "label": "5" }] },
    { "key": "skin", "type": "choice", "label": "Look", "default": "nightsky", "choices": [{ "value": "nightsky", "label": "Night sky" }, { "value": "arcade", "label": "Arcade" }] }
  ]
}
```

| Option type | Value | Notes |
|---|---|---|
| `text`, `longtext` | string | `maxLength` (default 60 / 1200) |
| `choice` | one of `choices[].value` | `choices[].price` adds to the total |
| `color` | `"#rrggbb"` | |
| `date` | `"YYYY-MM-DD"` | |
| `toggle` | true / false | `price` is added when on |
| `image`, `video`, `audio` | a file id | `price` is added when one is given |
| `images` | a list of file ids | `max` (default 6); `free` + `pricePerExtra` price extra pictures |

- Prices are whole **paise**. The **server** computes the total with `priceFor()` from `core/options.js`; the browser never sends a price.
- An option whose key is `skin` chooses the look; its choices must be listed in `skins`.
- Words may use `{{recipient}}` and `{{sender}}`; they are filled in when the gift is shown.
- `npm run check -- product <id>` checks the manifest and that `sample.json` is a complete valid order.

## 4. The mount contract

```js
export default {
  mount(root, ctx) {
    // draw into root; return { destroy() } to stop timers and listeners
  },
};
```

`ctx`:

| Field | Meaning |
|---|---|
| `ctx.options` | the checked, defaulted values (unknown keys are dropped) |
| `ctx.media.url(id)` / `await ctx.media.resolve(id)` | the address of an uploaded file. In a preview a missing file gets a stand-in picture or tune |
| `ctx.look` | `{ id, copy, fx }`: the skin's name, its copy overrides and its sound/particle effects |
| `ctx.onOptions(fn)` | optional: apply new options in place (live preview). Without it the host remounts the product |
| `ctx.ready()`, `ctx.opened()`, `ctx.finished()` | tell the host (and the storefront's preview) what happened |
| `ctx.reducedMotion`, `ctx.preview`, `ctx.store` | motion preference, preview mode, a safe key-value store (nothing is saved in a preview) |

Rules (checked by `npm run check`): no `innerHTML` (customer text is untrusted: use text nodes), no `fetch`, no browser storage, no `window.open`, no third-party URLs. Build addresses never; ask `ctx.media`.

## 5. The page around a product

`host/index.html` starts one product:

| URL | Meaning |
|---|---|
| `?product=<id>&gift=<url>` | a delivered gift: `<url>` returns `{ "product", "options", "media": { "<id>": { "type", "url" } } }` (the backend's `GET /api/gifts/<slug>`) |
| `&preview=1` | preview: uses `sample.json`, stand-ins for missing files, and listens for `postMessage({ type: 'options', options, media })` from the storefront. Add `&skin=<id>` to try a look |

The page reports back with `postMessage({ type: 'gift', event: 'ready' | 'opened' | 'finished' | 'error' })` and keeps the last event on `document.documentElement.dataset.giftEvent`.

## 6. Rules for phones

- Portrait first at 390 x 844; it must also work at 360 x 640. Use `100dvh`, never `100vh`; honour `env(safe-area-inset-*)`.
- One hand, one thumb: every control at least 44px, Pointer Events only, nothing that needs hover.
- Instagram's in-app browser: no native dialogs, sound only after a tap, no downloads, no popups.
- First screen at most 150 KB gzip; everything after the first tap at most 1.5 MB. Pictures are resized on the phone before upload.
- Test the longest allowed text and the most allowed pictures. Nothing may scroll sideways.
- Respect `prefers-reduced-motion`.

## 7. Acceptance checklist for a new product

- [ ] `npm run check` prints OK, `npm test` passes, `npm run test:browser` passes for every skin the product lists
- [ ] Every option works live in the playground, and the price is right with every add-on on
- [ ] Plays through to the end, then "play again" works
- [ ] Looks right with the longest text and the most pictures at 390 x 844 and 360 x 640
- [ ] A real phone check, in portrait, including an Instagram in-app browser
- [ ] No console errors, no third-party requests, no native dialogs

## 8. Adding a product

1. Copy a folder under `products/` and change `product.json` (`id`, name, options, price) and `sample.json`.
2. A new format: add a variant under `elements/finale/reveal/variants/` (see the existing four), or a new element registered in `elements/registry.js`.
3. Run `npm run check -- product <id>`, open it in the playground, then `npm run test:browser` (add a play-through for it in `tests/browser.mjs`).
