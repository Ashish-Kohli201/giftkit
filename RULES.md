# RULES

The ground rules for everything in this repo. If a rule here conflicts with a prompt, the rule wins.
Rules marked **(checked)** are enforced by `npm run check`.

## 1. What we are building

- Personalized, interactive digital gifts, built done-for-you from **one JSON config per gift**.
- Three separable parts, built in this order:
  - **Part 3 (P0) - Themes, skins + elements:** this repo. The creative library.
  - **Part 1 (P1) - Engine:** reads a config, assembles theme + skin + elements, builds and ships a private link.
  - **Part 2 (P2) - Customer website:** storefront, configurator, orders.
- `core/runtime.js` is a **reference** glue (readable, tested). The production engine keeps the same seams.

## 2. Vocabulary (use these words exactly)

| Term | Meaning |
|---|---|
| **Gift config** | One JSON file describing a whole gift (people, days, assets, finale). Content lives here. |
| **Element** | A self-contained piece of experience: config in, UI out, completion signal. Owns **behavior**. |
| **Theme** | A world's setup: a desk room, an outdoor clearing, a concert. Owns **where things are** (layout of the roles). `themes/<id>/` |
| **Skin** | The look: tokens + element parts + fx + copy + the paint for each theme. Night Sky, Arcade... Works in **every** theme. `skins/<id>/` |
| **Tier** | Spark (one tap), Countdown (a day per game), Signature (everything). |
| **Role** | A named touchable thing every theme provides (`hub`, `vault`, `board`, `light`, `pet`...). The stable contract between themes and skins. See `docs/WORLD_CONTRACT.md`. |
| **Part** | A named styleable piece of an element (`data-part="tile"`). The public styling API. |
| **State** | A value on a part (`data-state="correct"`). The other half of the styling API. |
| **Token** | A CSS variable (`--gk-*`) every skin must define. |
| **Fragment** | One character awarded per completed day; the vault code is derived from them. |
| **Slot** | An asset reference in config (`@photo_01`). Content never points at files directly. |

## 3. Tech stack

- Vanilla JS (ES modules), plain CSS with custom properties. **No framework. No runtime dependencies.**
- Dev tooling in Node only: static server, checker, scaffolder. Tests: Node (logic) + Playwright (browser).
- Gift pages are static files. Fonts self-hosted, **no CDN, no analytics, no third-party requests (checked in smoke test)**.
- Mobile first: design at 360px wide, Pointer Events only, 44px minimum tap targets, safe-area insets, `prefers-reduced-motion` respected.
- The production engine may add Vite, Ajv, Tailwind for the *storefront/admin only*. Never inside a gift.

## 4. How skins, themes and elements relate

`themes x skins x tiers` is the catalogue: every combination must work. Elements are shared by all of them.

Elements and skins are **decoupled in code but not in feel**. A skin reaches into elements through four layers:

1. **Tokens** - palette, type, shape, motion. Cheap; gives a coherent baseline on its own.
2. **Parts** - restyle every named part of every element. A wordle tile is a paper scrap, a glowing star, or a pixel block.
3. **Assets and motion** - fx (synth sound, particles, haptics), microcopy overrides, optional decorative DOM.
4. **World paint** - how the skin draws each theme's roles (a laptop, a console, a tent). A skin ships `paint-<theme>.css`
   (and optionally `decorate-<theme>.js`) per theme it supports.

Fallback rules: core ships a token-driven default look for every element part (zero-specificity `:where()`), and
`core/world.css` ships one for every role. A new skin with only tokens already works in every theme.
A new theme with only a layout already works with every skin. Polish pair by pair, highest impact first.

## 5. Dependency direction

```
gift config --> engine --> world.mount() --> elements mounted via mountElement()
                  |          (core/world.js)             ^
                  +--> loadTheme(theme, skin) -- layout + tokens/parts/fx/copy/paint ----+ (styling only)
```

- Elements **never** import from `themes/` or `skins/`. **(checked)**
- Themes and skins **never** import from `elements/` and never touch element internals; they style `[data-part]` / `[data-state]` only.
- Both depend on `core/`. Core depends on neither.

## 6. Hard rules

**Elements**
1. All user-visible text is overridable copy (`element.copy`, `ctx.t(key)`). No hardcoded strings in logic. **(checked: copy required)**
2. Never `innerHTML`/`outerHTML`/`insertAdjacentHTML`. Build DOM with `part()`/text nodes. Customer text is untrusted. **(checked)**
3. Never `alert`/`confirm`/`prompt`. Use `ctx.dialogs`. **(checked)**
4. Never touch `localStorage` or friends. Use `ctx.store`. **(checked)**
5. Never build asset URLs. Use `ctx.assets.resolve("@slot")`. No hardcoded URLs. **(checked)**
6. No network calls from elements. **(checked)**
7. Never import from `themes/` or `skins/`. **(checked)**
8. Every styleable piece is a declared part in `parts[]`; every declared part has a rule in `style.css`. **(checked)**
9. Structure rules in `style.css` are normal selectors; default paint is wrapped in `:where()` and uses only `var(--gk-*)`. **(checked, warning)**
10. Completion is reported only via `ctx.onComplete(result)`; failure via `ctx.onFail(info)`. Failing never silently loops: show feedback and offer retry.
11. Ship `placeholderParams` that satisfy your own schema. **(checked)** Placeholders contain no real people, no copyrighted lyrics/titles/art.
12. Respect motion: no motion that cannot be disabled by `prefers-reduced-motion` (core.css disables transitions globally; JS-driven motion must check `reducedMotion()`).

**Skins**
1. Every selector begins with `[data-skin="<id>"]` (or `:where([data-skin="<id>"] ...)`). **(checked)**
2. `@keyframes` names are prefixed `<id>-`. **(checked)**
3. All required tokens defined; `--gk-tap >= 44px`; text contrast >= 4.5:1 on its backgrounds. **(checked)**
4. Any animation has a `prefers-reduced-motion` block. **(checked)**
5. No external URLs, no `@import`, no CDN fonts. Self-host under `assets/`. **(checked)**
6. `fx` defines all five events (use `{}` for silent). **(checked)**
7. Target parts and states only. Never `:nth-child` into element internals, never rely on tag names.
8. Avoid `!important` (allowed only to disable animation in reduced motion). **(checked, warning)**
9. A skin never defines a shell or behavior; decoration only (`decorateWorld`: aria-hidden DOM, no state-changing listeners). **(checked)**
10. A world-paint rule that mentions a part name shared with an element (`board`) lives under `[data-part="room-stage"]`. **(checked)**

**Themes (worlds)**
1. Every selector begins with `[data-theme="<id>"]`. **(checked)** Geometry variables only; no colors (a skin owns every color).
2. Every role has `--<role>-x/-y/-w/-ar` for portrait and landscape. **(checked)** Roles never overlap by more than 12% (backdrop roles excepted) and stay >= 44px on screen **(tested at 8 device sizes)**.
3. Behavior comes from the shared engine (`core/world.js`); a theme does not add state or timers.
4. Labels and copy never say "fragment", "level" or "collect"; the world guides implicitly. **(tested)**

**Config and content**
1. Fragments are unique and unambiguous (no `I O 0 1`); the vault code is **derived**, never hardcoded.
2. Assets are referenced as `@slot` only.
3. Text answers may be stored hashed by the build step (engine concern; elements receive plain params at mount).
4. No personal data, real names, or third-party media in any default, sample, or placeholder.

## 7. Creativity budget (how we stay creative while doing less work)

- **Variety comes from content and composition, not new code.** Same elements, different order, copy, photos, theme, skin.
- **Variants over new modules.** One `quiz` covers quiz, who-said-it, and "no wrong answer". Prefer a new `mode`/param to a new element.
- **Elements are small and params are generous** (copy, difficulty, counts). Bespoke feel without a code change.
- **Skins are cheap to start** (tokens only) and expensive only where it matters (the 4 hero elements + finale + the paint for each theme). **Themes are cheap too** (a layout of the same roles).
- **One-offs stay one-offs.** A custom request becomes a library element only after a second customer wants it.
- **Cap the library.** Add an element, skin or theme only when a real order or a clear gap demands it.

## 8. Definition of done

**Element:** passes `npm run check`; mounts in the playground with `placeholderParams`; completes and reports through `ctx`;
works at 360px with touch only; usable with keyboard; params errors are readable; documented in its file header.

**Skin:** passes `npm run check`; all elements legible in the playground; every theme it claims is painted and passes the matrix
tests at 8 device sizes; reduced-motion pass done; one pass on a real phone; `skin.json` has description, mood and a preview image.

**Theme (world):** passes `npm run check`; every role placed in both compositions; renders with the neutral skin (default paint);
painted by at least one skin; `theme.json` has metaphor and description.

## 9. Out of scope for this repo

Accounts, payments, the privacy/encryption add-on, the configurator, storefront, order API, and gift build/deploy scripts.
Leave clean seams (resolver, store, `mountElement`) so they plug in without touching elements, themes or skins.
