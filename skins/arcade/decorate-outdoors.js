// Arcade x Outdoors - the decorative DOM that turns the clearing into a neon fairground midway at night.
// The world engine (core/world.js) builds the roles and their behavior; this module only appends purely visual,
// aria-hidden pieces to the stage and to the roles. paint-outdoors.css, paint-outdoors-roles.css and paint-outdoors-hero.css style them.
// Everything is prefixed mw- (midway) so nothing can collide with an element part or a contract role.
// Repeated pieces carry data-n so the CSS can tell them apart without relying on child order.
//   every tier  sky, moon, Ferris wheel, tent skyline, boardwalk ground and a string of bunting behind the roles
//   Spark       the hero role becomes a lit arcade cabinet; two lamp posts and a bulb strip dress the midway
//   Countdown   booth (hub), prize chest (vault), photo strip (board), ticket bucket (jar), lamp post (light), fireworks (scenic)
//   Signature   adds carousel organ, photo booth, ticket window, ring toss, a mascot, carnival bulbs and a searchlight
// The tally is painted with CSS only: the engine rebuilds its children whenever progress changes, so nothing may be appended to it.
import { part } from '../../core/util.js';

/** A decorative piece. `tag` is span inside buttons (valid HTML) and div at stage level. */
const piece = (tag, name, attrs = {}, ...children) => part(tag, name, { 'aria-hidden': 'true', ...attrs }, ...children);
const span = (name, ...children) => piece('span', name, {}, ...children);
const many = (name, count) => Array.from({ length: count }, (_, i) => piece('span', name, { 'data-n': String(i + 1) }));

const BULBS = 14;
const CABINS = 8;

/** Sky, moon, Ferris wheel, tent skyline, boardwalk and bunting: the midway behind every tier's roles. */
function backdrop(stage) {
  stage.append(
    piece('div', 'mw-sky'),
    piece('div', 'mw-moon', {}, ...many('mw-crater', 3)),
    piece('div', 'mw-wheel', {}, ...many('mw-leg', 2), span('mw-rim', span('mw-spokes'), ...many('mw-cabin', CABINS)), span('mw-ring'), span('mw-hub')),
    piece('div', 'mw-skyline'),
    piece('div', 'mw-ground'),
    piece('div', 'mw-bunting'));
}

function decorateSpark({ room, stage, roles }) {
  roles.hero.append(
    span('cab-marquee', part('span', 'cab-marquee-text', {}, room.getAttribute('aria-label') ?? '')),
    span('cab-screen', span('cab-glow'), span('cab-sprite')),
    span('cab-panel', span('cab-stick'), ...many('cab-key', 2)),
    span('cab-button', span('cab-cap')),
    span('cab-base'));
  stage.append(
    piece('div', 'mw-bulb-strip', {}, ...Array.from({ length: BULBS }, (_, i) => piece('span', 'mw-bulb', { 'data-n': String(i + 1) }))),
    piece('div', 'mw-post', { 'data-n': '1' }, span('mw-post-head')),
    piece('div', 'mw-post', { 'data-n': '2' }, span('mw-post-head')));
}

function decorateMidway({ tier, stage, roles }) {
  roles.hub.append(span('mw-booth-roof'), span('mw-booth-screen', ...many('mw-booth-glyph', 3)), span('mw-booth-counter'));
  roles.vault.append(span('mw-chest-star'), span('mw-chest-lid'), span('mw-chest-body'), span('mw-chest-lock'));
  roles.board.append(span('mw-strip-line'), ...many('mw-strip-photo', 3));
  roles.scenic.append(...many('mw-fw', 3));
  roles.light.append(span('mw-pole'), span('mw-lamp'));
  roles.jar.append(span('mw-bucket'), span('mw-tickets'));

  if (tier !== 'signature') return;
  roles['app-notes'].append(span('mw-tw-roof'), span('mw-tw-hole'), span('mw-tw-roll'));
  roles['app-music'].append(span('mw-organ-pipes', ...many('mw-pipe', 5)), span('mw-organ-dial'), span('mw-organ-base'));
  roles['app-gallery'].append(span('mw-pb-sign'), span('mw-pb-curtain'), span('mw-pb-feet'));
  roles.toy.append(span('mw-rt-board', ...many('mw-rt-peg', 3)), span('mw-rt-ring'));
  roles.pet.append(span('mw-mascot-antenna'), span('mw-mascot-body', ...many('mw-mascot-eye', 2)), ...many('mw-mascot-heart', 3));
  roles['ambient-a'].append(...Array.from({ length: BULBS }, (_, i) => piece('span', 'mw-bulb', { 'data-n': String(i + 1) })));
  roles['ambient-b'].append(span('mw-sl-base'), span('mw-sl-lens'));
  // the searchlight's beam is stage-level so it can sweep across the sky behind the roles
  stage.append(piece('div', 'mw-sweep'));
}

/** Called once by the world engine after the roles exist. */
export default function decorateWorld(api) {
  backdrop(api.stage);
  if (api.tier === 'spark') decorateSpark(api);
  else decorateMidway(api);
}
