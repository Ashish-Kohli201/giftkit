// Full-viewport gift page for checking real device sizes (open it on a phone via your LAN address).
// URL options:  ?tier=spark|countdown|signature   ?theme=<world id>   ?skin=<skin id>   ?mode=all|sequential|date   ?unlock=1   ?night=4  pretend 4 nights are done (to review the room on night 5)
//               ?exclude=pet,toy  leaves those roles out of the room   ?finale=scroll|envelope|slideshow|cake  picks the ending
//               ?element=<id>[&params=<json>]  opens just that element in a real sheet (used by tests/responsive.mjs to check fit)
// This file is a dev tool - it is not part of the product.
import { startGift } from '../core/runtime.js';
import { registry } from '../elements/registry.js';
import { mountElement } from '../core/mount.js';
import { createResolver } from '../core/resolver.js';
import { part } from '../core/util.js';
import { TIER_FILES } from './tiers.js';

const params = new URL(location.href).searchParams;
const tier = params.get('tier') || 'countdown';
if (!(tier in TIER_FILES)) throw new Error(`Unknown tier "${tier}". Use: ${Object.keys(TIER_FILES).join(', ')}`);

const config = await (await fetch(`../sample/${TIER_FILES[tier]}`)).json();
if (params.get('mode')) config.schedule.mode = params.get('mode');
if (params.get('exclude')) config.roles = { ...config.roles, exclude: params.get('exclude').split(',').filter(Boolean) };
if (params.get('finale')) config.finale = { ...config.finale, variant: params.get('finale') };

const gift = await startGift({
  root: document.getElementById('gift-root'),
  config,
  themeId: params.get('theme') || config.meta.theme,
  skinId: params.get('skin') || config.meta.skin,
  base: location.href,
  preview: true,
  unlockAll: params.get('unlock') === '1',
  finishedDays: Number(params.get('night') || 0),
});

// Element test mode: the same sheet, theme and day-note a real day gets, so fit problems show up exactly as a recipient would see them.
const elementId = params.get('element');
if (elementId) {
  const element = registry[elementId];
  if (!element) throw new Error(`Unknown element "${elementId}". Use: ${Object.keys(registry).join(', ')}`);
  const sheet = gift.shell.present('test', { title: elementId });
  sheet.container.append(part('p', 'day-note', {}, 'A sample note that is long enough to wrap onto a second line on a narrow phone screen.'));
  const host = part('div', 'element-host');
  sheet.container.append(host);
  await mountElement(element, host, {
    theme: gift.theme,
    params: params.get('params') ? JSON.parse(params.get('params')) : {},
    assets: createResolver({ placeholders: true }),
    vars: { recipient: config.people.recipient, sender: config.people.sender },
    usePlaceholders: true,
  });
}
