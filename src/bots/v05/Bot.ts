// FROZEN: the bots of bot version 'bots-v0.5' (rules v0.4-defaults-2), kept unchanged so
// earlier games and world-map tickets still verify. Do not edit; new work goes in src/bots/.
import type { Action, View } from '../../engine/index.js';

/** A bot reads only its own View and returns one of legalActions(view) (spec 16). */
export interface Bot {
  chooseAction(view: View): Action;
}
