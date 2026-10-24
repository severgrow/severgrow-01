// THE TEN LESSONS — levels 1-10 are the tutorial.
//
// A lesson is DATA (an authored opening, a gentle opponent, what it teaches) plus three pure
// functions of the LIVE game, never of a step counter:
//   * `lessonGoals`  — which of its ideas the player has already done (read from the game history);
//   * `suggestMove`  — the one move the light points at right now (always a legal move);
//   * `lessonBeat`   — what the glass window says and what is lit.
// So any other legal move keeps working: the next beat is simply read from wherever the game now is.
// docs/LESSON-SCRIPTS.md is the same script in prose; the tests keep them in step.
import {
  apply, coordKey, hexDistance, homeCoord, isStrangled, legalActions, neighbors, parseKey, viewFor,
} from '../../../src/engine/index.js';
import type { Action, Card, Coord, Event, State } from '../../../src/engine/index.js';
import type { Level } from '../../../src/bots/levels.js';
import { LESSON as W } from '../../../src/strings.js';
import { authoredState } from './authored.js';
import { FINAL_LESSON } from './final.js';
import type { PositionSpec } from './authored.js';
import type { OpponentScript } from './opponent.js';
import type { ActionKind, LessonTier, PowerKind } from './mastery.js';

const YOU = 0 as const;
const THEM = 1 as const;

// ---------- what a lesson can teach ----------

export type Goal =
  | { t: 'grow' }
  | { t: 'strengthen'; key: string; card: number }
  | { t: 'take'; key: string }
  | { t: 'gold'; key: string }
  | { t: 'cut'; key: string }
  | { t: 'bloom' }
  | { t: 'strangle' }
  | { t: 'bomb'; key: string }
  | { t: 'blast'; key: string }
  | { t: 'blastGrow' }
  | { t: 'pileBloom' };

export type Lesson = {
  level: number;
  /**
   * Bump when the opening or the script changes. A saved, unfinished lesson of another version is
   * restarted (never resumed into a position it no longer matches); a completed level stays done.
   */
  version: number;
  position: PositionSpec;
  /** The scripted opponent, or a real bot level (level 10 is a normal game). */
  opponent: { script: OpponentScript } | { bot: Level };
  /** Levels 1-3: only the lit thing (and its quiet alternatives) answers a tap. */
  locked: boolean;
  /** The ideas this lesson is for, in order. */
  goals: readonly Goal[];
  /**
   * Explanations shown once, tap anywhere to move on. Board facts and the first draw come before the
   * first draw; a move (gold, Bloom, surround, Bomb, Blast) is explained after the draw, the moment it
   * can be played (ACT_INTROS — owner, 2026-10-22: "every step has a playable example straight away").
   */
  intro: readonly IntroKind[];
  /** Level 10 keeps its hints for an idle moment; every other level guides every step (the fade decides how much). */
  guide: 'always' | 'idle';
  /**
   * The actions this level introduces. From level 2 a spotlight may fire only for one of these,
   * and only one new-idea spotlight is spent per level (lessons/mastery.ts).
   */
  newActions: readonly ActionKind[];
  /** The finish card: title, the one idea learned (YOU LEARNED: …), and its small mark. */
  finish: { title: string; line: string; learned: string; icon: string };
};

/** The one-time concepts a lesson explains in its info box before the first move. */
export type IntroKind =
  | 'tree' | 'their-home' | 'first-draw' | 'rock' | 'gold'
  | 'bloom-cards' | 'surround' | 'bomb' | 'blast' | 'pile-gold'
  /**
   * Level 10's send-off, said once before the first draw of the first real game (owner,
   * 2026-10-24). It explains nothing on the board: nothing is lit, a tap anywhere dismisses it,
   * and it never comes back.
   */
  | 'first-game';

/**
 * The level that first teaches each power. Before it the lesson never offers that move; a hello
 * only fires after it, never in its own lesson.
 */
const POWER_TAUGHT_AT: Readonly<Record<PowerKind, number>> = Object.freeze({ bloom: 5, bomb: 7, blast: 8 });

// ---------- the lessons ----------

const SET3: readonly (readonly [0 | 1 | 2 | 3, number])[] = [[0, 3], [1, 3], [2, 3]];

export const LESSONS: readonly Lesson[] = Object.freeze([
  {
    level: 1, version: 3, locked: true, guide: 'always',
    intro: ['tree', 'their-home', 'first-draw'],
    goals: [{ t: 'grow' }],
    newActions: ['draw', 'grow', 'throw'],
    position: {
      seed: 96001,
      hand: [[0, 8], [1, 2], [1, 5], [2, 4], [1, 3], [2, 6], [3, 5]],
      opponent: [[1, 2], [2, 2], [3, 3], [0, 2], [3, 2], [2, 3], [3, 4]],
      deck: [[2, 7], [0, 4], [0, 5], [0, 6], [1, 7], [3, 6], [3, 7], [3, 2], [0, 7], [1, 6], [2, 8], [1, 4]],
      discard: [[3, 1]],
    },
    // The first game is calm: it grows once, on its 2nd turn, and never takes anything (owner, 2026-10-23).
    opponent: { script: { growOn: [2] } },
    finish: { title: W.youWin, line: W.wonOnPoints, learned: 'DRAW, GROW, THROW', icon: '✦' },
  },
  {
    level: 2, version: 3, locked: true, guide: 'always',
    intro: [],
    goals: [{ t: 'strengthen', key: '-1,1', card: 8 }, { t: 'take', key: '0,0' }],
    newActions: ['strengthen', 'take'],
    position: {
      seed: 96002,
      tiles: [['-1,1', YOU, 2], ['0,0', THEM, 4], ['1,-1', THEM, 5]],
      hand: [[0, 8], [1, 6], [2, 3], [3, 2], [0, 4], [1, 2], [2, 5]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[3, 5], [2, 7], [2, 6], [0, 6], [0, 3], [1, 5], [0, 7], [1, 7], [3, 7], [2, 4], [1, 4], [3, 6]],
      discard: [[3, 1]],
    },
    opponent: { script: { avoid: ['0,0'] } },
    finish: { title: W.youWin, line: W.wonOnPoints, learned: 'STRONGER TILES WIN', icon: '↑' },
  },
  {
    level: 3, version: 3, locked: true, guide: 'always',
    intro: ['rock', 'gold'],
    goals: [{ t: 'gold', key: '0,0' }],
    newActions: [],
    position: {
      seed: 96003,
      rock: ['-1,0'],
      gold: ['0,0'],
      tiles: [['-1,1', YOU, 3], ['1,-1', THEM, 4]],
      hand: [[3, 5], [2, 8], [2, 6], [3, 7], [1, 7], [1, 2], [1, 4]],
      opponent: [[1, 2], [2, 2], [3, 3], [0, 2], [3, 2], [2, 3], [3, 4]],
      deck: [[1, 6], [0, 4], [0, 8], [3, 6], [2, 4], [3, 2], [0, 6], [1, 3], [0, 7], [0, 5], [2, 7], [1, 5]],
      discard: [[3, 1]],
    },
    // It heads for the gold first: if you leave it, it takes it (and the lesson shows why).
    opponent: { script: { prefer: ['0,0'] } },
    finish: { title: W.youWin, line: W.goldDecided, learned: 'GOLD COUNTS DOUBLE', icon: '◆' },
  },
  {
    level: 4, version: 3, locked: false, guide: 'always',
    intro: [],
    goals: [{ t: 'cut', key: '1,-1' }],
    newActions: ['cut'],
    position: {
      seed: 96004,
      tiles: [['-1,1', YOU, 4], ['0,0', YOU, 3], ['1,-1', THEM, 2], ['0,-1', THEM, 5], ['-1,-1', THEM, 3]],
      hand: [[0, 8], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[3, 5], [1, 7], [1, 5], [2, 6], [1, 4], [0, 6], [3, 6], [2, 4], [0, 7], [0, 3]],
      discard: [[3, 1]],
    },
    opponent: { script: {} },
    finish: { title: W.youWin, line: W.wonOnPoints, learned: 'CUT THEIR ROOT', icon: '✂' },
  },
  {
    level: 5, version: 3, locked: false, guide: 'always',
    intro: ['bloom-cards'],
    goals: [{ t: 'bloom' }],
    newActions: ['bloom'],
    position: {
      seed: 96005,
      tiles: [['-1,1', YOU, 2], ['1,-2', THEM, 9], ['1,-1', THEM, 9], ['2,-1', THEM, 9]],
      hand: [...SET3, [1, 2], [2, 6], [3, 7], [1, 8]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 4], [1, 4], [3, 5], [0, 6], [1, 5], [2, 4], [3, 6], [0, 7], [1, 7], [2, 7], [3, 8], [2, 8]],
      discard: [[3, 1]],
    },
    opponent: { script: {} },
    finish: { title: W.youWin, line: W.wonOnPoints, learned: 'BLOOM THREE AT ONCE', icon: '✿' },
  },
  {
    level: 6, version: 3, locked: false, guide: 'always',
    intro: ['surround'],
    goals: [{ t: 'strangle' }],
    newActions: ['surround'],
    position: {
      seed: 96006,
      tiles: [['-1,1', YOU, 4], ['0,0', YOU, 5]],
      hand: [[0, 1], [0, 3], [3, 9], [2, 7], [1, 9], [1, 6], [1, 8]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 6], [1, 4], [3, 5], [0, 4], [1, 5], [2, 4], [3, 6], [0, 7], [1, 7], [2, 6], [3, 7], [2, 8]],
      discard: [[3, 1]],
    },
    // It grows like any player, onto a side of its own home when that is all it has; the
    // surround then takes that tile back (owner, 2026-10-22: a level that never moves feels broken).
    opponent: { script: {} },
    finish: { title: W.youWin, line: W.wonByKo, learned: 'SURROUND THEIR HOME', icon: '◎' },
  },
  {
    level: 7, version: 3, locked: false, guide: 'always',
    intro: ['bomb'],
    goals: [{ t: 'bomb', key: '0,0' }],
    newActions: ['bomb'],
    position: {
      seed: 96007,
      tiles: [['-1,1', YOU, 3], ['0,0', THEM, 9], ['1,-1', THEM, 9]],
      hand: [[null, 0], [0, 3], [1, 4], [2, 5], [3, 6], [0, 7], [1, 8]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 4], [1, 5], [3, 5], [0, 6], [1, 6], [2, 4], [3, 7], [0, 8], [2, 7], [1, 7], [3, 8]],
      discard: [[3, 1]],
    },
    opponent: { script: {} },
    finish: { title: W.youWin, line: W.wonOnPoints, learned: 'BOMB ONE TILE', icon: '●' },
  },
  {
    level: 8, version: 3, locked: false, guide: 'always',
    intro: ['blast'],
    goals: [{ t: 'blast', key: '0,-1' }, { t: 'blastGrow' }],
    newActions: ['blast'],
    position: {
      seed: 96008,
      tiles: [
        ['-1,1', YOU, 4], ['0,0', YOU, 5],
        ['0,-1', THEM, 9], ['1,-1', THEM, 9], ['-1,0', THEM, 6], ['1,-2', THEM, 9], ['2,-1', THEM, 9],
      ],
      hand: [[null, 0], [null, 0], [0, 3], [1, 4], [2, 5], [3, 6], [0, 7]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 4], [1, 5], [3, 5], [0, 6], [1, 6], [2, 4], [3, 7], [0, 8], [2, 7], [1, 7]],
      discard: [[3, 1]],
    },
    opponent: { script: {} },
    finish: { title: W.youWin, line: W.wonOnPoints, learned: 'BLAST A HOLE', icon: '✹' },
  },
  {
    level: 9, version: 3, locked: false, guide: 'always',
    intro: ['pile-gold'],
    goals: [{ t: 'pileBloom' }],
    newActions: [],
    position: {
      seed: 96009,
      tiles: [['-1,1', YOU, 4], ['1,-2', THEM, 9], ['1,-1', THEM, 9], ['2,-1', THEM, 9]],
      hand: [[0, 3], [0, 4], [1, 2], [2, 6], [3, 7], [1, 8], [2, 9]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[3, 2], [1, 4], [3, 5], [0, 6], [1, 5], [2, 4], [3, 6], [0, 7], [1, 7], [2, 7], [3, 8], [2, 8]],
      discard: [[3, 1], [0, 5]],
    },
    opponent: { script: {} },
    finish: { title: W.youWin, line: W.wonOnPoints, learned: 'BLOOM FROM THE THROW PILE', icon: '↦' },
  },
  {
    level: 10, version: 3, locked: false, guide: 'idle',
    // The last level opens like a real game (the ritual plays from level 10 on), then says this one
    // thing before the first draw: you know the game now, go and play it (owner, 2026-10-24).
    intro: ['first-game'],
    goals: [],
    newActions: [],
    // A normal opening, the one copy the server's Seeds verifier also replays (final.ts).
    position: FINAL_LESSON.position,
    opponent: { bot: FINAL_LESSON.botLevel },
    finish: { title: W.canPlay, line: W.canPlayLine, learned: 'THE WHOLE GAME', icon: '★' },
  },
] satisfies Lesson[]);

export const lessonFor = (level: number): Lesson | null => LESSONS.find((l) => l.level === level) ?? null;
export const lessonOpening = (lesson: Lesson): State => authoredState(lesson.position);

// ---------- reading the live game ----------

const mine = (s: State): Event[] => (s.history ?? []).filter((e) => 'player' in e && e.player === YOU);

/** My turns, each as the list of my events from its draw (or deck-end start) to its throw. */
const myTurns = (s: State): Event[][] => {
  const turns: Event[][] = [];
  let cur: Event[] | null = null;
  for (const e of s.history ?? []) {
    if (!('player' in e) || e.player !== YOU) continue;
    if (!cur) { cur = []; turns.push(cur); }
    cur.push(e);
    if (e.t === 'Discard') cur = null;
  }
  return turns;
};

/**
 * Levels 1-3 lock every tap to the lit one — but only on the FIRST turn. From turn 2 the player is
 * free to choose; the light still guides by its mastery tier. A completed turn is a Discard.
 */
export const lessonLocked = (lesson: Lesson, s: State): boolean =>
  lesson.locked && myTurns(s).filter((t) => t.some((e) => e.t === 'Discard')).length === 0;

const GROWTH = new Set<Event['t']>(['Sprout', 'Strengthen', 'Overgrow', 'FruitCard']);

const keyOf = (c: Coord) => coordKey(c);

/** Has the player done this idea? Read from the game's own history, never from a counter. */
export const goalDone = (g: Goal, s: State): boolean => {
  const ev = mine(s);
  switch (g.t) {
    case 'grow': return ev.some((e) => e.t === 'Sprout');
    case 'strengthen': return ev.some((e) => e.t === 'Strengthen' && keyOf(e.coord) === g.key);
    case 'take': return ev.some((e) => e.t === 'Overgrow' && keyOf(e.coord) === g.key);
    case 'gold': return s.board[g.key]?.owner === YOU || ev.some((e) => (e.t === 'Sprout' || e.t === 'Overgrow') && keyOf(e.coord) === g.key);
    case 'cut': return ev.some((e) => e.t === 'Overgrow' && keyOf(e.coord) === g.key);
    case 'bloom': return ev.some((e) => e.t === 'Bloom');
    case 'strangle': return s.result?.reason === 'strangle' && s.result.winner === YOU;
    case 'bomb': return ev.some((e) => e.t === 'FruitCard');
    case 'blast': return ev.some((e) => e.t === 'MegaBomb');
    case 'blastGrow': {
      const turn = myTurns(s).find((t) => t.some((e) => e.t === 'MegaBomb'));
      return !!turn && turn.some((e) => GROWTH.has(e.t));
    }
    case 'pileBloom': {
      const turn = myTurns(s).find((t) => t.some((e) => e.t === 'Draw' && e.from === 'discard'));
      return !!turn && turn.some((e) => e.t === 'Bloom');
    }
  }
};

/** The first idea not yet done, or null when the lesson's ideas are all done. */
export const currentGoal = (lesson: Lesson, s: State): Goal | null =>
  lesson.goals.find((g) => !goalDone(g, s)) ?? null;

/** Could this lesson still teach its next idea from here? (Else: offer RESTART LEVEL.) */
export const goalReachable = (lesson: Lesson, s: State): boolean => {
  const g = currentGoal(lesson, s);
  if (!g || s.phase === 'GAME_OVER') return true;
  const hand = s.hands[YOU];
  switch (g.t) {
    case 'strengthen': return hand.some((c) => c.suit !== null && c.rank > (s.board[g.key]?.strength ?? 99)) && s.board[g.key]?.owner === YOU;
    case 'take': case 'cut': {
      const t = s.board[g.key];
      return !!t && t.owner === THEM && hand.some((c) => c.suit !== null && c.rank > t.strength);
    }
    case 'gold': return s.board[g.key]?.owner !== THEM || hand.some((c) => c.suit !== null && c.rank > (s.board[g.key]?.strength ?? 99));
    case 'bomb': return hand.some((c) => c.suit === null) && s.board[g.key]?.owner === THEM;
    case 'blast': return hand.filter((c) => c.suit === null).length >= 2;
    case 'bloom': return bloomCardsFor(hand).length >= 3 || s.deck.length > 0;
    case 'pileBloom': return goalDone({ t: 'bloom' }, s) || s.deck.length > 0 || s.discard.length > 0;
    default: return true;
  }
};

// ---------- the suggested move: the one thing the light points at ----------

type Sprout = Extract<Action, { t: 'Sprout' }>;

const cardOf = (s: State, id: number): Card | undefined => s.hands[YOU].find((c) => c.id === id);
const rankOf = (s: State, id: number): number => cardOf(s, id)?.rank ?? 0;

/** Cards that bloom together in hand: three of a number (any suits). */
const bloomCardsFor = (hand: readonly Card[]): Card[] => {
  for (let r = 1; r <= 9; r++) {
    const same = hand.filter((c) => c.suit !== null && c.rank === r);
    if (same.length >= 3) return same.slice(0, 3);
  }
  return [];
};

/** Taking one of their tiles is taught in level 2; before it the light never points at one. */
const takesTaught = (lesson: Pick<Lesson, 'level'>): boolean => lesson.level >= 2;

/**
 * The plain Grow a careful beginner makes: gold first, then one of their tiles it can take (a
 * two-point swing, and the opponent grows every turn — owner, 2026-10-22), then forward, with the
 * lowest card that does it. `takes` is false before the lesson that teaches taking a tile (level 2):
 * the light never suggests a move the player has not been shown.
 */
const plainGrow = (s: State, legal: readonly Action[], takes = true): Sprout | null => {
  const theirs = homeCoord(THEM, s.config);
  const sprouts = legal.filter((a): a is Sprout => a.t === 'Sprout'
    && (takes ? s.board[coordKey(a.coord)]?.owner !== YOU : !s.board[coordKey(a.coord)]));
  if (!sprouts.length) return null;
  const gold = (a: Sprout) => (s.terrain[coordKey(a.coord)] === 'rich' ? 0 : 1);
  const take = (a: Sprout) => (s.board[coordKey(a.coord)]?.owner === THEM ? 0 : 1);
  return [...sprouts].sort((a, b) =>
    gold(a) - gold(b)
    || take(a) - take(b)
    || hexDistance(a.coord, theirs) - hexDistance(b.coord, theirs)
    || rankOf(s, b.card) - rankOf(s, a.card)
    || coordKey(a.coord).localeCompare(coordKey(b.coord)))[0]!;
};

/** A Grow onto `key`, with the lowest card that does it (or the named rank, or the strongest). */
const growOnto = (s: State, legal: readonly Action[], key: string, rank?: number, pick: 'lowest' | 'strongest' = 'lowest'): Sprout | null =>
  [...legal.filter((a): a is Sprout => a.t === 'Sprout' && coordKey(a.coord) === key)]
    .filter((a) => rank === undefined || rankOf(s, a.card) === rank)
    .sort((a, b) => (pick === 'strongest' ? rankOf(s, b.card) - rankOf(s, a.card) : rankOf(s, a.card) - rankOf(s, b.card)) || a.card - b.card)[0] ?? null;

/** The Bloom that grows forward: three tiles toward their home, deterministic. */
const bestBloom = (s: State, legal: readonly Action[], allowKo = false): Extract<Action, { t: 'Bloom' }> | null => {
  const theirs = homeCoord(THEM, s.config);
  const blooms = legal.filter((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom' && a.cards.length === 3);
  const reach = (a: Extract<Action, { t: 'Bloom' }>) => Math.min(...a.hexes.map((h) => hexDistance(h, theirs)));
  const strangles = (a: Action) => { try { return isStrangled(apply(s, a), THEM); } catch { return false; } };
  return [...blooms].filter((a) => allowKo || !strangles(a)).sort((a, b) =>
    reach(a) - reach(b)
    || a.hexes.map(keyOf).join('|').localeCompare(b.hexes.map(keyOf).join('|'))
    || a.cards.join(',').localeCompare(b.cards.join(',')))[0] ?? null;
};

/** The Blast that removes the most enemy tiles (deterministic tie-break by target key). */
const bestBlast = (s: State, legal: readonly Action[]): Extract<Action, { t: 'MegaBomb' }> | null => {
  const blasts = legal.filter((a): a is Extract<Action, { t: 'MegaBomb' }> => a.t === 'MegaBomb');
  const removes = (a: Extract<Action, { t: 'MegaBomb' }>) => {
    try {
      const n = apply(s, a);
      let count = 0;
      for (const [k, t] of Object.entries(s.board)) {
        if (t && t.owner === THEM && !t.root && !n.board[k]) count++;
      }
      return count;
    } catch { return 0; }
  };
  return [...blasts].sort((a, b) => removes(b) - removes(a) || keyOf(a.target).localeCompare(keyOf(b.target)))[0] ?? null;
};

/** The Bomb on the strongest enemy tile it can take (lowest card on ties). */
const bestBomb = (s: State, legal: readonly Action[]): Extract<Action, { t: 'PlayFruit' }> | null => {
  const bombs = legal.filter((a): a is Extract<Action, { t: 'PlayFruit' }> => a.t === 'PlayFruit');
  return [...bombs].sort((a, b) =>
    (s.board[keyOf(b.target)]?.strength ?? 0) - (s.board[keyOf(a.target)]?.strength ?? 0)
    || keyOf(a.target).localeCompare(keyOf(b.target))
    || a.card - b.card)[0] ?? null;
};

/**
 * A legal extra power, strongest first. When the lesson's goal is done the light must never fall
 * through to » while one of these is playable: it either gives the one-time hello or stays quiet.
 */
const bestPower = (s: State, legal: readonly Action[], allowKo: boolean): Action | null => {
  const blast = bestBlast(s, legal);
  if (blast) return blast;
  const bloom = bestBloom(s, legal, allowKo);
  if (bloom) return bloom;
  return bestBomb(s, legal);
};

const strangleMove = (s: State, legal: readonly Action[]): Action | null =>
  legal.find((a) => {
    if (a.t !== 'Sprout' && a.t !== 'Bloom') return false;
    try { const n = apply(s, a); return n.result?.reason === 'strangle' && n.result.winner === YOU; } catch { return false; }
  }) ?? null;

/** Toward the strangle: a Grow onto a side of their home, else forward. */
const surroundStep = (s: State, legal: readonly Action[]): Action | null => {
  const around = new Set(neighbors(homeCoord(THEM, s.config), s.config.boardRadius).map(keyOf));
  const onSide = legal.filter((a): a is Sprout => a.t === 'Sprout' && around.has(keyOf(a.coord)) && s.board[keyOf(a.coord)]?.owner !== YOU)
    .sort((a, b) => keyOf(a.coord).localeCompare(keyOf(b.coord)) || rankOf(s, a.card) - rankOf(s, b.card))[0];
  return onSide ?? plainGrow(s, legal);  // the surround lesson (6) comes after taking is taught
};

/** The throw: the lowest card that no remaining idea needs (Bombs and Bloom cards are kept). */
const bestThrow = (s: State, legal: readonly Action[], keep: ReadonlySet<number>): Action | null => {
  const throws = legal.filter((a): a is Extract<Action, { t: 'Discard' }> => a.t === 'Discard');
  const card = (a: Extract<Action, { t: 'Discard' }>) => cardOf(s, a.card)!;
  return [...throws].sort((a, b) =>
    Number(keep.has(a.card)) - Number(keep.has(b.card))
    || Number(card(a).suit === null) - Number(card(b).suit === null)
    || card(a).rank - card(b).rank
    || a.card - b.card)[0] ?? null;
};

/** Cards the next ideas still need, so the light never says to throw them. */
const keepFor = (lesson: Lesson, s: State): Set<number> => {
  const keep = new Set<number>();
  const g = currentGoal(lesson, s);
  const hand = s.hands[YOU];
  if (!g) return keep;
  if (g.t === 'bomb' || g.t === 'blast') hand.filter((c) => c.suit === null).forEach((c) => keep.add(c.id));
  if (g.t === 'bloom') bloomCardsFor(hand).forEach((c) => keep.add(c.id));
  if (g.t === 'pileBloom') hand.filter((c) => c.suit === 0 && (c.rank === 3 || c.rank === 4)).forEach((c) => keep.add(c.id));
  if (g.t === 'strengthen' || g.t === 'take' || g.t === 'cut') {
    const top = [...hand].filter((c) => c.suit !== null).sort((a, b) => b.rank - a.rank)[0];
    if (top) keep.add(top.id);
  }
  return keep;
};

/** Would taking the Throw pile's top card make a Bloom possible this turn? */
export const pileCompletesBloom = (s: State): boolean => {
  const top = s.discard.at(-1);
  if (!top || top.suit === null || s.phase !== 'DRAW' || s.actor !== YOU) return false;
  try {
    const after = apply(s, { t: 'Draw', from: 'discard' });
    return legalActions(viewFor(after, YOU)).some((a) => a.t === 'Bloom' && a.cards.includes(top.id));
  } catch {
    return false;
  }
};

/**
 * The one move the light points at, or null on their turn / when the game is over. Always a legal
 * move of the current position.
 */
/**
 * The game's own rule for a tapped card (main.ts `bloomKindsForCard`): a card that shares a face with
 * a legal Bloom opens that Bloom instead of a single Grow. A lit single Grow must not use one, or the
 * tap the light asks for would do something else.
 */
export const opensBloom = (s: State, legal: readonly Action[], card: number): boolean => {
  const hand = s.hands[YOU];
  const c = hand.find((x) => x.id === card);
  if (!c || c.suit === null) return false;
  return legal.some((a) => a.t === 'Bloom'
    && a.cards.some((id) => { const o = hand.find((x) => x.id === id); return !!o && o.suit === c.suit && o.rank === c.rank; }));
};

/** The same Grow (same hex) with a card that taps as a Grow, else the best plain Grow that does. */
const asTappableGrow = (s: State, legal: readonly Action[], a: Action | null, notKo: (x: Action | null) => Action | null, takes: boolean): Action | null => {
  if (!a || a.t !== 'Sprout' || !opensBloom(s, legal, a.card)) return a;
  const plain = legal.filter((x): x is Sprout => x.t === 'Sprout' && !opensBloom(s, legal, x.card));
  const sameHex = plain.filter((x) => keyOf(x.coord) === keyOf(a.coord))
    .sort((x, y) => rankOf(s, y.card) - rankOf(s, x.card) || x.card - y.card)[0];
  // A Strengthen keeps its number when it can (the lesson names a card); otherwise any plain card.
  return sameHex ?? notKo(plainGrow(s, plain.filter((x) => notKo(x) !== null), takes)) ?? a;
};

// Your legal moves in a position, worked out once (read-only: nothing here changes the list).
const legalCache = new WeakMap<State, readonly Action[]>();
const engineLegal = (s: State): readonly Action[] => {
  let legal = legalCache.get(s);
  if (!legal) legalCache.set(s, legal = legalActions(viewFor(s, YOU)));
  return legal;
};

/**
 * A power is not offered before the lesson that teaches it (owner, 2026-10-22: "make it impossible
 * to have bloom in hand before the bloom lesson — things shouldn't confuse a first-time player").
 * The cards stay the engine's; the lesson simply never offers the move, so its button, its glow and
 * its hints never appear. Every move it does offer is still a legal engine move.
 */
export const lessonAllows = (lesson: Pick<Lesson, 'level'>, a: Action): boolean =>
  a.t === 'Bloom' ? lesson.level >= POWER_TAUGHT_AT.bloom
  : a.t === 'PlayFruit' ? lesson.level >= POWER_TAUGHT_AT.bomb
  : a.t === 'MegaBomb' ? lesson.level >= POWER_TAUGHT_AT.blast
  : true;

/** Is a Bloom part of this lesson's game yet? (The UI asks before it shows any Bloom hint.) */
export const lessonOffersBloom = (lesson: Pick<Lesson, 'level'>): boolean => lesson.level >= POWER_TAUGHT_AT.bloom;

const allowedCache = new WeakMap<State, Map<number, readonly Action[]>>();
/** Your legal moves in this lesson: the engine's, less any power the lesson has not taught yet. */
export const lessonLegal = (lesson: Pick<Lesson, 'level'>, s: State): readonly Action[] => {
  let byLevel = allowedCache.get(s);
  if (!byLevel) allowedCache.set(s, byLevel = new Map());
  let legal = byLevel.get(lesson.level);
  if (!legal) byLevel.set(lesson.level, legal = engineLegal(s).filter((a) => lessonAllows(lesson, a)));
  return legal;
};

// States are immutable engine values, so a position's suggestion never changes: the screen asks
// several times per tap (the window, the lit card, the answer), and each answer searches moves.
const suggested = new WeakMap<State, Map<Lesson, Action | null>>();

export const suggestMove = (lesson: Lesson, s: State): Action | null => {
  let byLesson = suggested.get(s);
  if (!byLesson) suggested.set(s, byLesson = new Map());
  if (byLesson.has(lesson)) return byLesson.get(lesson)!;
  const a = suggestFresh(lesson, s);
  byLesson.set(lesson, a);
  return a;
};

const suggestFresh = (lesson: Lesson, s: State): Action | null => {
  const legal = s.phase === 'ACT' && s.actor === YOU ? lessonLegal(lesson, s) : [];
  const a = suggestRaw(lesson, s);
  if (!a || a.t !== 'Sprout') return a;
  const koAllowed = currentGoal(lesson, s)?.t === 'strangle' || lesson.level === 10;
  const notKo = (x: Action | null): Action | null => {
    if (!x || koAllowed) return x;
    try { return isStrangled(apply(s, x), THEM) ? null : x; } catch { return null; }
  };
  return asTappableGrow(s, legal, a, notKo, takesTaught(lesson));
};

const suggestRaw = (lesson: Lesson, s: State): Action | null => {
  if (s.phase === 'GAME_OVER' || s.actor !== YOU) return null;
  const legal = lessonLegal(lesson, s);
  if (!legal.length) return null;
  const goal = currentGoal(lesson, s);
  if (s.phase === 'DRAW') {
    if (goal?.t === 'pileBloom' && pileCompletesBloom(s)) return legal.find((a) => a.t === 'Draw' && a.from === 'discard') ?? legal[0]!;
    return legal.find((a) => a.t === 'Draw' && a.from === 'deck') ?? legal.find((a) => a.t === 'Draw') ?? legal[0]!;
  }
  if (s.phase === 'DISCARD') return bestThrow(s, legal, keepFor(lesson, s)) ?? legal[0]!;
  if (s.phase !== 'ACT') return legal[0]!;
  const grew = (s.sproutsThisTurn ?? 0) > 0;
  const end = legal.find((a) => a.t === 'EndAct') ?? null;
  const pick = (a: Action | null | undefined): Action | null => a ?? null;
  // A KO is the lesson only on level 6, and part of the game on level 10. Elsewhere the light never
  // points at a move that ends the game by surround: the lesson ends on points, as most games do.
  const koAllowed = goal?.t === 'strangle' || lesson.level === 10;
  const win = koAllowed ? strangleMove(s, legal) : null;
  const notKo = (a: Action | null): Action | null => {
    if (!a || koAllowed) return a;
    try { return isStrangled(apply(s, a), THEM) ? null : a; } catch { return null; }
  };
  if (goal) {
    switch (goal.t) {
      // Without the lesson's own card, the strongest one: a strengthen with a 3 teaches nothing
      // (owner, 2026-10-24: "it wasn't a strong card at all").
      case 'strengthen': if (!grew) { const m = growOnto(s, legal, goal.key, goal.card) ?? growOnto(s, legal, goal.key, undefined, 'strongest'); if (m) return m; } break;
      case 'take': case 'cut': case 'gold': if (!grew) { const m = growOnto(s, legal, goal.key); if (m) return m; } break;
      case 'bloom': { const m = bestBloom(s, legal); if (m) return m; break; }
      case 'pileBloom': { const m = bestBloom(s, legal); if (m && s.drawnFromDiscard !== null) return m; break; }
      case 'strangle': { const m = win ?? (!grew ? surroundStep(s, legal) : null); if (m) return m; break; }
      case 'bomb': if (!grew) { const m = legal.find((a) => a.t === 'PlayFruit' && keyOf(a.target) === goal.key); if (m) return m; } break;
      case 'blast': { const m = legal.find((a) => a.t === 'MegaBomb' && keyOf(a.target) === goal.key) ?? legal.find((a) => a.t === 'MegaBomb'); if (m) return m; break; }
      case 'blastGrow': if (!grew) { const m = plainGrow(s, legal, takesTaught(lesson)); if (m) return m; } break;
      case 'grow': break;
    }
  }
  if (win) return win;
  // Never steer past a power: » is not the suggestion while a Bloom, Bomb or Blast is legal; the
  // light points at the strongest power instead (or the beat goes quiet once its one-time hello
  // has been shown — see lessonBeat).
  {
    const power = bestPower(s, legal, false);
    if (power) return power;
  }
  if (!grew) {
    const g = notKo(plainGrow(s, legal.filter((a) => notKo(a) !== null), takesTaught(lesson)));
    if (g) return g;
  }
  // Level 10 is a real game: the light never nudges toward ending the turn.
  if (lesson.level === 10) return null;
  return pick(end) ?? legal[0]!;
};

// ---------- what the window says, and what is lit ----------

/** The one glowing thing. Quiet alternatives (other legal places) may glow faintly beside it. */
export type Lit =
  | { t: 'none' }
  | { t: 'home'; player: 0 | 1 }
  | { t: 'hex'; key: string; quiet?: readonly string[] }
  | { t: 'hexes'; keys: readonly string[] }
  | { t: 'card'; id: number; quiet?: readonly number[] }
  | { t: 'cards'; ids: readonly number[] }
  | { t: 'deck' }
  | { t: 'discard' }
  | { t: 'end' }
  | { t: 'bloom' }
  | { t: 'rock'; key: string }
  | { t: 'led' }
  /** The cockpit's score display (taught once, level 1). */
  | { t: 'score' }
  /** The Draw pile together with its count (taught once, level 1). */
  | { t: 'deckCount' }
  /** The Undo key (taught once, level 9). */
  | { t: 'undo' };

export type Beat = {
  /** Stable id (an explanation is shown once; seen ids are kept with the lesson's save). */
  id: string;
  /**
   * THE DISPLAY (the cockpit's LED): what to do now, as a short action line — never a lone word.
   * Only action, status and warning beats carry this.
   */
  say?: string;
  /**
   * THE INFO BOX (#lesson-plate): one explanation, as a full sentence. Explanations are shown once
   * per lesson and are never faded; the box never carries an action label or a button.
   */
  line?: string;
  lit: Lit;
  /** An explanation: a tap anywhere (or on the lit thing) moves on. */
  explain?: boolean;
  /** Their turn (a status, not an instruction): shown while the opponent plays, never faded. */
  status?: boolean;
  /** Show only after a few idle seconds (the late levels' quiet guide). */
  idleOnly?: boolean;
  /** The action this step teaches, so the UI can fade its light by the player's mastery. */
  kind?: ActionKind;
  /** A power's one-time hello: remembered on this device, never shown twice. */
  hello?: PowerKind;
};

/** What the UI knows beyond the game state: what is picked, and which explanations were seen. */
export type BeatCtx = {
  /** The card picked in hand (or null). */
  card: number | null;
  /** A Bloom / Blast is being placed (its tiles are the next touch). */
  placing: 'bloom' | 'blast' | null;
  /** A throw is waiting for its second tap (the card id). */
  throwPending: number | null;
  seen: ReadonlySet<string>;
  /** Bloom / Bomb / Blast hellos already shown on this device. */
  powerSeen?: ReadonlySet<PowerKind>;
};

const GOAL_POWER: Readonly<Record<string, PowerKind | undefined>> = Object.freeze({
  bloom: 'bloom', pileBloom: 'bloom', bomb: 'bomb', blast: 'blast', blastGrow: 'blast',
});

const legalPowers = (legal: readonly Action[]): PowerKind[] => {
  const out: PowerKind[] = [];
  if (legal.some((a) => a.t === 'Bloom')) out.push('bloom');
  if (legal.some((a) => a.t === 'PlayFruit')) out.push('bomb');
  if (legal.some((a) => a.t === 'MegaBomb')) out.push('blast');
  return out;
};

/** The cards to glow for a power's hello (a card in the fan, never the map). */
const powerCards = (s: State, legal: readonly Action[], power: PowerKind): number[] => {
  if (power === 'bloom') {
    const bloom = bestBloom(s, legal, true);
    return bloom ? [...bloom.cards] : [];
  }
  if (power === 'bomb') {
    const bomb = legal.find((a) => a.t === 'PlayFruit');
    return bomb && bomb.t === 'PlayFruit' ? [bomb.card] : [];
  }
  const blast = legal.find((a) => a.t === 'MegaBomb');
  return blast && blast.t === 'MegaBomb' ? [...blast.cards] : [];
};

/**
 * The first time a power is legal AFTER its lesson, glow its card(s) and say what to do with it —
 * once ever. It is skipped in the power's own lesson (that lesson is already teaching it) and while
 * the lesson's goal is still open. Once a hello has been seen the state is silent, never nagging.
 */
const helloBeat = (lesson: Lesson, s: State, ctx: BeatCtx, goal: Goal | null, legal: readonly Action[]): Beat | null => {
  if (goal) return null;
  // The hello is a notification; once the player has picked a card or started placing, the normal
  // step takes over so the lit tiles can be tapped.
  if (ctx.card !== null || ctx.placing !== null) return null;
  const taughtHere = new Set(lesson.goals.map((g) => GOAL_POWER[g.t]).filter((p): p is PowerKind => !!p));
  const legalNow = legalPowers(legal);
  for (const power of ['blast', 'bomb', 'bloom'] as const) {
    if (!legalNow.includes(power)) continue;
    if (lesson.level <= POWER_TAUGHT_AT[power]) continue;
    if (taughtHere.has(power)) continue;
    if (ctx.powerSeen?.has(power)) continue;
    const ids = powerCards(s, legal, power);
    if (!ids.length) continue;
    const say = power === 'bloom' ? W.bloomHello : power === 'bomb' ? W.bombHello : W.tapBlast;
    return { id: `hello:${power}`, say, lit: { t: 'cards', ids }, kind: power, hello: power };
  }
  return null;
};

/** An explanation: one sentence in the info box, dismissed by a tap anywhere (never faded). */
const explain = (id: string, line: string, lit: Lit): Beat => ({ id, line, lit, explain: true });

/** The intros that explain a MOVE: shown after the draw, the first time that move can be played. */
const ACT_INTROS: ReadonlySet<IntroKind> = new Set<IntroKind>(['gold', 'bloom-cards', 'surround', 'bomb', 'blast']);

/** The explanation for one intro, or null while it has nothing to point at yet. */
const introFor = (s: State, which: IntroKind, id: string, legal: readonly Action[]): Beat | null => {
  switch (which) {
    // Level 1's opening: while the box is read, the display scrolls a welcome, not an action.
    case 'tree': return { ...explain(id, W.yourHomeLine, { t: 'home', player: YOU }), say: W.welcome };
    case 'their-home': return { ...explain(id, W.theirHomeLine, { t: 'home', player: THEM }), say: W.welcome };
    case 'first-draw': return { ...explain(id, W.tapDrawLine, { t: 'deck' }), say: W.welcome };
    case 'rock': {
      const rock = Object.keys(s.terrain).find((k) => s.terrain[k] === 'rock');
      return rock ? explain(id, W.rocksBlockLine, { t: 'rock', key: rock }) : null;
    }
    case 'pile-gold': return explain(id, W.pileGoldLine, { t: 'discard' });
    // Level 10's send-off: no target, no action word — the box speaks and a tap anywhere starts play.
    case 'first-game': return explain(id, W.firstGameLine, { t: 'none' });
    case 'gold': {
      const gold = Object.keys(s.terrain).find((k) => s.terrain[k] === 'rich' && legal.some((a) => a.t === 'Sprout' && keyOf(a.coord) === k));
      return gold ? explain(id, W.goldDoubleLine, { t: 'hex', key: gold }) : null;
    }
    case 'bloom-cards': {
      const bloom = bestBloom(s, legal, true);
      return bloom ? explain(id, W.cardsThatBloomLine, { t: 'cards', ids: [...bloom.cards] }) : null;
    }
    case 'surround': {
      const around = new Set(neighbors(homeCoord(THEM, s.config), s.config.boardRadius).map(keyOf));
      return legal.some((a) => a.t === 'Sprout' && around.has(keyOf(a.coord)))
        ? explain(id, W.surroundLine, { t: 'home', player: THEM }) : null;
    }
    case 'bomb': {
      const bomb = legal.find((a) => a.t === 'PlayFruit');
      return bomb && bomb.t === 'PlayFruit' ? explain(id, W.bombLine, { t: 'card', id: bomb.card }) : null;
    }
    case 'blast': {
      const blast = legal.find((a) => a.t === 'MegaBomb');
      return blast && blast.t === 'MegaBomb' ? explain(id, W.blastLine, { t: 'cards', ids: [...blast.cards] }) : null;
    }
  }
};

/**
 * What the display says before the lesson's first sentence is on screen (the stage intro and the
 * opening deal): level 1 welcomes from its very first frame, never a step word (owner, 2026-10-22:
 * "the first second it still says DRAW"). Null: the display keeps its own calm face.
 */
export const openingDisplay = (lesson: Lesson, s: State, seen: ReadonlySet<string>): string | null =>
  lesson.level === 1 && s.phase === 'DRAW' && myTurns(s).length === 0
    && lesson.intro.some((which) => (which === 'tree' || which === 'their-home' || which === 'first-draw') && !seen.has(`${lesson.level}:intro:${which}`))
    ? W.welcome : null;

const introBeat = (lesson: Lesson, s: State, ctx: BeatCtx): Beat | null => {
  const beforeFirstDraw = s.phase === 'DRAW' && myTurns(s).length === 0;
  // A move's explanation waits for the draw and for a free hand: nothing picked, nothing placing.
  const canExplainMove = s.phase === 'ACT' && ctx.card === null && ctx.placing === null && !!currentGoal(lesson, s);
  if (!beforeFirstDraw && !canExplainMove) return null;
  const legal = canExplainMove ? lessonLegal(lesson, s) : [];
  for (const which of lesson.intro) {
    const id = `${lesson.level}:intro:${which}`;
    if (ctx.seen.has(id)) continue;
    if (ACT_INTROS.has(which) !== canExplainMove) continue;
    const beat = introFor(s, which, id, legal);
    if (beat) return beat;
  }
  return null;
};

/** Explanations that follow a moment: they appear once, right after it happens. */
const momentBeat = (lesson: Lesson, s: State, seen: ReadonlySet<string>): Beat | null => {
  if (s.actor !== YOU || s.phase === 'GAME_OVER') return null;
  const once = (id: string) => !seen.has(`${lesson.level}:${id}`);
  const ev = mine(s);
  // "Tiles keep the rank of the card used" is about the NUMBER ON THE TILE that was just placed,
  // so the light goes to that hex — not to the display (owner, 2026-10-20: it lit the score
  // display and pointed the arrow at it, which taught the wrong thing). The newest Sprout in the
  // history is the tile just placed; the words are unchanged, and the score keeps its own face.
  if (lesson.level === 1 && once('grew')) {
    const grew = [...ev].reverse().find((e): e is Extract<Event, { t: 'Sprout' }> => e.t === 'Sprout');
    if (grew) return explain(`${lesson.level}:grew`, W.youGrewLine, { t: 'hex', key: coordKey(grew.coord) });
  }
  if (lesson.level === 4 && goalDone({ t: 'cut', key: '1,-1' }, s) && once('withered'))
    return explain(`${lesson.level}:withered`, W.witheredLine, { t: 'led' });
  if (lesson.level === 5 && goalDone({ t: 'bloom' }, s) && once('bloomed'))
    return explain(`${lesson.level}:bloomed`, W.bloomedLine, { t: 'led' });
  // Right after the Bloom from the Throw pile: neither the Bloom nor the Grow is ever required, and
  // » keeps the cards. Said once, pointing at »; the light then carries on as usual (owner,
  // 2026-10-20: taught here, never forced).
  // (» is lit only when no power is playable: the light never points at » past a power.)
  if (lesson.level === 9 && s.phase === 'ACT' && goalDone({ t: 'pileBloom' }, s) && once('optional'))
    return explain(`${lesson.level}:optional`, W.optionalLine,
      legalPowers(lessonLegal(lesson, s)).length ? { t: 'none' } : { t: 'end' });
  // Straight after the skip: everything since the draw can still be taken back, until the Throw
  // (owner, 2026-10-22). The Undo key is lit.
  if (lesson.level === 9 && s.phase === 'ACT' && goalDone({ t: 'pileBloom' }, s) && !once('optional') && once('undo'))
    return explain(`${lesson.level}:undo`, W.undoLine, { t: 'undo' });
  // The clock: the Draw pile is nearly gone. The warning belongs on the display, not in the box.
  if (lesson.level === 1 && s.phase === 'DRAW' && s.deck.length > 0 && s.deck.length <= 3 && once('pile-low'))
    return { id: `${lesson.level}:pile-low`, say: W.lastCards, lit: { t: 'deckCount' }, explain: true };
  if (s.deckFinal && s.phase === 'ACT' && (s.sproutsThisTurn ?? 0) === 0 && once(`last-turn`))
    return { id: `${lesson.level}:last-turn`, say: W.lastTurn, line: W.lastTurnLine, lit: { t: 'led' }, explain: true };
  return null;
};

/**
 * The one-time explanations that belong to an idea as it is about to be used (the Grow and Throw
 * sentences, a stronger card, a cut, the free Grow after a Blast, skipping). They are a separate
 * beat from the action, so the box is an explanation and the display is the action — never both
 * saying the same thing. Shown once per lesson, never faded.
 */
const ideaBeat = (
  lesson: Lesson, s: State, ctx: BeatCtx, goal: Goal | null, move: Action,
): Beat | null => {
  // An explanation comes directly before its move, every time: a card already picked does not skip
  // it when that card is the one the move uses (owner, 2026-10-22: the cut sentence was lost when
  // the player picked the card first).
  const pickedOther = ctx.card !== null && !('card' in move && move.card === ctx.card);
  if (pickedOther || ctx.placing !== null || ctx.throwPending !== null) return null;
  const once = (id: string) => !ctx.seen.has(`${lesson.level}:idea:${id}`);
  if (lesson.level === 1 && s.phase === 'ACT' && once('first-grow')
    && !mine(s).some((e) => e.t === 'Sprout') && move.t === 'Sprout')
    return explain(`${lesson.level}:idea:first-grow`, W.growLine, { t: 'card', id: move.card });
  if (lesson.level === 1 && s.phase === 'DISCARD' && once('first-throw') && move.t === 'Discard')
    return explain(`${lesson.level}:idea:first-throw`, W.throwLine, { t: 'card', id: move.card });
  // The lesson's own idea is explained every turn its move is lit, never left as a bare light: a
  // turn that passes without it brings the sentence back with the light (owner, 2026-10-24: "a 3
  // card twice in a row… no lesson attached to it"). One id per turn: `2:idea:strengthen`, then
  // `2:idea:strengthen@2` on the second turn, and so on.
  const turn = myTurns(s).length;
  const each = (idea: string) => `${idea}${turn > 1 ? `@${turn}` : ''}`;
  if (lesson.level === 2 && goal?.t === 'strengthen' && once(each('strengthen')) && move.t === 'Sprout')
    return explain(`${lesson.level}:idea:${each('strengthen')}`, W.biggerWinsLine, { t: 'card', id: move.card });
  // A take or a cut is explained the turn it can be played, right before the tap (owner,
  // 2026-10-22: level 2's cut sentence came straight after the strengthen, a turn too early).
  const playsGoal = s.phase === 'ACT' && move.t === 'Sprout' && !!goal && 'key' in goal && keyOf(move.coord) === goal.key;
  if (lesson.level === 2 && goal?.t === 'take' && playsGoal && once(each('take')))
    return explain(`${lesson.level}:idea:${each('take')}`, W.takeTileLine, { t: 'hex', key: goal.key });
  if (lesson.level === 4 && goal?.t === 'cut' && playsGoal && once(each('cut')))
    return explain(`${lesson.level}:idea:${each('cut')}`, W.cutLinkLine, { t: 'hex', key: goal.key });
  if (lesson.level === 8 && goal?.t === 'blastGrow' && once('free-grow') && move.t === 'Sprout')
    return explain(`${lesson.level}:idea:free-grow`, W.freeGrowLine, { t: 'card', id: move.card });
  return null;
};

const kindForMove = (goal: Goal | null, move: Action): ActionKind | null => {
  switch (move.t) {
    case 'Draw': return 'draw';
    case 'Discard': return 'throw';
    case 'Bloom': return 'bloom';
    case 'PlayFruit': return 'bomb';
    case 'MegaBomb': return 'blast';
    case 'Sprout':
      return goal?.t === 'strengthen' ? 'strengthen'
        : goal?.t === 'take' ? 'take'
        : goal?.t === 'cut' ? 'cut'
        : goal?.t === 'strangle' ? 'surround'
        : 'grow';
    case 'EndAct': return 'throw';
    default: return null;
  }
};

/** Is this move the lesson's own step (the idea it teaches), rather than an ordinary suggestion? */
const servesGoal = (goal: Goal | null, move: Action): boolean => {
  if (!goal) return false;
  switch (goal.t) {
    case 'grow': return move.t === 'Sprout';
    case 'strengthen': case 'take': case 'cut': case 'gold':
      return move.t === 'Sprout' && keyOf(move.coord) === goal.key;
    case 'bloom': return move.t === 'Bloom';
    case 'pileBloom': return move.t === 'Bloom' || (move.t === 'Draw' && move.from === 'discard');
    case 'strangle': return move.t === 'Sprout';
    case 'bomb': return move.t === 'PlayFruit';
    case 'blast': return move.t === 'MegaBomb';
    case 'blastGrow': return move.t === 'MegaBomb' || move.t === 'Sprout';
  }
};

/** The action beat: the display says what to do. No explanation lives here (the box is separate). */
const lightFor = (lesson: Lesson, s: State, ctx: BeatCtx, move: Action, legal: readonly Action[]): Beat => {
  const goal = currentGoal(lesson, s);
  // The lesson's own step is lit at once; every other suggestion waits for a few idle seconds
  // (owner, 2026-10-24: "cards suggested should be after a few seconds of idle… and be actually a
  // good move"). Level 1 teaches the whole turn, so every step there is its own. Level 10 waits
  // for a quiet moment on every hint.
  const idleOnly = lesson.guide === 'idle' || (lesson.level !== 1 && !servesGoal(goal, move));
  const kind = kindForMove(goal, move);
  const beat = (id: string, say: string, lit: Lit): Beat => ({
    id, say, lit, ...(idleOnly ? { idleOnly } : {}), ...(kind ? { kind } : {}),
  });
  switch (move.t) {
    case 'Draw':
      if (move.from === 'discard') return beat('pile', W.tapThrowPile, { t: 'discard' });
      return beat('draw', W.tapDraw, { t: 'deck' });
    case 'Sprout': {
      const key = keyOf(move.coord);
      if (ctx.card !== move.card) return beat(`pick:${move.card}`, W.chooseCard, { t: 'card', id: move.card });
      const others = legal.filter((a): a is Sprout => a.t === 'Sprout' && a.card === move.card).map((a) => keyOf(a.coord)).filter((k) => k !== key);
      if (goal?.t === 'strangle' && strangleMove(s, legal)) return beat('can-win', W.tapLastSide, { t: 'hex', key });
      // Their tile (a lesson's cut, or the light taking one of theirs) is named as theirs.
      const say = goal?.t === 'take' || goal?.t === 'cut' || s.board[key]?.owner === THEM ? W.tapTheirTile : W.tapTile;
      return beat(`tile:${key}`, say, { t: 'hex', key, ...(goal ? {} : { quiet: others }) });
    }
    case 'Bloom': {
      // Two steps: tap Bloom to pick it, then tap (or draw) its lit tiles.
      if (ctx.placing === 'bloom') return beat('bloom-tiles', W.tapTiles, { t: 'hexes', keys: move.hexes.map(keyOf) });
      return beat('bloom', W.tapBloom, { t: 'bloom' });
    }
    case 'PlayFruit':
      if (ctx.card !== move.card) return beat('bomb-card', W.chooseBomb, { t: 'card', id: move.card });
      return beat('bomb-tile', W.bombTile, { t: 'hex', key: keyOf(move.target) });
    case 'MegaBomb':
      if (ctx.placing === 'blast') return beat('blast-tile', W.tapTile, { t: 'hex', key: keyOf(move.target) });
      return beat('blast', W.tapBlast, { t: 'bloom' });
    case 'EndAct':
      return beat('end', W.tapThrow, { t: 'end' });
    case 'Discard':
      if (ctx.throwPending === move.card) return beat('throw-pile', W.tapThrowPile, { t: 'discard' });
      return beat(`throw:${move.card}`, W.throwCard, { t: 'card', id: move.card });
    default:
      return beat('wait', W.notYet, { t: 'none' });
  }
};

/**
 * What the display says, what the box explains, and what is lit — read from the live game.
 * Null when there is nothing to show (the game is over).
 */
export const lessonBeat = (lesson: Lesson, s: State, ctx: BeatCtx): Beat | null => {
  if (s.phase === 'GAME_OVER') return null;
  if (s.actor !== YOU) {
    const first = myTurns(s).length <= 1 && lesson.guide === 'always';
    return {
      id: 'their-turn', say: W.theirTurn, status: true,
      ...(first ? { line: W.theirTurnLine } : {}), lit: { t: 'none' },
      ...(lesson.guide === 'idle' ? { idleOnly: true } : {}),
    };
  }
  const intro = introBeat(lesson, s, ctx);
  if (intro) return intro;
  const moment = momentBeat(lesson, s, ctx.seen);
  if (moment) return moment;
  const legal = lessonLegal(lesson, s);
  const goal = currentGoal(lesson, s);
  const hello = helloBeat(lesson, s, ctx, goal, legal);
  if (hello) return hello;
  // The goal is done and a power is still playable: its one-time hello has been shown (or was not
  // due here), so the light stays quiet. It never falls through to » and never nudges repeatedly.
  if (!goal && legalPowers(legal).length && ctx.card === null && ctx.placing === null) return null;
  const move = suggestMove(lesson, s);
  if (!move) return null;
  const idea = ideaBeat(lesson, s, ctx, goal, move);
  if (idea) return idea;
  return lightFor(lesson, s, ctx, move, legal);
};

/**
 * The same beat, faded to the tier the player has earned. Explanations, a status line and a power's
 * one-time hello are never faded (they are exactly the moment being taught); an ordinary move is:
 *   spotlight — the action, full light
 *   guide     — the action, soft pointer and glow
 *   whisper   — the action instruction, a gentle pulse on the target (never a single word)
 *   silent    — nothing, the calm neutral display
 */
export const presentedLessonBeat = (beat: Beat | null, tier: LessonTier): Beat | null => {
  if (!beat) return null;
  if (beat.explain || beat.hello || beat.status) return beat;
  if (tier === 'silent') return null;
  return beat;
};

/** Unused-for-now helper kept beside the board reader: the key of a coordinate string. */
export const normKey = (k: string): string => coordKey(parseKey(k));
