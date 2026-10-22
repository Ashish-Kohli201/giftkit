// Gallery - a grid of the customer's photos with a full-size viewer. Swipe (Pointer Events), arrow keys, or the buttons move
// between photos. The viewer is part of the element (an overlay), not a native dialog. Photos load lazily as they scroll in.
import { part, reducedMotion } from '../../../core/util.js';

const SWIPE_PX = 48; // how far a horizontal drag must travel to count as a swipe

export default {
  id: 'gallery',
  kind: 'app',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['thumbs', 'thumb', 'thumb-photo', 'viewer', 'viewer-stage', 'viewer-photo', 'viewer-caption', 'viewer-counter', 'viewer-prev', 'viewer-next', 'viewer-close', 'message'],
  layoutParts: ['thumbs', 'viewer-stage'],
  copy: {
    thumbs: 'Photos',
    open: 'Open photo {{n}} of {{total}}',
    close: 'Close photo',
    prev: 'Previous photo',
    next: 'Next photo',
    counter: '{{n}} / {{total}}',
    unavailable: 'This photo could not be shown.',
    viewer: 'Photo viewer',
  },
  paramsSchema: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array', minItems: 1, maxItems: 24,
        items: {
          type: 'object', required: ['photo'],
          properties: { photo: { type: 'string', pattern: '^@[A-Za-z0-9_-]+$' }, caption: { type: 'string' } },
        },
      },
    },
  },
  placeholderParams: {
    items: [
      { photo: '@photo_01', caption: 'Somewhere with a view' },
      { photo: '@photo_02', caption: 'A slow afternoon' },
      { photo: '@photo_03', caption: 'Golden hour' },
      { photo: '@photo_04', caption: 'Just passing through' },
      { photo: '@photo_05', caption: 'A good day' },
      { photo: '@photo_06' },
    ],
  },

  mount(container, ctx) {
    const items = ctx.params.items;
    const urls = new Array(items.length).fill(null); // resolved asset per photo: { url, alt } or { failed: true }
    let current = -1; // index shown in the viewer, -1 = closed
    let lastThumb = null;

    // ---- thumbnails
    const thumbs = part('div', 'thumbs', { role: 'list', 'aria-label': ctx.t('thumbs') });
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { observer.unobserve(e.target); loadThumb(Number(e.target.dataset.index)); } }), { rootMargin: '240px' })
      : null;

    function resolveAsset(i) {
      if (!urls[i]) {
        urls[i] = ctx.assets.resolve(items[i].photo)
          .then((a) => ({ url: a.url, alt: a.alt || items[i].caption || '' }))
          .catch(() => ({ failed: true }));
      }
      return urls[i];
    }

    const thumbEls = items.map((item, i) => {
      const img = part('img', 'thumb-photo', { alt: '', decoding: 'async', draggable: 'false' });
      const btn = part('button', 'thumb', { type: 'button', role: 'listitem', 'data-index': String(i), 'data-state': 'loading', 'aria-label': `${ctx.t('open', { n: i + 1, total: items.length })}${item.caption ? `: ${item.caption}` : ''}` }, img);
      btn.addEventListener('click', () => openViewer(i, btn));
      thumbs.append(btn);
      return { btn, img };
    });

    async function loadThumb(i) {
      const asset = await resolveAsset(i);
      const { btn, img } = thumbEls[i];
      if (asset.failed) { btn.dataset.state = 'error'; return; }
      img.addEventListener('load', () => { btn.dataset.state = 'ready'; }, { once: true });
      img.addEventListener('error', () => { btn.dataset.state = 'error'; }, { once: true });
      img.src = asset.url;
    }
    thumbEls.forEach(({ btn }, i) => (observer ? observer.observe(btn) : loadThumb(i)));

    // ---- viewer
    const photo = part('img', 'viewer-photo', { alt: '', draggable: 'false' });
    const message = part('p', 'message', { role: 'status', 'aria-live': 'polite' });
    const stage = part('div', 'viewer-stage', {}, photo, message);
    const caption = part('p', 'viewer-caption');
    const counter = part('p', 'viewer-counter', { 'aria-live': 'polite' });
    const prev = part('button', 'viewer-prev', { type: 'button', 'aria-label': ctx.t('prev') }, '‹');
    const next = part('button', 'viewer-next', { type: 'button', 'aria-label': ctx.t('next') }, '›');
    const close = part('button', 'viewer-close', { type: 'button', 'aria-label': ctx.t('close') }, '×');
    const viewer = part('div', 'viewer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': ctx.t('viewer'), hidden: true, 'data-state': 'closed' }, stage, prev, next, close, caption, counter);
    container.append(thumbs, viewer);

    async function show(i) {
      current = (i + items.length) % items.length;
      const mine = current;
      viewer.dataset.state = 'open';
      stage.dataset.state = 'loading';
      message.textContent = '';
      photo.removeAttribute('src');
      caption.textContent = items[mine].caption ?? '';
      counter.textContent = ctx.t('counter', { n: mine + 1, total: items.length });
      prev.hidden = next.hidden = items.length < 2;
      const asset = await resolveAsset(mine);
      if (mine !== current) return; // the viewer moved on while this loaded
      if (asset.failed) { stage.dataset.state = 'error'; message.textContent = ctx.t('unavailable'); return; }
      photo.alt = asset.alt;
      photo.onerror = () => { stage.dataset.state = 'error'; message.textContent = ctx.t('unavailable'); };
      photo.onload = () => { stage.dataset.state = 'ready'; };
      photo.src = asset.url;
    }

    function openViewer(i, fromThumb) {
      lastThumb = fromThumb;
      viewer.hidden = false;
      show(i);
      close.focus({ preventScroll: true });
    }
    function closeViewer() {
      current = -1;
      viewer.hidden = true;
      viewer.dataset.state = 'closed';
      lastThumb?.focus({ preventScroll: true });
    }

    prev.addEventListener('click', () => show(current - 1));
    next.addEventListener('click', () => show(current + 1));
    close.addEventListener('click', closeViewer);

    // swipe: follow the finger a little, then change photo if the drag was long enough
    let startX = null;
    stage.addEventListener('pointerdown', (e) => { startX = e.clientX; stage.setPointerCapture?.(e.pointerId); });
    stage.addEventListener('pointermove', (e) => {
      if (startX === null || reducedMotion()) return;
      photo.style.transform = `translateX(${Math.max(-80, Math.min(80, e.clientX - startX))}px)`;
    });
    const endSwipe = (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      photo.style.transform = '';
      if (Math.abs(dx) >= SWIPE_PX && items.length > 1) show(current + (dx < 0 ? 1 : -1));
    };
    stage.addEventListener('pointerup', endSwipe);
    stage.addEventListener('pointercancel', () => { startX = null; photo.style.transform = ''; });

    // keys are caught in the capture phase so Escape closes the viewer, not the whole sheet behind it
    const onKey = (e) => {
      if (current < 0) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeViewer(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
    };
    document.addEventListener('keydown', onKey, true);

    return { destroy() { document.removeEventListener('keydown', onKey, true); observer?.disconnect(); } };
  },
};
