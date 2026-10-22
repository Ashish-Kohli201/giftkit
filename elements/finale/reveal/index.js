// Reveal - the finale: headline, optional video, letter, photos. Letter fades in after the video ends (or Skip),
// then gently auto-scrolls until the viewer touches/scrolls. All text is inserted as text nodes (never HTML).
import { part, reducedMotion } from '../../../core/util.js';

export default {
  id: 'reveal',
  kind: 'finale',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['scroll', 'headline', 'video-frame', 'video', 'skip', 'notice', 'letter', 'letter-line', 'photos', 'photo', 'restart'],
  layoutParts: ['scroll', 'video-frame', 'photos'],
  copy: {
    skip: 'Skip video',
    videoMissing: 'The video could not be loaded.',
    restart: 'Back to start',
  },
  paramsSchema: {
    type: 'object',
    required: ['blocks'],
    properties: {
      autoScroll: { type: 'boolean' },
      scrollSpeed: { type: 'number', minimum: 5, maximum: 80 }, // px per second
      blocks: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', required: ['type'],
          properties: {
            type: { type: 'string', enum: ['headline', 'video', 'letter', 'photos'] },
            text: { type: 'string' },
            ref: { type: 'string' },   // video asset slot
            items: { type: 'array', items: { type: 'string' }, maxItems: 8 }, // photo slots
          },
        },
      },
    },
  },
  placeholderParams: {
    autoScroll: true,
    blocks: [
      { type: 'headline', text: 'Happy Birthday, {{recipient}}!' },
      { type: 'letter', text: 'Dear {{recipient}},\n\nThis is a placeholder letter. In a real gift, this is where your words go - the ones you have been saving up.\n\nEvery star you collected led here.\n\nLove,\n{{sender}}' },
      { type: 'photos', items: ['@photo_01', '@photo_02'] },
    ],
  },

  mount(container, ctx) {
    const timers = [];
    let raf = 0, started = false, scrollStopped = false;
    const scroll = part('div', 'scroll', { tabindex: '0' });
    const gated = [];       // everything after the first video waits until the video ends / is skipped
    let seenVideo = false;

    for (const b of ctx.params.blocks) {
      let node;
      if (b.type === 'headline') {
        node = part('h2', 'headline', { 'data-state': 'hidden' }, b.text ?? '');
      } else if (b.type === 'video') {
        seenVideo = true;
        node = buildVideo(b);
      } else if (b.type === 'letter') {
        node = part('div', 'letter', { 'data-state': 'hidden' },
          String(b.text ?? '').split(/\n{2,}/).map((para, i) => part('p', 'letter-line', { style: `--i:${i}` }, para)));
      } else if (b.type === 'photos') {
        node = part('div', 'photos', { 'data-state': 'hidden' }, (b.items ?? []).map((ref) => {
          const img = document.createElement('img');
          img.decoding = 'async'; img.loading = 'lazy'; img.alt = '';
          ctx.assets.resolve(ref).then((a) => { img.src = a.url; img.alt = a.alt || 'Photo'; }).catch(() => img.remove());
          return part('figure', 'photo', {}, img);
        }));
      }
      scroll.append(node);
      // Letter + photos wait for the video to end (or be skipped). With no video they appear after a short beat.
      if (b.type === 'letter' || b.type === 'photos') gated.push(node);
    }
    const restart = part('button', 'restart', { type: 'button', hidden: true }, ctx.t('restart'));
    restart.addEventListener('click', () => ctx.onExit());
    scroll.append(restart);
    container.append(scroll);

    function buildVideo(b) {
      const video = part('video', 'video', { controls: true, playsinline: true, preload: 'metadata' });
      const notice = part('p', 'notice', { hidden: true }, ctx.t('videoMissing'));
      const skip = part('button', 'skip', { type: 'button' }, ctx.t('skip'));
      const fail = () => { notice.hidden = false; };
      ctx.assets.resolve(b.ref).then((a) => { video.src = a.url; if (a.poster) video.poster = a.poster; }).catch(fail);
      video.addEventListener('error', fail);
      video.addEventListener('ended', unlockRest);
      skip.addEventListener('click', () => { video.pause?.(); unlockRest(); });
      return part('div', 'video-frame', {}, video, notice, skip);
    }

    function unlockRest() {
      if (started) return;
      started = true;
      ctx.fx.reveal();
      gated.forEach((n) => { n.dataset.state = 'visible'; });
      restart.hidden = false;
      ctx.onComplete({});
      timers.push(setTimeout(startAutoScroll, 1400));
    }

    function startAutoScroll() {
      if (ctx.params.autoScroll === false || reducedMotion()) return;
      const stop = () => { scrollStopped = true; cancelAnimationFrame(raf); };
      ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((ev) => scroll.addEventListener(ev, stop, { passive: true, once: true }));
      const speed = ctx.params.scrollSpeed ?? 22;
      let last = performance.now(), pos = scroll.scrollTop;
      const tick = (now) => {
        if (scrollStopped) return;
        pos += speed * ((now - last) / 1000);
        last = now;
        scroll.scrollTop = pos;
        if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) return;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    // headline appears first; with no video, everything else follows
    const headline = scroll.querySelector('[data-part="headline"]');
    timers.push(setTimeout(() => { if (headline) headline.dataset.state = 'visible'; }, 250));
    if (!seenVideo) timers.push(setTimeout(unlockRest, 1100));

    return { destroy() { timers.forEach(clearTimeout); cancelAnimationFrame(raf); } };
  },
};
