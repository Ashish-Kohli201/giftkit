// Reveal - the finale. One element, four endings ("variants over new modules"): the content is always the same blocks
// (headline, video, letter, photos), the variant decides how they arrive.
//   scroll     the original: headline, then letter and photos fade in and the page drifts like end credits
//   envelope   a sealed envelope to open; the letter is read a paragraph at a time, then the photos fan out
//   slideshow  a memory film: Ken Burns photos with crossfades, then the letter over the last frame
//   cake       make a wish: blow out the candles, confetti, then the letter and photos
// Each variant lives in variants/<name>.js. All text is inserted as text nodes (never HTML).
import mountScroll from './variants/scroll.js';
import mountEnvelope from './variants/envelope.js';
import mountSlideshow from './variants/slideshow.js';
import mountCake from './variants/cake.js';

const VARIANTS = { scroll: mountScroll, envelope: mountEnvelope, slideshow: mountSlideshow, cake: mountCake };

export default {
  id: 'reveal',
  kind: 'finale',
  version: 2,
  layout: new URL('./style.css', import.meta.url).href,
  parts: [
    // shared by several variants
    'headline', 'video-frame', 'video', 'skip', 'notice', 'letter', 'letter-line', 'photos', 'photo', 'restart',
    // scroll
    'scroll',
    // envelope
    'env-stage', 'env-envelope', 'env-back', 'env-address', 'env-pocket', 'env-flap', 'env-seal', 'env-hint',
    'env-card', 'env-lines', 'env-next', 'env-photos', 'env-polaroid', 'env-caption',
    // slideshow
    'film-stage', 'film-slides', 'film-slide', 'film-caption', 'film-dim', 'film-lines', 'film-progress', 'film-tick',
    'film-controls', 'film-prev', 'film-pause', 'film-next',
    // cake
    'cake-stage', 'cake-cake', 'cake-tier', 'cake-icing', 'cake-candles', 'cake-candle', 'cake-flame', 'cake-blow',
    'cake-hint', 'cake-confetti', 'cake-bit', 'cake-after',
  ],
  // structural wrappers; themes rarely need to style them (excluded from coverage)
  layoutParts: ['scroll', 'video-frame', 'photos', 'env-stage', 'env-lines', 'env-photos', 'film-stage', 'film-slides', 'film-lines', 'film-progress', 'film-controls', 'cake-stage', 'cake-candles', 'cake-confetti', 'cake-after'],
  copy: {
    skip: 'Skip video',
    videoMissing: 'The video could not be loaded.',
    restart: 'Back to start',
    photo: 'Photo',
    // envelope
    envTo: 'For {{recipient}}',
    envHint: 'Tap the envelope to open it',
    envOpen: 'Open the envelope',
    envOpened: 'Envelope opened',
    envNext: 'Tap to continue',
    envPhotos: 'See the photos',
    envDone: 'Finish',
    // slideshow
    filmLabel: 'Memory film. Tap to pause, tap the edges to go back or forward.',
    filmSkip: 'Skip to the end',
    filmPause: 'Pause',
    filmPlay: 'Play',
    filmPrev: 'Previous',
    filmNext: 'Next',
    filmProgress: 'Part {{n}} of {{total}}',
    // cake
    cakeHint: 'Make a wish, then blow out the candles',
    cakeLeft: '{{n}} left',
    cakeDone: 'Your wish is on its way...',
    cakeBlow: 'Blow',
    cakeCandle: 'Candle {{n}}',
  },
  paramsSchema: {
    type: 'object',
    required: ['blocks'],
    properties: {
      variant: { type: 'string', enum: Object.keys(VARIANTS) },   // default "scroll"
      autoScroll: { type: 'boolean' },                            // scroll only
      scrollSpeed: { type: 'number', minimum: 5, maximum: 80 },   // scroll only: px per second
      slideMs: { type: 'integer', minimum: 2000, maximum: 12000 }, // slideshow only: time per photo
      candles: { type: 'integer', minimum: 1, maximum: 9 },       // cake only: number of candles
      blocks: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', required: ['type'],
          properties: {
            type: { type: 'string', enum: ['headline', 'video', 'letter', 'photos'] },
            text: { type: 'string' },
            ref: { type: 'string' },   // video asset slot
            items: { type: 'array', items: { type: 'string' }, maxItems: 8 },    // photo slots
            captions: { type: 'array', items: { type: 'string' }, maxItems: 8 }, // optional, one per photo (envelope, slideshow)
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
      { type: 'photos', items: ['@photo_01', '@photo_02'], captions: ['A day to remember', 'Just us'] },
    ],
  },

  mount(container, ctx) {
    const variant = ctx.params.variant ?? 'scroll';
    container.dataset.variant = variant;
    return VARIANTS[variant](container, ctx);
  },
};
