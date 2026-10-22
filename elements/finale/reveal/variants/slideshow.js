// Variant "slideshow": a memory film. A title card, then every photo full-bleed with a slow pan and zoom (Ken Burns) and a
// crossfade, videos full-frame, and finally the letter fading in line by line over a dimmed last frame, ending on the headline.
// Tap the middle (or Space) to pause, the edges (or arrow keys) to go back and forward; "skip" jumps to the end.
// Scenes advance on a timer (setTimeout). With reduced motion there is no pan or zoom, only the crossfade.
import { part, reducedMotion } from '../../../../core/util.js';
import { buildVideo, photoImage, readBlocks } from './shared.js';

const TITLE_MS = 3200;
const LINE_MS = 2600;

export default function mountSlideshow(container, ctx) {
  const model = readBlocks(ctx.params.blocks);
  const slideMs = ctx.params.slideMs ?? 4500;
  const title = model.headlines[0] ?? '';

  // ---- scenes, in order: title, videos, photos, letter + closing headline
  const scenes = [];
  if (title) scenes.push({ kind: 'title', ms: TITLE_MS });
  model.videos.forEach((ref) => scenes.push({ kind: 'video', ref }));
  model.photos.forEach((p) => scenes.push({ kind: 'photo', ref: p.ref, caption: p.caption, ms: slideMs }));
  scenes.push({ kind: 'letter' });
  let index = -1, paused = false, finished = false;
  let advanceTimer = 0;
  let lineTimers = [];
  const cleanup = [];

  // ---- DOM
  const slides = part('div', 'film-slides', { 'aria-live': 'polite' });
  const dim = part('div', 'film-dim', { 'aria-hidden': 'true', 'data-state': 'off' });
  const lines = part('div', 'film-lines');
  const closing = part('h2', 'headline', { 'data-state': 'hidden' }, title);
  const restart = part('button', 'restart', { type: 'button', hidden: true }, ctx.t('restart'));
  restart.addEventListener('click', () => ctx.onExit());
  const ticks = scenes.map((_, i) => part('span', 'film-tick', { 'data-state': 'next', style: `--i:${i}` }));
  const progress = part('div', 'film-progress', { role: 'img', 'aria-label': '' }, ticks);
  const prev = part('button', 'film-prev', { type: 'button', 'aria-label': ctx.t('filmPrev') }, '◀');
  const pause = part('button', 'film-pause', { type: 'button', 'aria-label': ctx.t('filmPause'), 'aria-pressed': 'false' }, '❚❚');
  const forward = part('button', 'film-next', { type: 'button', 'aria-label': ctx.t('filmNext') }, '▶');
  const controls = part('div', 'film-controls', {}, prev, pause, forward);
  const skip = part('button', 'skip', { type: 'button' }, ctx.t('filmSkip'));
  const stage = part('div', 'film-stage', { tabindex: '0', 'aria-label': ctx.t('filmLabel') }, slides, dim, lines, closing, progress, skip, controls, restart);
  container.append(stage);

  // ---- timing
  const clearTimers = () => { clearTimeout(advanceTimer); lineTimers.forEach(clearTimeout); lineTimers = []; };
  const later = (fn, ms) => { advanceTimer = setTimeout(fn, ms); };
  const nextFrame = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

  function setCurrent(i) {
    ticks.forEach((t, n) => { t.dataset.state = n < i ? 'past' : n === i ? 'current' : 'next'; });
    progress.setAttribute('aria-label', ctx.t('filmProgress', { n: i + 1, total: scenes.length }));
  }

  /** A photo slide: the image drifts and zooms toward a direction picked from the slide number. */
  function photoSlide(scene, i) {
    const dir = i % 4;
    return part('div', 'film-slide', {
      'data-state': 'hidden', 'data-kind': 'photo',
      style: `--dx:${[-3, 3, -2, 2][dir]}%; --dy:${[-2, 2, 2, -2][dir]}%; --ms:${scene.ms}ms; --kb:${reducedMotion() ? 0 : 1}`,
    }, photoImage(ctx, scene.ref), scene.caption ? part('p', 'film-caption', {}, scene.caption) : null);
  }

  function fadeOutOld(keepLast) {
    const all = [...slides.children];
    all.forEach((old, n) => {
      if (keepLast && n === all.length - 1) return;
      old.dataset.state = 'hidden';
      setTimeout(() => old.remove(), 900);
    });
  }

  function show(i) {
    clearTimers();
    index = Math.max(0, Math.min(i, scenes.length - 1));
    const scene = scenes[index];
    setCurrent(index);
    lines.replaceChildren();
    closing.dataset.state = 'hidden';
    dim.dataset.state = 'off';
    restart.hidden = true;
    if (scene.kind === 'letter') { fadeOutOld(true); showLetter(); return; }
    fadeOutOld(false);
    if (scene.kind === 'title') {
      slides.append(part('div', 'film-slide', { 'data-state': 'visible', 'data-kind': 'title' }, part('h2', 'headline', {}, title)));
    } else if (scene.kind === 'video') {
      const { node } = buildVideo(ctx, scene.ref, () => show(index + 1));
      slides.append(part('div', 'film-slide', { 'data-state': 'visible', 'data-kind': 'video' }, node));
      return; // a video holds the film until it ends or is skipped
    } else {
      const slide = photoSlide(scene, index);
      slides.append(slide);
      nextFrame(() => { slide.dataset.state = 'visible'; });
    }
    if (!paused) later(() => show(index + 1), scene.ms);
  }

  /** The last scene: the letter over a dimmed last frame, one paragraph at a time, then the headline and the way out. */
  function showLetter() {
    dim.dataset.state = 'on';
    model.paragraphs.forEach((text, i) => {
      lineTimers.push(setTimeout(() => {
        const p = part('p', 'letter-line', { 'data-state': 'hidden' }, text);
        lines.append(p);
        nextFrame(() => { p.dataset.state = 'visible'; });
      }, 600 + i * LINE_MS));
    });
    lineTimers.push(setTimeout(finish, 600 + model.paragraphs.length * LINE_MS + 1200));
  }

  function finish() {
    if (title) closing.dataset.state = 'visible';
    restart.hidden = false;
    if (finished) return;
    finished = true;
    ctx.fx.reveal();
    ctx.onComplete({});
  }

  function togglePause() {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? '▶' : '❚❚';
    pause.setAttribute('aria-label', paused ? ctx.t('filmPlay') : ctx.t('filmPause'));
    stage.dataset.paused = String(paused);
    if (paused) clearTimeout(advanceTimer);
    else if (scenes[index]?.ms) later(() => show(index + 1), scenes[index].ms);
  }

  /** Jump straight to the end: the whole letter at once, the headline, the way out. */
  function skipToEnd() {
    show(scenes.length - 1);
    lineTimers.forEach(clearTimeout);
    lineTimers = [];
    lines.replaceChildren(...model.paragraphs.map((t) => part('p', 'letter-line', { 'data-state': 'visible' }, t)));
    finish();
  }

  const go = (delta) => show(index + delta);
  prev.addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
  forward.addEventListener('click', (e) => { e.stopPropagation(); go(1); });
  pause.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
  skip.addEventListener('click', (e) => { e.stopPropagation(); skipToEnd(); });

  // edge taps go back / forward, the middle pauses (Pointer Events only)
  stage.addEventListener('pointerup', (e) => {
    if (e.target.closest('button, video')) return;
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.25) go(-1); else if (x > 0.75) go(1); else togglePause();
  });
  const onKey = (e) => {
    const onControl = e.target.closest?.('button, video, input');
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === ' ' && !onControl) { e.preventDefault(); togglePause(); }
  };
  document.addEventListener('keydown', onKey);
  cleanup.push(() => document.removeEventListener('keydown', onKey));

  show(0);
  return { destroy() { clearTimers(); cleanup.forEach((fn) => fn()); } };
}
