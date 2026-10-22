# Skin guide: build a skin (a look)

Read `RULES.md` (5 minutes) and `docs/WORLD_CONTRACT.md` first. A **skin** is a look: palette, type, shape, sound, copy,
how every element looks, and how each theme's objects are painted. A skin works in every **theme** (world). Themes are
covered in the contract; this page is about skins.

Reference skins: `skins/nightsky/` (full), `skins/arcade/` (full, very different feel). Smallest valid skin: `skins/_neutral/`.

## 0. The 10-minute start

```bash
npm run dev                                        # playground at http://localhost:5173/playground/
npm run new-skin -- forest "Forest"                # copies _neutral -> skins/forest, registers it
# edit skins/forest/tokens.css (palette, type, motion) -> pick "Forest" in the playground (Skin menu)
npm run check -- skin forest                       # contract check
```

With only `tokens.css`, all 13 elements AND every theme already look coherent: core paints elements from your tokens,
and `core/world.css` paints every role (a glyph in a rounded token) from the same tokens. Everything after this is
*making it feel like a world*.

## 1. Anatomy of a skin folder

```
skins/<id>/
  skin.json            manifest: id, name, styles[], worlds{}, preview, contractVersion      (required)
  tokens.css           the 26 required --gk-* tokens + optional per-tier mood                (required)
  parts.css            restyles element parts (wordle tile, memory card...), may start empty  (required)
  index.js             exports { id, fx, copy, decorate? }                                    (required)
  paint-<theme>.css    how this skin paints a theme's roles (per theme you support)          (optional)
  decorate-<theme>.js  decorative DOM for that theme (a window, a cabinet, a moon)           (optional)
  assets/              preview.svg, fonts/ (self-hosted), textures
```

`skin.json` declares what it paints:

```json
"worlds": { "desk": { "styles": ["paint-desk.css"], "module": "decorate-desk.js" },
            "outdoors": { "styles": ["paint-outdoors.css"], "module": "decorate-outdoors.js" } }
```

A theme with no entry falls back to the default paint, so it still works. The checker prints which themes a skin paints.

## 2. Step by step

1. **Tokens** (`tokens.css`). Scope with `[data-skin="<id>"]`. Use plain hex for colors so contrast is checked
   (text on bg, muted on bg, accent-text on accent). Optional per-tier mood: `[data-skin="<id>"][data-tier="spark"] { --gk-accent: ... }`.
2. **Parts** (`parts.css`): highest impact first - wordle, memory, vault, reveal, then the rest.
   Pattern: `[data-skin="<id>"] [data-element="wordle"] [data-part="tile"][data-state="correct"] { ... }`.
   Change look (color, shape, texture, glow, motion), never layout geometry: elements size themselves to fit the screen.
3. **FX and copy** (`index.js`): `fx` defines all five events (`{}` = silent), synthesized sound and particles only.
   `copy` holds `"<element>.<key>"` overrides and shell labels: `"shell.<key>"`, or `"shell.<theme>.<role>"` to re-word a
   role for one theme (a `hub` is a Laptop in a desk room, a Tent outdoors). Resolution order: gift config > skin > theme > core.
4. **Paint a theme**: `paint-<theme>.css` paints the roles (`hero`, `hub`, `vault`, `board`, `tally`, `jar`, `light`, `scenic`,
   `app-*`, `pet`, `toy`, `ambient-*`), the ambience layers (`glow`, `dim`) and the hub sheet; `decorate-<theme>.js`
   (default export `decorateWorld({ tier, room, stage, roles, copy, vars })`) may add purely decorative DOM.
   Every role also has four empty `slot-a..slot-d` spans to paint with CSS alone. You may override a role's box variables
   (`--<role>-x/-y/-w/-ar`) when your art needs another shape.
5. **Preview**: `assets/preview.svg` about 320x200 for the configurator picker.
6. **Check, then test like a recipient**:

```bash
npm run check -- skin <id>      # must print OK
npm test                        # unit + contract checks
npm run test:browser            # whole matrix: every theme x skin x tier, phone viewport, full play-through
npm run test:responsive         # whole matrix at 8 device sizes + every element fits the screen
```

## 3. Rulebook (checklist)

**MUST** (checked by `npm run check`)
- [ ] `skin.json` valid; `id` equals the folder name; `contractVersion` current; listed files exist
- [ ] All 26 tokens defined; `--gk-tap >= 44px`; contrast >= 4.5:1 for text pairs
- [ ] Every CSS selector scoped to `[data-skin="<id>"]` (or `:where([data-skin="<id>"] ...)`)
- [ ] Every `@keyframes` prefixed `<id>-`; animation present => `prefers-reduced-motion` block present
- [ ] No external URLs, `@import`, CDN fonts; no `alert/confirm/prompt`, no `innerHTML` in skin JS
- [ ] All 5 `fx` events and `copy` exported; no `shell` (a skin never defines behavior)
- [ ] A world-paint rule that mentions a part name an element also uses (`board`) sits under `[data-part="room-stage"]`

**MUST** (human review, and the matrix tests)
- [ ] Style parts and states only; never element internals or tag names
- [ ] Every role is recognisable in the paint, >= 44px, fully on screen, and focus is visible
- [ ] Decorative DOM is `aria-hidden` and never intercepts pointer events
- [ ] Nothing says "fragment", "level" or "collect": the world guides implicitly
- [ ] Original art, copy and sound only

**SHOULD**
- [ ] 100% element part coverage (`VERBOSE=1 npm run check -- skin <id>` lists gaps)
- [ ] Paint for every theme in `themes/themes.json`
- [ ] Prefer CSS gradients/SVG to images; keep any image under ~100KB
- [ ] A palette that works for both a romantic and a playful gift (copy changes, look does not)

**MUST NOT**
- Change element layout geometry or a theme's role geometry "to fit" (override the role's box variables instead)
- Add logic, timers, network, storage or analytics to a skin
- Import anything from `elements/`
- Depend on a font, image or script from another origin

## 4. Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Skin styles do nothing | Selector not under `[data-skin="<id>"]`, or a wrong `data-part` name | Copy part names from the element's `parts[]` or the role table; run the checker |
| Core defaults override mine | They do not (`:where()`), so check for a typo in the part or state name | Inspect the node: read its `data-part` / `data-state` |
| A wordle or jigsaw board turns into my pinboard | World-paint rule on `board` is not scoped under the stage | Prefix `[data-part="room-stage"]` (the checker catches this) |
| A role is under the finger-size rule | The role's box is too small at 320px wide | Raise its `--<role>-w` for your skin or reshape the art |
| An animation plays on load for every tile | Animating the base selector instead of a `[data-state]` | Put the animation on the state selector |

## 5. Going further

- **A new theme is a new world, not a new skin**: see `docs/WORLD_CONTRACT.md` and `npm run new-theme`.
- **Skin families**: a second skin that re-points tokens and re-uses `decorate-<theme>.js` by import is almost free.
- **A new element needs a skin pass**: `VERBOSE=1 npm run check -- skin <id>` shows which parts each skin still needs.
