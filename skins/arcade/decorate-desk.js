// Arcade x Desk - the decorative DOM that makes the desk room an arcade after hours.
// The world engine (core/world.js) builds the roles and their behavior; this module only appends purely visual,
// aria-hidden pieces to them (and to the stage), and paint-desk.css / paint-props.css / paint-spark.css style them.
// Repeated pieces carry data-n so the CSS can tell them apart without relying on child order.
//   Spark      the hero role becomes a lit arcade cabinet; an OPEN sign, a poster and a coin dress the room
//   Countdown  console (hub), prize case (vault), photo wall (board), scoreboard (tally), ticket jar, neon sign (light),
//              wall screen (scenic), marquee bulbs, shelf, desk, cartridges, a controller
//   Signature  adds jukebox, claw machine, terminal, pinball, a ghost and a disco ball (all roles); no controller
import { part } from '../../core/util.js';

/** A decorative piece. `tag` is span inside buttons (valid HTML) and div at stage level. */
const piece = (tag, name, attrs = {}, ...children) => part(tag, name, { 'aria-hidden': 'true', ...attrs }, ...children);
const span = (name, ...children) => piece('span', name, {}, ...children);
const many = (name, count, tag = 'span') => Array.from({ length: count }, (_, i) => piece(tag, name, { 'data-n': String(i + 1) }));

const MARQUEE_BULBS = 14;

function decorateSpark({ room, stage, roles }) {
  roles.hero.append(
    span('cab-marquee', part('span', 'cab-marquee-text', {}, room.getAttribute('aria-label') ?? '')),
    span('cab-screen', span('cab-glow'), span('cab-sprite')),
    span('cab-panel', span('cab-stick'), ...many('cab-key', 2)),
    span('cab-button', span('cab-cap')),
    span('cab-base'));
  stage.append(
    piece('div', 'open-sign', {}, part('span', 'open-sign-text', {}, '★ OPEN ★')),
    piece('div', 'wall-poster', {}, span('wall-poster-art')),
    piece('div', 'floor-coin', {}, span('floor-coin-face')));
}

function decorateDesk({ tier, stage, roles }) {
  // fixtures behind and around the roles
  stage.append(
    piece('div', 'marquee', {}, ...Array.from({ length: MARQUEE_BULBS }, (_, i) => piece('span', 'marquee-bulb', { style: `--i:${i}` }))),
    piece('div', 'shelf', {}, span('shelf-robot', span('robot-head'), span('robot-body'))),
    piece('div', 'desk', {}, span('desk-front')),
    piece('div', 'carts', {}, ...many('cart', 3)));
  if (tier !== 'signature') stage.append(piece('div', 'pad', {}, span('pad-stick'), ...many('pad-btn', 2)));

  // the roles' own art
  roles.hub.append(span('tv-screen', ...many('tv-glyph', 3)), span('tv-base'));
  roles.vault.append(span('case-trophy'), span('case-glass'), span('case-body'), span('case-lock'));
  roles.board.append(...many('wall-photo', 3));
  roles.scenic.append(span('wall-screen', span('wall-ball'), span('wall-heart')));
  roles.light.append(...many('sign-glyph', 3));
  roles.jar.append(span('jar-tickets'), span('jar-lid'));

  if (tier !== 'signature') return;
  roles['app-music'].append(span('juke-top', span('juke-record')), span('juke-dial'), span('juke-grill'));
  roles['app-gallery'].append(span('claw-glass', span('claw-arm'), ...many('claw-prize', 3)), span('claw-panel'));
  roles['app-notes'].append(span('term-screen', ...many('term-line', 3), span('term-cursor')), span('term-base'));
  roles.toy.append(span('pin-table', ...many('pin-bumper', 3), span('pin-ball')), ...many('pin-flipper', 2));
  roles.pet.append(span('ghost-body', ...many('ghost-eye', 2), span('ghost-mouth')), ...many('ghost-heart', 3));
  roles['ambient-b'].append(span('disco-string'), span('disco-ball'));
  stage.append(piece('div', 'disco-beams'));
}

/** Called once by the world engine after the roles exist. */
export default function decorateWorld(api) {
  if (api.tier === 'spark') decorateSpark(api);
  else decorateDesk(api);
}
