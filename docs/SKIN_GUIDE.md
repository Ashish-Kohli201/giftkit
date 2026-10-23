# Skin guide: build a skin (a look)

Read `RULES.md` first. A **skin** is a look: palette, type, shape, sound, copy, and how each part of a format is drawn
(the envelope, the cake, the film frame ...). Every product can wear any skin its `product.json` lists.

Reference skins: `skins/nightsky/` and `skins/arcade/` (full, very different feel). Smallest valid skin: `skins/_neutral/`.

## 0. The 10-minute start

```bash
npm run dev                                        # playground at http://localhost:5173/playground/
npm run new-skin -- forest "Forest"                # copies _neutral -> skins/forest and registers it
# edit skins/forest/tokens.css (palette, type, motion)
# add "forest" to a product's "skins" and to its "skin" option choices to see it in the playground's Look menu
npm run check -- skin forest                       # contract check
```

With only `tokens.css`, every format already looks coherent: core paints every part from your tokens. Everything after this
is *making it feel like something*.

## 1. The files

```
skins/<id>/
  skin.json     manifest: id, name, description, mood, entry, styles[], preview, contractVersion   (required)
  tokens.css    the 26 required --gk-* tokens, scoped to [data-skin="<id>"]                       (required)
  parts.css     how each part of the reveal element looks: [data-skin="<id>"] [data-element="reveal"] [data-part="env-seal"]
  index.js      fx (sound + particles + haptics per event) and copy overrides ("reveal.<key>")
  assets/       preview.svg (about 320x200, for the website's picker); fonts and images are self-hosted here
```

## 2. The four layers, cheapest first

1. **Tokens**: palette, type, shape, motion. A coherent baseline on its own.
2. **Parts**: restyle each named part of the reveal element. `VERBOSE=1 npm run check -- skin <id>` lists the parts you skipped.
3. **fx and copy**: `fx.success/fail/unlock/tap/reveal` (synthesized, no audio files) and microcopy like `reveal.restart`.
4. **Preview image**.

## 3. Rulebook (checklist)

**MUST** (checked by `npm run check`)
- [ ] `skin.json` valid; `id` equals the folder name; `contractVersion` current; listed files exist
- [ ] All 26 tokens defined; `--gk-tap >= 44px`; contrast >= 4.5:1 for text pairs
- [ ] Every CSS selector scoped to `[data-skin="<id>"]` (or `:where([data-skin="<id>"] ...)`)
- [ ] Every `@keyframes` prefixed `<id>-`; animation present => `prefers-reduced-motion` block present
- [ ] No external URLs, `@import`, CDN fonts; no `alert/confirm/prompt`, no `innerHTML` in skin JS
- [ ] All 5 `fx` events and `copy` exported

**MUST** (human review)
- [ ] Style parts and states only; never element internals or tag names
- [ ] Focus is visible; tap targets are at least 44px
- [ ] Original art, copy and sound only
- [ ] Check it on a real phone, in portrait, with the longest allowed message

**MUST NOT**
- Change an element's layout geometry "to fit"
- Add logic, timers, network, storage or analytics to a skin
- Import anything from `elements/` or `products/`
- Depend on a font, image or script from another origin

## 4. Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Skin styles do nothing | Selector not under `[data-skin="<id>"]`, or a wrong `data-part` name | Copy part names from the element's `parts[]`; run the checker |
| Core defaults override mine | They do not (`:where()`), so check for a typo in the part or state name | Inspect the node: read its `data-part` / `data-state` |
| An animation plays on load for every item | Animating the base selector instead of a `[data-state]` | Put the animation on the state selector |
