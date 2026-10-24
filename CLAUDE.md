# CLAUDE.md

Read `RULES.md` first. It is the source of truth. Then `docs/spark/PRODUCT_GUIDE.md` (how a product is built) and `docs/spark/BACKEND.md` (the website, payments and automation around it).

This is the `spark` branch: a stripped-down base for one-tap gift products. The full library lives at the tag `full-library-v1`.

## Working rules
- After ANY change to an element, skin or product, run `npm run check`. Before finishing a task, run `npm test`.
- Storefront check: `npm run test:site` (the whole purchase for every product, on phone screens).
- Browser check: `npm run test:browser` (every product x skin at 390x844 and 360x640; needs `npm i` and `npx playwright install chromium` once).
- Never claim something works unless a test or the playground shows it.
- No stubs, no TODO placeholders, no one-line minified code. Readable, commented, small files.
- Keep zero runtime dependencies. No frameworks, no CDN, no third-party requests in gift code.
- Do not add features that are not asked for. One task per session.
- Hyphens, not em-dashes, in docs and copy.
- Phones first: portrait 390x844, also 360x640, `100dvh`, one hand.

## Commands
- `npm run dev` -> http://localhost:5173/playground/
- `npm run check` / `npm run check -- skin <id>` / `npm run check -- product <id>` / `npm run check -- element <id>`
- `npm run new-skin -- <id> "Name"`
- `npm test` -> unit tests + contract check; `npm run test:browser` -> Playwright

## Where things live
- `products/<id>/` a product: `product.json` (options + price), `index.js` (`mount(root, ctx)`), `sample.json`. `products/_shared/reveal.js` turns options into the reveal element's params.
- `elements/finale/reveal/` the reveal element; its formats are `variants/*.js`. Register elements in `elements/registry.js`.
- `skins/<id>/` a look: tokens, element parts, fx, copy. List in `skins/skins.json`.
- `core/` shared plumbing: `product.js` (host), `options.js` (check + price, no DOM, shared with the backend), `look.js`, `fx.js`, `resolver.js`, `store.js`, `validate.js`, `util.js`.
- `site/` the storefront (landing, guided builder, payment seam in `site/lib/api.js`); see `docs/spark/SITE.md`.
- Payments: `docs/spark/PAYMENTS.md` (YouPI-PG: the flow, the backend checklist, what is untested). `core/payments/youpi.js` checks webhooks.
- `host/` the page a recipient opens. `playground/` the dev form + live phone frame.
- Guides: `docs/spark/PRODUCT_GUIDE.md`, `docs/spark/BACKEND.md`, `docs/SKIN_GUIDE.md`.
