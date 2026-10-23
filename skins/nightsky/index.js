// Night Sky - skin entry. A skin's JS is small and mostly declarative:
//   fx    sound + particles + haptics per event (synthesized, no audio files)
//   copy  microcopy overrides, "reveal.<key>", for the format's own text

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
    'reveal.restart': 'Back to the stars',
  },
};
