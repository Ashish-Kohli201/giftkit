// Polaroid - a single photo keepsake with a caption. Tap to flip if a `back` note is provided. No completion signal (it's a prop).
import { part } from '../../../core/util.js';

export default {
  id: 'polaroid',
  kind: 'prop',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['frame', 'photo', 'caption', 'back'],
  layoutParts: [],
  copy: { flip: 'Flip the photo', unflip: 'Show the photo' },
  paramsSchema: {
    type: 'object',
    required: ['photo'],
    properties: {
      photo: { type: 'string', pattern: '^@' },
      caption: { type: 'string', maxLength: 80 },
      back: { type: 'string', maxLength: 200 },
      tilt: { type: 'number', minimum: -12, maximum: 12 },
    },
  },
  placeholderParams: { photo: '@photo_01', caption: 'A moment I keep coming back to', back: 'Written on the back: remember this day.', tilt: -3 },

  mount(container, ctx) {
    const { caption = '', back = '', tilt = 0 } = ctx.params;
    const img = document.createElement('img');
    img.decoding = 'async'; img.loading = 'lazy'; img.alt = '';
    ctx.assets.resolve(ctx.params.photo).then((a) => { img.src = a.url; img.alt = a.alt || caption || 'Photo'; }).catch(() => { img.alt = 'Photo unavailable'; });

    const faceFront = part('span', 'photo', {}, img, part('span', 'caption', {}, caption));
    const frame = back
      ? part('button', 'frame', { type: 'button', 'data-state': 'front', 'aria-label': ctx.t('flip'), style: `--tilt:${tilt}deg` }, faceFront, part('span', 'back', {}, back))
      : part('div', 'frame', { 'data-state': 'front', style: `--tilt:${tilt}deg` }, faceFront);
    if (back) {
      frame.addEventListener('click', () => {
        const flipped = frame.dataset.state === 'front';
        frame.dataset.state = flipped ? 'back' : 'front';
        frame.setAttribute('aria-label', flipped ? ctx.t('unflip') : ctx.t('flip'));
        ctx.fx.tap(frame);
      });
    }
    container.append(frame);
    return { destroy() {} };
  },
};
