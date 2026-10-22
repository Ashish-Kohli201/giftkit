// Start a gift folder: gift.json from the tier's starting template, and an empty media folder with a short guide.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GIFTS, ROOT, giftNameOf } from './paths.js';

export const TIERS = ['spark', 'countdown', 'signature'];

const MEDIA_GUIDE = (name) => [
  'DROP YOUR FILES HERE.',
  '',
  'Pictures: .jpg .png .webp        Songs: .mp3 .m4a        Videos: .mp4 (H.264)',
  '',
  'A file is used by its name: "us at goa.jpg" becomes @us_at_goa.',
  'You do not have to list your files anywhere. Songs add a Music app, pictures add a Photos app and a pinboard,',
  `and a video joins the ending, all by themselves. Run:  npm run gift -- check ${name}`,
  '',
  'Tips: iPhone photos (.heic) must be exported as JPG. Keep pictures under 5 MB and videos under 60 MB.',
  'A video can have a cover picture: name it like the video, plus ".poster" (our-video.mp4 + our-video.poster.jpg).',
  '',
].join('\n');

/**
 * @param opts { name, tier, theme, skin, recipient, sender, birthday (YYYY-MM-DD) }
 * @returns { name, dir, config }
 * @throws Error with a plain-language message when the name is taken or an option is wrong
 */
export async function createGift({ name: rawName, tier = 'signature', theme, skin, recipient, sender, birthday } = {}) {
  const name = giftNameOf(rawName);
  if (!name) throw new Error('Give the gift a short name, for example aria-birthday.');
  const dir = join(GIFTS, name);
  if (existsSync(dir)) throw new Error(`There is already a gift called "${name}". Pick another name.`);
  if (!TIERS.includes(tier)) throw new Error('The tier must be spark, countdown or signature.');
  const config = JSON.parse(await readFile(join(ROOT, 'engine/templates', `${tier}.json`), 'utf8'));
  if (theme) config.meta.theme = theme;
  if (skin) config.meta.skin = skin;
  if (recipient) config.people.recipient = recipient;
  if (sender) config.people.sender = sender;
  if (birthday) {
    // the finale opens on the birthday; the first night is as many days earlier as there are nights
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw new Error('The birthday needs a date like 2026-12-20.');
    const last = Date.parse(birthday);
    const nights = Math.max(config.days.length, 1);
    const day = (n) => new Date(last - n * 86400000).toISOString().slice(0, 10);
    config.schedule = { mode: 'date', startDate: day(nights), finaleDate: birthday };
  }
  await mkdir(join(dir, 'media'), { recursive: true });
  await writeFile(join(dir, 'gift.json'), `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(join(dir, 'media', 'README.txt'), MEDIA_GUIDE(name));
  return { name, dir, config };
}
