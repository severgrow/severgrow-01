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
import type { PositionSpec } from './authored.js';
import type { OpponentScript } from './opponent.js';

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
  | { t: 'pileBloom' }
  | { t: 'skip' };

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
  /** Explanations shown once before the first draw (tap anywhere to move on). */
  intro: readonly ('tree' | 'their-home' | 'rock' | 'bloom-cards' | 'surround')[];
  /** How much the window says once the lesson's ideas are done: every step, one word, or only on idle. */
  guide: 'full' | 'word' | 'idle';
  /** The finish card's title and line on a win. */
  finish: { title: string; line: string };
};

// ---------- the lessons ----------

const SET3: readonly (readonly [0 | 1 | 2 | 3, number])[] = [[0, 3], [1, 3], [2, 3]];

export const LESSONS: readonly Lesson[] = Object.freeze([
  {
    level: 1, version: 1, locked: true, guide: 'full',
    intro: ['tree', 'their-home'],
    goals: [{ t: 'grow' }],
    position: {
      seed: 96001,
      hand: [[0, 8], [1, 2], [1, 5], [2, 4], [1, 3], [2, 6], [3, 5]],
      opponent: [[1, 2], [2, 2], [3, 3], [0, 2], [3, 2], [2, 3], [3, 4]],
      deck: [[2, 7], [0, 4], [0, 5], [0, 6], [1, 7], [3, 6], [3, 7], [3, 2], [0, 7], [1, 6], [2, 8], [1, 4]],
      discard: [[3, 1]],
    },
    opponent: { script: { growOn: [2] } },
    finish: { title: W.youWin, line: W.wonOnPoints },
  },
  {
    level: 2, version: 1, locked: true, guide: 'word',
    intro: [],
    goals: [{ t: 'strengthen', key: '-1,1', card: 8 }, { t: 'take', key: '0,0' }],
    position: {
      seed: 96002,
      tiles: [['-1,1', YOU, 2], ['0,0', THEM, 4], ['1,-1', THEM, 5]],
      hand: [[0, 8], [1, 6], [2, 3], [3, 2], [0, 4], [1, 2], [2, 5]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[3, 5], [2, 7], [2, 6], [0, 6], [0, 3], [1, 5], [0, 7], [1, 7], [3, 7], [2, 4], [1, 4], [3, 6]],
      discard: [[3, 1]],
    },
    opponent: { script: { growOn: [3], avoid: ['0,0'] } },
    finish: { title: W.youWin, line: W.wonOnPoints },
  },
  {
    level: 3, version: 1, locked: true, guide: 'word',
    intro: ['rock'],
    goals: [{ t: 'gold', key: '0,0' }],
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
    opponent: { script: { growOn: [1, 3], prefer: ['0,0'] } },
    finish: { title: W.youWin, line: W.goldDecided },
  },
  {
    level: 4, version: 1, locked: false, guide: 'word',
    intro: [],
    goals: [{ t: 'cut', key: '1,-1' }],
    position: {
      seed: 96004,
      tiles: [['-1,1', YOU, 4], ['0,0', YOU, 3], ['1,-1', THEM, 2], ['0,-1', THEM, 5], ['-1,-1', THEM, 3]],
      hand: [[0, 8], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[3, 5], [1, 7], [1, 5], [2, 6], [1, 4], [0, 6], [3, 6], [2, 4], [0, 7], [0, 3]],
      discard: [[3, 1]],
    },
    opponent: { script: { growOn: [2] } },
    finish: { title: W.youWin, line: W.wonOnPoints },
  },
  {
    level: 5, version: 1, locked: false, guide: 'word',
    intro: ['bloom-cards'],
    goals: [{ t: 'bloom' }],
    position: {
      seed: 96005,
      tiles: [['-1,1', YOU, 2], ['1,-2', THEM, 9], ['1,-1', THEM, 9], ['2,-1', THEM, 9]],
      hand: [...SET3, [1, 2], [2, 6], [3, 7], [1, 8]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 4], [1, 4], [3, 5], [0, 6], [1, 5], [2, 4], [3, 6], [0, 7], [1, 7], [2, 7], [3, 8], [2, 8]],
      discard: [[3, 1]],
    },
    opponent: { script: { growOn: [2] } },
    finish: { title: W.youWin, line: W.wonOnPoints },
  },
  {
    level: 6, version: 1, locked: false, guide: 'word',
    intro: ['surround'],
    goals: [{ t: 'strangle' }],
    position: {
      seed: 96006,
      tiles: [['-1,1', YOU, 4], ['0,0', YOU, 5]],
      hand: [[0, 1], [0, 3], [3, 9], [2, 7], [1, 9], [1, 6], [1, 8]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 6], [1, 4], [3, 5], [0, 4], [1, 5], [2, 4], [3, 6], [0, 7], [1, 7], [2, 6], [3, 7], [2, 8]],
      discard: [[3, 1]],
    },
    // It leaves its own home's sides to you: the lesson is the surround.
    opponent: { script: { growOn: [1, 2, 3], avoid: ['1,-1', '1,-2', '2,-1'] } },
    finish: { title: W.youWin, line: W.wonByKo },
  },
  {
    level: 7, version: 1, locked: false, guide: 'word',
    intro: [],
    goals: [{ t: 'bomb', key: '0,0' }],
    position: {
      seed: 96007,
      tiles: [['-1,1', YOU, 3], ['0,0', THEM, 9], ['1,-1', THEM, 9]],
      hand: [[null, 0], [0, 3], [1, 4], [2, 5], [3, 6], [0, 7], [1, 8]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 4], [1, 5], [3, 5], [0, 6], [1, 6], [2, 4], [3, 7], [0, 8], [2, 7]],
      discard: [[3, 1]],
    },
    // The Bomb is the whole margin here, so it holds its ground and does not grow.
    opponent: { script: { growOn: [] } },
    finish: { title: W.youWin, line: W.wonOnPoints },
  },
  {
    level: 8, version: 1, locked: false, guide: 'word',
    intro: [],
    goals: [{ t: 'blast', key: '0,-1' }, { t: 'blastGrow' }],
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
    opponent: { script: { growOn: [2] } },
    finish: { title: W.youWin, line: W.wonOnPoints },
  },
  {
    level: 9, version: 1, locked: false, guide: 'word',
    intro: [],
    goals: [{ t: 'pileBloom' }, { t: 'skip' }],
    position: {
      seed: 96009,
      tiles: [['-1,1', YOU, 4], ['1,-2', THEM, 9], ['1,-1', THEM, 9], ['2,-1', THEM, 9]],
      hand: [[0, 3], [0, 4], [1, 2], [2, 6], [3, 7], [1, 8], [2, 9]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[3, 2], [1, 4], [3, 5], [0, 6], [1, 5], [2, 4], [3, 6], [0, 7], [1, 7], [2, 7], [3, 8], [2, 8]],
      discard: [[3, 1], [0, 5]],
    },
    opponent: { script: { growOn: [2] } },
    finish: { title: W.youWin, line: W.wonOnPoints },
  },
  {
    level: 10, version: 1, locked: false, guide: 'idle',
    intro: [],
    goals: [],
    position: {
      seed: 96010,
      gold: ['0,0'],
      rock: ['0,1'],
      // A normal opening: both sides have grown a little, and their home already has cover.
      tiles: [['-1,1', YOU, 4], ['1,-1', THEM, 4], ['1,-2', THEM, 6], ['2,-1', THEM, 7]],
      hand: [[0, 4], [0, 5], [1, 5], [2, 5], [3, 7], [null, 0], [1, 8]],
      opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
      deck: [[0, 6], [1, 4], [3, 5], [0, 3], [1, 6], [2, 4], [3, 6], [0, 8], [1, 7], [2, 7], [3, 8], [2, 8], [0, 7], [1, 3]],
      discard: [[3, 1]],
    },
    opponent: { bot: 1 },
    finish: { title: W.canPlay, line: W.canPlayLine },
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
    case 'skip':
      return myTurns(s).some((t) => t.some((e) => e.t === 'Bloom') && t.some((e) => e.t === 'Discard') && !t.some((e) => GROWTH.has(e.t)));
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

/** The plain Grow a careful beginner makes: gold first, then forward, with the lowest card that does it. */
const plainGrow = (s: State, legal: readonly Action[]): Sprout | null => {
  const theirs = homeCoord(THEM, s.config);
  const sprouts = legal.filter((a): a is Sprout => a.t === 'Sprout' && !s.board[coordKey(a.coord)]);
  if (!sprouts.length) return null;
  const gold = (a: Sprout) => (s.terrain[coordKey(a.coord)] === 'rich' ? 0 : 1);
  return [...sprouts].sort((a, b) =>
    gold(a) - gold(b)
    || hexDistance(a.coord, theirs) - hexDistance(b.coord, theirs)
    || rankOf(s, b.card) - rankOf(s, a.card)
    || coordKey(a.coord).localeCompare(coordKey(b.coord)))[0]!;
};

/** A Grow onto `key`, with the lowest card that does it (or the named rank). */
const growOnto = (s: State, legal: readonly Action[], key: string, rank?: number): Sprout | null =>
  [...legal.filter((a): a is Sprout => a.t === 'Sprout' && coordKey(a.coord) === key)]
    .filter((a) => rank === undefined || rankOf(s, a.card) === rank)
    .sort((a, b) => rankOf(s, a.card) - rankOf(s, b.card) || a.card - b.card)[0] ?? null;

/** The Bloom that grows forward: three tiles toward their home, deterministic. */
const bestBloom = (s: State, legal: readonly Action[]): Extract<Action, { t: 'Bloom' }> | null => {
  const theirs = homeCoord(THEM, s.config);
  const blooms = legal.filter((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom' && a.cards.length === 3);
  const reach = (a: Extract<Action, { t: 'Bloom' }>) => Math.min(...a.hexes.map((h) => hexDistance(h, theirs)));
  const strangles = (a: Action) => { try { return isStrangled(apply(s, a), THEM); } catch { return false; } };
  return [...blooms].filter((a) => !strangles(a)).sort((a, b) =>
    reach(a) - reach(b)
    || a.hexes.map(keyOf).join('|').localeCompare(b.hexes.map(keyOf).join('|'))
    || a.cards.join(',').localeCompare(b.cards.join(',')))[0] ?? null;
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
  return onSide ?? plainGrow(s, legal);
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
const asTappableGrow = (s: State, legal: readonly Action[], a: Action | null, notKo: (x: Action | null) => Action | null): Action | null => {
  if (!a || a.t !== 'Sprout' || !opensBloom(s, legal, a.card)) return a;
  const plain = legal.filter((x): x is Sprout => x.t === 'Sprout' && !opensBloom(s, legal, x.card));
  const sameHex = plain.filter((x) => keyOf(x.coord) === keyOf(a.coord))
    .sort((x, y) => rankOf(s, y.card) - rankOf(s, x.card) || x.card - y.card)[0];
  // A Strengthen keeps its number when it can (the lesson names a card); otherwise any plain card.
  return sameHex ?? notKo(plainGrow(s, plain.filter((x) => notKo(x) !== null))) ?? a;
};

export const suggestMove = (lesson: Lesson, s: State): Action | null => {
  const legal = s.phase === 'ACT' && s.actor === YOU ? legalActions(viewFor(s, YOU)) : [];
  const a = suggestRaw(lesson, s);
  if (!a || a.t !== 'Sprout') return a;
  const koAllowed = currentGoal(lesson, s)?.t === 'strangle' || lesson.level === 10;
  const notKo = (x: Action | null): Action | null => {
    if (!x || koAllowed) return x;
    try { return isStrangled(apply(s, x), THEM) ? null : x; } catch { return null; }
  };
  return asTappableGrow(s, legal, a, notKo);
};

const suggestRaw = (lesson: Lesson, s: State): Action | null => {
  if (s.phase === 'GAME_OVER' || s.actor !== YOU) return null;
  const legal = legalActions(viewFor(s, YOU));
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
      case 'strengthen': if (!grew) { const m = growOnto(s, legal, goal.key, goal.card) ?? growOnto(s, legal, goal.key); if (m) return m; } break;
      case 'take': case 'cut': case 'gold': if (!grew) { const m = growOnto(s, legal, goal.key); if (m) return m; } break;
      case 'bloom': { const m = bestBloom(s, legal); if (m) return m; break; }
      case 'pileBloom': { const m = bestBloom(s, legal); if (m && s.drawnFromDiscard !== null) return m; break; }
      case 'skip': {
        // The lesson: after the Bloom, end the turn without the Grow.
        const bloomedNow = myTurns(s).at(-1)?.some((e) => e.t === 'Bloom');
        if (bloomedNow && !grew && end) return end;
        break;
      }
      case 'strangle': { const m = win ?? (!grew ? surroundStep(s, legal) : null); if (m) return m; break; }
      case 'bomb': if (!grew) { const m = legal.find((a) => a.t === 'PlayFruit' && keyOf(a.target) === goal.key); if (m) return m; } break;
      case 'blast': { const m = legal.find((a) => a.t === 'MegaBomb' && keyOf(a.target) === goal.key) ?? legal.find((a) => a.t === 'MegaBomb'); if (m) return m; break; }
      case 'blastGrow': if (!grew) { const m = plainGrow(s, legal); if (m) return m; } break;
      case 'grow': break;
    }
  }
  if (win) return win;
  if (!grew) {
    const g = notKo(plainGrow(s, legal.filter((a) => notKo(a) !== null)));
    if (g) return g;
  }
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
  | { t: 'led' };

export type Beat = {
  /** Stable id (an explanation is shown once; seen ids are kept with the lesson's save). */
  id: string;
  title: string;
  line?: string;
  lit: Lit;
  /** An explanation: a tap anywhere (or NEXT / ») moves on. */
  explain?: boolean;
  /** A short LED message beside it (the display, never the board). */
  led?: string;
  /** Show only after a few idle seconds (the late levels' quiet guide). */
  idleOnly?: boolean;
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
};

const explain = (id: string, title: string, line: string, lit: Lit, led?: string): Beat =>
  ({ id, title, line, lit, explain: true, ...(led ? { led } : {}) });

const introBeat = (lesson: Lesson, s: State, seen: ReadonlySet<string>): Beat | null => {
  if (s.phase !== 'DRAW' || myTurns(s).length > 0) return null;
  for (const which of lesson.intro) {
    const id = `${lesson.level}:intro:${which}`;
    if (seen.has(id)) continue;
    if (which === 'tree') return explain(id, W.yourTree, W.yourTreeLine, { t: 'home', player: YOU });
    if (which === 'their-home') return explain(id, W.theirHome, W.theirHomeLine, { t: 'home', player: THEM });
    if (which === 'rock') {
      const rock = Object.keys(s.terrain).find((k) => s.terrain[k] === 'rock')!;
      return explain(id, W.rocksBlock, W.rocksBlockLine, { t: 'rock', key: rock });
    }
    if (which === 'bloom-cards') return explain(id, W.cardsThatBloom, W.cardsThatBloomLine, { t: 'cards', ids: bloomCardsFor(s.hands[YOU]).map((c) => c.id) });
    if (which === 'surround') return explain(id, W.surround, W.surroundLine, { t: 'home', player: THEM });
  }
  return null;
};

/** Explanations that follow a moment: they appear once, right after it happens. */
const momentBeat = (lesson: Lesson, s: State, seen: ReadonlySet<string>): Beat | null => {
  if (s.actor !== YOU || s.phase === 'GAME_OVER') return null;
  const once = (id: string) => !seen.has(`${lesson.level}:${id}`);
  const ev = mine(s);
  if (lesson.level === 1 && ev.some((e) => e.t === 'Sprout') && once('grew'))
    return explain(`${lesson.level}:grew`, W.youGrew, W.youGrewLine, { t: 'led' }, 'YOU 1 : THEM 0');
  if (lesson.level === 4 && goalDone({ t: 'cut', key: '1,-1' }, s) && once('withered'))
    return explain(`${lesson.level}:withered`, W.withered, W.witheredLine, { t: 'led' });
  if (lesson.level === 5 && goalDone({ t: 'bloom' }, s) && once('bloomed'))
    return explain(`${lesson.level}:bloomed`, W.bloomed, W.bloomedLine, { t: 'led' });
  // The clock: the Draw pile is nearly gone (levels with a points ending say it once).
  if (lesson.level === 1 && s.phase === 'DRAW' && s.deck.length > 0 && s.deck.length <= 3 && once('pile-low'))
    return explain(`${lesson.level}:pile-low`, W.pileLow, W.pileLowLine, { t: 'deck' }, 'LAST CARDS');
  if (s.deckFinal && s.phase === 'ACT' && (s.sproutsThisTurn ?? 0) === 0 && once(`last-turn`))
    return explain(`${lesson.level}:last-turn`, W.lastTurn, W.lastTurnLine, { t: 'led' }, 'LAST TURN');
  return null;
};

/** The words for a step: spelled out while the lesson's idea is new, one word once it is not. */
const words = (lesson: Lesson, s: State, full: [string, string], word: string): { title: string; line?: string } => {
  const firstTurn = myTurns(s).filter((t) => t.some((e) => e.t === 'Discard')).length === 0;
  if (lesson.guide === 'full' && firstTurn) return { title: full[0], line: full[1] };
  return { title: word };
};

const lightFor = (lesson: Lesson, s: State, ctx: BeatCtx, move: Action, legal: readonly Action[]): Beat => {
  const goal = currentGoal(lesson, s);
  const idleOnly = lesson.guide === 'idle' || (lesson.guide === 'word' && !goal && lesson.level >= 6);
  const beat = (id: string, w: { title: string; line?: string }, lit: Lit): Beat => ({ id, ...w, lit, ...(idleOnly ? { idleOnly } : {}) });
  switch (move.t) {
    case 'Draw':
      if (move.from === 'discard') return { id: 'pile', title: W.pileGold, line: W.pileGoldLine, lit: { t: 'discard' } };
      return beat('draw', words(lesson, s, [W.tapDraw, W.tapDrawLine], W.draw), { t: 'deck' });
    case 'Sprout': {
      const key = keyOf(move.coord);
      const goalWords = goal?.t === 'strengthen' ? [W.biggerWins, W.biggerWinsLine]
        : goal?.t === 'take' ? [W.takeTile, W.takeTileLine]
        : goal?.t === 'cut' ? [W.cutLink, W.cutLinkLine]
        : goal?.t === 'gold' ? [W.goldDouble, W.goldDoubleLine]
        : goal?.t === 'strangle' ? (strangleMove(s, legal) ? [W.canWin, W.canWinLine] : [W.surround, W.surroundLine])
        : goal?.t === 'blastGrow' ? [W.freeGrow, W.freeGrowLine]
        : null;
      if (ctx.card !== move.card) {
        const w = goalWords ? { title: goalWords[0]!, line: goalWords[1]! } : words(lesson, s, [W.pickCard, W.pickCardLine], W.grow);
        return beat(`pick:${move.card}`, w, { t: 'card', id: move.card });
      }
      const others = legal.filter((a): a is Sprout => a.t === 'Sprout' && a.card === move.card).map((a) => keyOf(a.coord)).filter((k) => k !== key);
      const w = goalWords ? { title: goalWords[0]!, line: goalWords[1]! } : words(lesson, s, [W.tapTile, W.tapTileLine], W.grow);
      return beat(`tile:${key}`, w, { t: 'hex', key, ...(goal ? {} : { quiet: others }) });
    }
    case 'Bloom': {
      if (ctx.placing === 'bloom') return beat('bloom-tiles', { title: W.tapBloom, line: W.tapBloomLine }, { t: 'hexes', keys: move.hexes.map(keyOf) });
      if (goal?.t === 'pileBloom') return { id: 'bloom', title: W.tapBloom, line: W.tapBloomLine, lit: { t: 'bloom' } };
      return beat('bloom', { title: W.playLit, line: W.playLitLine }, { t: 'bloom' });
    }
    case 'PlayFruit':
      if (ctx.card !== move.card) return beat('bomb-card', { title: W.bombTile, line: W.bombTileLine }, { t: 'card', id: move.card });
      return beat('bomb-tile', { title: W.bombTile, line: W.bombTileLine }, { t: 'hex', key: keyOf(move.target) });
    case 'MegaBomb':
      if (ctx.placing === 'blast') return beat('blast-tile', { title: W.blast, line: W.blastLine }, { t: 'hex', key: keyOf(move.target) });
      return beat('blast', { title: W.blast, line: W.blastLine }, { t: 'bloom' });
    case 'EndAct':
      if (goal?.t === 'skip') return { id: 'skip', title: W.skipGrow, line: W.skipGrowLine, lit: { t: 'end' } };
      return beat('end', { title: W.done, line: W.doneLine }, { t: 'end' });
    case 'Discard':
      if (ctx.throwPending === move.card) return beat('throw-pile', words(lesson, s, [W.throwPile, W.throwPileLine], W.throwWord), { t: 'discard' });
      return beat(`throw:${move.card}`, words(lesson, s, [W.throwCard, W.throwCardLine], W.throwWord), { t: 'card', id: move.card });
    default:
      return beat('wait', { title: W.notYet }, { t: 'none' });
  }
};

/**
 * What the window says and what is lit, from the live game. Null when the window should be empty
 * (the game is over).
 */
export const lessonBeat = (lesson: Lesson, s: State, ctx: BeatCtx): Beat | null => {
  if (s.phase === 'GAME_OVER') return null;
  if (s.actor !== YOU) {
    const first = myTurns(s).length <= 1 && lesson.guide === 'full';
    return { id: 'their-turn', title: W.theirTurn, ...(first ? { line: W.theirTurnLine } : {}), lit: { t: 'none' }, ...(lesson.guide === 'idle' ? { idleOnly: true } : {}) };
  }
  const intro = introBeat(lesson, s, ctx.seen);
  if (intro) return intro;
  const moment = momentBeat(lesson, s, ctx.seen);
  if (moment) return moment;
  const move = suggestMove(lesson, s);
  if (!move) return null;
  return lightFor(lesson, s, ctx, move, legalActions(viewFor(s, YOU)));
};

/** Unused-for-now helper kept beside the board reader: the key of a coordinate string. */
export const normKey = (k: string): string => coordKey(parseKey(k));
