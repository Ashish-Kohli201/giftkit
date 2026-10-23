// Product "credits": the scroll reveal format. All the work is in products/_shared/reveal.js; this file only says which format and its settings.
import { mountReveal } from '../_shared/reveal.js';

export default {
  mount: (root, ctx) => mountReveal(root, ctx, { variant: 'scroll', extra: (o) => ({ autoScroll: true, scrollSpeed: { slow: 22, normal: 34 }[o.pace ?? 'normal'] }) }),
};
