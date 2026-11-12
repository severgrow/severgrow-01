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
//
// FROM LEVEL 4 IT PLAYS LIKE SOMEONE ACROSS THE TABLE (owner, 2026-11-04: beta testers said levels
// 2-9 "feel broken because the ai opp is not doing much - make sure it makes more actions especially
// from lesson 4 onwards ... Don't change much but improve that in a very smart way not breaking
// anything"). Two small habits, each a script option, so levels 1-3 are exactly as they were:
//   * `contests`: its grow heads for YOUR land (an open hex beside your tiles) instead of hiding on
//     its own side, so every turn visibly answers yours;
//   * `blooms`: where the lesson has taught Bloom (level 5 on), a turn holding one is a turn of two
//     moves, the grow AND a Bloom, on open ground only (never your tiles, never a key hex).
// Level 9's real bot did nothing on 39% of its turns: that is fixed for every level in the bots
// themselves (src/bots/keeps-growing.ts, bots-v0.11).
import { apply, coordKey, hexDistance, homeCoord, isStrangled, legalActions, neighbors, parseKey, scores, viewFor } from '../../../src/engine/index.js';
import type { Action, Card, Event, State } from '../../../src/engine/index.js';
import { botSeed } from '../../../src/bots/levels.js';
import type { Level } from '../../../src/bots/levels.js';
import { botFor, CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';

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
  /** Its grow heads for your land: an open hex beside your tiles first (levels 4 on). */
  contests?: boolean;
  /** After its grow it also plays a Bloom it holds, on open ground only (levels 5 on: Bloom is taught). */
  blooms?: boolean;
};

/** Who plays against you in a lesson: a script, or a real bot level (levels 9 and 10). */
export type LessonOpponent = { script: OpponentScript } | { bot: Level };

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
        // Contesting, an open hex beside your tiles comes first: it answers you where you are.
        const near = (a: Extract<Action, { t: 'Sprout' }>) => script.contests && !s.board[coordKey(a.coord)]
          && neighbors(a.coord, s.config.boardRadius).some((n) => s.board[coordKey(n)]?.owner === YOU) ? 0 : 1;
        const best = [...pool].sort((a, b) =>
          near(a) - near(b)
          || rank(a) - rank(b)
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
    const bloom = script.blooms ? gentleBloom(s, legal, script) : null;
    if (bloom) return bloom;
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

/**
 * Its events this turn: everything since YOUR last throw (a turn at the end of the deck has no draw,
 * so the draw cannot mark where a turn starts).
 */
const thisTurn = (s: State): readonly Event[] => {
  const h = s.history ?? [];
  let i = h.length;
  while (i > 0 && !(h[i - 1]!.t === 'Discard' && 'player' in h[i - 1]! && (h[i - 1] as { player: number }).player === YOU)) i--;
  return h.slice(i);
};
/** Has it played a Bloom this turn? (One Bloom a turn: a second move, not a flood.) */
const bloomedThisTurn = (s: State): boolean => thisTurn(s).some((e) => e.t === 'Bloom' && e.player === OPP);

/**
 * Its Bloom, if it holds one: on OPEN ground only (it never takes your tiles with it), never on a
 * hex the lesson keeps for you, never one that surrounds your home, and never one that would put it
 * level with you or ahead on points (measured: without that, following the light lost levels 5 and
 * 7). The smallest, lowest Bloom, nearest its own home: weak tiles you can answer, never a wall.
 */
const gentleBloom = (s: State, legal: readonly Action[], script: OpponentScript): Action | null => {
  if (bloomedThisTurn(s)) return null;
  const avoid = new Set(script.avoid ?? []);
  const hand = s.hands[OPP];
  const theirs = homeCoord(OPP, s.config);
  const blooms = legal.filter((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom')
    .filter((a) => a.hexes.every((h) => !s.board[coordKey(h)] && !avoid.has(coordKey(h))))
    .filter((a) => safe(s, a))
    // A lesson stays yours to win: a Bloom never puts it level with you or ahead.
    .filter((a) => { try { const [you, it] = scores(apply(s, a)); return it < you; } catch { return false; } });
  const ranks = (a: Extract<Action, { t: 'Bloom' }>) => a.cards.reduce((n, id) => n + (hand.find((c) => c.id === id)?.rank ?? 99), 0);
  const away = (a: Extract<Action, { t: 'Bloom' }>) => a.hexes.reduce((n, h) => n + hexDistance(h, theirs), 0);
  const key = (a: Extract<Action, { t: 'Bloom' }>) => a.hexes.map(coordKey).join('|') + '#' + a.cards.join(',');
  return [...blooms].sort((a, b) => a.cards.length - b.cards.length || ranks(a) - ranks(b) || away(a) - away(b) || key(a).localeCompare(key(b)))[0] ?? null;
};

/**
 * THE LESSON'S OPPONENT, one move. A script plays its script; a real bot plays its level.  The bot is the
 * game's current version (bots-v0.11: a turn never ends without its grow), the very one a level 10
 * Seeds proof is replayed against.
 */
export const lessonOpponentAction = (lesson: { opponent: LessonOpponent }, s: State): Action => {
  const o = lesson.opponent;
  if ('script' in o) return scriptedOpponentAction(s, o.script) ?? legalActions(viewFor(s, OPP))[0]!;
  const seed = botSeed(s.seed, o.bot, s.turnNumber, s.history?.length ?? 0);
  return botFor(CURRENT_BOT_VERSION)!(viewFor(s, OPP), o.bot, seed);
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
