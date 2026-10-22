// What the studio says about the choices a gift has: sizes (tiers), worlds (themes) and looks (skins).
// Themes and skins describe themselves in their own manifests (served by /api/catalog); the tiers are described here.

export const TIER_INFO = {
  spark: {
    title: 'Spark', line: 'A small surprise',
    text: 'A cosy scene with one thing to tap. It opens your letter, photos and video. No games, nothing to figure out. Quickest to make.',
    bullets: ['One tap', 'Letter, photos, video', 'Ready in minutes'],
    icon: 'sparkle',
  },
  countdown: {
    title: 'Countdown', line: 'A game a day',
    text: 'A few nights of small games, one unlocked at a time, ending with a locked box that opens on the big day.',
    bullets: ['About five nights', 'A game each night', 'A vault finale'],
    icon: 'moon',
  },
  signature: {
    title: 'Signature', line: 'The whole story',
    text: 'About ten nights with a story each night. The room slowly fills with music, photos, notes and little surprises as they play, until the finale.',
    bullets: ['About ten nights, a story each', 'The room grows every night', 'Music, photos, notes, ending'],
    icon: 'heart',
  },
};

export const MODE_INFO = {
  date: { title: 'One night a day', text: 'Each night opens on its own date, counting down to the birthday.' },
  sequential: { title: 'One after another', text: 'The next night opens as soon as the last is finished. No dates.' },
  all: { title: 'Everything open', text: 'All the nights are open from the start.' },
};

export const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

/** "2026-12-20" -> "Sun 20 Dec 2026" */
export function longDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return '';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)).replace(',', '');
}
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const timeAgo = (ms) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const units = [[60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month']];
  let v = s / 60, i = 0;
  while (i < units.length - 1 && v >= units[i + 1][0]) { v /= units[i + 1][0]; i++; }
  const n = Math.floor(v);
  return `${n} ${units[i][1]}${n === 1 ? '' : 's'} ago`;
};
