// Rules presets for the page. Both are plain RulesConfig overrides: the engine's
// rules are never changed.
import { deadwood, deckExhaustionResult, endGame, legalActions, scores } from '../engine/index.js';
import type { Action, RulesConfig, State, View } from '../engine/index.js';

export type Mode = 'lite' | 'classic';

/**
 * Lite: no Rot (threshold far above any possible hand), no Fruit, and Knock only at a
 * perfect hand (the engine's minimum). The page never offers Knock in Lite, and
 * `settle` ends the game when the deck runs out (higher score wins); Strangle still wins.
 */
export const LITE: Partial<RulesConfig> = { rotThreshold: 1000, fruitPerPlayer: 0, knockDeadwood: 0 };

/** Classic: the full default rules. */
export const CLASSIC: Partial<RulesConfig> = {};

export const PRESETS: Record<Mode, Partial<RulesConfig>> = { lite: LITE, classic: CLASSIC };

export const modeOf = (c: RulesConfig): Mode => (c.fruitPerPlayer === 0 && c.rotThreshold >= 1000 ? 'lite' : 'classic');

/** The moves the page offers: everything legal, minus Knock in Lite. */
export const visibleMoves = (v: View, mode: Mode): Action[] => {
  const all = legalActions(v);
  return mode === 'lite' ? all.filter((a) => a.t !== 'Knock') : all;
};

/**
 * Lite ends when the deck runs out: when a turn would start with an empty deck, the
 * game is scored with the engine's own deck-exhaustion result (higher score wins).
 * Classic is left to the engine, where only a short refill ends the game.
 */
export const settle = (s: State, mode: Mode): State => {
  if (mode !== 'lite' || s.phase !== 'DRAW' || s.deck.length > 0) return s;
  const dw: [number, number] = [deadwood(s.hands[0]), deadwood(s.hands[1])];
  return endGame(s, deckExhaustionResult(scores(s), dw));
};
