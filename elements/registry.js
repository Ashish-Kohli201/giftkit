// The element library. To add an element: build its folder, import it here. That's the whole registration step.
import wordle from './games/wordle/index.js';
import memory from './games/memory/index.js';
import quiz from './games/quiz/index.js';
import vault from './finale/vault/index.js';
import reveal from './finale/reveal/index.js';
import polaroid from './props/polaroid/index.js';
import coupons from './apps/coupons/index.js';
import jigsaw from './games/jigsaw/index.js';
import timeline from './games/timeline/index.js';
import hunt from './games/hunt/index.js';
import music from './apps/music/index.js';
import gallery from './apps/gallery/index.js';
import notes from './apps/notes/index.js';

export const registry = { wordle, memory, quiz, vault, reveal, polaroid, coupons, timeline, hunt, jigsaw, music, gallery, notes };
