// Preview entry (used by `npm run gift -- preview`): same as the real page, plus the things an owner needs before sending it.
//   progress is not saved, so every reload starts fresh            ?unlock=1   show everything, ignore the schedule
//   ?night=4   pretend four nights are finished                    ?today=2026-12-05   pretend it is that date
//   ?finale=envelope|slideshow|cake|scroll   try another ending    ?exclude=pet,toy   leave roles out
//   ?play=3   open night 3's game straight away                     ?ending=1   play the ending straight away
// The page also reloads itself when the gift's files change.
import { startGift } from './core/runtime.js';

const root = document.getElementById('gift-root');
const q = new URLSearchParams(location.search);
try {
  const config = await (await fetch('./gift.json', { cache: 'no-store' })).json();
  if (q.get('finale')) config.finale = { ...config.finale, variant: q.get('finale') };
  if (q.get('exclude')) config.roles = { ...config.roles, exclude: q.get('exclude').split(',').filter(Boolean) };
  if (q.get('mode')) config.schedule = { ...config.schedule, mode: q.get('mode') };
  const gift = await startGift({
    root, config, base: location.href, preview: true,
    unlockAll: q.get('unlock') === '1',
    finishedDays: Number(q.get('night') || 0),
    now: () => (q.get('today') ? new Date(`${q.get('today')}T09:00:00`) : new Date()),
  });
  if (q.get('play')) gift.playDay(Number(q.get('play')));
  if (q.get('ending') === '1') gift.playEnding();
} catch (error) {
  root.textContent = `This gift could not be opened: ${error.message}`;
  root.style.cssText += ';color:#fff;font:16px system-ui;padding:24px';
  console.error(error);
}
if (typeof EventSource === 'function') new EventSource('./__reload').onmessage = () => location.reload();
