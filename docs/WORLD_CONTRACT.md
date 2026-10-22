# World contract: themes, skins and tiers

A gift is built from three independent choices. Any combination must work.

| Choice | What it is | Where it lives |
|---|---|---|
| **Theme** | The world's setup: a desk room, an outdoor camp, a concert stage. Decides *where things are* and the layout of the roles below. | `themes/<id>/` |
| **Skin** | The look: palette, type, shape, sound, copy, how every element looks, and how each theme's objects are painted. Night Sky, Arcade, a green skin... Usable across themes. | `skins/<id>/` |
| **Tier** | How big the experience is: Spark (one tap), Countdown (a day per game), Signature (everything). | `config.meta.tier` |

`themes x skins x tiers` is the number of offerings. Adding a skin or a theme multiplies the catalogue.
Elements (wordle, memory, quiz...) are shared by all of them and never change.

```
gift config  { meta: { theme: "desk", skin: "nightsky", tier: "countdown" } }
   |
   +--> loadTheme(theme, skin)
          skin   : tokens + element parts (parts.css) + fx + copy + paint-<theme>.css + decorate-<theme>.js
          theme  : layout.css + the world engine (core/world.js) that creates the roles
```

## Roles: what every theme must provide

A role is something the recipient can touch, with a fixed meaning. A theme places the roles in its world; a skin
decides what they look like. **Role part names are the stable contract** - the engine, the tests and every skin rely on them.

| Role (`data-part`) | Meaning | Tiers | Behavior (owned by the world engine) |
|---|---|---|---|
| `hero` | The one thing to tap (a gift, a cabinet button) | spark | Opens the surprise. `data-state` idle / pressed |
| `hub` | Where the days live (laptop, console, tent screen) | countdown, signature | Opens a sheet with one icon per day (and the app taskbar). `data-hint="yes"` when a day is ready |
| `vault` | The locked thing that gives the final surprise | countdown, signature | `data-status` locked / open / done, `data-hint="yes"` when ready |
| `board` | Pinned memories | when the gift has `scene.corkboard` (still shown for its notes otherwise) | Opens Memories. Contains `board-notes` holding `note` (`data-state` filled / empty, letter text) |
| `tally` | Quiet progress marks | countdown, signature | Contains `tally-mark` (`data-status` locked / open / done) |
| `jar` | Coupons | when the gift has `apps.coupons` | Opens coupons |
| `light` | The ambience switch (lamp, neon sign, lantern) | countdown, signature | Toggles `data-ambient` on / off on `room`, `aria-pressed` |
| `scenic` | The backdrop (a window, a screen, the sky) | countdown, signature | Tap sets `data-state="pop"` for ~1.2s (shooting star, sparkle) |
| `app-music` | Music launcher (record player, jukebox) | signature | Opens the Music app |
| `app-gallery` | Photos launcher (photo line, claw machine) | signature | Opens the Gallery app |
| `app-notes` | Notes launcher (notebook, terminal) | signature | Opens the Notes app |
| `pet` | A creature (cat, ghost, fox) | signature | Tap sets `data-state="happy"` for ~2.6s |
| `toy` | A toy (plant to water, pinball) | signature | Tap sets `data-state="play"` for ~2.2s |
| `ambient-a` / `ambient-b` | Two extra toggles (fairy lights, curtains, marquee...) | signature | Toggle `data-ambient-a` / `data-ambient-b` (`on` / `off`) on `room`, `aria-pressed` |

A role whose extra is missing from the gift is not rendered. The hub sheet parts (`desktop`, `apps`, `app` with
`app-glyph` / `app-label`, `taskbar` with `app[data-tool]`) are shared chrome that every skin paints.

Roles never say "fragment", "level" or "collect" in their labels. The room guides the recipient implicitly.

## DOM the world engine builds

```
[data-part="room"]  (data-ambient, data-ambient-a, data-ambient-b)      size container, fills the screen
  [data-part="room-back"]   decorative, full bleed (wall, sky)
  [data-part="room-floor"]  decorative, full bleed (carpet, grass)
  [data-part="room-stage"]  fixed-aspect box; ALL sizes inside are cqw (1% of the stage width)
     ...the roles above, each a <button> (or div for tally/board-notes) with 4 empty decorative children
        [data-part="slot-a"] .. [data-part="slot-d"]  (aria-hidden) for the skin to paint
     [data-part="dim"]   darkens the room when ambience is off (overscans the room)
     [data-part="glow"]  light-source glow (overscans the room)
  [data-part="room-over"]   decorative overlay (scanlines, vignette)
```

The stage is 9:16 in portrait and 16:10 otherwise, anchored to the top and centred. The same composition therefore
appears on every device.

## Who owns what

**Theme (`themes/<id>/layout.css`, scoped `[data-theme="<id>"]`)** - geometry only.
- Sets the stage variables per orientation: for each role `--<role>-x`, `--<role>-y`, `--<role>-w` (cqw), plus any
  theme-specific variables (e.g. `--horizon-y`) that skins may read.
- Positions every role (`left/top/width`), tap target minimum 44px, focus ring, stacking order, hidden when not applicable.
- Ships a **token-driven default paint** wrapped in `:where()` so a skin with only tokens still renders every role
  (a simple glyph in a rounded box). Never hard-codes colors.

**Skin (`skins/<id>/`, scoped `[data-skin="<id>"]`)** - everything you see.
- `tokens.css`, `parts.css` (element looks), `index.js` (`fx`, `copy`, `decorate`), `skin.json`.
- Per theme: `paint-<theme>.css` and optionally `decorate-<theme>.js`. The decorate module default-exports
  `function decorateWorld({ tier, room, stage, roles, copy })` and may append purely decorative DOM (aria-hidden,
  pointer-events none) to `stage` / `room` / any role. It may not add behavior or listeners that change state.
  `roles` maps role name to its element.
- May override a role's box variables for a theme (a cabinet is taller than a gift box) with higher specificity.
- Declares the worlds it paints in `skin.json` under `worlds`. A world with no paint falls back to the theme's default paint.
- May override the role names read aloud: skin copy key `shell.<theme>.<role>` beats `shell.<role>`.

**Engine (`core/world.js`)** - behavior and state: roles, sheets, toggles, transient states, hub sheet, hotspot visibility.

## Copy resolution (shell labels)

`skin copy["shell.<theme>.<key>"]` > `skin copy["shell.<key>"]` > `theme copy["shell.<key>"]` > core default.
Role label keys (read aloud, never shown as text): `giftTag` (the Spark hero, also shown on it), `hub`, `vault`, `board`, `jar`, `light`,
`scenic`, `appMusic`, `appGallery`, `appNotes`, `pet`, `toy`, `ambientA`, `ambientB`. The app names shown on the hub taskbar are
`music`, `gallery`, `notes`. A role whose part name an element also uses (`board`) must be styled under `[data-part="room-stage"]`.

## Checks (`npm run check`)

- every skin: tokens, element part coverage, fx, copy, scoping (`[data-skin="<id>"]`), keyframes prefixed `<skin>-`, reduced motion
- every theme: manifest, `layout.css` scoping (`[data-theme="<id>"]`), keyframes prefixed `<theme>-`, every role positioned
- every (theme, skin) pair that the skin declares: its paint file exists and is scoped `[data-skin="<id>"]`
- `npm run test:browser` and `npm run test:responsive` run the whole matrix: every theme x every skin x every tier on 8 device sizes
