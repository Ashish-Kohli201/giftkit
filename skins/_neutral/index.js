// Neutral starter skin. The smallest valid skin: tokens only, silent fx, no copy overrides.
// Every theme paints itself from tokens when a skin has no art for it, so this skin works in any world.
// STEP 5 (fx): empty = silent and particle-free. See skins/nightsky/index.js for a full example.
export default {
  id: '_neutral',
  fx: { success: {}, fail: {}, unlock: {}, tap: {}, reveal: {} },
  copy: {},
};
