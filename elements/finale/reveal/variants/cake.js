// Variant "cake": make a wish. A cake with candles in a dim room; blow each candle out by tapping it, or press Blow (no
// microphone is used). When the last flame goes out there is confetti, the headline pops, and the letter and photos follow.
import { part, reducedMotion } from '../../../../core/util.js';
import { buildVideo, paragraphs, photoImage } from './shared.js';

const CONFETTI = 36;

export default function mountCake(container, ctx) {
  const timers = [];
  const candleCount = ctx.params.candles ?? 5;
  let lit = candleCount, done = false;

  // ---- the cake
  const hint = part('p', 'cake-hint', { role: 'status', 'aria-live': 'polite' }, ctx.t('cakeHint'));
  const candles = Array.from({ length: candleCount }, (_, i) => {
    const flame = part('span', 'cake-flame', { 'aria-hidden': 'true' });
    const c = part('button', 'cake-candle', { type: 'button', 'data-state': 'lit', 'aria-label': ctx.t('cakeCandle', { n: i + 1 }), style: `--i:${i}` }, flame);
    c.addEventListener('click', () => blowOut(c));
    return c;
  });
  const cake = part('div', 'cake-cake', { 'aria-hidden': 'true' },
    part('div', 'cake-tier', { 'data-level': 'top' }), part('div', 'cake-tier', { 'data-level': 'bottom' }), part('div', 'cake-icing'));
  const candleRow = part('div', 'cake-candles', { style: `--count:${candleCount}` }, candles);
  const blow = part('button', 'cake-blow', { type: 'button' }, ctx.t('cakeBlow'));
  const confetti = part('div', 'cake-confetti', { 'aria-hidden': 'true' });

  // ---- what follows the wish: headline, video, letter, photos, restart (the same content as every other variant)
  const after = part('div', 'cake-after', { 'data-state': 'hidden', tabindex: '0' });
  const seen = [];
  for (const b of ctx.params.blocks) {
    if (b.type === 'headline') seen.push(part('h2', 'headline', { 'data-state': 'hidden' }, b.text ?? ''));
    else if (b.type === 'video') seen.push(buildVideo(ctx, b.ref, () => {}).node);
    else if (b.type === 'letter') seen.push(part('div', 'letter', { 'data-state': 'hidden' }, paragraphs(b.text).map((t, i) => part('p', 'letter-line', { style: `--i:${i}` }, t))));
    else if (b.type === 'photos') seen.push(part('div', 'photos', { 'data-state': 'hidden' }, (b.items ?? []).map((ref) => part('figure', 'photo', {}, photoImage(ctx, ref)))));
  }
  const restart = part('button', 'restart', { type: 'button', hidden: true }, ctx.t('restart'));
  restart.addEventListener('click', () => ctx.onExit());
  after.append(...seen, restart);

  const stage = part('div', 'cake-stage', { 'data-state': 'wish' }, cake, candleRow, hint, blow, confetti, after);
  container.append(stage);
  blow.focus?.({ preventScroll: true });

  // ---- blowing out the candles
  function blowOut(candle) {
    if (done || candle.dataset.state === 'out') return;
    candle.dataset.state = 'out';
    candle.setAttribute('aria-disabled', 'true');
    ctx.fx.tap(candle);
    lit -= 1;
    hint.textContent = lit > 0 ? ctx.t('cakeLeft', { n: lit }) : ctx.t('cakeDone');
    if (lit === 0) wishMade();
  }

  /** The Blow button puts out the remaining candles one after another (all at once with reduced motion). */
  function blowAll() {
    const remaining = candles.filter((c) => c.dataset.state === 'lit');
    remaining.forEach((c, i) => timers.push(setTimeout(() => blowOut(c), reducedMotion() ? 0 : i * 220)));
  }
  blow.addEventListener('click', blowAll);

  function wishMade() {
    done = true;
    blow.hidden = true;
    ctx.fx.success(stage);
    ctx.fx.reveal();
    burstConfetti();
    stage.dataset.state = 'wished';
    // the cake settles, then the rest of the gift rises over it
    timers.push(setTimeout(() => {
      after.dataset.state = 'visible';
      seen.forEach((n, i) => timers.push(setTimeout(() => { n.dataset.state = 'visible'; }, reducedMotion() ? 0 : 350 * i)));
      restart.hidden = false;
      ctx.onComplete({ candles: candleCount });
      after.focus?.({ preventScroll: true });
    }, reducedMotion() ? 0 : 1500));
    timers.push(setTimeout(() => confetti.replaceChildren(), 4500));
  }

  function burstConfetti() {
    confetti.replaceChildren(...Array.from({ length: CONFETTI }, (_, i) => {
      // spread across the width with a little variety; the skin colors them by index
      const x = (i * 97) % 100, drift = ((i * 53) % 40) - 20, spin = ((i * 131) % 360) - 180, delay = (i % 9) * 60;
      return part('span', 'cake-bit', { style: `--x:${x}%; --drift:${drift}cqw; --spin:${spin}deg; --delay:${delay}ms; --k:${i % 5}` });
    }));
  }

  return { destroy() { timers.forEach(clearTimeout); } };
}
