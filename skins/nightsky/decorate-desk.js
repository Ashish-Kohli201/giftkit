// Night Sky x Desk - the decorative DOM of the bedroom: a window onto the night sky with curtains and fairy lights, the
// sill, a desk with books, and (Spark) a bed. Everything here is aria-hidden scenery; the things the recipient can touch
// are the world's roles (hub, vault, light, ...), which this skin paints from paint-desk.css using their empty slots.
// See docs/WORLD_CONTRACT.md. The decorate hook receives the room's stage and appends scenery behind the roles.
import { part } from '../../core/util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BULBS = 11;

const decor = (name, ...children) => part('div', name, { 'aria-hidden': 'true' }, ...children);

/** String lights: a sagging wire with bulbs. Built as SVG so it scales with the scene. */
function buildStrand() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 16');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('data-part', 'strand');
  svg.setAttribute('aria-hidden', 'true');
  const wire = document.createElementNS(SVG_NS, 'path');
  wire.setAttribute('d', 'M-2 2 Q 25 14 50 6 T 102 3');
  wire.setAttribute('data-part', 'strand-wire');
  svg.append(wire);
  for (let i = 0; i < BULBS; i++) {
    const t = (i + 0.5) / BULBS;
    const bulb = document.createElementNS(SVG_NS, 'circle');
    // sample the wire's rough height at t so bulbs hang on it
    const y = 3 + Math.sin(t * Math.PI * 2.2) * 2.2 + Math.sin(t * Math.PI) * 4;
    bulb.setAttribute('cx', (t * 100).toFixed(1));
    bulb.setAttribute('cy', (y + 1.6).toFixed(1));
    bulb.setAttribute('r', '1.5');
    bulb.setAttribute('data-part', 'strand-bulb');
    bulb.style.setProperty('--i', i);
    svg.append(bulb);
  }
  return svg;
}

/** The arched window: sky, two star layers, moon, a shooting star, and the window bars. */
const buildWindow = () => decor('win',
  decor('win-pane', decor('win-stars-far'), decor('win-stars-near'), decor('win-moon'), decor('win-shoot')),
  decor('win-bars'));

const buildDrapes = () => ['left', 'right'].map((side) => part('div', 'drape', { 'data-side': side, 'aria-hidden': 'true' }));

/** The sill under the window, with a small potted plant on it (omitted when the floor already has a plant to water). */
const buildSill = (withPlant) => decor('sill', withPlant ? decor('sill-plant', decor('sill-leaf'), decor('sill-leaf'), decor('sill-pot')) : null);

/** A quilted bed with pillows, for the one-screen Spark room. */
const buildBed = () => decor('bed', decor('bed-pillow'), decor('bed-pillow'), decor('bed-fold'));

/** The desk surface with its drawers, and a stack of books on it. */
const buildDesk = () => [
  decor('desk', decor('desk-front')),
  decor('books', decor('book'), decor('book'), decor('book')),
];

export default function decorateWorld({ tier, stage }) {
  const scenery = [...buildDrapes(), buildWindow(), buildStrand(), buildSill(tier !== 'signature')];
  scenery.push(...(tier === 'spark' ? [buildBed()] : buildDesk()));
  stage.prepend(...scenery);
}
