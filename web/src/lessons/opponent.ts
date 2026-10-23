// THE SCRIPTED OPPONENT — a gentle, deterministic player for the teaching levels.
//
// It plays by the same rules as everyone (every move it makes comes from `legalActions`), it looks
// like a calm human, and it is never the reason a lesson fails:
//   * it always draws from the Draw pile, so the Throw pile stays exactly as the lesson set it;
//   * it grows on every turn from level 2 (owner, 2026-10-22: a level that does not move feels like a bug; level 1 grows once, on its 2nd turn), one
//     tile at a time, on its own side of the board. With no room to spread it strengthens its
//     weakest tile, and only then takes your weakest one, so every turn is a real move. A
//     beginner who does the lesson still ends well ahead; one who plays very badly may lose;
//   * it never takes the last open side of your home, so a lesson can never be lost to a surprise KO;
//   * it throws its lowest card (a Bomb never), the move a careful player makes.
// No randomness: the same position always gives the same move.
import { apply, coordKey, hexDistance, homeCoord, isStrangled, legalActions, parseKey, viewFor } from '../../../src/engine/index.js';
import type { Action, Card, State } from '../../../src/engine/index.js';

export type OpponentScript = {
  /**
   * Which of its own turns (1 = its first) it grows on. Absent: EVERY turn (the rule since
   * 2026-10-22). Only level 1 uses it: the first game is calm, and the opponent grows once.
   */
  growOn?: readonly number[];
  /** Hexes it goes for first, in order, when it grows (a lesson's "they head for the gold"). */
  prefer?: readonly string[];
  /** Hexes it never grows on (a lesson's key hex stays free for you). */
  avoid?: readonly string[];
  /** It may overgrow (take) one of your tiles. Off by default: a gentle opponent does not attack. */
  attacks?: boolean;
};

const OPP = 1 as const;
const YOU = 0 as const;

/** Its own turn count: 1 on its first turn (finished turns end with a throw or a deck-end turn). */
export const opponentTurnIndex = (s: State): number =>
  1 + (s.history ?? []).filter((e) => e.t === 'Discard' && e.player === OPP).length;

const isBomb = (c: Card) => c.suit === null;

/** Never hand you a loss: a move that strangles your home is not one it makes. */
const safe = (s: State, a: Action): boolean => {
  try {
    return !isStrangled(apply(s, a), YOU);
  } catch {
    return false;
  }
};

export const scriptedOpponentAction = (s: State, script: OpponentScript = {}): Action | null => {
  const legal = legalActions(viewFor(s, OPP));
  if (!legal.length) return null;
  if (s.phase === 'DRAW') return legal.find((a) => a.t === 'Draw' && a.from === 'deck') ?? legal.find((a) => a.t === 'Draw') ?? legal[0]!;

  if (s.phase === 'ACT') {
    if ((s.sproutsThisTurn ?? 0) === 0 && (!script.growOn || script.growOn.includes(opponentTurnIndex(s)))) {
      const hand = s.hands[OPP];
      const avoid = new Set(script.avoid ?? []);
      const sprouts = legal.filter((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout')
        .filter((a) => !avoid.has(coordKey(a.coord)))
        .filter((a) => {
          const tile = s.board[coordKey(a.coord)];
          if (!tile) return true;
          if (tile.owner === OPP) return false; // it does not strengthen: it spreads
          return !!script.attacks;
        })
        .filter((a) => safe(s, a));
      if (sprouts.length) {
        const rank = (a: Extract<Action, { t: 'Sprout' }>) => hand.find((c) => c.id === a.card)?.rank ?? 99;
        const theirs = homeCoord(OPP, s.config);
        const preferred = (script.prefer ?? []).find((k) => sprouts.some((a) => coordKey(a.coord) === k));
        // Its lowest card that can make the move, on the hex nearest its own home (it stays on its
        // side), the preferred hex first. Ties go to the lower key, so it never wavers.
        const pool = preferred ? sprouts.filter((a) => coordKey(a.coord) === preferred) : sprouts;
        const best = [...pool].sort((a, b) =>
          rank(a) - rank(b)
          || hexDistance(a.coord, theirs) - hexDistance(b.coord, theirs)
          || coordKey(a.coord).localeCompare(coordKey(b.coord)))[0];
        if (best) return best;
      }
      // No room to spread: it strengthens its weakest tile, and only with nothing else to do takes
      // your weakest tile — so every turn is a real move. Lowest card that does it; never on a hex the
      // lesson keeps for you, never a move that surrounds your home.
      const rank = (a: Extract<Action, { t: 'Sprout' }>) => hand.find((c) => c.id === a.card)?.rank ?? 99;
      const tile = (a: Extract<Action, { t: 'Sprout' }>) => s.board[coordKey(a.coord)]?.strength ?? 99;
      const weakestFirst = (xs: Extract<Action, { t: 'Sprout' }>[]) => [...xs].sort((a, b) =>
        tile(a) - tile(b) || rank(a) - rank(b) || coordKey(a.coord).localeCompare(coordKey(b.coord)))[0];
      const onto = (owner: 0 | 1) => legal.filter((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout')
        .filter((a) => !avoid.has(coordKey(a.coord)) && s.board[coordKey(a.coord)]?.owner === owner)
        .filter((a) => safe(s, a));
      const fallback = weakestFirst(onto(OPP)) ?? weakestFirst(onto(YOU));
      if (fallback) return fallback;
    }
    return legal.find((a) => a.t === 'EndAct') ?? legal[0]!;
  }

  if (s.phase === 'DISCARD') {
    const hand = s.hands[OPP];
    const discards = legal.filter((a): a is Extract<Action, { t: 'Discard' }> => a.t === 'Discard');
    const card = (a: Extract<Action, { t: 'Discard' }>) => hand.find((c) => c.id === a.card)!;
    const sorted = [...discards].sort((a, b) =>
      Number(isBomb(card(a))) - Number(isBomb(card(b))) || card(a).rank - card(b).rank || a.card - b.card);
    return sorted[0] ?? legal[0]!;
  }
  return legal[0]!;
};

/** Its whole turn from the Draw step, for the tests and the opponent's quick replay. */
export const playOpponentTurn = (s: State, script: OpponentScript = {}): State => {
  let next = s;
  for (let guard = 0; guard < 12 && next.phase !== 'GAME_OVER' && next.actor === OPP; guard++) {
    const a = scriptedOpponentAction(next, script);
    if (!a) break;
    next = apply(next, a);
  }
  return next;
};

/** Keys that stay unused by the script, for readability in lesson data. */
export const keys = (...k: string[]): readonly string[] => Object.freeze(k.map((x) => coordKey(parseKey(x))));
