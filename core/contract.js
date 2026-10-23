// The contract every element, skin and product is checked against. Bump CONTRACT_VERSION on breaking changes.
export const CONTRACT_VERSION = 2;

export const ELEMENT_KINDS = ['game', 'app', 'prop', 'finale'];

// Sound + particle + haptic events a skin's `fx` must define.
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

// What a customer can be asked for in a product. See docs/spark/PRODUCT_GUIDE.md.
export const OPTION_TYPES = ['text', 'longtext', 'choice', 'color', 'date', 'image', 'images', 'video', 'audio', 'toggle'];
export const MEDIA_TYPES = ['image', 'images', 'video', 'audio'];
