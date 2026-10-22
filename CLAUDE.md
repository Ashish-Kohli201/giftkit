# CLAUDE.md

Read `RULES.md` first. It is the source of truth. Then `docs/CONTEXT.md` for the background and roadmap, and `docs/WORLD_CONTRACT.md` for how themes (worlds) and skins (looks) fit together.

## Working rules
- After ANY change to an element, skin or theme, run `npm run check`. Before finishing a task, run `npm test`.
- Browser flow check: `npm run test:browser`; device-size check: `npm run test:responsive` (both run the whole theme x skin x tier matrix; needs `npm i` and `npx playwright install chromium` once).
- Never claim something works unless a test or the playground shows it.
- No stubs, no TODO placeholders, no one-line minified code. Readable, commented, small files.
- Keep zero runtime dependencies. No frameworks, no CDN, no third-party requests in gift code.
- Do not add features that are not asked for. One task per session.
- Hyphens, not em-dashes, in docs and copy.

## Commands
- `npm run dev` -> http://localhost:5173/playground/
- `npm run check` / `npm run check -- skin <id>` / `npm run check -- theme <id>` / `npm run check -- element <id>`
- `npm run new-skin -- <id> "Name"` / `npm run new-theme -- <id> "Name"`
- `npm run gift -- new|add|check|preview|build <name>` the gift engine (docs/ENGINE.md); `npm run gift -- studio` the on-screen gift studio (docs/STUDIO.md); `npm run test:engine` / `npm run test:studio` test them
- `npm test` -> unit tests + contract check

## Where things live
- `elements/<kind>/<id>/` behavior (index.js + style.css). Register in `elements/registry.js`.
- `themes/<id>/` a world: geometry of the roles (layout.css). List in `themes/themes.json`. Behavior is `core/world.js`, structure + default paint `core/world.css`.
- `skins/<id>/` a look: tokens, element parts, fx, copy, and `paint-<theme>.css` + `decorate-<theme>.js` per theme. List in `skins/skins.json`.
- `engine/` the gift engine: reads `gifts/<name>/gift.json` + `media/`, checks it, builds a static gift folder + zip. `gifts/`, `dist-gifts/`, `.engine/` are never committed.
- `core/` shared plumbing. `core/runtime.js` is a REFERENCE glue, not the production engine.
- `engine/studio/` the gift studio (a local web app over the same gift folders).
- Guides: `docs/ELEMENT_GUIDE.md`, `docs/SKIN_GUIDE.md`, `docs/WORLD_CONTRACT.md`, `docs/ENGINE.md`, `docs/STUDIO.md`.
