# Context and roadmap

Background captured from the planning chat, so a fresh Claude Code session does not start blind.

## The product
- Done-for-you personalized interactive digital gifts (mostly romantic couples, later any occasion). Customers answer questions, see a watermarked preview and a quote, and order. The owner builds the gift from one JSON config and delivers a private link. Payment happens over WhatsApp.
- Origin: a 10-day birthday gift (desk scene with a laptop, one mini-game per day, one key fragment per day, a vault on the last day that opens a video and a letter). It was hardcoded for one couple. The new product is config-driven.
- Tiers (presets of the same engine): Spark (instant), Moment (one sitting), Countdown (multi-day), Signature (custom, apply form only). Prices in INR, editable later.

## Why this repo exists
A previous attempt (Copilot, in `Needmoney/`) produced a ~570-line skeleton with stub games, an in-memory order store, a server price that ignored `pricing.json`, and a runtime that only opened the first game. We restarted in smaller parts, with rules first.

## The 3-part split (build order matters)
1. **Part 3 (P0) - Themes + elements** (THIS REPO). The creative library. Done so far: contract, 7 elements, Night Sky theme, neutral starter, playground, checker, reference runtime, tests.
2. **Part 1 (P1) - Engine**: reads a config, assembles theme + elements, validates, builds assets, produces a private deployable link. Admin/builder for the owner.
3. **Part 2 (P2) - Customer website**: storefront, configurator with live preview and pure `price(config)`, order API, WhatsApp handoff.

## Decisions already made
- Elements own behavior, themes own presentation. Four theme layers: tokens, parts, fx/copy/decorate, shell (the metaphor).
- Core paints every part from tokens via zero-specificity `:where()`, so a theme with only tokens + shell already works.
- Variants over new modules (one `quiz` covers quiz, who-said-it, no-wrong-answer).
- Vault code is derived from fragments, never hardcoded. Fragments are unique and avoid I/O/0/1.
- Every asset is a `@slot` resolved through an AssetResolver (so an encrypted resolver can be added later).
- In-world dialogs only (no alert/confirm/prompt). Pointer Events only. Mobile first at 360px.
- No third-party lyrics, titles, art, or audio anywhere. Placeholder content is original.

## Known bugs from the ORIGINAL gift to avoid when porting games
- Fragment collisions (two days awarding the same letter; code ignoring some days).
- Memory game awarding a different fragment than it displayed.
- Hidden-hearts reveal using conflicting opacity classes (use explicit state).
- Crossword clue/grid mismatch (generate clues from the same data as the grid).
- Chat-stats style games requiring a perfect score and silently looping (make thresholds configurable, show feedback).
- Wordle row-count differing across versions (parametrize).
- HTML5 drag and drop (jigsaw, sortable list) fails on touch: use Pointer Events.
- `closeApp` relying on global `event`; music pause on null audio; settings window never opening.

## Roadmap
1. Port remaining elements: `lyric`, `crossword`, `hearts` (see `docs/ELEMENT_GUIDE.md`, section 8). Done: `hunt`, `jigsaw`, `timeline`.
2. Second theme: DONE - `arcade` (neon retro arcade; Spark cabinet, game-room desk, Signature adds jukebox, claw machine, terminal, pinball, ghost). It proves the room contract: rooms share hotspot part names for the desk objects (`laptop`, `lamp`, `jar`, `lockbox`, `pinboard-hit`, `window-hit`, `calendar-day`, `note`, `app`, `taskbar` + `data-tool`), so the shared browser tests run for every room theme via the per-theme tables in `tests/smoke.mjs` and `tests/responsive.mjs`. A third theme can reuse the same contract. The display font is a bold monospace until a pixel font is self-hosted (needs owner OK to download one).
3. Tier presets: sample configs exist for Spark (`sample/spark.json`, one game then a direct reveal), Countdown (`sample/config.json`) and Signature (`sample/signature.json`, 10 days, 8 game types). Night Sky now has a real room per tier instead of a map: Spark (window + gift, `scene-spark.js`), Countdown (desk with laptop, pinboard, jar, locked box, lamp, `scene-countdown.js`). Signature (same `scene-desk.js`, richer): laptop taskbar with Music, Photos and Notes apps (elements `music`, `gallery`, `notes`), curtains, plant to water, fairy lights, lamp, a cat, a notebook; warmer palette and an aurora in the window. The old star map remains only as `shell-map.js`, a fallback for unknown tiers. Design rules from the owner: no on-the-nose copy (no "fragments", "Star N", challenge framing); the world implicitly guides; always something to touch; tiers differ by the whole environment, not just the number of games; theme nuance per tier via `data-tier` (small palette shift).
4. Then Part 1 (engine) and Part 2 (website). Not before Part 3 is solid.

## Open questions for the owner
- Brand name (use a single site config when the website is built).
- Which second theme first: Desk (the original look) or something new?

## Architecture update: themes x skins x tiers (read docs/WORLD_CONTRACT.md)
The owner reframed the library: a THEME is the world's setup (desk room, outdoor clearing, later a concert), a SKIN is a look
(Night Sky, Arcade, later a green one) that works in every theme, and a TIER is the size of the experience. Offerings =
themes x skins x tiers (2 x 2 x 3 = 12 today). Roles (`hub`, `vault`, `board`, ...) are the stable contract; `core/world.js`
is the shared behavior, `core/world.css` the shared structure and token-driven default paint, `themes/<id>/layout.css`
the geometry, `skins/<id>/paint-<theme>.css` + `decorate-<theme>.js` the art. Gift config: `meta: { theme, skin, tier }`.
Next candidates: a concert theme; a third skin (green); a fourth tier.

## Owner feedback after the first themes (the journey)
- Tiers 1 and 2 are right as they are. Signature was a mess: every object on screen at once, no guiding spirit, no story.
- Fixes: progressive reveal (the room grows one thing per finished night), a story beat per night plus a one-time intro,
  the hub shows only tonight and one teaser, and a gentle glow marks whatever is new. See docs/WORLD_CONTRACT.md ("The journey").
- Gifts are landscape only (rotate hint in portrait). Roles can be included or excluded per gift (`config.roles`).
- Endings: the finale (`reveal`) has variants chosen with `finale.variant` (scroll, envelope, slideshow, cake).
- Open question for the owner: the story text in sample/signature.json is placeholder; real gifts need the sender's own beats.

## Part 1 (engine) - first version built
`npm run gift -- new|add|check|preview|build <name>` (docs/ENGINE.md). A gift is a folder (`gift.json` + `media/`); media is used by file
name (`@us_at_goa`), songs / pictures / a video appear in the gift automatically, `check` explains problems in plain words, `preview`
serves the gift on the LAN (HTTP Range for iPhones) with live reload, `build` writes a self-contained folder + zip with hashed media
and a secret path. Still to do: hashed text answers, encrypted private media, image resizing, a visual editor, order intake from Part 2.

