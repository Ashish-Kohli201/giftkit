# The gift studio

A screen for making a gift: no files to edit, no commands after the first one. It works on the same gift folders as the
command line (`gifts/<name>/gift.json` + `media/`, see `docs/ENGINE.md`), so you can move between the two at any time.

```bash
npm run gift -- studio          # opens http://localhost:5190/ in your browser (add --no-open, --port 5190)
```

The studio only answers on this computer. Press Ctrl+C in the terminal to close it. Everything is saved as you go; the last
30 versions of each `gift.json` are kept in `gifts/<name>/.history/`.

## The six steps

| Step | What you do |
|---|---|
| **1 Setup** | Who the gift is for and from, when the nights open (real dates counting down to the birthday, one after another, or all open), how big it is (Spark, Countdown, Signature), and its world and look. |
| **2 Media** | Drag in pictures, songs and videos. Thumbnails, a song player, each file's name (`@us_at_goa`), whether it is used, warnings for heavy or unsupported files, delete, a cover picture for a video. Switch off what gets added on its own (Music app, Photos app, pinboard). |
| **3 Nights** | Each night's game, written as a form (wordle, quiz, "who said it?", hunt, memory, jigsaw, timeline), the line above it, and its story. Drag to reorder, add, duplicate, delete. **Try this night** opens that game in the live preview. Signature gifts also get their opening words here. |
| **4 Room** | What is in the room and when each thing appears: a timeline with a column per night; drag things to another night, leave things out, or show the whole room from the start. Also coupons, notes, music and photo details, and the memories board. |
| **5 Ending** | A locked box or straight to the surprise; four ending styles (rolling credits, a sealed envelope, a memory film, make a wish) you can play in the preview; the headline, letter, photos and video. |
| **6 Review** | What is still wrong in plain words with a button that jumps to where to fix it, a checklist before sending, a summary, and **Build the gift**: a folder and a zip, how to put it online, and the private link. |

## Always beside you: the live preview

The gift itself, in a landscape phone, updates after every change. Under it: how far through the nights to show, a screen size,
"Show everything", reload, **On my phone** (the Wi-Fi address to open on a phone on the same Wi-Fi) and **New tab**.
Undo and redo (Ctrl+Z / Ctrl+Shift+Z) work across every screen. If `gift.json` ever has a typo, the studio shows the text and
the problem so it can be fixed right there.

## For developers

```
engine/studio/server.js          the local server: JSON API + the live preview + file serving (guarded: this computer only,
                                 writes need the X-Studio header and a local Origin)
engine/studio/ui/app.js          the shell: routes, top bar, steps, preview, repair screen
engine/studio/ui/store.js        state, autosave, undo/redo, events (open, edit, saved, report, media, preview, upload)
engine/studio/ui/ui-kit.js       h() and the small set of controls; media-picker.js is the shared file chooser
engine/studio/ui/preview.js      the live preview panel and previewGo({ play, ending })
engine/studio/ui/pages/*.js      one module per step (render(root, ctx) -> cleanup)
engine/studio/ui/schema-form.js  a settings form generated from any element's paramsSchema
tests/studio-*.mjs               one test file per step; tests/lib/studio-harness.mjs is the shared setup (npm run test:studio)
```

A step is `{ id, title, hint, render(root, { store, go, goStep }) }`. It builds itself once, edits only through
`store.edit(fn, { coalesce })` (so typing is one undo step and focus is never stolen) and listens to the store's events.
Colours come from the CSS variables in `studio.css` (light and dark).

Not done yet: duplicating or deleting a whole gift from the home screen, renaming a media file, a QR code for the phone
address, image resizing, and sign-in (the studio is a single-person tool on one computer).
