// Shared by every product that is a "reveal" format (envelope, cake, film, credits): turns the customer's options into the
// reveal element's blocks, gives it the ctx it expects, and adds the optional song.
// Customer text is only ever inserted as text (the element builds it with text nodes), never as HTML.
import reveal from '../../elements/finale/reveal/index.js';
import { validate } from '../../core/validate.js';
import { ensureCss, part, template } from '../../core/util.js';

/**
 * @param root   the product's stage (given by the host)
 * @param ctx    the product ctx (core/product.js)
 * @param spec   { variant, extra(options) -> the variant's own settings, e.g. { candles: 5 } }
 */
export async function mountReveal(root, ctx, { variant, extra = () => ({}) }) {
  await ensureCss(reveal.layout);
  const host = part('div', 'reveal-host');
  host.style.display = 'contents';
  root.append(host);

  let container;
  let running = null; // the format currently on screen (its destroy() stops its timers and key listeners)
  let song = null;
  let opened = false;
  let alive = true;
  let latest = ctx.options; // the newest options, so "back to start" replays with what the customer last typed

  const vars = (o) => ({ recipient: o.recipient ?? '', sender: o.sender ?? '' });
  const words = (text, o) => template(text ?? '', vars(o));

  /** The reveal element's blocks, in the order a recipient meets them. */
  function blocks(o) {
    const list = [];
    if (o.title) list.push({ type: 'headline', text: words(o.title, o) });
    if (o.video) list.push({ type: 'video', ref: o.video });
    if (o.message) list.push({ type: 'letter', text: words(o.message, o) });
    if (o.photos?.length) list.push({ type: 'photos', items: o.photos, captions: o.captions ?? [] });
    // the element needs at least one block; a preview with nothing typed yet still shows something
    return list.length ? list : [{ type: 'headline', text: words('For {{recipient}}', o) }];
  }

  function render(o) {
    running?.destroy?.();
    container?.remove();
    container = part('div', 'reveal-root', { 'data-element': reveal.id, 'data-kind': reveal.kind, 'data-variant': variant });
    host.append(container);
    const params = { variant, blocks: blocks(o), ...extra(o) };
    const errors = validate(reveal.paramsSchema, params, `${reveal.id}.params`);
    if (errors.length) throw new Error(errors.join('; '));

    const t = (key, v = {}) => template(ctx.look.copy[`${reveal.id}.${key}`] ?? reveal.copy[key] ?? key, { ...vars(o), ...v });
    running = reveal.mount(container, {
      params, t,
      assets: { resolve: (ref) => ctx.media.resolve(String(ref).replace(/^@/, '')) },
      fx: ctx.look.fx, vars: vars(o), store: ctx.store,
      onComplete: () => ctx.finished(),
      onFail: () => {},
      emit: () => {},
      onExit: () => { opened = false; render(latest); },   // "back to start"
    });
  }

  // ---- the optional song: starts on the first tap (phones only allow sound after a touch), with a mute button
  async function setupSong(o) {
    song?.audio.pause();
    song?.button.remove();
    song = null;
    if (!o.music) return;
    try {
      const file = await ctx.media.resolve(o.music, { type: 'audio' });
      if (!alive) return;
      const audio = new Audio(file.url);
      audio.loop = true;
      const button = part('button', 'music', { type: 'button', 'aria-label': ctx.look.copy['music.off'] ?? 'Turn the music off' }, '♪');
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const on = audio.paused;
        on ? audio.play().catch(() => {}) : audio.pause();
        button.dataset.state = on ? 'on' : 'off';
        button.setAttribute('aria-label', on ? (ctx.look.copy['music.off'] ?? 'Turn the music off') : (ctx.look.copy['music.on'] ?? 'Turn the music on'));
      });
      button.dataset.state = 'off';
      root.append(button);
      song = { audio, button };
    } catch { /* a missing song never blocks the gift */ }
  }

  function firstTap() {
    if (opened) return;
    opened = true;
    ctx.opened();
    if (song && song.audio.paused) { song.audio.play().then(() => { song.button.dataset.state = 'on'; }).catch(() => {}); }
  }
  root.addEventListener('pointerdown', firstTap);

  render(ctx.options);
  await setupSong(ctx.options);
  ctx.ready();

  // live preview: new words, pictures or settings re-render in place (the host does not need to remount)
  ctx.onOptions((o) => { latest = o; opened = false; render(o); setupSong(o); });

  return {
    destroy() {
      alive = false;
      root.removeEventListener('pointerdown', firstTap);
      song?.audio.pause();
      song?.button.remove();
      running?.destroy?.();
      container?.remove();
      host.remove();
    },
  };
}
