// NO TURN WITHOUT ITS GROW (bots-v0.11; owner, 2026-11-04: "Remove the skipping growth in all levels
// really", after beta testers said the opponent felt broken when it "doesn't take his round").
//
// The ladder's gentler levels (1-6) used to end a turn on purpose without growing (`skipGrowth`, a
// "laziness" dial: 57% of steps at level 1, 33% at level 4), and any level could end a turn ungrown
// on a slip or a hold. Measured on lesson 9 (bot level 4), 39% of its turns showed nothing at all.
//
// Now a turn never ends without its grow while a grow is legal. Where the level would have ended
// it, the bot makes the MOST MODEST grow instead: it strengthens its own weakest tile, at the back if
// it can (a tile beside yours would only get harder for you to take), with its lowest card that can;
// with nothing to strengthen, it spreads one tile, lowest card, nearest its own home. A move you see,
// worth little: measured on lesson 9 against bot levels 2, 3 and 5 standing in for the player (120
// games each), a FULL best move instead of the lazy stop cut the stand-in's wins 55 -> 24 (level 3);
// this modest grow keeps them close (55 -> 45; level 2 36 -> 31; level 5 111 -> 101).
//
// Everything else is exactly the level's own choice (bots-v0.10), so every other position plays the
// same. Pure and deterministic: no randomness, the same view always gives the same move.
import { coordKey, hexDistance, homeCoord, legalActions, neighbors } from '../engine/index.js';
import type { Action, View } from '../engine/index.js';
import { chooseLevelAction } from './levels.js';
import type { Level } from './levels.js';

type Sprout = Extract<Action, { t: 'Sprout' }>;

/** The most modest legal grow for the view's player, or null when it cannot grow at all. */
export const modestGrow = (v: View): Sprout | null => {
  const me = v.player, you = (1 - me) as 0 | 1;
  const sprouts = legalActions(v).filter((a): a is Sprout => a.t === 'Sprout');
  if (!sprouts.length) return null;
  const rank = (a: Sprout) => v.hand.find((c) => c.id === a.card)?.rank ?? 99;
  const key = (a: Sprout) => coordKey(a.coord);
  const front = (a: Sprout) => neighbors(a.coord, v.config.boardRadius).some((n) => v.board[coordKey(n)]?.owner === you) ? 1 : 0;
  const own = sprouts.filter((a) => v.board[key(a)]?.owner === me);
  if (own.length) {
    return [...own].sort((a, b) => front(a) - front(b)
      || v.board[key(a)]!.strength - v.board[key(b)]!.strength
      || rank(a) - rank(b) || key(a).localeCompare(key(b)))[0]!;
  }
  const home = homeCoord(me, v.config);
  const open = sprouts.filter((a) => !v.board[key(a)]);
  const pool = open.length ? open : sprouts;
  return [...pool].sort((a, b) => rank(a) - rank(b)
    || hexDistance(a.coord, home) - hexDistance(b.coord, home)
    || key(a).localeCompare(key(b)))[0]!;
};

/** bots-v0.11: the level's own move, except that a turn never ends without its grow. */
export const chooseKeepsGrowing = (v: View, level: Level, seed: number): Action => {
  const a = chooseLevelAction(v, level, seed);
  if (a.t !== 'EndAct' || v.phase !== 'ACT' || v.sproutsThisTurn > 0) return a;
  return modestGrow(v) ?? a;
};
