// The roles of a world (see docs/WORLD_CONTRACT.md) and the order the Signature room reveals them in.
// Shared by the world engine, the playground controls and the gift validator, so they can never disagree.

/** The order a Signature room grows, one step per finished night (spread over however many nights the gift has). */
export const PROGRESS_ORDER = ['board', 'light', 'jar', 'app-music', 'pet', 'app-gallery', 'toy', 'app-notes', 'ambient-a', 'ambient-b'];

/** Roles a gift can never remove: without them there is nothing to play. */
export const REQUIRED_ROLES = ['hero', 'hub', 'vault'];

/** Roles a gift may leave out, with a plain-language name for controls and messages. */
export const OPTIONAL_ROLES = [
  { id: 'scenic', label: 'backdrop tap' }, { id: 'tally', label: 'progress marks' }, { id: 'board', label: 'memories board' },
  { id: 'light', label: 'light switch' }, { id: 'jar', label: 'coupons jar' }, { id: 'app-music', label: 'music' },
  { id: 'app-gallery', label: 'photos' }, { id: 'app-notes', label: 'notes' }, { id: 'pet', label: 'pet' },
  { id: 'toy', label: 'toy' }, { id: 'ambient-a', label: 'lights toggle' }, { id: 'ambient-b', label: 'second toggle' },
];

export const ALL_ROLE_IDS = [...REQUIRED_ROLES, ...OPTIONAL_ROLES.map((r) => r.id)];

/** The ending styles of the reveal finale. */
export const FINALE_VARIANTS = ['scroll', 'envelope', 'slideshow', 'cake'];
