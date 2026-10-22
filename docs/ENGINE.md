# The gift engine

The engine turns a folder of words and media into a finished gift: one static folder (and a `.zip`) that opens on any
phone and works on any web host. It checks your work first and tells you what is wrong in plain words.

```
gifts/aria-birthday/
  gift.json      the words, the games, the choices
  media/         drop pictures, songs and videos here
```

## The easiest way: the studio

`npm run gift -- studio` opens a screen where you do everything below by clicking and dragging (setup, media, each night, the room, the ending, check and build). See `docs/STUDIO.md`. The rest of this page is the command line and the file format it works on, which the studio reads and writes too.

## The 5-minute path

```bash
npm run gift -- new aria-birthday --for "Aria" --from "Sam" --birthday 2026-12-20
npm run gift -- add aria-birthday "C:\Users\me\Pictures\goa-trip"      # or just drag files into gifts/aria-birthday/media
npm run gift -- preview aria-birthday                                  # opens on this computer AND on your phone (same Wi-Fi)
npm run gift -- check aria-birthday                                    # what is still wrong?
npm run gift -- build aria-birthday                                    # -> dist-gifts/<secret>/ and <secret>.zip
```

`preview` prints two addresses: one for this computer and one for a phone on the same Wi-Fi. Save `gift.json` or drop in a
file and the page refreshes by itself. Progress is not saved in a preview, so every reload starts fresh. Add these to the address:

| Add to the address | What it does |
|---|---|
| `?unlock=1` | show everything, ignore the schedule |
| `?night=4` | pretend four nights are finished (to see night five) |
| `?today=2026-12-05` | pretend it is that date (for date schedules) |
| `?finale=envelope` | try another ending: `scroll`, `envelope`, `slideshow`, `cake` |
| `?exclude=pet,toy` | leave roles out of the room |

## Adding your own media

**Drop files in the `media/` folder. That is all.** A file is used by its name: `us at goa.jpg` becomes `@us_at_goa`
(lowercase, spaces and symbols become `_`). You never list files anywhere, and sub-folders are fine.

| Kind | Use | Notes |
|---|---|---|
| Pictures | `.jpg` `.png` `.webp` `.gif` `.avif` | under 5 MB each. iPhone `.heic` must be exported as JPG |
| Songs | `.mp3` `.m4a` `.aac` `.ogg` `.wav` | under 15 MB. Your own songs only |
| Videos | `.mp4` (H.264) `.webm` | under 60 MB. `.mov` only plays on Apple devices. Cover picture: `clip.poster.jpg` next to `clip.mp4` |

**Things appear on their own** (every one is reported as a note by `check`, and you can switch them off):

- songs in `media/` add a **Music** app (all songs, up to 12)
- pictures add a **Photos** app (up to 24), pin the first ones to the **memories board** (up to 8), and add a photo block to the **ending**
- a video joins the **ending**

To say no: `"auto": false` at the top of `gift.json` (turns all of it off), or `"apps": { "music": false }`.

**Using a file by name** (anywhere in `gift.json`):

```json
"apps": { "gallery": { "items": ["@us_at_goa", { "photo": "@sunset", "caption": "The night we got lost" }] } },
"finale": { "reveal": [ { "type": "video", "ref": "@our_story" }, { "type": "photos", "items": "@all" } ] },
"days": [ { "day": 6, "game": { "type": "jigsaw", "params": { "image": "@any" } } } ]
```

| Shorthand | Means |
|---|---|
| `"@all"` | every picture (or every song) in `media/`, up to what that element can show |
| `["@a", "b"]` | a plain list of names instead of objects; `@` and capital letters are optional |
| `"@any"` | for a game that needs one picture (jigsaw): the first picture in `media/` |
| `"faces": "@all"` | a memory game that uses your pictures as the card faces |

A name that does not match a file is caught with a suggestion: `@us_at_goaa ... Did you mean @us_at_goa?`

## gift.json

Only the first three parts are required. Everything else has a sensible default.

```json
{
  "meta": { "theme": "outdoors", "skin": "nightsky", "tier": "signature", "timezone": "Asia/Kolkata" },
  "people": { "recipient": "Aria", "sender": "Sam" },
  "days": [ { "day": 1, "note": "A warm-up.", "game": { "type": "wordle", "params": { "answer": "LIGHT" } },
              "story": { "title": "Night 1 - The spark", "text": "Do you remember the first time we properly talked?" } } ],
  "schedule": { "mode": "date", "startDate": "2026-12-10", "finaleDate": "2026-12-20" },
  "story": { "intro": { "title": "Ten nights", "text": "{{recipient}}, there are ten nights until your birthday." } },
  "finale": { "type": "vault", "variant": "envelope",
              "reveal": [ { "type": "headline", "text": "Happy Birthday, {{recipient}}!" },
                          { "type": "letter", "text": "Dear {{recipient}},\n\nYour own words here.\n\n{{sender}}" } ] },
  "apps": { "coupons": { "items": [ { "id": "c1", "title": "One slow dance", "detail": "Anytime." } ] },
            "notes": { "items": [ { "title": "A note", "text": "Something to keep." } ] } },
  "roles": { "exclude": ["toy"], "unlockDay": { "pet": 2 } }
}
```

| Setting | Choices |
|---|---|
| `meta.tier` | `spark` (one tap), `countdown` (a game a day), `signature` (the room grows night by night, with a story) |
| `meta.theme` | `desk`, `outdoors` (see `themes/themes.json`) |
| `meta.skin` | `nightsky`, `arcade` (see `skins/skins.json`) |
| `schedule.mode` | `sequential` (one after another), `date` (one a day from `startDate`; the finale on `finaleDate`), `all` (everything open) |
| games | `wordle` `memory` `quiz` `hunt` `jigsaw` `timeline` (`docs/ELEMENT_GUIDE.md` lists each one's settings) |
| `finale.type` | `vault` (a code from the notes gathered over the nights opens it), `reveal` (opens straight away; used by Spark) |
| `finale.variant` | `scroll`, `envelope`, `slideshow`, `cake` |
| `roles` | `exclude: [...]`, `include: [...]`, `unlockDay: { "pet": 2 }`, `progressive: false` (see `docs/WORLD_CONTRACT.md`) |

`{{recipient}}` and `{{sender}}` are filled in everywhere.

## What `check` tells you

```
Checking aria-birthday  (signature, desk x nightsky, 10 nights)
Media
  6 files: 1 song, 1 video, 4 pictures
    @our_song                     song         86 KB
    ...
Fix these 2 problems:
  x night 4 (hunt) clues: this is missing
  x apps.gallery.items[1].photo: @us_at_goaa is used here but there is no file with that name... Did you mean @us_at_goa?
Worth a look (2):
  ! people: these are still the sample names (Aria and Sam).
  ! text: 12 text(s) still look like instructions or placeholders, for example night 1 (wordle) story text ...
Notes:
  - auto: added the Music app (1 song found in media/)
```

- **x problems** stop a build. **! warnings** are worth a look (sample names still in, a night without a story, a heavy file, text that still says "Write your ...").
- A preview is lenient: a missing picture shows a stand-in so you can keep working. A build is strict.

## Building and sending

`build` makes `dist-gifts/<secret>/` (the finished gift) and `dist-gifts/<secret>.zip`. The secret is created once per gift and
kept in `gifts/<name>/.slug`, so rebuilding gives the same link. Use `--slug my-link` to choose one, `--strict` to treat
warnings as errors, `--no-zip` to skip the zip.

The folder is self-contained (about 0.5 MB plus your media): no server code, no third-party requests, nothing to install.

- **Easiest:** drag the `.zip` onto a static host (Netlify Drop, Cloudflare Pages "upload", GitHub Pages, any web server) as its own site. Send the link.
- **One site, many gifts:** upload each gift folder under your site so the link is `https://your-site/<secret>/`.
- **Check on a real phone first:** `npm run gift -- preview <name>`, then open the Wi-Fi address on an iPhone and an Android.

**About privacy:** the link is secret (a random path the search engines are told to ignore), not encrypted: anyone who has it can
open the gift, and nobody else can find it. Real protection for sensitive media is a separate add-on (see `docs/CONTEXT.md`).
Media files are named by their content, so they are cached for a year and a changed photo can never show an old copy.

## Under the hood (for developers)

```
engine/cli.mjs          the commands
engine/lib/media.js     scan media/, name slots, judge sizes and formats
engine/lib/gift-normalize.js   defaults, shorthands, "drop files in and they appear", forgiving references
engine/lib/gift-validate.js    the plain-language checks (element schemas, themes, skins, roles, media types, leftovers)
engine/lib/build.js     check, then copy what the gift uses (core, elements, one skin, one theme, hashed media) + manifest
engine/lib/zip.js       a small zip writer (media is streamed, never held in memory)
engine/lib/server.js    static server with HTTP Range (iPhones need it for video and songs) and live reload
engine/template/        index.html and the two entry files (real, and preview)
engine/templates/       the three `gift new` starting points
tests/engine.mjs        media rules, shorthands, checks, build, zip, CLI, and a real browser opening a built gift (npm run test:engine)
```

The website (Part 2) can call `prepareGift` / `buildGift` from `engine/lib/build.js` directly: they take a folder and return a
report, so an order's config and uploaded files are handled the same way as a hand-made gift. Not done yet: hashing text answers
(RULES 6, config 3), an encrypted resolver for private media, image resizing, and a visual editor on top of this folder format.
