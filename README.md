# giftkit

Themes and elements for config-driven interactive gifts. Zero runtime dependencies.
This repo is **Part 3 (P0)**: the creative library the engine will assemble.

## Run it

```bash
npm run dev          # http://localhost:5173/playground/
npm test             # unit tests + contract check (no browser needed)
npm run test:browser # Playwright smoke test (npm i && npx playwright install chromium first)
```

Needs Node 18+. No install step is required to run the playground.

## What is in the box

| Path | What |
|---|---|
| `RULES.md` | **Start here.** Vocabulary, layers, hard rules, definition of done |
| `engine/` | The gift engine: media folder + gift.json -> checked, built static gift (docs/ENGINE.md) |
| `docs/SKIN_GUIDE.md`, `docs/WORLD_CONTRACT.md` | Build a skin (a look); how themes (worlds), skins and tiers fit together |
| `docs/ELEMENT_GUIDE.md` | Build an element + the `ctx` reference |
| `elements/` | 7 elements: wordle, memory, quiz (also who-said-it), vault, reveal, polaroid, coupons |
| `themes/desk/`, `themes/outdoors/` | Worlds: where the roles sit (layout.css). Behavior is `core/world.js` |
| `skins/nightsky/`, `skins/arcade/` | Looks, each painted for every theme (tokens, element parts, fx, copy, paint) |
| `skins/_neutral/` | Smallest valid skin (tokens only) and the scaffold template |
| `core/` | Theme loader, `mountElement`, sheets, dialogs, fx, resolver, store, validator, fragments, schedule |
| `core/runtime.js` | **Reference** glue: config + theme + elements -> a playable gift |
| `sample/config.json` | A 5-day countdown gift used by the playground and tests |
| `sample/spark.json`, `sample/signature.json` | The small (one game, no vault) and big (10 day, 8 game types) tier samples |
| `playground/` | Dev tool: every element standalone (editable params) + the full gift in a phone frame |
| `scripts/` | `serve.mjs`, `check.mjs` (contract checker), `new-skin.mjs` and `new-theme.mjs` (scaffolds) |

## How it fits together

```
config.json ──> engine ──> loadTheme(id)   tokens + parts + fx + copy + shell
                   │
                   └────> shell.mount() ──> user taps an item
                                          └> mountElement(element, container, { params, theme, assets, store, hooks })
                                                 element -> ctx.onComplete() -> engine awards a fragment -> shell updates
                                                 all fragments -> vault (code derived) -> reveal
```

- **Elements** own behavior and expose named **parts** (`data-part`) and **states** (`data-state`).
- **Themes** own presentation in four layers: tokens, parts, fx/copy/decoration, and the **shell** (the metaphor).
- A theme with only tokens + a shell is already complete (core paints every part from tokens).

## Everyday tasks

```bash
npm run gift -- new aria-birthday           # make a gift (then: add, preview, check, build; see docs/ENGINE.md)
npm run new-skin -- forest "Forest"         # scaffold a skin (a look)
npm run new-theme -- concert "Concert"      # scaffold a theme (a world)
npm run check                              # check all elements + themes
npm run check -- theme nightsky            # one theme
VERBOSE=1 npm run check -- theme arcade    # list unthemed parts
```

Add an element: see `docs/ELEMENT_GUIDE.md` section 6. Add a skin: `docs/SKIN_GUIDE.md`. Add a theme (world): `docs/WORLD_CONTRACT.md`.

## Status and next steps

- Done: contract, 7 elements, 1 full theme + starter, checker, playground, reference runtime, tests.
- Not here by design: configurator, storefront, order API, gift build/deploy, encrypted assets (see `RULES.md` section 9).
- Next elements (port from the original gift): hunt, lyric, jigsaw, crossword, timeline, hearts. Next theme: a second world to prove the abstraction (e.g. Arcade or a Desk port).
