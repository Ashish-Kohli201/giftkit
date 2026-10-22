// Where gifts live and where the engine writes. The CLI and the studio agree through this file.
// GIFT_DIR / GIFT_OUT override the defaults (used by the tests and by anyone who keeps gifts elsewhere).
import { join, resolve } from 'node:path';
import { ROOT } from './build.js';

export { ROOT };
export const GIFTS = process.env.GIFT_DIR ? resolve(process.env.GIFT_DIR) : join(ROOT, 'gifts');
export const DIST = process.env.GIFT_OUT ? resolve(process.env.GIFT_OUT) : join(ROOT, 'dist-gifts');
export const PREVIEW = join(ROOT, '.engine', 'preview');
export const giftNameOf = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
