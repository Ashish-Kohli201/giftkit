// The contract every element and theme is checked against. Bump CONTRACT_VERSION on breaking changes.
export const CONTRACT_VERSION = 1;

export const ELEMENT_KINDS = ['game', 'app', 'prop', 'finale'];

// Sound + particle + haptic events a theme's `fx` must define.
export const FX_EVENTS = ['success', 'fail', 'unlock', 'tap', 'reveal'];

// Every skin MUST define all of these in tokens.css (scoped to [data-skin="<id>"]).
export const REQUIRED_TOKENS = [
  '--gk-bg', '--gk-bg-2', '--gk-surface', '--gk-surface-2',
  '--gk-text', '--gk-text-muted', '--gk-accent', '--gk-accent-text',
  '--gk-success', '--gk-danger', '--gk-border',
  '--gk-font-display', '--gk-font-body', '--gk-font-mono',
  '--gk-radius-s', '--gk-radius-m', '--gk-radius-l',
  '--gk-shadow-1', '--gk-shadow-2', '--gk-glow',
  '--gk-ease', '--gk-dur-fast', '--gk-dur-med', '--gk-dur-slow',
  '--gk-tap', '--gk-gap',
];

// Default microcopy for the shell (the "world" around the elements). Themes and skins override via copy["shell.<key>"].
export const DEFAULT_SHELL_COPY = {
  title: 'A gift for {{recipient}}',
  subtitle: 'From {{sender}}',
  dayLabel: 'Day {{n}}',
  finaleLabel: 'Vault',
  revealLabel: 'Your surprise',
  giftTag: 'For {{recipient}}',
  trayLabel: 'Fragments',
  extrasLabel: 'Extras',
  lockedTitle: 'Not yet',
  lockedOn: 'Unlocks {{date}}',
  lockedPrev: 'Come back to this one after the one before it.',
  finaleLocked: 'It will not open yet. Something is still missing.',
  revealLocked: 'Finish the game first',
  fragmentTitle: 'Something slipped out',
  fragmentFound: 'A little note slipped out: {{fragment}}. It might be worth remembering.',
  // names of the roles in a themed world; used as accessible labels (not shown as text). See docs/WORLD_CONTRACT.md
  hub: 'Games',
  vault: 'Locked box',
  board: 'Memories',
  jar: 'Jar',
  light: 'Light',
  scenic: 'Backdrop',
  appMusic: 'Music',
  appGallery: 'Photos',
  appNotes: 'Notes',
  pet: 'Pet',
  toy: 'Toy',
  ambientA: 'Lights',
  ambientB: 'Mood',
  music: 'Music',
  gallery: 'Photos',
  notes: 'Notes',
  coupons: 'Coupons',
  memories: 'Memories',
  'status.locked': 'Locked',
  'status.open': 'Ready',
  'status.done': 'Completed',
  errorTitle: 'Something went wrong',
};
