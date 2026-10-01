// The page's opponent is GreedyBot (src/bots). It reads only its own View, and in
// Lite it is told not to knock, so it plays exactly the moves the page offers.
import type { Action, View } from '../../src/engine/index.js';
import { createGreedyBot } from '../../src/bots/GreedyBot.js';
import type { Mode } from '../../src/playtest/presets.js';

const bots = { lite: createGreedyBot({ allowKnock: false }), classic: createGreedyBot() };

export const chooseAction = (v: View, mode: Mode = 'classic'): Action => bots[mode].chooseAction(v);
