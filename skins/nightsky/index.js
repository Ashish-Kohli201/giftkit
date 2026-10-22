// Night Sky - skin entry. A skin's JS is small and mostly declarative:
//   fx       (Layer 3)  sound + particles + haptics per event (synthesized, no audio files)
//   copy     (Layer 3)  microcopy overrides: "shell.<key>" / "shell.<theme>.<key>" for the room, "<element>.<key>" for elements
//   decorate (Layer 3)  optional hook to add decorative DOM to an element (never logic)
import { part } from '../../core/util.js';

const GOLD = ['#ffd479', '#fff2c8', '#ffffff', '#b9c4ff'];

export default {
  id: 'nightsky',

  fx: {
    success: { sound: [523.25, 659.25, 783.99, 1046.5], wave: 'sine', particles: { glyphs: ['✦', '✧', '★'], colors: GOLD, count: 16 }, haptic: 20 },
    fail:    { sound: [293.66, 233.08], wave: 'triangle', gain: 0.05, haptic: [30, 40, 30] },
    unlock:  { sound: [392, 523.25, 659.25, 880, 1174.7], wave: 'sine', particles: { glyphs: ['★', '✦'], colors: GOLD, count: 26 }, haptic: 40 },
    tap:     { sound: [880], wave: 'sine', gain: 0.025, step: 0.05 },
    reveal:  { sound: [261.63, 329.63, 392, 523.25, 659.25], wave: 'sine', gain: 0.05, step: 0.16, particles: { glyphs: ['✦'], colors: GOLD, count: 20 } },
  },

  copy: {
    'shell.title': 'A room for {{recipient}}',
    'shell.subtitle': '{{sender}}',
    'shell.dayLabel': 'Day {{n}}',
    'shell.finaleLabel': 'The little box',
    'shell.revealLabel': 'Your surprise',
    'shell.revealLocked': 'Not just yet',
    'shell.giftTag': 'For {{recipient}}',
    'shell.lockedTitle': 'Not yet',
    'shell.lockedOn': 'Opens {{date}}',
    'shell.lockedPrev': 'Come back to this one after the one before it.',
    'shell.finaleLocked': 'It will not budge. Something is still missing.',
    'shell.fragmentTitle': 'Something slipped out',
    'shell.fragmentFound': 'A little note fell out of that one: {{fragment}}. It might be worth remembering.',
    'shell.memories': 'Memories',
    'shell.coupons': 'For you to keep',
    'shell.music': 'Music',
    'shell.gallery': 'Photos',
    'shell.notes': 'Notes',
    // what the things in the desk room are called when read aloud
    'shell.desk.hub': 'Laptop',
    'shell.desk.vault': 'A small locked box',
    'shell.desk.board': 'Pinboard',
    'shell.desk.jar': 'Jar of notes',
    'shell.desk.light': 'Lamp',
    'shell.desk.scenic': 'Look outside',
    'shell.desk.appMusic': 'Record player',
    'shell.desk.appGallery': 'Photo easel',
    'shell.desk.appNotes': 'Notebook',
    'shell.desk.pet': 'Sleeping cat',
    'shell.desk.toy': 'Little plant',
    'shell.desk.ambientA': 'Fairy lights',
    'shell.desk.ambientB': 'Curtains',
    // what the things at the campsite are called when read aloud
    'shell.outdoors.hub': 'Tent',
    'shell.outdoors.vault': 'A small chest',
    'shell.outdoors.board': 'Photos on a string',
    'shell.outdoors.jar': 'Firefly jar',
    'shell.outdoors.light': 'Lantern',
    'shell.outdoors.scenic': 'Look up',
    'shell.outdoors.appMusic': 'Radio',
    'shell.outdoors.appGallery': 'Instant camera',
    'shell.outdoors.appNotes': 'Journal',
    'shell.outdoors.pet': 'Sleeping fox',
    'shell.outdoors.toy': 'Marshmallow stick',
    'shell.outdoors.ambientA': 'String lights',
    'shell.outdoors.ambientB': 'Campfire',
    'wordle.win': 'A new star appears!',
    'wordle.lose': 'The star slipped away. It was {{answer}}.',
    'memory.win': 'Every pair found in {{moves}} moves.',
    'quiz.passed': 'The stars approve.',
    'vault.prompt': 'A lock with {{length}} letters. The notes on the board might help.',
    'vault.open': 'The sky opens...',
    'reveal.restart': 'Back to the stars',
    'coupons.stamp': 'Redeemed',
    'music.loading': 'Dropping the needle...',
    'music.pickOne': 'Pick one and press play.',
    'music.error': '"{{title}}" would not play. Try the next one.',
    'gallery.unavailable': 'This one is hiding from us.',
    'gallery.close': 'Back to all photos',
    'notes.back': 'All notes',
    'jigsaw.hint': 'Glimpse the sky',
    'jigsaw.win': 'The constellation is whole! {{moves}} moves.',
    'jigsaw.loading': 'Gathering stardust...',
    'timeline.hint': 'Which moment came first? Set the stars in the order they happened.',
    'timeline.check': 'Read the stars',
    'timeline.win': 'Every star in its place.',
    'timeline.score': '{{correct}} of {{total}} stars in place. Nudge the rest.',
    'timeline.wrong': 'The stars are still tangled. Nudge them again.',
    'hunt.step': 'Star clue {{n}} of {{total}}',
    'hunt.right': 'A star answers back!',
    'hunt.wrong': 'The sky stays quiet. Look again.',
    'hunt.next': 'Follow the next star',
    'hunt.done': 'Every clue found. The sky is yours.',
  },

  // Example of Layer-3 decoration: purely visual DOM. Styled in parts.css via [data-part="halo"].
  decorate(elementId, container) {
    if (elementId === 'vault') container.prepend(part('div', 'halo', { 'aria-hidden': 'true' }));
  },
};
