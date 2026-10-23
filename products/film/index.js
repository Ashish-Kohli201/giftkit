// Product "film": the slideshow reveal format. All the work is in products/_shared/reveal.js; this file only says which format and its settings.
import { mountReveal } from '../_shared/reveal.js';

export default {
  mount: (root, ctx) => mountReveal(root, ctx, { variant: 'slideshow', extra: (o) => ({ slideMs: { slow: 6500, normal: 4500, quick: 3000 }[o.pace ?? 'normal'] }) }),
};
