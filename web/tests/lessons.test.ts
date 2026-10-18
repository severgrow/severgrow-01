// Levels 1-10 are the tutorial: authored lessons, each ending in a real win.
// Three automated players per level: (a) follows the light's move, (b) plays random legal moves,
// (c) taps only the lit thing, through the same beat the screen shows.
import { describe, expect, it } from 'vitest';
import {
  apply, coordKey, createCards, homeCoord, isStrangled, legalActions, mulberry32, neighbors, viewFor,
} from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed } from '../../src/bots/levels.js';
import { botFor, CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { SMALL_BOARD_RADIUS } from '../../src/campaign/small-board.js';
import { LESSON } from '../../src/strings.js';
import {
  LESSONS, currentGoal, goalDone, goalReachable, lessonBeat, lessonFor, lessonOpening, suggestMove,
} from '../src/lessons/lessons.js';
import type { BeatCtx, Lesson, Lit } from '../src/lessons/lessons.js';
import { scriptedOpponentAction } from '../src/lessons/opponent.js';
import { bloomProblem, tapAnswer } from '../src/lessons/answer.js';
import type { Tap } from '../src/lessons/answer.js';

const bot = botFor(CURRENT_BOT_VERSION)!;

const opponentMove = (lesson: Lesson, s: State): Action =>
  'script' in lesson.opponent
    ? scriptedOpponentAction(s, lesson.opponent.script)!
    : bot(viewFor(s, 1), lesson.opponent.bot, botSeed(s.seed, lesson.opponent.bot, s.turnNumber, s.history?.length ?? 0));

const myTurns = (s: State) => (s.history ?? []).filter((e) => e.t === 'Discard' && e.player === 0).length;

/** Plays a whole lesson; `me` chooses my moves. Returns the final state. */
const play = (lesson: Lesson, me: (s: State) => Action, guard = 600): State => {
  let s = lessonOpening(lesson);
  for (let i = 0; i < guard && s.phase !== 'GAME_OVER'; i++) {
    const a = s.actor === 0 ? me(s) : opponentMove(lesson, s);
    s = apply(s, a);
  }
  return s;
};

/** Turn limits from the brief (your own turns). */
const TURNS: Record<number, [number, number]> = {
  1: [4, 4], 2: [4, 6], 3: [4, 6], 4: [4, 6], 5: [3, 6], 6: [3, 6], 7: [3, 6], 8: [3, 6], 9: [3, 6], 10: [3, 10],
};

describe('lesson openings', () => {
  it('there are ten lessons, levels 1-10, each on the 19-hex board', () => {
    expect(LESSONS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const l of LESSONS) {
      const s = lessonOpening(l);
      expect(s.config.boardRadius, `L${l.level}`).toBe(SMALL_BOARD_RADIUS);
      expect(Object.keys(s.board)).toHaveLength(19);
    }
  });

  it('every opening is a legal position built from real cards, none invented or doubled', () => {
    for (const l of LESSONS) {
      const s = lessonOpening(l);
      const cards = [...s.hands[0], ...s.hands[1], ...s.deck, ...s.discard];
      expect(new Set(cards.map((c) => c.id)).size, `L${l.level}`).toBe(cards.length);
      const real = new Map(createCards(s.config).map((c) => [c.id, c]));
      for (const c of cards) expect(real.get(c.id), `L${l.level} card ${c.id}`).toEqual(c);
      expect(s.phase).toBe('DRAW');
      expect(s.actor).toBe(0);
      expect(s.hands[0]).toHaveLength(7);
      expect(s.hands[1]).toHaveLength(7);
      expect(legalActions(viewFor(s, 0)).length).toBeGreaterThan(0);
      for (const [k, t] of Object.entries(s.board)) if (t) expect(s.terrain[k], `L${l.level} ${k}`).not.toBe('rock');
    }
  });

  it('levels 1-4: no Bloom in the opening hand, and none ever lights up while you follow the light', () => {
    for (const l of LESSONS.filter((x) => x.level <= 4)) {
      let s = lessonOpening(l);
      for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
        if (s.actor === 0) {
          expect(legalActions(viewFor(s, 0)).some((a) => a.t === 'Bloom'), `L${l.level} turn ${s.turnNumber}`).toBe(false);
          s = apply(s, suggestMove(l, s)!);
        } else s = apply(s, opponentMove(l, s));
      }
    }
  });

  it('level 1 is open ground: no rock, no gold, nothing grown yet', () => {
    const s = lessonOpening(lessonFor(1)!);
    expect(Object.values(s.terrain).every((t) => t === 'normal')).toBe(true);
    expect(Object.values(s.board).filter((t) => t && !t.root)).toHaveLength(0);
  });
});

describe('player (a): follows the light', () => {
  for (const lesson of LESSONS) {
    it(`level ${lesson.level}: wins, and the lesson's moment happens`, () => {
      const end = play(lesson, (s) => suggestMove(lesson, s)!);
      expect(end.phase).toBe('GAME_OVER');
      expect(end.result?.winner, `L${lesson.level} ${JSON.stringify(end.result)}`).toBe(0);
      for (const g of lesson.goals) expect(goalDone(g, end), `L${lesson.level} ${g.t}`).toBe(true);
      const [lo, hi] = TURNS[lesson.level]!;
      const turns = myTurns(end) + (end.result?.reason === 'strangle' ? 1 : 0);
      expect(turns, `L${lesson.level} turns`).toBeGreaterThanOrEqual(lo);
      expect(turns, `L${lesson.level} turns`).toBeLessThanOrEqual(hi);
    });
  }

  it('ends on points, except level 6 which is the KO lesson', () => {
    for (const lesson of LESSONS) {
      const end = play(lesson, (s) => suggestMove(lesson, s)!);
      expect(end.result?.reason, `L${lesson.level}`).toBe(lesson.level === 6 ? 'strangle' : 'deck_exhaustion');
    }
  });

  it('the light only ever points at a legal move', () => {
    for (const lesson of LESSONS) {
      let s = lessonOpening(lesson);
      for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
        if (s.actor === 0) {
          const a = suggestMove(lesson, s)!;
          expect(legalActions(viewFor(s, 0)), `L${lesson.level}`).toContainEqual(a);
          s = apply(s, a);
        } else s = apply(s, opponentMove(lesson, s));
      }
    }
  });
});

describe('player (b): random legal moves', () => {
  for (const lesson of LESSONS) {
    it(`level ${lesson.level}: always finishes, never deadlocks, always has a beat`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const rand = mulberry32(seed * 7919 + lesson.level);
        const end = play(lesson, (s) => {
          const legal = legalActions(viewFor(s, 0));
          expect(legal.length).toBeGreaterThan(0);
          const beat = lessonBeat(lesson, s, { card: null, placing: null, throwPending: null, seen: new Set() });
          expect(beat, `L${lesson.level} seed ${seed}`).not.toBeNull();
          return legal[Math.floor(rand() * legal.length)]!;
        });
        expect(end.phase, `L${lesson.level} seed ${seed}`).toBe('GAME_OVER');
      }
    });
  }
});

/** The UI's own flow, driven only by the lit thing: tap it, nothing else. */
const tapOnlyTheLight = (lesson: Lesson): { end: State; taps: number; wrong: number } => {
  let s = lessonOpening(lesson);
  const ctx: { card: number | null; placing: BeatCtx['placing']; throwPending: number | null; seen: Set<string> } =
    { card: null, placing: null, throwPending: null, seen: new Set() };
  let taps = 0;
  let wrong = 0;
  const playIt = (a: Action) => { s = apply(s, a); ctx.card = null; ctx.placing = null; ctx.throwPending = null; };
  for (let i = 0; i < 2000 && s.phase !== 'GAME_OVER'; i++) {
    if (s.actor !== 0) { playIt(opponentMove(lesson, s)); continue; }
    const beat = lessonBeat(lesson, s, ctx)!;
    expect(beat, `L${lesson.level}`).not.toBeNull();
    taps++;
    if (beat.explain) { ctx.seen.add(beat.id); continue; }
    const lit: Lit = beat.lit;
    const legal = legalActions(viewFor(s, 0));
    const suggested = suggestMove(lesson, s)!;
    const tap: Tap = lit.t === 'hex' ? { t: 'hex', key: lit.key } : lit.t === 'card' ? { t: 'card', id: lit.id }
      : lit.t === 'deck' ? { t: 'deck' } : lit.t === 'discard' ? { t: 'discard' } : lit.t === 'end' ? { t: 'end' }
      : lit.t === 'hexes' ? { t: 'hex', key: lit.keys[0]! } : { t: 'other' };
    if (tapAnswer(s, ctx.card, tap, lit, lesson.locked, ctx.placing !== null) !== null) wrong++;
    switch (lit.t) {
      case 'deck': playIt(legal.find((a) => a.t === 'Draw' && a.from === 'deck')!); break;
      case 'discard':
        if (s.phase === 'DRAW') playIt(legal.find((a) => a.t === 'Draw' && a.from === 'discard')!);
        else playIt({ t: 'Discard', card: ctx.throwPending! });
        break;
      case 'card':
        if (s.phase === 'DISCARD') ctx.throwPending = lit.id; else ctx.card = lit.id;
        break;
      case 'hex': {
        const a = ctx.placing === 'blast'
          ? legal.find((x) => x.t === 'MegaBomb' && coordKey(x.target) === lit.key)
          : legal.find((x) => (x.t === 'Sprout' && coordKey(x.coord) === lit.key || x.t === 'PlayFruit' && coordKey(x.target) === lit.key) && 'card' in x && x.card === ctx.card);
        expect(a, `L${lesson.level} hex ${lit.key}`).toBeDefined();
        playIt(a!);
        break;
      }
      case 'hexes': expect(suggested.t).toBe('Bloom'); playIt(suggested); break;
      case 'bloom': ctx.placing = suggested.t === 'MegaBomb' ? 'blast' : 'bloom'; break;
      case 'end': playIt(legal.find((a) => a.t === 'EndAct')!); break;
      default: throw new Error(`L${lesson.level}: nothing to tap on my turn (${beat.id})`);
    }
  }
  return { end: s, taps, wrong };
};

describe('player (c): taps only the lit thing', () => {
  for (const lesson of LESSONS) {
    it(`level ${lesson.level}: wins with zero wrong taps`, () => {
      const { end, wrong } = tapOnlyTheLight(lesson);
      expect(end.result?.winner, `L${lesson.level}`).toBe(0);
      expect(wrong, `L${lesson.level}`).toBe(0);
    });
  }

  it('level 1 is short: under 60 taps, at most three explanation beats before the first draw', () => {
    const { taps } = tapOnlyTheLight(lessonFor(1)!);
    expect(taps).toBeLessThan(60);
    expect(lessonFor(1)!.intro.length).toBeLessThanOrEqual(3);
  });
});

describe('the scripted opponent', () => {
  it('only plays legal moves and never surrounds your home', () => {
    for (const lesson of LESSONS) {
      if (!('script' in lesson.opponent)) continue;
      for (let seed = 1; seed <= 10; seed++) {
        const rand = mulberry32(seed);
        let s = lessonOpening(lesson);
        for (let i = 0; i < 600 && s.phase !== 'GAME_OVER'; i++) {
          if (s.actor === 1) {
            const a = scriptedOpponentAction(s, lesson.opponent.script)!;
            expect(legalActions(viewFor(s, 1))).toContainEqual(a);
            s = apply(s, a);
            expect(isStrangled(s, 0), `L${lesson.level}`).toBe(false);
          } else {
            const legal = legalActions(viewFor(s, 0));
            s = apply(s, legal[Math.floor(rand() * legal.length)]!);
          }
        }
      }
    }
  });

  it('always draws from the Draw pile, so the Throw pile stays as the lesson set it', () => {
    for (const lesson of LESSONS) {
      if (!('script' in lesson.opponent)) continue;
      const end = play(lesson, (s) => suggestMove(lesson, s)!);
      const theirDraws = (end.history ?? []).filter((e) => e.t === 'Draw' && e.player === 1);
      expect(theirDraws.every((e) => e.t === 'Draw' && e.from === 'deck'), `L${lesson.level}`).toBe(true);
    }
  });
});

describe('the lessons teach the rules as they are', () => {
  it('a Bomb uses the Grow; a Blast does not (level 8 grows after it)', () => {
    const l7 = lessonFor(7)!;
    let s = apply(lessonOpening(l7), { t: 'Draw', from: 'deck' });
    s = apply(s, suggestMove(l7, s)!);
    expect(s.sproutsThisTurn).toBe(1);
    expect(legalActions(viewFor(s, 0)).some((a) => a.t === 'Sprout')).toBe(false);
    const l8 = lessonFor(8)!;
    let t = apply(lessonOpening(l8), { t: 'Draw', from: 'deck' });
    const blast = suggestMove(l8, t)!;
    expect(blast.t).toBe('MegaBomb');
    t = apply(t, blast);
    expect(t.sproutsThisTurn).toBe(0);
    expect(legalActions(viewFor(t, 0)).some((a) => a.t === 'Sprout')).toBe(true);
  });

  it('a Blast never touches a home', () => {
    const l8 = lessonFor(8)!;
    let s = apply(lessonOpening(l8), { t: 'Draw', from: 'deck' });
    s = apply(s, suggestMove(l8, s)!);
    expect(s.board[coordKey(homeCoord(1, s.config))]?.root).toBe(true);
    expect(s.board[coordKey(homeCoord(0, s.config))]?.root).toBe(true);
  });

  it('level 4: taking the link withers the tiles behind it', () => {
    const l4 = lessonFor(4)!;
    let s = apply(lessonOpening(l4), { t: 'Draw', from: 'deck' });
    s = apply(s, suggestMove(l4, s)!);
    expect(s.board['1,-1']?.owner).toBe(0);
    expect(s.board['0,-1']).toBeFalsy();
    expect(s.board['-1,-1']).toBeFalsy();
  });

  it('level 9: the Throw pile top completes a Bloom, and Skip ends the turn without the Grow', () => {
    const l9 = lessonFor(9)!;
    const s = lessonOpening(l9);
    expect(suggestMove(l9, s)).toEqual({ t: 'Draw', from: 'discard' });
    const end = play(l9, (x) => suggestMove(l9, x)!);
    expect(goalDone({ t: 'pileBloom' }, end)).toBe(true);
    expect(goalDone({ t: 'skip' }, end)).toBe(true);
  });
});

describe('win-moment proof (levels 6-10)', () => {
  it('whenever the window says YOU CAN WIN, a legal move surrounds their home', () => {
    for (const lesson of LESSONS.filter((l) => l.level >= 6)) {
      let s = lessonOpening(lesson);
      for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
        if (s.actor === 0) {
          const beat = lessonBeat(lesson, s, { card: null, placing: null, throwPending: null, seen: new Set(['x']) });
          if (beat?.title === LESSON.canWin) {
            const wins = legalActions(viewFor(s, 0)).some((a) => { const n = apply(s, a); return n.result?.reason === 'strangle' && n.result.winner === 0; });
            expect(wins, `L${lesson.level}`).toBe(true);
          }
          s = apply(s, suggestMove(lesson, s)!);
        } else s = apply(s, opponentMove(lesson, s));
      }
    }
  });

  it('level 6 really is a surround: the lit side is one of their home\'s sides', () => {
    const l6 = lessonFor(6)!;
    const s = apply(lessonOpening(l6), { t: 'Draw', from: 'deck' });
    const m = suggestMove(l6, s)!;
    const sides = neighbors(homeCoord(1, s.config), s.config.boardRadius).map(coordKey);
    expect(m.t === 'Sprout' && sides.includes(coordKey(m.coord))).toBe(true);
  });
});

describe('wrong taps always get an answer', () => {
  const l1 = lessonFor(1)!;
  const s0 = lessonOpening(l1);
  it('before drawing: a tile or a card says DRAW FIRST', () => {
    expect(tapAnswer(s0, null, { t: 'hex', key: '-1,1' })).toBe(LESSON.drawFirst);
    expect(tapAnswer(s0, null, { t: 'card', id: s0.hands[0][0]!.id })).toBe(LESSON.drawFirst);
  });
  it('a tile away from your tree says CONNECT TO YOUR TREE; their home says so; rock blocks', () => {
    const s = apply(s0, { t: 'Draw', from: 'deck' });
    const card = s.hands[0][0]!.id;
    expect(tapAnswer(s, card, { t: 'hex', key: '2,-1' })).toBe(LESSON.connect);
    expect(tapAnswer(s, card, { t: 'hex', key: '2,-2' })).toBe(LESSON.isTheirHome);
    const l3 = lessonFor(3)!;
    const r = apply(lessonOpening(l3), { t: 'Draw', from: 'deck' });
    expect(tapAnswer(r, r.hands[0][0]!.id, { t: 'hex', key: '-1,0' })).toBe(LESSON.rockBlocks);
  });
  it('a card too low for their tile says TOO WEAK with the numbers', () => {
    const l2 = lessonFor(2)!;
    const s = apply(lessonOpening(l2), { t: 'Draw', from: 'deck' });
    const low = s.hands[0].find((c) => c.rank === 2 && c.suit !== null)!;
    expect(tapAnswer(s, low.id, { t: 'hex', key: '0,0' })).toBe(LESSON.tooWeak(2, 4));
  });
  it('a Bomb aimed at a tile that does not touch yours says MUST TOUCH YOUR TILES', () => {
    const l7 = lessonFor(7)!;
    const s = apply(lessonOpening(l7), { t: 'Draw', from: 'deck' });
    const bomb = s.hands[0].find((c) => c.suit === null)!;
    expect(tapAnswer(s, bomb.id, { t: 'hex', key: '1,-1' })).toBe(LESSON.mustTouch);
  });
  it('in levels 1-3 a legal tap that is not the lit one is led back to the light', () => {
    const s = apply(s0, { t: 'Draw', from: 'deck' });
    const beat = lessonBeat(l1, s, { card: null, placing: null, throwPending: null, seen: new Set(['1:intro:tree', '1:intro:their-home']) })!;
    expect(beat.lit.t).toBe('card');
    const other = s.hands[0].find((c) => beat.lit.t === 'card' && c.id !== beat.lit.id)!;
    expect(tapAnswer(s, null, { t: 'card', id: other.id }, beat.lit, true)).toBe(LESSON.tapLit);
  });
  it('a random tapper on level 1 never gets a silent dead tap', () => {
    const rand = mulberry32(42);
    let s = s0;
    const keys = Object.keys(s.board);
    for (let i = 0; i < 300 && s.phase !== 'GAME_OVER'; i++) {
      if (s.actor !== 0) { s = apply(s, opponentMove(l1, s)); continue; }
      const legal = legalActions(viewFor(s, 0));
      const tap: Tap = rand() < 0.5 ? { t: 'hex', key: keys[Math.floor(rand() * keys.length)]! } : { t: 'card', id: s.hands[0][Math.floor(rand() * s.hands[0].length)]!.id };
      const answer = tapAnswer(s, null, tap);
      // Either the tap can do something (some legal move uses it) or it is answered.
      const usable = tap.t === 'hex'
        ? legal.some((a) => (a.t === 'Sprout' && coordKey(a.coord) === tap.key))
        : legal.some((a) => ('card' in a && a.card === tap.id));
      expect(usable || answer !== null, `${JSON.stringify(tap)} in ${s.phase}`).toBe(true);
      s = apply(s, legal[Math.floor(rand() * legal.length)]!);
    }
  });
  it('an illegal Bloom says what is missing', () => {
    const cards = createCards({ ...lessonOpening(l1).config });
    const [a, b, c, d] = [cards.find((x) => x.suit === 0 && x.rank === 3)!, cards.find((x) => x.suit === 1 && x.rank === 3)!, cards.find((x) => x.suit === 2 && x.rank === 5)!, cards.find((x) => x.suit === 2 && x.rank === 3)!];
    expect(bloomProblem([a, b])).toBe(LESSON.bloomNeeds);
    expect(bloomProblem([a, b, c])).toBe(LESSON.bloomMatch);
    expect(bloomProblem([a, b, d])).toBeNull();
  });
});

describe('robustness', () => {
  it('throwing the key card makes the lesson unreachable, which the game can tell (RESTART LEVEL)', () => {
    const l7 = lessonFor(7)!;
    let s = apply(lessonOpening(l7), { t: 'Draw', from: 'deck' });
    s = apply(s, { t: 'EndAct' });
    const bomb = s.hands[0].find((c) => c.suit === null)!;
    s = apply(s, { t: 'Discard', card: bomb.id });
    expect(currentGoal(l7, s)?.t).toBe('bomb');
    expect(goalReachable(l7, s)).toBe(false);
  });
  it('the opening of every lesson is the same every time (no randomness)', () => {
    for (const l of LESSONS) expect(JSON.stringify(lessonOpening(l))).toBe(JSON.stringify(lessonOpening(l)));
  });
});
