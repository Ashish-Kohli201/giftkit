// Outdoors world - entry. The behavior is the shared world engine (core/world.js); this theme adds its geometry (layout.css)
// and the default names of the things in an outdoor clearing, which a skin may re-word ("shell.outdoors.<role>").
import { mountWorld } from '../../core/world.js';

export default {
  id: 'outdoors',
  copy: {
    'shell.hub': 'Tent',
    'shell.vault': 'A small chest',
    'shell.board': 'Photos on a line',
    'shell.jar': 'Jar of lights',
    'shell.light': 'Lantern',
    'shell.scenic': 'Look up',
    'shell.appMusic': 'Radio',
    'shell.appGallery': 'Photo box',
    'shell.appNotes': 'Journal',
    'shell.pet': 'Little fox',
    'shell.toy': 'Marshmallow stick',
    'shell.ambientA': 'String lights',
    'shell.ambientB': 'Campfire',
  },
  mount: (root, opts) => mountWorld(root, opts, { id: 'outdoors' }),
};
