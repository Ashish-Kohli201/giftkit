// Variant "scroll": the original ending. A headline, an optional video, then the letter and photos fade in and the page
// gently auto-scrolls until the viewer touches it, like end credits.
import { part, reducedMotion } from '../../../../core/util.js';
import { buildVideo, paragraphs, photoImage } from './shared.js';

export default function mountScroll(container, ctx) {
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
      node = buildVideo(ctx, b.ref, unlockRest).node;
    } else if (b.type === 'letter') {
      node = part('div', 'letter', { 'data-state': 'hidden' }, paragraphs(b.text).map((para, i) => part('p', 'letter-line', { style: `--i:${i}` }, para)));
    } else if (b.type === 'photos') {
      node = part('div', 'photos', { 'data-state': 'hidden' }, (b.items ?? []).map((ref) => part('figure', 'photo', {}, photoImage(ctx, ref))));
    }
    scroll.append(node);
    // Letter + photos wait for the video to end (or be skipped). With no video they appear after a short beat.
    if (b.type === 'letter' || b.type === 'photos') gated.push(node);
  }
  const restart = part('button', 'restart', { type: 'button', hidden: true }, ctx.t('restart'));
  restart.addEventListener('click', () => ctx.onExit());
  scroll.append(restart);
  container.append(scroll);

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
}
