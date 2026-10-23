// Neutral starter skin. The smallest valid skin: tokens only, silent fx, no copy overrides.
// Core paints every part from the tokens when a skin has no art, so this skin works with every product.
// STEP 5 (fx): empty = silent and particle-free. See skins/nightsky/index.js for a full example.
export default {
  id: '_neutral',
  fx: { success: {}, fail: {}, unlock: {}, tap: {}, reveal: {} },
  copy: {},
};
