// Helpers shared by every reveal variant: reading the content blocks, and building photos and video through ctx.assets.
// All text is inserted as text nodes (never HTML); every file goes through ctx.assets.
import { part } from '../../../../core/util.js';

/** Split a letter into paragraphs (blank-line separated). */
export const paragraphs = (text) => String(text ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

/**
 * Sort the gift's blocks into what each variant needs. Order inside each list follows the config.
 * @returns {{ headlines: string[], videos: string[], paragraphs: string[], photos: {ref: string, caption: string}[] }}
 */
export function readBlocks(blocks) {
  const model = { headlines: [], videos: [], paragraphs: [], photos: [] };
  for (const b of blocks) {
    if (b.type === 'headline' && b.text) model.headlines.push(b.text);
    else if (b.type === 'video' && b.ref) model.videos.push(b.ref);
    else if (b.type === 'letter') model.paragraphs.push(...paragraphs(b.text));
    else if (b.type === 'photos') (b.items ?? []).forEach((ref, i) => model.photos.push({ ref, caption: b.captions?.[i] ?? '' }));
  }
  return model;
}

/** An <img> that resolves its @slot through the AssetResolver; it removes itself if the asset is missing. */
export function photoImage(ctx, ref) {
  const img = document.createElement('img');
  img.decoding = 'async';
  img.alt = '';
  ctx.assets.resolve(ref).then((a) => { img.src = a.url; img.alt = a.alt || ctx.t('photo'); }).catch(() => img.remove());
  return img;
}

/**
 * A video with a visible notice if it cannot load and a skip button; `onDone` runs once when it ends or is skipped.
 * @returns {{ node: HTMLElement, video: HTMLVideoElement }}
 */
export function buildVideo(ctx, ref, onDone) {
  const video = part('video', 'video', { controls: true, playsinline: true, preload: 'metadata' });
  const notice = part('p', 'notice', { hidden: true }, ctx.t('videoMissing'));
  const skip = part('button', 'skip', { type: 'button' }, ctx.t('skip'));
  let finished = false;
  const done = () => { if (finished) return; finished = true; onDone(); };
  const fail = () => { notice.hidden = false; };
  ctx.assets.resolve(ref).then((a) => { video.src = a.url; if (a.poster) video.poster = a.poster; }).catch(fail);
  video.addEventListener('error', fail);
  video.addEventListener('ended', done);
  skip.addEventListener('click', () => { video.pause?.(); done(); });
  return { node: part('div', 'video-frame', {}, video, notice, skip), video };
}
