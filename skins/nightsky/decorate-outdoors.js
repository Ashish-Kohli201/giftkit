// Night Sky x Outdoors - the decorative DOM of the campsite: a starry sky with a moon, hills and pines on the horizon,
// dark grass, string lights across the top, and a campfire. Everything here is aria-hidden scenery; the things the
// recipient can touch are the world's roles (hub = tent, vault = chest, ...), painted from paint-outdoors-roles.css using
// their empty slots. The decorate hook receives the room's stage and appends scenery behind the roles.
// See docs/WORLD_CONTRACT.md. All pieces are namespaced `out-` so they never collide with element parts.
import { part } from '../../core/util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BULBS = 11;
/** Pines on the horizon as [x in cqw, height in cqw]. Gaps are left where the tent and the lantern stand. */
const PINES = [[-3, 14], [5, 18], [13, 11], [66, 12], [75, 17], [85, 13], [94, 16]];

const piece = (tag, name, attrs = {}, ...children) => part(tag, name, { 'aria-hidden': 'true', ...attrs }, ...children);
const div = (name, ...children) => piece('div', name, {}, ...children);

/** The sky: gradient, two star layers, the moon, a shooting star, and (CSS shows it in Signature only) an aurora. */
const buildSky = () => div('out-sky', div('out-stars-far'), div('out-stars-near'), div('out-moon'), div('out-shoot'), div('out-aurora'));

const buildPines = () => div('out-pines', ...PINES.map(([x, h]) => piece('span', 'out-pine', { style: `--x:${x}cqw;--h:${h}cqw` })));

/** Two big dark pines framing the bottom corners (CSS hides them on wide screens). */
const buildForegroundPines = () => [1, 2].map((n) => piece('span', 'out-fg-pine', { 'data-n': String(n) }));

/** String lights: a sagging wire with bulbs, built as SVG so it scales with the scene. */
function buildStrand() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 16');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('data-part', 'out-strand');
  svg.setAttribute('aria-hidden', 'true');
  const wire = document.createElementNS(SVG_NS, 'path');
  wire.setAttribute('d', 'M-2 2 Q 25 14 50 6 T 102 3');
  wire.setAttribute('data-part', 'out-strand-wire');
  svg.append(wire);
  for (let i = 0; i < BULBS; i++) {
    const t = (i + 0.5) / BULBS;
    const bulb = document.createElementNS(SVG_NS, 'circle');
    // sample the wire's rough height at t so the bulbs hang on it
    const y = 3 + Math.sin(t * Math.PI * 2.2) * 2.2 + Math.sin(t * Math.PI) * 4;
    bulb.setAttribute('cx', (t * 100).toFixed(1));
    bulb.setAttribute('cy', (y + 1.6).toFixed(1));
    bulb.setAttribute('r', '1.5');
    bulb.setAttribute('data-part', 'out-strand-bulb');
    bulb.style.setProperty('--i', i);
    svg.append(bulb);
  }
  return svg;
}

/** The campfire: glow, embers, two crossed logs, and three flames (the Signature toggle banks them down to embers). */
const buildFire = () => div('out-fire',
  div('out-firelight'), div('out-embers'), div('out-logs'),
  ...[1, 2, 3].map((n) => piece('div', 'out-flame', { 'data-n': String(n) })));

/** Photos clipped to the board's string (the board role itself provides the poles and string through its slots). */
const buildPhotos = () => [1, 2, 3].map((n) => piece('span', 'out-photo', { 'data-n': String(n) }));

/** Called once by the world engine after the roles exist. */
export default function decorateWorld({ stage, roles }) {
  stage.prepend(div('out-ground', div('out-path')), buildSky(), div('out-hills'), buildPines(), ...buildForegroundPines(), buildStrand(), buildFire());
  roles.board?.append(...buildPhotos());
}
