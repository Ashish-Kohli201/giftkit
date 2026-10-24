# Notepark (giftkit)

Small, very pretty, one-tap gift products. A customer fills in a short form on their phone, pays, and gets a private link.
Zero runtime dependencies in gift code.

This is the `spark` branch. The earlier full library (rooms, tiers, gift engine, studio) is kept at the tag `full-library-v1`.

## Run it

```bash
npm run dev          # http://localhost:5173/playground/   pick a product, fill the form, watch it on a phone
npm test             # unit tests + contract check (no browser needed)
npm run test:backend # the real backend code against a mock of Google
npm run test:e2e     # Playwright: the real site + the real backend code, a whole purchase and the other roads
npm run test:site    # Playwright: the whole purchase for every product on phone screens (demo mode)
npm run test:browser # Playwright: every product x skin at 390x844 and 360x640 (npm i && npx playwright install chromium first)
```

Needs Node 18+. No install step is needed to run the playground.

## What is in the box

| Path | What |
|---|---|
| `RULES.md` | **Start here.** Vocabulary, hard rules, definition of done |
| `docs/spark/PRODUCT_GUIDE.md` | How to build a product (for the frontend) |
| `docs/spark/SITE.md` | The storefront: the guided buying flow and its seam to the backend |
| `site/` | The storefront customers use (landing, guided builder, payment). `npm run dev` then /site/ |
| `backend/` | The server: one Google Apps Script project (Sheet database, Drive files, Gmail bank alerts, email, a one-minute clock). Setup in `backend/README.md` |
| `docs/spark/BACKEND.md`, `docs/spark/UPI.md` | How the backend is built; how a payment is decided |
| `docs/SKIN_GUIDE.md` | Build a skin (a look) |
| `products/` | The products: `envelope`, `cake`, `film`, `credits`; each is `product.json` + `index.js` + `sample.json`. `_shared/` holds the reveal adapter |
| `elements/finale/reveal/` | The reveal element and its four formats (variants: envelope, cake, slideshow, scroll) |
| `skins/nightsky/`, `skins/arcade/` | Looks (tokens, part rules, fx, copy). `_neutral/` is the smallest valid skin and the scaffold template |
| `core/` | `product.js` (the host), `options.js` (check + price, shared with the backend), `look.js`, fx, resolver, store, validator |
| `host/` | The page a recipient opens: `?product=<id>&gift=<json url>`; with `&preview=1` it is the live preview |
| `playground/` | Dev tool: a form made from `product.json`, a phone-sized live frame, the price |
| `scripts/` | `serve.mjs`, `check.mjs` (contract checker), `new-skin.mjs` (scaffold) |

## How it fits together

```
customer options + files --> startProduct (core/product.js) --> products/<id>/index.js  mount(root, ctx)
   checked + priced by core/options.js                                  |
   look loaded by core/look.js                                          +--> the reveal element draws the format
```

A gift is data (the customer's options and file ids), not a build: the same deployed product runs for every order.

## Everyday tasks

```bash
npm run new-skin -- forest "Forest"      # scaffold a skin (a look)
npm run check                            # check every element, skin and product
npm run check -- product cake            # one product
VERBOSE=1 npm run check -- skin arcade   # list unthemed parts
```
