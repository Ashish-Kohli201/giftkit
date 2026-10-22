// MEDIA PICKER: choose a picture, a song or a video from the gift's media library, or add a new one right there.
// Every screen that needs a file (a night's picture, the ending's video, a song) uses this one dialog.
//
//   const slot = await pickMedia({ type: 'image' })                     // '@us_at_goa', or null if cancelled
//   const slots = await pickMedia({ type: 'image', multiple: true })    // ['@a', '@b'], or null
//   mediaThumb(entry)   a small preview node for a library entry (picture, song or video)
//   slotLabel('@us_at_goa')   "Us at goa", for showing a slot in words
import { store } from './store.js';
import { btn, dropZone, formatBytes, h, humanize, icon, modal, toast } from './ui-kit.js';

const KIND = { image: { label: 'picture', plural: 'pictures', accept: 'image/*' }, audio: { label: 'song', plural: 'songs', accept: 'audio/*' }, video: { label: 'video', plural: 'videos', accept: 'video/*' } };

export const slotLabel = (slot) => humanize(String(slot ?? '').replace(/^@/, ''));

/** A small picture of a media file: the picture itself, a song note, or a video's cover. */
export function mediaThumb(entry, size = 72) {
  if (entry.type === 'image') return h('img.media-thumb', { src: entry.url, alt: '', width: size, height: size, loading: 'lazy', style: { width: `${size}px`, height: `${size}px` } });
  if (entry.type === 'video' && entry.posterUrl) return h('img.media-thumb', { src: entry.posterUrl, alt: '', width: size, height: size, style: { width: `${size}px`, height: `${size}px` } });
  return h('span.media-thumb.media-thumb-icon', { style: { width: `${size}px`, height: `${size}px` } }, icon(entry.type === 'audio' ? 'music' : 'video', Math.round(size / 3)));
}

/**
 * Open the picker. Resolves with one slot ('@name'), a list of slots when `multiple`, or null when cancelled.
 * @param opts { type: 'image' | 'audio' | 'video', multiple, title, selected: ['@a'] }
 */
export function pickMedia({ type = 'image', multiple = false, title, selected = [] } = {}) {
  const kind = KIND[type];
  return new Promise((resolve) => {
    const chosen = new Set(selected.map((s) => String(s).replace(/^@/, '')));
    let answered = false;
    const finish = (value) => { answered = true; m.close(); resolve(value); };
    const grid = h('div.picker-grid');
    const status = h('p.hint');

    const paint = () => {
      const items = store.mediaOf(type);
      grid.replaceChildren(...(items.length
        ? items.map((e) => h('button.picker-item', {
          type: 'button', 'aria-pressed': String(chosen.has(e.id)), title: `${e.name} - ${formatBytes(e.size)}`,
          onclick: () => { if (multiple) { chosen.has(e.id) ? chosen.delete(e.id) : chosen.add(e.id); paint(); } else finish(`@${e.id}`); },
        }, mediaThumb(e, 96), h('span.picker-name', {}, slotLabel(e.id)), chosen.has(e.id) ? h('span.picker-check', {}, icon('check', 14)) : null))
        : [h('p.muted.picker-empty', {}, `No ${kind.plural} yet. Add some below.`)]));
      status.textContent = multiple ? `${chosen.size} chosen` : '';
      okBtn.disabled = multiple && chosen.size === 0;
    };

    const upload = async (files) => {
      const res = await store.uploadMedia(files);
      for (const r of res) if (!r.ok) toast(r.error, 'error', 6000);
      paint();
    };
    const okBtn = btn('Use these', { variant: 'primary', onClick: () => finish([...chosen].map((id) => `@${id}`)) });
    const body = h('div.picker', {}, grid, status, dropZone({ label: `Add ${kind.plural}`, accept: kind.accept, compact: true, onFiles: upload }));
    const m = modal({
      title: title ?? `Choose a ${kind.label}`, body, wide: true,
      actions: multiple ? [btn('Cancel', { onClick: () => m.close() }), okBtn] : [btn('Cancel', { onClick: () => m.close() })],
      onClose: () => { if (!answered) resolve(null); },
    });
    paint();
    const stop = store.on('media', paint);
    const orig = m.close;
    m.close = () => { stop(); orig(); };
  });
}
