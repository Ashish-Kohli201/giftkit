// Desk world - entry. The behavior is the shared world engine (core/world.js); this theme adds its layout (layout.css)
// and the default names of the things in a desk room, which a skin may re-word ("shell.desk.<role>").
import { mountWorld } from '../../core/world.js';

export default {
  id: 'desk',
  copy: {
    'shell.hub': 'Laptop',
    'shell.vault': 'A small locked box',
    'shell.board': 'Pinboard',
    'shell.jar': 'Jar of notes',
    'shell.light': 'Lamp',
    'shell.scenic': 'Look outside',
    'shell.appMusic': 'Music player',
    'shell.appGallery': 'Photos',
    'shell.appNotes': 'Notebook',
    'shell.pet': 'Sleeping cat',
    'shell.toy': 'Little plant',
    'shell.ambientA': 'Lights',
    'shell.ambientB': 'Curtains',
  },
  mount: (root, opts) => mountWorld(root, opts, { id: 'desk' }),
};
