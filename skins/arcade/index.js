// Arcade - skin entry. A skin's JS is small and mostly declarative:
//   fx       (Layer 3)  sound + particles + haptics per event (synthesized chiptune, no audio files)
//   copy     (Layer 3)  microcopy overrides, "reveal.<key>", for the format's own text

const NEON = ['#ff4fb0', '#4df3ff', '#ffd447', '#3dffa0', '#ffffff'];

export default {
  id: 'arcade',

  fx: {
    success: { sound: [523.25, 659.25, 783.99, 1046.5], wave: 'square', gain: 0.04, step: 0.07, particles: { glyphs: ['■', '★', '♥'], colors: NEON, count: 18 }, haptic: 20 },
    fail:    { sound: [220, 164.81, 110], wave: 'square', gain: 0.04, step: 0.1, haptic: [30, 40, 30] },
    unlock:  { sound: [392, 523.25, 659.25, 783.99, 1046.5, 1318.5], wave: 'square', gain: 0.04, step: 0.06, particles: { glyphs: ['★', '■'], colors: NEON, count: 28 }, haptic: 40 },
    tap:     { sound: [988], wave: 'square', gain: 0.018, step: 0.04 },
    reveal:  { sound: [261.63, 329.63, 392, 523.25, 659.25, 783.99], wave: 'square', gain: 0.035, step: 0.12, particles: { glyphs: ['♥', '★'], colors: NEON, count: 24 } },
  },

  copy: {
    'reveal.restart': 'Insert coin to play again',
    'reveal.skip': 'Skip the cutscene',
    'reveal.videoMissing': 'The tape got stuck. The rest is still here for you.',
  },
};
