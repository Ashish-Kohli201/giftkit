// Product "cake": the cake reveal format. All the work is in products/_shared/reveal.js; this file only says which format and its settings.
import { mountReveal } from '../_shared/reveal.js';

export default {
  mount: (root, ctx) => mountReveal(root, ctx, { variant: 'cake', extra: (o) => ({ candles: Number(o.candles ?? 5) }) }),
};
