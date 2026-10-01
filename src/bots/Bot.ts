import type { Action, View } from '../engine/index.js';

/** A bot reads only its own View and returns one of legalActions(view) (spec 16). */
export interface Bot {
  chooseAction(view: View): Action;
}
