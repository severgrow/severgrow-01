// The page's opponent is GreedyBot (src/bots). It reads only its own View and plays only
// legal moves; parked rules (Knock, Rot, Fruit) are never offered when they are off.
import type { Action, View } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';

export const chooseAction = (v: View): Action => GreedyBot.chooseAction(v);
