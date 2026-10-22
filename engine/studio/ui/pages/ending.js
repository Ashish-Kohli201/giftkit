// ENDING: how the gift finishes. How it opens (a locked box or straight to the surprise), how it looks (four styles you can
// play right here), and what is in it (a headline, the letter, photos, a video), in an order you choose.
//
// Everything edits gift.json through store.edit. The screen is built once; typing updates in place, and only adding, removing
// or reordering blocks redraws the list of blocks.
import { endingArt } from '../ending-art.js';
import { pickMedia, mediaThumb, slotLabel } from '../media-picker.js';
import { previewGo } from '../preview.js';
import { badge, btn, clear, confirmBox, field, h, icon, input, plural, textarea, toast, toggle } from '../ui-kit.js';

const STYLES = {
  scroll: { title: 'Rolling credits', text: 'The words and photos drift up the screen, like the end of a film.' },
  envelope: { title: 'A sealed envelope', text: 'They open an envelope, read the letter a line at a time, then the photos fan out.' },
  slideshow: { title: 'A memory film', text: 'Your photos glide past with a slow zoom, then the letter appears over the last one.' },
  cake: { title: 'Make a wish', text: 'A cake with candles to blow out, then confetti and the letter.' },
};
const BLOCKS = {
  headline: { label: 'Headline', icon: 'sparkle', hint: 'A big line of words.' },
  letter: { label: 'Letter', icon: 'letter', hint: 'Your own words.' },
  photos: { label: 'Photos', icon: 'image', hint: 'Up to 8 pictures.' },
  video: { label: 'Video', icon: 'video', hint: 'One video.' },
};
const MAX_BLOCKS = 12;
const MAX_PHOTOS = 8;
const wordCount = (text) => (String(text).trim().match(/\S+/g) ?? []).length;
const looksUnfinished = (text) => /(^|\n)\s*Write your |placeholder/i.test(String(text));

export default {
  id: 'ending', title: 'Ending', hint: 'How it finishes',
  render(root, { store }) {
    const raw = () => store.current.raw;
    const fin = () => raw().finale ?? {};
    const tier = () => raw().meta?.tier;
    const blocks = () => fin().reveal ?? [];
    const editFin = (fn, coalesce) => store.edit((d) => { d.finale ??= {}; fn(d.finale); }, { coalesce });
    const editBlocks = (fn, coalesce) => editFin((f) => { f.reveal ??= []; fn(f.reveal); }, coalesce);
    const variant = () => fin().variant ?? 'scroll';

    const playEnding = () => { store.ui.finale = variant(); previewGo({ ending: true }); };

    // ================================================================ 1. how it opens
    const opens = h('section.section');
    const paintOpens = () => {
      clear(opens).append(h('header', {}, h('h2', {}, 'How does it open?'), h('p', {}, 'The very last thing they do.')));
      if (tier() === 'spark') {
        opens.append(h('div.callout', {}, icon('info'), h('div', {}, 'A Spark gift opens straight to the surprise: one tap and it plays. There is nothing to unlock.')));
        return;
      }
      const type = fin().type ?? 'vault';
      const card = (id, title, text) => h('button.choice', {
        type: 'button', 'aria-pressed': String(type === id),
        onclick: () => { editFin((f) => { f.type = id; }); paintOpens(); },
      }, icon(id === 'vault' ? 'lock' : 'gift', 22), h('strong', {}, title), h('span.muted', {}, text));
      opens.append(h('div.choices', {},
        card('vault', 'A locked box', 'Over the nights they pick up little notes with letters on. At the end they put the letters in order to open the box. The code is made for you automatically, so you never type it.'),
        card('reveal', 'Straight to the surprise', 'When the last night is done, the ending simply opens. No box, no code.')));
    };

    // ================================================================ 2. how it looks
    const looks = h('section.section');
    const styleCards = h('div.choices.ending-styles');
    const options = h('div.ending-options');
    const paintStyles = () => {
      clear(styleCards).append(...Object.entries(STYLES).map(([id, s]) => h('div.ending-style', { 'aria-current': variant() === id ? 'true' : null },
        h('button.choice', { type: 'button', 'aria-pressed': String(variant() === id), onclick: () => { editFin((f) => { f.variant = id; }); store.ui.finale = id; paintStyles(); paintOptions(); } },
          h('span.ending-art', {}, endingArt(id)), h('strong', {}, s.title), h('span.muted', {}, s.text)),
        btn('Play it', { small: true, icon: 'play', title: `Play ${s.title} in the preview`, onClick: () => { if (variant() !== id) { editFin((f) => { f.variant = id; }); store.ui.finale = id; paintStyles(); paintOptions(); } playEnding(); } }))));
    };
    // The reveal element takes these as settings named like this; they live next to "variant" in gift.json.
    const numberOpt = (key, fallback, min, max, step = 1) => ({
      get: () => fin()[key] ?? fallback,
      set: (v) => editFin((f) => { f[key] = Math.min(max, Math.max(min, v)); }, `opt-${key}`),
      min, max, step,
    });
    const paintOptions = () => {
      clear(options);
      const v = variant();
      if (v === 'cake') {
        const o = numberOpt('candles', 5, 1, 9);
        const out = h('output.ending-stepper-value', { 'aria-live': 'polite' }, String(o.get()));
        const set = (n) => { o.set(n); out.textContent = String(o.get()); };
        options.append(field('How many candles?', h('div.ending-stepper', {}, btn('', { icon: 'down', title: 'Fewer candles', variant: 'secondary', onClick: () => set(o.get() - 1) }), out, btn('', { icon: 'up', title: 'More candles', variant: 'secondary', onClick: () => set(o.get() + 1) })), { hint: 'They blow out one at a time. Between 1 and 9.' }));
      } else if (v === 'slideshow') {
        const cur = fin().slideMs ?? 5000;
        const out = h('output', {}, `${(cur / 1000).toFixed(0)} seconds`);
        const slider = h('input', { type: 'range', min: 2, max: 12, step: 1, value: String(Math.round(cur / 1000)), 'aria-label': 'Seconds per photo',
          oninput: (e) => { const s = Number(e.target.value); out.textContent = `${s} seconds`; editFin((f) => { f.slideMs = s * 1000; }, 'opt-slideMs'); } });
        options.append(field('How long is each photo shown?', h('div.ending-slider', {}, slider, out), { hint: 'Between 2 and 12 seconds.' }));
      } else if (v === 'scroll') {
        const speed = fin().scrollSpeed ?? 30;
        const out = h('output', {}, String(speed));
        const slider = h('input', { type: 'range', min: 5, max: 80, step: 5, value: String(speed), 'aria-label': 'Scroll speed',
          oninput: (e) => { out.textContent = e.target.value; editFin((f) => { f.scrollSpeed = Number(e.target.value); }, 'opt-scrollSpeed'); } });
        options.append(
          toggle('Drift by itself', fin().autoScroll ?? true, (on) => editFin((f) => { f.autoScroll = on; }), { hint: 'Switched off, they scroll it themselves.' }),
          field('How fast?', h('div.ending-slider', {}, slider, out), { hint: 'Slower is calmer.' }));
      } else {
        options.append(h('p.muted', {}, 'Nothing to set: the envelope is opened by tapping it.'));
      }
    };
    looks.append(h('header', {}, h('h2', {}, 'How does it look?'), h('p', {}, 'Four styles for the same words and photos. Press Play to see the real thing in the preview.')),
      styleCards, options, h('div.ending-play', {}, btn('Play the ending', { variant: 'primary', icon: 'play', onClick: playEnding })));

    // ================================================================ 3. what is in it
    const problems = h('div.ending-problems');
    const autoInfo = h('div');
    const list = h('div.ending-blocks', { role: 'list' });
    const addRow = h('div.ending-add');
    const limitNote = h('p.hint');

    const paintProblems = () => {
      const rep = store.current.report ?? {};
      const mine = [...(rep.errors ?? []).map((m) => ['bad', m]), ...(rep.warnings ?? []).map((m) => ['warn', m])].filter(([, m]) => /^finale/.test(m));
      clear(problems).append(...mine.map(([kind, m]) => h(`div.callout.callout-${kind}`, {}, icon('alert'), h('div', {}, m.replace(/^finale\.?(reveal)?/, 'The ending').replace(/^The ending\[(\d+)\]/, (x, i) => `Block ${Number(i) + 1}`)))));
    };
    const paintAuto = () => {
      const notes = (store.current.report?.notes ?? []).filter((n) => /^auto: added (your pictures to the ending|your video)/.test(n));
      clear(autoInfo);
      if (notes.length) autoInfo.append(h('div.callout', {}, icon('sparkle'), h('div', {}, 'Your pictures are added automatically; add a Photos block to choose and order them yourself. ', h('span.muted', {}, notes.map((n) => n.replace(/^auto: /, '')).join('; ') + '.'))));
    };

    function move(from, to) {
      if (from === to) return;
      editBlocks((arr) => { const [b] = arr.splice(from, 1); arr.splice(to, 0, b); });
      paintBlocks();
    }

    function startDrag(e, card, index) {
      e.preventDefault();
      const grip = e.currentTarget;
      grip.setPointerCapture?.(e.pointerId);
      const startY = e.clientY;
      card.classList.add('is-dragging');
      const others = [...list.children].filter((c) => c !== card);
      const onMove = (ev) => { card.style.transform = `translateY(${ev.clientY - startY}px)`; };
      const onUp = (ev) => {
        grip.removeEventListener('pointermove', onMove); grip.removeEventListener('pointerup', onUp); grip.removeEventListener('pointercancel', onUp);
        card.style.transform = ''; card.classList.remove('is-dragging');
        const target = others.filter((c) => { const r = c.getBoundingClientRect(); return ev.clientY > r.top + r.height / 2; }).length;
        move(index, target);
      };
      grip.addEventListener('pointermove', onMove); grip.addEventListener('pointerup', onUp); grip.addEventListener('pointercancel', onUp);
    }

    // ---- one block's body
    function headlineBody(b, i) {
      return field('The words', input({ value: b.text ?? '', placeholder: 'Happy Birthday, {{recipient}}!', oninput: (e) => editBlocks((a) => { a[i].text = e.target.value; }, `b${i}-text`) }), { hint: 'A big line. {{recipient}} becomes her name.' });
    }
    function letterBody(b, i) {
      const ta = textarea({ rows: 9, value: b.text ?? '', placeholder: 'Dear {{recipient}},\n\nYour own words here...' });
      const count = h('span.hint', {}, '');
      const note = h('div.callout.callout-warn', { hidden: true }, icon('alert'), h('div', {}, 'This still looks like the sample or an instruction. Write your own words.'));
      const refresh = () => { const n = wordCount(ta.value); count.textContent = `${plural(n, 'word')}`; note.hidden = !looksUnfinished(ta.value); };
      ta.addEventListener('input', () => { refresh(); editBlocks((a) => { a[i].text = ta.value; }, `b${i}-text`); });
      const insert = (token) => { ta.focus(); ta.setRangeText(token, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); };
      refresh();
      return h('div.ending-letter', {}, field('The letter', ta, { hint: 'Leave a blank line between paragraphs; each one appears on its own.' }),
        h('div.ending-letter-tools', {}, h('span.muted', {}, 'Put in:'), h('button.chip', { type: 'button', onclick: () => insert('{{recipient}}') }, 'Her name'), h('button.chip', { type: 'button', onclick: () => insert('{{sender}}') }, 'Your name'), count), note);
    }
    function photosBody(b, i) {
      const wrap = h('div.ending-photos');
      const all = b.items === '@all';
      const items = Array.isArray(b.items) ? b.items : [];
      const lib = store.mediaOf('image');
      const caps = Array.isArray(b.captions) ? b.captions : [];
      const swap = (a, c) => editBlocks((arr) => {
        const it = arr[i].items; [it[a], it[c]] = [it[c], it[a]];
        if (arr[i].captions) { const cp = arr[i].captions; [cp[a], cp[c]] = [cp[c], cp[a]]; }
      });
      const strip = h('div.ending-strip');
      if (all) {
        strip.append(...lib.slice(0, MAX_PHOTOS).map((m) => mediaThumb(m, 64)));
        if (!lib.length) strip.append(h('p.muted', {}, 'No pictures yet. Add some in the Media step.'));
        wrap.append(h('p', {}, lib.length > MAX_PHOTOS ? `All your pictures, in name order (the first ${MAX_PHOTOS} of ${lib.length}).` : `All your pictures (${lib.length}), in name order.`), strip);
      } else {
        items.forEach((slot, n) => {
          const entry = lib.find((m) => `@${m.id}` === slot);
          const cap = input({ value: caps[n] ?? '', placeholder: 'Caption (optional)', 'aria-label': `Caption for ${slotLabel(slot)}`, oninput: (e) => editBlocks((arr) => { const c = (arr[i].captions ??= []); while (c.length < arr[i].items.length) c.push(''); c[n] = e.target.value; if (c.every((x) => !x)) delete arr[i].captions; }, `b${i}-cap${n}`) });
          strip.append(h('div.ending-photo', {},
            entry ? mediaThumb(entry, 72) : h('span.media-thumb.media-thumb-icon', { style: { width: '72px', height: '72px' } }, icon('alert', 22)),
            h('span.ending-photo-name', {}, slotLabel(slot)), cap,
            h('div.ending-photo-tools', {}, btn('', { variant: 'ghost', small: true, icon: 'arrowLeft', title: 'Move earlier', disabled: n === 0, onClick: () => { swap(n, n - 1); paintBlocks(); } }),
              btn('', { variant: 'ghost', small: true, icon: 'arrowRight', title: 'Move later', disabled: n === items.length - 1, onClick: () => { swap(n, n + 1); paintBlocks(); } }),
              btn('', { variant: 'ghost', small: true, icon: 'close', title: 'Take this picture out', onClick: () => { editBlocks((arr) => { arr[i].items.splice(n, 1); arr[i].captions?.splice(n, 1); }); paintBlocks(); } }))));
        });
        if (!items.length) strip.append(h('p.muted', {}, 'No pictures chosen yet.'));
        wrap.append(strip, h('p.hint', {}, 'The captions show in the envelope and the memory film.'));
      }
      wrap.append(h('div.ending-photo-actions', {},
        btn(all || items.length ? 'Choose pictures' : 'Choose pictures', { icon: 'image', onClick: async () => {
          const got = await pickMedia({ type: 'image', multiple: true, selected: all ? [] : items, title: 'Choose the pictures for the ending' });
          if (!got) return;
          if (got.length > MAX_PHOTOS) toast(`The ending can show ${MAX_PHOTOS} pictures; the first ${MAX_PHOTOS} were kept.`);
          editBlocks((arr) => { arr[i].items = got.slice(0, MAX_PHOTOS); delete arr[i].captions; });
          paintBlocks();
        } }),
        btn('Use all my pictures', { icon: 'sparkle', onClick: () => { editBlocks((arr) => { arr[i].items = '@all'; delete arr[i].captions; }); paintBlocks(); } })));
      return wrap;
    }
    function videoBody(b, i) {
      const entry = store.mediaOf('video').find((m) => `@${m.id}` === b.ref);
      return h('div.ending-video', {},
        entry ? mediaThumb(entry, 72) : h('span.media-thumb.media-thumb-icon', { style: { width: '72px', height: '72px' } }, icon('video', 24)),
        h('div', {}, h('strong', {}, entry ? slotLabel(b.ref) : b.ref ? `${b.ref} (not found)` : 'No video chosen yet'),
          h('p.hint', {}, 'A cover picture is optional: add a picture named like the video plus ".poster", for example our-film.poster.jpg.'),
          btn(entry ? 'Choose another video' : 'Choose a video', { icon: 'video', onClick: async () => { const got = await pickMedia({ type: 'video', title: 'Choose the video' }); if (!got) return; editBlocks((arr) => { arr[i].ref = got; }); paintBlocks(); } })));
    }

    function blockCard(b, i, total) {
      const meta = BLOCKS[b.type] ?? { label: b.type, icon: 'info' };
      const card = h('div.ending-block', { role: 'listitem', 'data-type': b.type });
      const grip = h('button.ending-grip', { type: 'button', 'aria-label': `Drag block ${i + 1} to move it`, title: 'Drag to move', onpointerdown: (e) => startDrag(e, card, i) }, icon('grip', 18));
      card.append(
        h('header.ending-block-head', {}, grip, icon(meta.icon, 18), h('strong', {}, meta.label), h('span.muted', {}, `Block ${i + 1} of ${total}`), h('div.topbar-spacer'),
          btn('', { variant: 'ghost', small: true, icon: 'up', title: 'Move up', disabled: i === 0, onClick: () => move(i, i - 1) }),
          btn('', { variant: 'ghost', small: true, icon: 'down', title: 'Move down', disabled: i === total - 1, onClick: () => move(i, i + 1) }),
          btn('', { variant: 'ghost', small: true, icon: 'trash', title: 'Delete this block', onClick: async () => {
            if (b.type !== 'headline' && !(await confirmBox({ title: `Delete this ${meta.label.toLowerCase()}?`, message: 'You can bring it back with Undo.', confirm: 'Delete', danger: true }))) return;
            editBlocks((arr) => { arr.splice(i, 1); }); paintBlocks();
          } })),
        { headline: headlineBody, letter: letterBody, photos: photosBody, video: videoBody }[b.type]?.(b, i) ?? h('p.muted', {}, 'This block type is not editable here.'));
      return card;
    }

    function paintBlocks() {
      const arr = blocks();
      clear(list);
      if (!arr.length) list.append(h('div.empty', { style: { padding: '28px' } }, icon('letter', 30), h('strong', {}, 'The ending is empty'), h('p.muted', {}, 'Add a headline and a letter below.')));
      else list.append(...arr.map((b, i) => blockCard(b, i, arr.length)));
      const full = arr.length >= MAX_BLOCKS;
      clear(addRow).append(h('span.muted', {}, 'Add:'), ...Object.entries(BLOCKS).map(([type, m]) => btn(m.label, { small: true, icon: 'plus', title: m.hint, disabled: full,
        onClick: () => {
          editBlocks((a) => { a.push(type === 'headline' ? { type, text: '' } : type === 'letter' ? { type, text: '' } : type === 'photos' ? { type, items: '@all' } : { type, ref: '' }); });
          paintBlocks();
          list.lastElementChild?.querySelector('input, textarea, button.btn')?.focus();
        } })));
      limitNote.textContent = full ? `That is the most the ending can hold (${MAX_BLOCKS} blocks).` : `The ending can hold up to ${MAX_BLOCKS} blocks, and a photos block shows up to ${MAX_PHOTOS} pictures.`;
    }

    const content = h('section.section', {},
      h('header', {}, h('h2', {}, 'What is in it?'), h('p', {}, 'Your headline, your letter, your photos and video, in the order they appear.')),
      problems, autoInfo, list, addRow, limitNote);

    root.append(h('div.page-head', {}, h('h1', {}, 'How it ends'), h('p', {}, 'The last thing they see. Choose how it opens, how it looks, and what it says.')), opens, looks, content);
    paintOpens(); paintStyles(); paintOptions(); paintProblems(); paintAuto(); paintBlocks();

    const stops = [store.on('report', () => { paintProblems(); paintAuto(); })];
    return () => stops.forEach((s) => s());
  },
};
