// MEDIA: the gift's pictures, songs and videos. Drop files in, see them, play them, remove them, and choose what the gift
// adds on its own. A file is used by its name (@us_at_goa); nothing has to be listed anywhere.
import { mediaThumb, slotLabel } from '../media-picker.js';
import { badge, btn, clear, confirmBox, copyText, dropZone, formatBytes, h, icon, modal, plural, toast, toggle } from '../ui-kit.js';

const EXT_KIND = { image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'], audio: ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav'], video: ['mp4', 'webm', 'm4v', 'mov'] };
const kindOfFile = (f) => {
  const t = (f.type || '').split('/')[0];
  if (EXT_KIND[t]) return t;
  const ext = f.name.split('.').pop().toLowerCase();
  return Object.keys(EXT_KIND).find((k) => EXT_KIND[k].includes(ext)) ?? 'other';
};
const KIND_WORDS = { image: ['picture', 'pictures'], audio: ['song', 'songs'], video: ['video', 'videos'] };
const TABS = [['all', 'All'], ['image', 'Pictures'], ['audio', 'Songs'], ['video', 'Videos']];

/** Where a file is used, in the gift's own words, found by looking for "@slot" in gift.json as written. */
function placesUsed(raw, slot) {
  const places = new Set();
  const needle = `@${slot}`;
  const visit = (v, path) => {
    if (typeof v === 'string') {
      if (v.toLowerCase().replace(/-/g, '_') !== needle) return;
      const night = /^days\[(\d+)\]/.exec(path);
      if (night) { const d = raw.days?.[Number(night[1])]; places.add(`night ${d?.day ?? Number(night[1]) + 1}${d?.game?.type ? ` (${d.game.type})` : ''}`); }
      else if (path.startsWith('apps.gallery')) places.add('the Photos app');
      else if (path.startsWith('apps.music')) places.add('the Music app');
      else if (path.startsWith('scene.corkboard')) places.add('the pinboard');
      else if (path.startsWith('finale')) places.add('the ending');
      else places.add(path);
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'people') visit(x, path ? `${path}.${k}` : k);
  };
  visit(raw, '');
  return [...places];
}

export default {
  id: 'media', title: 'Media', hint: 'Pictures, songs, video',
  render(root, { store, goStep }) {
    const gift = () => store.current;
    const audio = new Audio();
    let playing = null; // slot id of the song that is playing
    let filter = 'all';
    let query = '';
    const problems = []; // [{ name, message }] shown until dismissed
    const stops = [];

    // ---------------------------------------------------------------- adding files
    const progress = h('div.media-progress', { 'aria-live': 'polite' });
    const messages = h('div.media-messages', { role: 'status' });
    const success = h('p.media-success', { hidden: true });
    let queue = [];
    let current = null;
    const paintProgress = () => {
      clear(progress);
      for (const f of queue) {
        const active = current?.name === f.name;
        const pct = active && current.total ? Math.round((current.loaded / current.total) * 100) : 0;
        progress.append(h('div.media-progress-row', {}, h('span.media-progress-name', {}, f.name), h('span.media-progress-bar', {}, h('span', { style: { width: `${active ? pct : 0}%` } })), h('span.muted', {}, active ? `${pct}%` : 'waiting')));
      }
    };
    const paintMessages = () => {
      clear(messages);
      for (const [i, p] of problems.entries()) {
        messages.append(h('div.callout.callout-bad.media-problem', {}, icon('alert'), h('div', {}, h('strong', {}, p.name), h('p', {}, p.message)),
          btn('', { variant: 'ghost', small: true, icon: 'close', title: 'Dismiss', onClick: () => { problems.splice(i, 1); paintMessages(); } })));
      }
    };
    async function addFiles(files) {
      files = files.filter((f) => f.size >= 0 && f.name);
      if (!files.length || !gift()) return;
      success.hidden = true;
      queue = files; paintProgress();
      const results = await store.uploadMedia(files);
      queue = []; current = null; paintProgress();
      const added = {};
      for (const r of results) {
        if (r.ok) added[kindOfFile(r.file)] = (added[kindOfFile(r.file)] ?? 0) + 1;
        else { problems.push({ name: r.file.name, message: r.error }); toast(`${r.file.name}: ${r.error}`, 'error', 6000); }
      }
      paintMessages();
      const parts = Object.entries(added).filter(([k]) => KIND_WORDS[k]).map(([k, n]) => `${n} ${KIND_WORDS[k][n === 1 ? 0 : 1]}`);
      if (parts.length) { success.textContent = `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]} added.`; success.hidden = false; }
    }
    const zone = dropZone({ label: 'Drop your pictures, songs and videos here', accept: 'image/*,audio/*,video/*,.heic,.mov', onFiles: addFiles });

    // drag anywhere on the page
    const overlay = h('div.media-drop-overlay', { hidden: true }, icon('upload', 40), h('strong', {}, 'Drop to add them to the gift'));
    document.body.append(overlay);
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const onEnter = (e) => { if (hasFiles(e)) { depth++; overlay.hidden = false; } };
    const onLeave = (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; overlay.hidden = true; } };
    const onOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const onDrop = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; overlay.hidden = true; if (!zone.contains(e.target)) addFiles([...e.dataTransfer.files]); };
    for (const [ev, fn] of [['dragenter', onEnter], ['dragleave', onLeave], ['dragover', onOver], ['drop', onDrop]]) document.addEventListener(ev, fn);
    stops.push(store.on('upload', (u) => { current = u; paintProgress(); }));

    // ---------------------------------------------------------------- what gets added for you
    const autoBox = h('section.section.media-auto');
    const noteFor = (word) => (gift().report?.notes ?? []).find((n) => n.includes(word))?.replace(/^auto: /, '');
    const paintAuto = () => {
      clear(autoBox);
      const tier = gift().raw?.meta?.tier;
      if (tier === 'spark') return;
      const raw = gift().raw ?? {};
      const rows = [
        { key: 'music', label: 'Music app', hint: 'Your songs, playable on the laptop in the gift.', off: raw.apps?.music === false, word: 'Music app',
          set: (d, on) => { d.apps ??= {}; if (on) { if (d.apps.music === false) delete d.apps.music; } else d.apps.music = false; } },
        { key: 'gallery', label: 'Photos app', hint: 'All your pictures in a gallery.', off: raw.apps?.gallery === false, word: 'Photos app',
          set: (d, on) => { d.apps ??= {}; if (on) { if (d.apps.gallery === false) delete d.apps.gallery; } else d.apps.gallery = false; } },
        { key: 'board', label: 'Pinboard of memories', hint: 'Your first pictures pinned up in the room.', off: Array.isArray(raw.scene?.corkboard) && raw.scene.corkboard.length === 0, word: 'memories board',
          set: (d, on) => { d.scene ??= {}; if (on) { if (Array.isArray(d.scene.corkboard) && !d.scene.corkboard.length) delete d.scene.corkboard; } else d.scene.corkboard = []; } },
      ];
      autoBox.append(h('header', {}, h('h2', {}, 'What gets added for you'),
        h('p', {}, 'Songs, pictures and videos appear in the gift on their own, so there is nothing to set up. Switch off anything you do not want.')),
      h('div.media-switches', {}, rows.map((r) => {
        const note = r.off ? null : noteFor(r.word);
        return h('div.media-switch', {}, toggle(r.label, !r.off, (on) => { store.edit((d) => r.set(d, on), {}); paintAuto(); }, { hint: r.hint }), note ? h('span.muted.media-switch-note', {}, note.replace(/^added /, '')) : null);
      })),
      h('p.hint', {}, 'Pictures and a video in the ending are chosen in the ', h('button.linklike', { type: 'button', onclick: () => goStep('ending') }, 'Ending step'), '.'));
    };

    // ---------------------------------------------------------------- the library
    const tabs = h('div.media-tabs', { role: 'tablist' });
    const grid = h('div.media-grid');
    const issuesFor = (e) => (gift().mediaIssues ?? []).filter((i) => i.level !== 'note' && (i.file === e.name || (e.posterUrl && i.file.startsWith(`${e.id}.poster`))));

    function stopAudio() { audio.pause(); playing = null; }
    function playSong(e) {
      if (playing === e.id) { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); return; }
      audio.src = e.url; playing = e.id;
      audio.play().catch(() => { toast('This song would not play. Try an MP3 or M4A.', 'error'); playing = null; updateAudioUi(); });
      updateAudioUi();
    }
    for (const ev of ['play', 'pause', 'timeupdate']) audio.addEventListener(ev, () => updateAudioUi());
    audio.addEventListener('ended', () => { playing = null; updateAudioUi(); });
    function updateAudioUi() {
      for (const t of grid.querySelectorAll('.media-tile[data-type="audio"]')) {
        const on = t.dataset.id === playing;
        const b = t.querySelector('.media-play');
        b.replaceChildren(icon(on && !audio.paused ? 'pause' : 'play', 18));
        b.setAttribute('aria-label', on && !audio.paused ? `Pause ${t.dataset.id}` : `Play ${t.dataset.id}`);
        t.querySelector('.media-songbar span').style.width = on && audio.duration ? `${(audio.currentTime / audio.duration) * 100}%` : '0%';
      }
    }

    function tile(e) {
      const issues = issuesFor(e);
      const preview = () => {
        if (e.type === 'image') modal({ title: slotLabel(e.id), body: h('div.media-large', {}, h('img', { src: e.url, alt: slotLabel(e.id) }), h('p.muted', {}, `${e.name} - ${formatBytes(e.size)} - use it as @${e.id}`)) });
        else if (e.type === 'video') {
          const v = h('video', { src: e.url, poster: e.posterUrl ?? null, controls: true, playsinline: true, preload: 'metadata' });
          const m = modal({ title: slotLabel(e.id), body: h('div.media-large', {}, v, h('p.muted', {}, `${e.name} - ${formatBytes(e.size)}`)), onClose: () => v.pause() });
        }
      };
      const thumb = e.type === 'audio'
        ? h('div.media-song', {}, h('button.media-play', { type: 'button', 'aria-label': `Play ${e.id}`, onclick: () => playSong(e) }, icon('play', 18)), h('span.media-songbar', {}, h('span')))
        : h('button.media-view', { type: 'button', 'aria-label': `Look at ${slotLabel(e.id)}`, onclick: preview }, mediaThumb(e, 160), e.type === 'video' ? h('span.media-vid-badge', {}, icon('play', 16)) : null);
      const remove = async () => {
        const places = placesUsed(gift().raw ?? {}, e.id);
        const message = e.used
          ? (places.length ? `${slotLabel(e.id)} is used in ${places.join(', ')}. If you remove it, those places will have nothing to show until you pick something else.` : `${slotLabel(e.id)} is used automatically (the Photos app, the pinboard, the ending or the Music app). Removing it changes those.`)
          : `Remove ${slotLabel(e.id)} from the gift? The file is deleted from the gift's media folder.`;
        if (await confirmBox({ title: `Remove ${e.name}?`, message, confirm: 'Remove', danger: true })) {
          try { if (playing === e.id) stopAudio(); await store.removeMedia(e.id); toast(`${slotLabel(e.id)} removed`, 'success'); } catch (err) { toast(err.message, 'error'); }
        }
      };
      const cover = e.type === 'video' ? (() => {
        const pick = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (ev) => {
          const f = ev.target.files[0]; ev.target.value = '';
          if (!f) return;
          const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')).toLowerCase() : '.jpg';
          const res = await store.uploadMedia([new File([f], `${e.id}.poster${ext}`, { type: f.type })]);
          if (!res[0].ok) toast(res[0].error, 'error', 6000); else toast('Cover picture added', 'success');
        } });
        return h('span', {}, pick, btn(e.posterUrl ? 'Change cover picture' : 'Add a cover picture', { small: true, icon: 'image', onClick: () => pick.click() }));
      })() : null;
      return h('article.media-tile', { 'data-id': e.id, 'data-type': e.type },
        thumb,
        h('div.media-meta', {}, h('strong.media-name', { title: e.name }, slotLabel(e.id)),
          h('div.media-chips', {}, h('span.chip.chip-accent.media-slot', {}, `@${e.id}`), btn('', { variant: 'ghost', small: true, icon: 'copy', title: `Copy @${e.id}`, onClick: () => copyText(`@${e.id}`) })),
          h('div.media-facts', {}, h('span.muted', {}, formatBytes(e.size)), e.used ? badge('Used', 'good') : badge('Not used yet', 'neutral'),
            ...issues.map((i) => h('span.badge.badge-warn.media-issue', { title: i.message, tabindex: 0 }, icon('alert', 12), 'Heads up'))),
          ...issues.map((i) => h('p.media-issue-text', {}, i.message)),
          h('div.media-actions', {}, cover, btn('Remove', { small: true, variant: 'danger', icon: 'trash', onClick: remove }))));
    }

    function paintLibrary() {
      const all = gift().media ?? [];
      const counts = { all: all.length, image: 0, audio: 0, video: 0 };
      for (const m of all) counts[m.type]++;
      clear(tabs).append(...TABS.map(([k, label]) => h('button.media-tab', { type: 'button', role: 'tab', 'aria-selected': String(filter === k), onclick: () => { filter = k; paintLibrary(); } }, label, h('span.media-count', {}, String(counts[k])))));
      const q = query.trim().toLowerCase();
      const shown = all.filter((m) => (filter === 'all' || m.type === filter) && (!q || m.id.includes(q.replace(/\s+/g, '_')) || m.name.toLowerCase().includes(q)));
      clear(grid);
      if (!all.length) {
        grid.append(h('div.empty.media-empty', {}, icon('image', 40), h('h2', {}, 'Nothing here yet'),
          h('p.muted', {}, 'Drop in the pictures, songs and a video you want in the gift. Pictures: JPG, PNG or WEBP. Songs: MP3 or M4A. Videos: MP4. No setup needed: each file is used by its name.')));
      } else if (!shown.length) grid.append(h('p.muted.media-none', {}, 'Nothing matches that.'));
      else grid.append(...shown.map(tile));
      updateAudioUi();
    }
    const search = h('input', { type: 'search', placeholder: 'Search by name', 'aria-label': 'Search your files', oninput: (e) => { query = e.target.value; paintLibrary(); } });
    stops.push(store.on('media', () => { paintLibrary(); paintAuto(); }), store.on('report', () => { paintLibrary(); paintAuto(); }));

    root.append(
      h('div.page-head', {}, h('h1', {}, 'Pictures, songs and videos'), h('p', {}, 'Everything you want to show goes here. Use a file by its name: "us at goa.jpg" becomes @us_at_goa.')),
      zone, progress, success, messages, autoBox,
      h('section.section.media-library', {}, h('header.media-lib-head', {}, h('h2', {}, 'Your files'), search), tabs, grid));
    paintAuto(); paintLibrary();

    return () => {
      stops.forEach((s) => s());
      for (const [ev, fn] of [['dragenter', onEnter], ['dragleave', onLeave], ['dragover', onOver], ['drop', onDrop]]) document.removeEventListener(ev, fn);
      overlay.remove(); audio.pause(); audio.removeAttribute('src');
    };
  },
};
