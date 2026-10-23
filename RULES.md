# RULES

The ground rules for everything in this repo. If a rule here conflicts with a prompt, the rule wins.
Rules marked **(checked)** are enforced by `npm run check`.

> This is the Spark branch: a small base for one-tap gift products. The full library (rooms, tiers, the gift engine and
> studio) is kept at the git tag `full-library-v1`.

## 1. What we are building

- A shop of **products**: each is one very pretty, one-tap gift format (a sealed envelope, a cake to blow out, a memory
  film, rolling credits ...). A customer fills in a short form on their phone, pays, and gets a private link.
- Three separable parts: **the products** (this repo), **the website** (storefront, live preview, checkout) and **the
  backend** (orders, payments, media, delivery). `docs/spark/BACKEND.md` covers the backend.
- Almost every customer is on a phone. Portrait, one hand, an Instagram in-app browser. Design for that first.

## 2. Vocabulary (use these words exactly)

| Term | Meaning |
|---|---|
| **Product** | One thing we sell. A folder `products/<id>/` with `product.json` (what the customer fills in, the price) and `index.js` (`mount(root, ctx)`). |
| **Options** | What the customer chose and typed: text, choices, pictures, a video, a song. Checked against `product.json` by `core/options.js`. |
| **Format** | How the surprise arrives (envelope, cake, film, scroll). Built as a **variant** of the `reveal` element. |
| **Element** | A self-contained piece of experience (today only `reveal`): params in, UI out, completion signal. |
| **Skin** | The look: tokens + element parts + fx + copy. Night Sky, Arcade ... `skins/<id>/` |
| **Part** | A named styleable piece of an element (`data-part="env-seal"`). The public styling API. |
| **State** | A value on a part (`data-state="open"`). The other half of the styling API. |
| **Token** | A CSS variable (`--gk-*`) every skin must define. |
| **File id** | The id of one customer upload (`m_x7k2`). Options refer to files by id, never by address. |

## 3. Tech stack

- Vanilla JS (ES modules), plain CSS with custom properties. **No framework. No runtime dependencies in gift code.**
- Dev tooling in Node only: static server, checker, scaffolder. Tests: Node (logic) + Playwright (browser).
- Gift pages are static files. Fonts self-hosted, **no CDN, no analytics, no third-party requests (checked in the browser test)**.
- Mobile first: portrait at 390 x 844, must also work at 360 x 640; `100dvh`, safe-area insets, Pointer Events only,
  44px minimum tap targets, `prefers-reduced-motion` respected.
- The website and backend may use their own tools (see `docs/spark/BACKEND.md`). Never inside a gift.

## 4. How the pieces relate

```
customer's options + files --> core/product.js (startProduct) --> products/<id>/index.js  mount(root, ctx)
                                     |                                   |
                                     +-- loadLook(skin): tokens + parts + fx + copy   +-- the reveal element (a format)
```

- A product never fetches, never builds a file address and never reads storage: everything arrives on `ctx`.
- Skins style `[data-part]` / `[data-state]` only. They never import from `elements/` or `products/`.
- Core depends on neither elements nor products.
- Pricing and checking of options live in `core/options.js`, which has no DOM, so the backend runs the very same code.

## 5. Hard rules

**Products**
1. A product is `product.json` + `index.js` (+ `sample.json`, a complete valid order). **(checked)**
2. Prices are whole paise and are computed only by `priceFor()` from the manifest. The browser never sends a price. **(tested)**
3. Customer text is untrusted: text nodes only, never `innerHTML`. **(checked)**
4. Files arrive as `ctx.media`; no network calls, no browser storage, no cookies, no `window.open`. **(checked)**
5. Every option has a plain-language label, and a missing or too-long value is explained next to its field. **(tested)**
6. A product must look right with the longest allowed text and the most allowed pictures at 360 x 640 and 390 x 844. **(tested at the sizes)**

**Elements**
1. All user-visible text is overridable copy (`element.copy`, `ctx.t(key)`). **(checked)**
2. Never `innerHTML`/`outerHTML`/`insertAdjacentHTML`; never `alert`/`confirm`/`prompt`; never `localStorage` and friends. **(checked)**
3. Never build asset URLs: `ctx.assets.resolve("@id")`. No hardcoded URLs, no network calls. **(checked)**
4. Elements never import from `skins/` or `products/`. **(checked)**
5. Every styleable piece is a declared part in `parts[]`; every declared part has a rule in `style.css`. **(checked)**
6. Structure rules are normal selectors; default paint is wrapped in `:where()` and uses only `var(--gk-*)`. **(checked, warning)**
7. Completion is reported only via `ctx.onComplete(result)`.
8. Ship `placeholderParams` that satisfy your own schema. **(checked)**
9. Respect motion: JS-driven motion checks `reducedMotion()`.

**Skins**
1. Every selector begins with `[data-skin="<id>"]` (or `:where([data-skin="<id>"] ...)`). **(checked)**
2. `@keyframes` names are prefixed `<id>-`. **(checked)**
3. All required tokens defined; `--gk-tap >= 44px`; text contrast >= 4.5:1 on its backgrounds. **(checked)**
4. Any animation has a `prefers-reduced-motion` block. **(checked)**
5. No external URLs, no `@import`, no CDN fonts. Self-host under `assets/`. **(checked)**
6. `fx` defines all five events (use `{}` for silent). **(checked)**
7. Target parts and states only; avoid `!important` (only to disable animation in reduced motion). **(checked, warning)**

**Content**
1. Assets are referenced by file id only.
2. No personal data, real names, or third-party media in any default, sample, or placeholder.
3. Sound is synthesized or the customer's own; never ship copyrighted music.

## 6. Creativity budget

- **Variety comes from content and composition**: same formats, different words, photos, skins and pace.
- **Options over new code**: a new candle count or pace is a `choice` in `product.json`, not a new module.
- **A new format is the real creative work.** Build it as a variant of `reveal` (or a new element) and wrap it in a product.
- **One-offs stay one-offs.** A custom request becomes a product only after a second customer wants it.

## 7. Definition of done

**Product:** passes `npm run check`; opens in the playground with its sample; every option works live; plays through to the end on
a real phone (an Instagram in-app browser too); passes `npm run test:browser` at both phone sizes for every skin it lists.

**Skin:** passes `npm run check`; every format legible in the playground; reduced-motion pass done; one pass on a real phone;
`skin.json` has a description, mood and a preview image.

## 8. Out of scope for this repo

Accounts, payments, order storage, media upload, delivery and the storefront. Leave clean seams (`core/options.js`,
`ctx.media`, the host page's `?gift=` JSON) so they plug in without touching products or skins.
