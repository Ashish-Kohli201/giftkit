// Coupons - redeemable treats. Redeemed state persists via ctx.store (namespaced by gift). Uses in-world confirm dialog.
import { part } from '../../../core/util.js';

export default {
  id: 'coupons',
  kind: 'app',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['list', 'coupon', 'coupon-title', 'coupon-detail', 'redeem', 'stamp'],
  layoutParts: ['list'],
  copy: {
    redeem: 'Redeem',
    stamp: 'Redeemed',
    confirmTitle: 'Redeem this coupon?',
    confirmMessage: '"{{title}}" can only be used once.',
    yes: 'Redeem it',
    no: 'Not yet',
  },
  paramsSchema: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', required: ['id', 'title'],
          properties: { id: { type: 'string', minLength: 1 }, title: { type: 'string', minLength: 1 }, detail: { type: 'string' } },
        },
      },
    },
  },
  placeholderParams: {
    items: [
      { id: 'c1', title: 'One slow dance', detail: 'Anytime, anywhere. Music optional.' },
      { id: 'c2', title: 'Breakfast in bed', detail: 'Pancakes included.' },
      { id: 'c3', title: 'You pick the movie', detail: 'No complaints. Valid once.' },
    ],
  },

  mount(container, ctx) {
    let redeemed = new Set(ctx.store.get('redeemed', []));
    const list = part('ul', 'list', { role: 'list' });

    for (const item of ctx.params.items) {
      const btn = part('button', 'redeem', { type: 'button', 'data-variant': 'primary' }, ctx.t('redeem'));
      const stamp = part('span', 'stamp', { 'aria-hidden': 'true' }, ctx.t('stamp'));
      const li = part('li', 'coupon', { 'data-state': redeemed.has(item.id) ? 'redeemed' : 'available' },
        part('div', 'coupon-title', {}, item.title),
        item.detail ? part('div', 'coupon-detail', {}, item.detail) : null,
        btn, stamp);
      const sync = () => { const done = redeemed.has(item.id); li.dataset.state = done ? 'redeemed' : 'available'; btn.disabled = done; };
      btn.addEventListener('click', async () => {
        const yes = await ctx.dialogs.confirm({ title: ctx.t('confirmTitle'), message: ctx.t('confirmMessage', { title: item.title }), ok: ctx.t('yes'), cancel: ctx.t('no') });
        if (!yes) return;
        redeemed.add(item.id);
        ctx.store.set('redeemed', [...redeemed]);
        sync();
        ctx.fx.success(li);
        ctx.emit('redeemed', { id: item.id });
      });
      sync();
      list.append(li);
    }
    container.append(list);
    return { destroy() {} };
  },
};
