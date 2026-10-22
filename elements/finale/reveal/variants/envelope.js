// Variant "envelope": a sealed envelope addressed to the recipient. Tap to open it; the letter slides out and is read one
// paragraph at a time (tap to continue), then the photos fan out as polaroids. Headlines are stamped on the card.
// Steps: closed -> opened -> (video) -> paragraphs -> photos -> done. With reduced motion the steps advance by themselves.
import { part, reducedMotion } from '../../../../core/util.js';
import { buildVideo, photoImage, readBlocks } from './shared.js';

const AUTO_MS = 2800; // reduced-motion auto advance

export default function mountEnvelope(container, ctx) {
  const timers = [];
  const model = readBlocks(ctx.params.blocks);
  // the card's steps, in reading order: an optional video, then every paragraph
  const steps = [...model.videos.map((ref) => ({ kind: 'video', ref })), ...model.paragraphs.map((text) => ({ kind: 'line', text }))];
  let step = -1, opened = false, finished = false;

  // ---- the envelope
  const envelope = part('button', 'env-envelope', { type: 'button', 'data-state': 'closed', 'aria-label': ctx.t('envOpen') },
    part('span', 'env-back', { 'aria-hidden': 'true' }),
    part('span', 'env-address', {}, ctx.t('envTo')),
    part('span', 'env-pocket', { 'aria-hidden': 'true' }),
    part('span', 'env-flap', { 'aria-hidden': 'true' }),
    part('span', 'env-seal', { 'aria-hidden': 'true' }));
  const hint = part('p', 'env-hint', { role: 'status', 'aria-live': 'polite' }, ctx.t('envHint'));

  // ---- the letter card
  const lines = part('div', 'env-lines', { 'aria-live': 'polite' });
  const next = part('button', 'env-next', { type: 'button', hidden: true }, ctx.t('envNext'));
  const card = part('div', 'env-card', { 'data-state': 'hidden', tabindex: '-1' },
    model.headlines.map((text) => part('h2', 'headline', {}, text)), lines, next);

  // ---- the photos
  const restart = part('button', 'restart', { type: 'button', hidden: true }, ctx.t('restart'));
  restart.addEventListener('click', () => ctx.onExit());
  const photos = part('div', 'env-photos', { 'data-state': 'hidden' }, model.photos.map((p, i) =>
    part('figure', 'env-polaroid', { style: `--i:${i}; --n:${model.photos.length}` }, photoImage(ctx, p.ref), p.caption ? part('figcaption', 'env-caption', {}, p.caption) : null)));

  const stage = part('div', 'env-stage', {}, envelope, hint, card, photos, restart);
  container.append(stage);

  function open() {
    if (opened) return;
    opened = true;
    ctx.fx.tap(envelope);
    envelope.dataset.state = 'open';
    envelope.setAttribute('aria-label', ctx.t('envOpened'));
    hint.textContent = '';
    // the flap folds back, then the card slides out
    timers.push(setTimeout(() => { card.dataset.state = 'out'; ctx.fx.reveal(); advance(); }, reducedMotion() ? 0 : 900));
  }

  /** Show the next step on the card: a video, one more paragraph, or (when the letter is read) the photos. */
  function advance() {
    if (finished) return;
    clearTimeout(advance.timer);
    step += 1;
    if (step >= steps.length) return showPhotos();
    const s = steps[step];
    if (s.kind === 'line') {
      lines.append(part('p', 'letter-line', { 'data-state': 'hidden' }, s.text));
      requestAnimationFrame(() => requestAnimationFrame(() => { lines.lastChild.dataset.state = 'visible'; }));
      lines.lastChild.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    } else {
      // a video holds the card until it ends or is skipped
      const { node } = buildVideo(ctx, s.ref, () => { next.hidden = false; advance(); });
      lines.append(node);
      next.hidden = true;
      return;
    }
    next.hidden = false;
    next.textContent = step === steps.length - 1 && model.photos.length ? ctx.t('envPhotos') : ctx.t('envNext');
    if (step === steps.length - 1 && !model.photos.length) next.textContent = ctx.t('envDone');
    if (reducedMotion()) advance.timer = setTimeout(advance, AUTO_MS);
  }

  function showPhotos() {
    finished = true;
    next.hidden = true;
    card.dataset.state = model.photos.length ? 'away' : 'out';
    if (model.photos.length) photos.dataset.state = 'visible';
    restart.hidden = false;
    ctx.fx.success(stage);
    ctx.onComplete({});
    restart.focus?.({ preventScroll: true });
  }

  envelope.addEventListener('click', open);
  next.addEventListener('click', advance);
  // Enter or Space continues from anywhere once the envelope is open (the envelope button itself handles its own keys)
  const onKey = (e) => {
    if (!opened || finished || e.target.closest?.('button, video')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
  };
  document.addEventListener('keydown', onKey);
  // a tap on the open card (not on a control) also continues, so a whole letter can be read with one thumb
  card.addEventListener('pointerup', (e) => { if (opened && !finished && !e.target.closest('button, video')) advance(); });
  envelope.focus?.({ preventScroll: true });

  return { destroy() { timers.forEach(clearTimeout); clearTimeout(advance.timer); document.removeEventListener('keydown', onKey); } };
}
