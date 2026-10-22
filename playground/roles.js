// The roles a gift may leave out, and the finale styles it may choose, for the playground controls and the full-screen page.
// The hub and the vault are always present (without them there is nothing to play). See docs/WORLD_CONTRACT.md.
export const OPTIONAL_ROLES = [
  { id: 'scenic', label: 'backdrop tap' }, { id: 'tally', label: 'progress marks' }, { id: 'board', label: 'memories board' },
  { id: 'light', label: 'light switch' }, { id: 'jar', label: 'coupons jar' }, { id: 'app-music', label: 'music' },
  { id: 'app-gallery', label: 'photos' }, { id: 'app-notes', label: 'notes' }, { id: 'pet', label: 'pet' },
  { id: 'toy', label: 'toy' }, { id: 'ambient-a', label: 'lights toggle' }, { id: 'ambient-b', label: 'second toggle' },
];
export const FINALE_VARIANTS = ['scroll', 'envelope', 'slideshow', 'cake'];
