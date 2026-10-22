# Element guide: build an element

An element is one self-contained piece of experience (a game, an app, a prop, or a finale).
It owns **behavior**. Themes own **look**. Read `RULES.md` sections 4-6 first.

## 1. Folder layout

```
elements/<kind>/<id>/
  index.js     the element module (default export)
  style.css    structure + default paint (see 4)
```

Kinds: `game` (can be completed), `app` (utility inside the world), `prop` (decorative/keepsake), `finale` (vault, reveal).
Register it in `elements/registry.js` - that is the whole registration step.

## 2. The contract

```js
export default {
  id: 'wordle',                 // unique, equals its registry key
  kind: 'game',                 // game | app | prop | finale
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['board', 'tile', ...],        // the public styling API
  layoutParts: ['board'],               // subset of parts that are structure-only
  copy: { win: 'You got it!', ... },    // every user-visible string, with defaults
  paramsSchema: { type: 'object', required: [...], properties: {...} },  // JSON Schema subset
  placeholderParams: { ... },           // used by previews and tests; must validate
  mount(container, ctx) { ...; return { destroy() {} }; },
};
```

## 3. `ctx` reference

| Field | Use |
|---|---|
| `ctx.params` | Validated params, with `{{variables}}` already filled in |
| `ctx.t(key, vars?)` | Copy lookup: gift `params.copy` > theme copy > element default |
| `ctx.vars` | `{ recipient, sender, ... }` |
| `ctx.assets.resolve('@slot')` | Promise of `{ url, type, alt, poster? }`. The only way to get files |
| `ctx.fx.success(el?) / fail / unlock / tap / reveal` | Theme-defined sound + particles. Pass the origin element for particle position |
| `ctx.dialogs.alert({...}) / confirm({...})` | In-world dialogs, return Promises |
| `ctx.store.get(key, fallback) / set(key, value)` | Persisted progress, namespaced per gift + element, never throws |
| `ctx.onComplete(result)` | The element was successfully finished (the engine awards fragments etc.) |
| `ctx.onFail(info)` | An attempt failed (informational; the element handles retry itself) |
| `ctx.emit(name, data)` | Generic event (e.g. coupon redeemed) |
| `ctx.onExit()` | Ask the host to close/leave (finale "back to start") |

`mount` returns `{ destroy() }`. Clean up listeners, timers, and animation frames there.

## 4. Styling: structure vs default paint

`style.css` has two sections:

```css
/* STRUCTURE - normal selectors: layout, sizing, positioning, mechanics (flips, stacking) */
[data-element="wordle"] [data-part="board"] { display: grid; ... }

/* DEFAULT PAINT - wrapped in :where() = zero specificity, token-driven, always overridable by a theme */
:where([data-element="wordle"] [data-part="tile"][data-state="correct"]) { background: var(--gk-success); }
```

- Use only `var(--gk-*)` tokens for color, radius, shadow, motion, tap size.
- Every declared part must appear in `style.css` (the checker fails otherwise) so every element has a fallback look in any theme.
- Expose state with `data-state` on the part (`correct`, `matched`, `redeemed`...). Never toggle random classes.
- Expose per-item indices as custom properties (`--i`) so themes can stagger animations.
- Mark pure wrappers in `layoutParts` so they are not counted against theme coverage.

## 4b. Fit the screen (games and finales)

A game or finale opens in a sheet and must be playable on a phone **without scrolling the page**. The sheet body is a flex column; core gives every
`data-kind="game"` / `"finale"` element exactly the room left under the header and day note (`flex: 1 1 var(--gk-fit-basis, 600px); min-height: 0`), with an
internal scroll only as a last resort. Props and apps (`polaroid`, `coupons`) keep their natural height and the sheet scrolls.

- Size from the room you get, not from fixed pixels. Add a `FIT (inside a sheet)` block to `style.css`, scoped `[data-part="sheet-body"] > [data-element="<id>"] ...`, so the standalone look is untouched.
- Make one part the flexible one (`flex: 1 1 0; min-height: 0`) and keep the rest `flex: none`: wordle's board, memory's grid, jigsaw's stage, timeline's list.
- When tiles/cards depend on the height, make that part a size container (`container-type: size`) and size its children with `cqh`/`cqw`, taking the row/column counts from custom properties the element sets (`--gk-cols`, `--gk-rows`). Cap with a `px` maximum so large screens stay tasteful.
- Short wide screens (landscape phones, `@media (orientation: landscape) and (max-height: 500px)`) may re-arrange (wordle puts the keyboard beside the board) or scroll inside the element, but primary controls must stay reachable.
- Tap targets stay >= `var(--gk-tap)` tall (a ten-key wordle row cannot be 44px wide on a 320px screen; keys are the only width exception).
- Prove it: add the element to `FIT_CASES` in `tests/responsive.mjs` (`npm run test:responsive`). It opens the element in a real sheet with a sample day note on 320x568, 360x640, 390x844, 430x932 and landscape, and fails on vertical scroll (portrait phones), sideways scroll, or small tap targets.

## 5. Rules (checked unless noted)

- Build DOM with `part(tag, name, attrs, ...children)`. **Never** `innerHTML`, `outerHTML`, `insertAdjacentHTML`.
- **Never** `alert/confirm/prompt`, `localStorage`, `fetch`, hardcoded URLs, imports from `themes/`.
- Every string through `ctx.t()`; every file through `ctx.assets`; every persisted value through `ctx.store`.
- Parts created in code must equal `parts[]` (extra or missing parts are flagged).
- Keyboard and touch both work. Pointer Events only (no mouse-only handlers, no HTML5 drag and drop). Tap targets >= `var(--gk-tap)`.
- Provide `aria-label`s, `role="status"` + `aria-live` for feedback text, visible focus (core provides a default ring).
- No silent loops: on failure show feedback and offer retry. Make thresholds params, not constants.
- Check `reducedMotion()` before JS-driven motion.
- Params must validate; errors should be readable (they are surfaced to the person building the gift).
- No third-party anything. Placeholder content is original and generic.

## 6. Add an element: 8 steps

1. Pick the kind and id. Prefer adding a **mode/param** to an existing element if it is a variant.
2. Copy the closest existing element folder.
3. Write `paramsSchema` and `placeholderParams` first. Fill `copy` with every string.
4. Write `mount`: build parts, wire events, report through `ctx.onComplete/onFail`.
5. Write `style.css`: structure first, then `:where()` default paint for every part and state.
6. Declare `parts` and `layoutParts`.
7. Import it in `elements/registry.js`.
8. `npm run check -- element <id>`, open the playground (it renders it automatically from the registry), then add parts styling to each theme (`VERBOSE=1 npm run check` shows the gaps).

## 7. Testing

- **Playground:** every registry element appears with editable params and an event log. Break the params on purpose and confirm the error message is useful.
- **Unit tests** (`tests/unit.mjs`): pure logic only; placeholderParams-vs-schema is tested for every element automatically.
- **Browser smoke** (`tests/smoke.mjs`): add the element to the sample config and extend the flow if it is a completable game.

## 8. Ideas that fit the contract (from the original gift)

`hunt` (scavenger hunt), `lyric` (customer-supplied snippet only), `jigsaw` (pointer-drag), `crossword` (clues generated from the same data as the grid),
`timeline`, `hearts` (hidden objects with explicit state). Port them as new elements following the steps above;
fix the known source bugs instead of copying them (clue/grid mismatch, drag and drop that fails on touch, fragment collisions).
