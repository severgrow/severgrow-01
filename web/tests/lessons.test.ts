// Levels 1-10 are the tutorial: authored lessons, each ending in a real win.
// Three automated players per level: (a) follows the light's move, (b) plays random legal moves,
// (c) taps only the lit thing, through the same beat the screen shows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apply, coordKey, createCards, homeCoord, isStrangled, legalActions, mulberry32, neighbors, viewFor,
} from '../../src/engine/index.js';
import type { Action, Event, State } from '../../src/engine/index.js';
import { botSeed } from '../../src/bots/levels.js';
import { botFor, CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { SMALL_BOARD_RADIUS } from '../../src/campaign/small-board.js';
import { LESSON } from '../../src/strings.js';
import {
  LESSONS, currentGoal, goalDone, goalReachable, lessonAllows, lessonBeat, lessonFor, lessonLegal, lessonLocked,
  lessonOffersBloom, lessonOpening, presentedLessonBeat, suggestMove,
} from '../src/lessons/lessons.js';
import type { BeatCtx, Lesson, Lit } from '../src/lessons/lessons.js';
import {
  LESSON_VERSION, decodeMastery, displayTier, encodeMastery, freshMastery, recordAction, recordHello, tierOf,
} from '../src/lessons/mastery.js';
import { createIdleWatch } from '../src/lessons/idle.js';
import { lessonVoiceFor } from '../src/lessons/lesson-voice.js';
import { scriptedOpponentAction } from '../src/lessons/opponent.js';
import { bloomProblem, tapAnswer } from '../src/lessons/answer.js';
import type { Tap } from '../src/lessons/answer.js';

const bot = botFor(CURRENT_BOT_VERSION)!;

const opponentMove = (lesson: Lesson, s: State): Action =>
  'script' in lesson.opponent
    ? scriptedOpponentAction(s, lesson.opponent.script)!
    : bot(viewFor(s, 1), lesson.opponent.bot, botSeed(s.seed, lesson.opponent.bot, s.turnNumber, s.history?.length ?? 0));

const myTurns = (s: State) => (s.history ?? []).filter((e) => e.t === 'Discard' && e.player === 0).length;

/** Plays a whole lesson; `me` chooses my moves. A silent light still needs an end-of-turn move. */
const play = (lesson: Lesson, me: (s: State) => Action | null, guard = 600): State => {
  let s = lessonOpening(lesson);
  for (let i = 0; i < guard && s.phase !== 'GAME_OVER'; i++) {
    let a = s.actor === 0 ? me(s) : opponentMove(lesson, s);
    if (!a) {
      const legal = legalActions(viewFor(s, 0));
      a = legal.find((x) => x.t === 'EndAct') ?? legal[0]!;
    }
    s = apply(s, a);
  }
  return s;
};

/** Turn limits from the brief (your own turns). */
const TURNS: Record<number, [number, number]> = {
  1: [4, 4], 2: [3, 5], 3: [3, 5], 4: [3, 5], 5: [3, 5], 6: [2, 5], 7: [3, 5], 8: [2, 5], 9: [3, 5], 10: [3, 10],
};

/**
 * The game's own rule for a tapped card: one that shares a face with a Bloom the page OFFERS opens
 * the Bloom (the page's moves are the lesson's: no Bloom before level 5 — Session.allow).
 */
const opensBloomInGame = (l: Lesson, s: State, card: number): boolean => {
  const hand = s.hands[0];
  const c = hand.find((x) => x.id === card);
  if (!c || c.suit === null) return false;
  return lessonLegal(l, s).some((a) => a.t === 'Bloom'
    && a.cards.some((id) => { const o = hand.find((x) => x.id === id); return !!o && o.suit === c.suit && o.rank === c.rank; }));
};

describe('the light never asks for a tap the game reads differently', () => {
  it('a lit single Grow never uses a card that the game would open as a Bloom (when another card can grow)', () => {
    for (const l of LESSONS) {
      let s = lessonOpening(l);
      for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
        if (s.actor === 0) {
          const a = suggestMove(l, s);
          if (!a) { const legal = legalActions(viewFor(s, 0)); s = apply(s, legal.find((x) => x.t === 'EndAct') ?? legal[0]!); continue; }
          if (a.t === 'Sprout' && opensBloomInGame(l, s, a.card)) {
            const other = lessonLegal(l, s).some((x) => x.t === 'Sprout' && !opensBloomInGame(l, s, x.card));
            expect(other, `L${l.level} turn ${s.turnNumber}: Grow with Bloom card ${a.card}`).toBe(false);
          }
          s = apply(s, a);
        } else s = apply(s, opponentMove(l, s));
      }
    }
  });
});

describe('the suggestion is worked out once per position', () => {
  it('asking twice about the same state gives the same answer, computed once', () => {
    for (const l of LESSONS) {
      const s = lessonOpening(l);
      const first = suggestMove(l, s);
      expect(suggestMove(l, s)).toBe(first);
      // a structurally equal copy is a different position object: same answer, worked out afresh
      expect(suggestMove(l, structuredClone(s))).toEqual(first);
    }
  });
});

describe('levels 11+ are untouched', () => {
  it('only levels 1-10 have a lesson; 11 and up keep their own opening (and their Seeds proofs)', () => {
    for (let n = 1; n <= 10; n++) expect(lessonFor(n), `L${n}`).not.toBeNull();
    for (let n = 11; n <= 50; n++) expect(lessonFor(n), `L${n}`).toBeNull();
  });
});

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

  it('levels 1-4 never offer a Bloom, whatever the player does (owner, 2026-10-22)', () => {
    // "Make it impossible to have bloom in hand before the bloom lesson": the cards are the engine's,
    // but the lesson never OFFERS the move, so no button, glow or hint can appear before level 5.
    for (const l of LESSONS.filter((x) => x.level <= 4)) {
      for (let seed = 0; seed <= 30; seed++) {
        const rand = mulberry32(seed * 131 + l.level);
        let s = lessonOpening(l);
        for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
          if (s.actor === 0) {
            const offered = lessonLegal(l, s);
            expect(offered.some((a) => a.t === 'Bloom'), `L${l.level} seed ${seed} turn ${s.turnNumber}`).toBe(false);
            expect(offered.length, `L${l.level}: there is always a move`).toBeGreaterThan(0);
            const a = seed === 0 ? suggestMove(l, s)! : offered[Math.floor(rand() * offered.length)]!;
            expect(offered, `L${l.level}: the light points at an offered move`).toContainEqual(a);
            s = apply(s, a);
          } else s = apply(s, opponentMove(l, s));
        }
      }
    }
    for (const l of LESSONS) {
      expect(lessonOffersBloom(l), `L${l.level}`).toBe(l.level >= 5);
      expect(lessonAllows(l, { t: 'Bloom', cards: [1, 2, 3], hexes: [] }), `L${l.level}`).toBe(l.level >= 5);
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
      if (lesson.level >= 2 && lesson.level <= 9) expect(turns, `L${lesson.level} short level`).toBeLessThanOrEqual(5);
    });
  }

  it('ends on points, except the surround lesson and the real game (L10) which may surround', () => {
    for (const lesson of LESSONS) {
      const end = play(lesson, (s) => suggestMove(lesson, s)!);
      const expected = lesson.level === 6 ? 'strangle' : lesson.level === 10 ? end.result?.reason : 'deck_exhaustion';
      expect(end.result?.reason, `L${lesson.level}`).toBe(expected);
      if (lesson.level === 10) expect(['deck_exhaustion', 'strangle']).toContain(end.result?.reason);
    }
  });

  it('the light only ever points at a legal move', () => {
    for (const lesson of LESSONS) {
      let s = lessonOpening(lesson);
      for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
        if (s.actor === 0) {
          const a = suggestMove(lesson, s);
          if (a) expect(legalActions(viewFor(s, 0)), `L${lesson.level}`).toContainEqual(a);
          const legal = legalActions(viewFor(s, 0));
          s = apply(s, a ?? legal.find((x) => x.t === 'EndAct') ?? legal[0]!);
        } else s = apply(s, opponentMove(lesson, s));
      }
    }
  });
});

describe('player (b): random legal moves', () => {
  for (const lesson of LESSONS) {
    it(`level ${lesson.level}: always finishes and never deadlocks`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const rand = mulberry32(seed * 7919 + lesson.level);
        const end = play(lesson, (s) => {
          const legal = legalActions(viewFor(s, 0));
          expect(legal.length).toBeGreaterThan(0);
          // A silent tier is deliberate: there may be no hint, but the game always has a move.
          return legal[Math.floor(rand() * legal.length)]!;
        });
        expect(end.phase, `L${lesson.level} seed ${seed}`).toBe('GAME_OVER');
      }
    });
  }
});

/** The UI's own flow, driven only by the lit thing: tap it, nothing else. */
const tapOnlyTheLight = (
  lesson: Lesson, powerSeen = new Set(['bloom', 'bomb', 'blast'] as const),
  onBeat: (beat: ReturnType<typeof lessonBeat>, s: State) => void = () => {},
): { end: State; taps: number; wrong: number } => {
  let s = lessonOpening(lesson);
  const ctx: { card: number | null; placing: BeatCtx['placing']; throwPending: number | null; seen: Set<string>; powerSeen: Set<'bloom' | 'bomb' | 'blast'> } =
    { card: null, placing: null, throwPending: null, seen: new Set(), powerSeen };
  let taps = 0;
  let wrong = 0;
  const playIt = (a: Action) => { s = apply(s, a); ctx.card = null; ctx.placing = null; ctx.throwPending = null; };
  for (let i = 0; i < 2000 && s.phase !== 'GAME_OVER'; i++) {
    if (s.actor !== 0) { playIt(opponentMove(lesson, s)); continue; }
    const beat = lessonBeat(lesson, s, ctx);
    onBeat(beat, s);
    taps++;
    if (!beat) {
      // SILENT: the calm neutral window. The player still chooses the same legal move.
      const suggested = suggestMove(lesson, s);
      if (suggested) { playIt(suggested); continue; }
      const legal = legalActions(viewFor(s, 0));
      const end = legal.find((a) => a.t === 'EndAct');
      if (end) { playIt(end); continue; }
      break;
    }
    if (beat.explain) { ctx.seen.add(beat.id); continue; }
    const lit: Lit = beat.lit;
    const legal = legalActions(viewFor(s, 0));
    const suggested = suggestMove(lesson, s);
    if (!suggested) {
      const end = legal.find((a) => a.t === 'EndAct');
      if (end) { playIt(end); continue; }
      break;
    }
    const tap: Tap = lit.t === 'hex' ? { t: 'hex', key: lit.key } : lit.t === 'card' ? { t: 'card', id: lit.id }
      : lit.t === 'deck' ? { t: 'deck' } : lit.t === 'discard' ? { t: 'discard' } : lit.t === 'end' ? { t: 'end' }
      : lit.t === 'hexes' ? { t: 'hex', key: lit.keys[0]! } : { t: 'other' };
    if (tapAnswer(s, ctx.card, tap, lit, lessonLocked(lesson, s), ctx.placing !== null) !== null) wrong++;
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

describe('final sign-off (owner, 2026-10-22)', () => {
  type Seen = { id: string; phase: State['phase']; turn: number; state: State; lit: Lit };
  const walk = (lesson: Lesson): Seen[] => {
    const out: Seen[] = [];
    tapOnlyTheLight(lesson, undefined, (beat, s) => {
      if (beat && !out.some((x) => x.id === beat.id && beat.explain)) out.push({ id: beat.id, phase: s.phase, turn: myTurns(s) + 1, state: s, lit: beat.lit });
    });
    return out;
  };

  it('a move is explained after the draw, the moment it can be played', () => {
    const cases: [number, string, (s: State) => boolean][] = [
      [3, '3:intro:gold', (s) => lessonLegal(lessonFor(3)!, s).some((a) => a.t === 'Sprout' && coordKey(a.coord) === '0,0')],
      [5, '5:intro:bloom-cards', (s) => lessonLegal(lessonFor(5)!, s).some((a) => a.t === 'Bloom')],
      [6, '6:intro:surround', (s) => {
        const sides = new Set(neighbors(homeCoord(1, s.config), s.config.boardRadius).map(coordKey));
        return lessonLegal(lessonFor(6)!, s).some((a) => a.t === 'Sprout' && sides.has(coordKey(a.coord)));
      }],
      [7, '7:intro:bomb', (s) => lessonLegal(lessonFor(7)!, s).some((a) => a.t === 'PlayFruit')],
      [8, '8:intro:blast', (s) => lessonLegal(lessonFor(8)!, s).some((a) => a.t === 'MegaBomb')],
    ];
    for (const [level, id, playable] of cases) {
      const seen = walk(lessonFor(level)!);
      const intro = seen.find((x) => x.id === id);
      expect(intro, `L${level}: ${id} is shown`).toBeDefined();
      expect(intro!.phase, `L${level}: after the draw`).toBe('ACT');
      expect(intro!.turn, `L${level}: on the first turn`).toBe(1);
      expect(playable(intro!.state), `L${level}: its move can be played right then`).toBe(true);
      // Before the draw the display only asks for the draw: nothing about the move yet.
      const before = seen.filter((x) => x.phase === 'DRAW' && x.turn === 1).map((x) => x.id);
      expect(before.some((x) => x.includes('intro:') && x !== '3:intro:rock'), `L${level}: ${before}`).toBe(false);
    }
    // Board facts and the opening's own explanations still come before the first draw.
    expect(walk(lessonFor(1)!).filter((x) => x.phase === 'DRAW' && x.turn === 1).map((x) => x.id))
      .toEqual(expect.arrayContaining(['1:intro:tree', '1:intro:their-home', '1:intro:first-draw']));
    expect(walk(lessonFor(3)!).find((x) => x.id === '3:intro:rock')!.phase).toBe('DRAW');
    expect(walk(lessonFor(9)!).find((x) => x.id === '9:intro:pile-gold')!.phase).toBe('DRAW');
  });

  it('level 1: the first three sentences welcome on the display, then it goes back to the action', () => {
    const seen = walk(lessonFor(1)!);
    const ids = ['1:intro:tree', '1:intro:their-home', '1:intro:first-draw'];
    const ctx = { card: null, placing: null, throwPending: null, seen: new Set<string>() };
    const s0 = lessonOpening(lessonFor(1)!);
    for (const id of ids) {
      const beat = lessonBeat(lessonFor(1)!, s0, ctx)!;
      expect(beat.id).toBe(id);
      expect(lessonVoiceFor({ beat, answer: null, stuck: false, restartLine: LESSON.restartLine }))
        .toEqual({ box: beat.line, display: LESSON.welcome, restart: false });
      ctx.seen.add(id);
    }
    expect(lessonBeat(lessonFor(1)!, s0, ctx)!.say, 'then the display asks for the draw').toBe(LESSON.tapDraw);
    expect(seen.filter((x) => x.id !== 'draw').every((x) => ids.includes(x.id) || x.phase !== 'DRAW' || x.turn > 1)).toBe(true);
    // No other level, and no later beat, uses the welcome.
    for (const l of LESSONS.filter((x) => x.level > 1)) {
      tapOnlyTheLight(l, undefined, (b) => expect(b?.say, `L${l.level} ${b?.id}`).not.toBe(LESSON.welcome));
    }
  });

  it('level 2: the cut is explained on the next turn, when a cut is there to play', () => {
    const seen = walk(lessonFor(2)!);
    const strengthen = seen.find((x) => x.id === '2:idea:strengthen')!;
    // From the second turn on, the idea's id carries its turn (owner, 2026-10-24: the sentence comes
    // back each turn its move is lit), so the take on turn 2 is `2:idea:take@2`.
    const take = seen.find((x) => x.id === '2:idea:take@2')!;
    expect(strengthen.turn).toBe(1);
    expect(take.turn, 'not straight after the strengthen').toBe(2);
    expect(take.phase).toBe('ACT');
    const takes = lessonLegal(lessonFor(2)!, take.state).filter((a) => a.t === 'Sprout' && coordKey(a.coord) === '0,0');
    expect(takes.length, 'their tile can be taken right then').toBeGreaterThan(0);
    expect(take.lit).toEqual({ t: 'hex', key: '0,0' });
  });

  it('level 2: whatever card the first turn throws, the cut is open on the next turn', () => {
    const l = lessonFor(2)!;
    let s = lessonOpening(l);
    // Turn 1 is locked to the lit moves: draw, strengthen, then the lit throw.
    while (!(s.phase === 'DISCARD' && s.actor === 0)) s = apply(s, s.actor === 0 ? suggestMove(l, s)! : opponentMove(l, s));
    for (const t of lessonLegal(l, s).filter((a) => a.t === 'Discard')) {
      let n = apply(s, t);
      while (!(n.phase === 'ACT' && n.actor === 0) && n.phase !== 'GAME_OVER') n = apply(n, n.actor === 0 ? suggestMove(l, n)! : opponentMove(l, n));
      expect(n.board['0,0']?.owner, 'their tile is still there').toBe(1);
      const lit = t.t === 'Discard' && t.card === (suggestMove(l, s) as { card: number }).card;
      if (lit) expect(lessonLegal(l, n).some((a) => a.t === 'Sprout' && coordKey(a.coord) === '0,0'), 'the lit throw keeps the cut open').toBe(true);
    }
  });

  it('level 9: right after the skip sentence, the Undo key is explained', () => {
    const seen = walk(lessonFor(9)!);
    const i = seen.findIndex((x) => x.id === '9:optional');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seen[i + 1]?.id).toBe('9:undo');
    expect(seen[i + 1]?.lit).toEqual({ t: 'undo' });
    expect(seen[i + 1]?.phase).toBe('ACT');
  });

  it('when the light points at one of their tiles, the display says so', () => {
    for (const l of LESSONS.filter((x) => x.level <= 9)) {
      tapOnlyTheLight(l, undefined, (beat, s) => {
        if (beat?.lit.t === 'hex' && beat.id.startsWith('tile:') && s.board[beat.lit.key]?.owner === 1) {
          expect(beat.say, `L${l.level} ${beat.id}`).toBe(LESSON.tapTheirTile);
        }
      });
    }
  });

  it('the last turn is announced in one short sentence', () => {
    expect(LESSON.lastTurnLine).toBe('The Draw pile is empty – this is your last turn.');
  });

  it('level 1: the opponent grows once, on its 2nd turn, and never takes your tile (owner, 2026-10-23)', () => {
    const l = lessonFor(1)!;
    for (let seed = 0; seed <= 12; seed++) {
      const rand = mulberry32(seed * 313 + 1);
      const end = play(l, (s) => { const o = lessonLegal(l, s); return seed === 0 ? suggestMove(l, s)! : o[Math.floor(rand() * o.length)]!; });
      const theirs = (end.history ?? []).filter((e) => 'player' in e && e.player === 1);
      const grows = theirs.filter((e) => e.t === 'Sprout' || e.t === 'Strengthen' || e.t === 'Overgrow');
      expect(grows.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      expect(theirs.some((e) => e.t === 'Overgrow'), `seed ${seed}: never takes`).toBe(false);
    }
  });

  it('level 1: the light never suggests taking their tile (that is level 2)', () => {
    const l = lessonFor(1)!;
    tapOnlyTheLight(l, undefined, (beat, s) => {
      const m = suggestMove(l, s);
      if (m?.t === 'Sprout') expect(s.board[coordKey(m.coord)]?.owner, `L1 ${beat?.id}`).not.toBe(1);
    });
  });

  it('a take or cut is explained right before it, even when its card was picked first', () => {
    for (const level of [2, 4]) {
      const l = lessonFor(level)!;
      const goal = l.goals.find((g) => g.t === 'take' || g.t === 'cut')! as { key: string };
      let s = lessonOpening(l);
      // Play the light until the goal's move is next and could be played.
      for (let i = 0; i < 200; i++) {
        const m = s.actor === 0 ? suggestMove(l, s) : null;
        if (m?.t === 'Sprout' && coordKey(m.coord) === goal.key) break;
        s = apply(s, s.actor === 0 ? m! : opponentMove(l, s));
      }
      const move = suggestMove(l, s) as { card: number };
      const beat = lessonBeat(l, s, { card: move.card, placing: null, throwPending: null, seen: new Set() });
      expect(beat?.id, `L${level}: the card is already picked`).toMatch(new RegExp(`^${level}:idea:${level === 2 ? 'take' : 'cut'}(@\\d+)?$`));
      expect(beat?.lit).toEqual({ t: 'hex', key: goal.key });
    }
  });

  it('levels 2-9: the opponent makes a Grow on every turn it can, whatever you do', () => {
    const GROWS = new Set(['Sprout', 'Strengthen', 'Overgrow']);
    for (const l of LESSONS.filter((x) => 'script' in x.opponent && x.level >= 2)) {
      for (let seed = 0; seed <= 12; seed++) {
        const rand = mulberry32(seed * 977 + l.level);
        let s = lessonOpening(l);
        let turnStart = -1;
        for (let i = 0; i < 600 && s.phase !== 'GAME_OVER'; i++) {
          if (s.actor === 1) {
            if (s.phase === 'ACT' && turnStart < 0) {
              turnStart = s.history?.length ?? 0;
              const couldGrow = legalActions(viewFor(s, 1)).some((a) => a.t === 'Sprout'
                && !isStrangled(apply(s, a), 0));
              s = apply(s, opponentMove(l, s));
              const grew = (s.history ?? []).slice(turnStart).some((e) => GROWS.has(e.t) && 'player' in e && e.player === 1);
              if (couldGrow) expect(grew, `L${l.level} seed ${seed} turn ${s.turnNumber}`).toBe(true);
              continue;
            }
            s = apply(s, opponentMove(l, s));
          } else {
            turnStart = -1;
            const offered = lessonLegal(l, s);
            s = apply(s, seed === 0 ? suggestMove(l, s) ?? offered[0]! : offered[Math.floor(rand() * offered.length)]!);
          }
        }
      }
    }
  });

  it('every level stays a game: following the light wins, and very poor play can lose', () => {
    let losses = 0;
    for (const l of LESSONS.filter((x) => 'script' in x.opponent)) {
      expect(play(l, (s) => suggestMove(l, s)!).result?.winner, `L${l.level}`).toBe(0);
      for (let seed = 1; seed <= 20; seed++) {
        const rand = mulberry32(seed * 7 + l.level);
        const end = play(l, (s) => { const o = lessonLegal(l, s); return o[Math.floor(rand() * o.length)]!; });
        if (end.result?.winner !== 0) losses++;
      }
    }
    expect(losses, 'a random player loses some games').toBeGreaterThan(0);
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

  it('level 9: the Throw pile top completes a Bloom', () => {
    const l9 = lessonFor(9)!;
    const s = lessonOpening(l9);
    expect(suggestMove(l9, s)).toEqual({ t: 'Draw', from: 'discard' });
    const end = play(l9, (x) => suggestMove(l9, x)!);
    expect(goalDone({ t: 'pileBloom' }, end)).toBe(true);
  });

  it('level 9: after the Bloom, one line says Bloom and Grow are optional; nothing waits for » (owner, 2026-10-20)', () => {
    const l9 = lessonFor(9)!;
    expect(l9.goals).toEqual([{ t: 'pileBloom' }]); // skipping is taught, never required
    // follow the light until the Bloom has happened this turn
    let s = lessonOpening(l9);
    for (let i = 0; i < 20 && !(s.phase === 'ACT' && goalDone({ t: 'pileBloom' }, s)); i++) s = apply(s, suggestMove(l9, s)!);
    expect(goalDone({ t: 'pileBloom' }, s)).toBe(true);
    const ctx = (seen: string[]): BeatCtx => ({ card: null, placing: null, throwPending: null, seen: new Set(seen) });
    const first = lessonBeat(l9, s, ctx([]))!;
    expect(first.id).toBe('9:optional');
    expect(first.explain).toBe(true);
    expect(first.line).toBe(LESSON.optionalLine);
    // it points at » unless a power is still playable (then nothing is lit: never » past a power)
    const powerLeft = legalActions(viewFor(s, 0)).some((a) => a.t === 'Bloom' || a.t === 'PlayFruit' || a.t === 'MegaBomb');
    expect(first.lit).toEqual(powerLeft ? { t: 'none' } : { t: 'end' });
    // once read, it never comes back, and the light does not push » while a Grow is still possible
    const next = lessonBeat(l9, s, ctx(['9:optional']));
    expect(next?.id).not.toBe('9:optional');
    const canGrow = legalActions(viewFor(s, 0)).some((a) => a.t === 'Sprout');
    if (canGrow) expect(suggestMove(l9, s)?.t).not.toBe('EndAct');
  });
});

describe('win-moment proof (levels 6-10)', () => {
  it('whenever the window says YOU CAN WIN, a legal move surrounds their home', () => {
    for (const lesson of LESSONS.filter((l) => l.level >= 6)) {
      let s = lessonOpening(lesson);
      for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
        if (s.actor === 0) {
          const beat = lessonBeat(lesson, s, { card: null, placing: null, throwPending: null, seen: new Set(['x']) });
          if (beat?.id === 'can-win') {
            const wins = legalActions(viewFor(s, 0)).some((a) => { const n = apply(s, a); return n.result?.reason === 'strangle' && n.result.winner === 0; });
            expect(wins, `L${lesson.level}`).toBe(true);
          }
          const a = suggestMove(lesson, s);
          const legal = legalActions(viewFor(s, 0));
          s = apply(s, a ?? legal.find((x) => x.t === 'EndAct') ?? legal[0]!);
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

describe('owner review 2026-10-19', () => {
  /** Every beat the follower meets on my turns, with the given ctx extras. */
  const beatsOf = (l: Lesson, extra: Partial<BeatCtx> = {}) => {
    const out: NonNullable<ReturnType<typeof lessonBeat>>[] = [];
    let s = lessonOpening(l);
    const seen = new Set<string>();
    for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
      if (s.actor === 0) {
        const b = lessonBeat(l, s, { card: null, placing: null, throwPending: null, seen, ...extra });
        if (b) { out.push(b); if (b.explain) { seen.add(b.id); continue; } }
        const a = suggestMove(l, s);
        const legal = legalActions(viewFor(s, 0));
        s = apply(s, a ?? legal.find((x) => x.t === 'EndAct') ?? legal[0]!);
      } else s = apply(s, opponentMove(l, s));
    }
    return out;
  };

  // Owner, 2026-10-24 (replaces the 2026-10-19 "levels 1-9 keep their hints on screen"): the
  // lesson's own step is lit at once; every other suggestion waits for a few idle seconds. Level 1
  // teaches the whole turn, so all of its steps stay lit; level 10 waits on every hint.
  it('the lesson\'s own step is lit at once; any other suggestion waits for a quiet moment', () => {
    expect(beatsOf(lessonFor(1)!).some((b) => b.idleOnly), 'L1').toBe(false);
    for (const l of LESSONS.filter((x) => x.level >= 2 && x.level <= 9)) {
      const actions = beatsOf(l).filter((b) => !b.explain && !b.status && !b.hello);
      expect(actions.some((b) => !b.idleOnly), `L${l.level}: its own step is lit at once`).toBe(true);
      expect(actions.filter((b) => b.id === 'draw' || b.id.startsWith('throw:')).every((b) => b.idleOnly), `L${l.level}: draw and throw wait`).toBe(true);
    }
    expect(beatsOf(lessonFor(10)!).some((b) => b.idleOnly)).toBe(true);
  });

  it('level 2: without the 8, the strengthen is lit with the strongest card, never a 3', () => {
    const l = lessonFor(2)!;
    let s = lessonOpening(l);
    s = apply(s, legalActions(viewFor(s, 0)).find((a) => a.t === 'Draw' && a.from === 'deck')!);
    // The 8 goes somewhere else first.
    const eight = s.hands[0].find((c) => c.rank === 8)!.id;
    s = apply(s, legalActions(viewFor(s, 0)).find((a) => a.t === 'Sprout' && a.card === eight && coordKey(a.coord) !== '-1,1')!);
    s = apply(s, legalActions(viewFor(s, 0)).find((a) => a.t === 'EndAct') ?? legalActions(viewFor(s, 0))[0]!);
    while (s.phase !== 'GAME_OVER' && !(s.actor === 0 && s.phase === 'ACT')) s = apply(s, s.actor === 0 ? suggestMove(l, s)! : opponentMove(l, s));
    const m = suggestMove(l, s);
    expect(m?.t).toBe('Sprout');
    const rank = (id: number) => s.hands[0].find((c) => c.id === id)!.rank;
    const strongest = Math.max(...legalActions(viewFor(s, 0)).filter((a) => a.t === 'Sprout' && coordKey(a.coord) === '-1,1').map((a) => rank((a as { card: number }).card)));
    expect(rank((m as { card: number }).card)).toBe(strongest);
    expect(strongest).toBeGreaterThan(3);
  });

  it('the end-of-turn step is always an action line, never a bare » or a lone word', () => {
    const ends = beatsOf(lessonFor(1)!).filter((b) => b.id === 'end');
    expect(ends.length).toBeGreaterThan(0);
    for (const b of ends) { expect(b.say).toBe(LESSON.tapThrow); expect(b.line).toBeUndefined(); }
  });

  it('every beat says a short action line of at most three words, and no explanation lives on a fadable beat', () => {
    // Owner, 2026-10-20: three words at most on the display; a lone » key name is still a line
    // ("TAP »"), but a bare word never is.
    const nWords = (t: string) => t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    for (const l of LESSONS) {
      for (const b of beatsOf(l)) {
        if (b.say) {
          expect(nWords(b.say), `L${l.level} ${b.id}: ${b.say}`).toBeGreaterThanOrEqual(1);
          expect(nWords(b.say), `L${l.level} ${b.id}: ${b.say}`).toBeLessThanOrEqual(3);
        }
        if (!b.explain && !b.status && !b.hello) expect(b.line, `L${l.level} ${b.id}`).toBeUndefined();
      }
    }
  });

  it('the Grow, Throw and first-draw explanations appear on their own beats, once', () => {
    const l1 = lessonFor(1)!;
    const beats = beatsOf(l1);
    const line = (id: string) => beats.find((b) => b.id === id)?.line;
    expect(line('1:idea:first-grow')).toBe(LESSON.growLine);
    expect(line('1:idea:first-throw')).toBe(LESSON.throwLine);
    expect(line('1:intro:first-draw')).toBe(LESSON.tapDrawLine);
    // Each is an explanation: the box, not the display. The display never carries an action here;
    // during level 1's opening it scrolls the welcome instead (owner, 2026-10-22).
    for (const id of ['1:idea:first-grow', '1:idea:first-throw', '1:intro:first-draw']) {
      const b = beats.find((x) => x.id === id)!;
      expect(b.explain, id).toBe(true);
      expect(b.say, id).toBe(id === '1:intro:first-draw' ? LESSON.welcome : undefined);
    }
  });

  it('a Bloom is two steps: tap Bloom to pick it, then tap the lit tiles', () => {
    for (const n of [5, 9]) {
      const l = lessonFor(n)!;
      let s = lessonOpening(l);
      for (let i = 0; i < 40 && !(s.phase === 'ACT' && suggestMove(l, s)?.t === 'Bloom'); i++) s = apply(s, suggestMove(l, s)!);
      const seen = new Set(LESSONS.flatMap((x) => x.intro.map((w) => `${x.level}:intro:${w}`)));
      const pick = lessonBeat(l, s, { card: null, placing: null, throwPending: null, seen })!;
      expect(pick.say, `L${n} pick`).toBe(LESSON.tapBloom);
      expect(pick.lit.t).toBe('bloom');
      const place = lessonBeat(l, s, { card: null, placing: 'bloom', throwPending: null, seen })!;
      expect(place.say, `L${n} place`).toBe(LESSON.tapTiles);
      expect(place.lit.t).toBe('hexes');
    }
  });
});

describe('the light never points at » while a power is playable', () => {
  const ALL_POWERS = new Set(['bloom', 'bomb', 'blast'] as const);
  const powers = (legal: readonly Action[]) =>
    legal.flatMap((a) => a.t === 'Bloom' ? ['bloom'] : a.t === 'PlayFruit' ? ['bomb'] : a.t === 'MegaBomb' ? ['blast'] : []);
  const fallback = (s: State): Action | null => {
    const legal = legalActions(viewFor(s, 0));
    return legal.find((a) => a.t === 'EndAct') ?? legal.find((a) => a.t === 'Discard') ?? legal[0] ?? null;
  };
  const litChoice = (lesson: Lesson, s: State): Action | null => {
    const beat = lessonBeat(lesson, s, { card: null, placing: null, throwPending: null, seen: new Set(), powerSeen: ALL_POWERS });
    if (!beat || beat.explain) return suggestMove(lesson, s) ?? fallback(s);
    if (beat.lit.t === 'deck') return legalActions(viewFor(s, 0)).find((a) => a.t === 'Draw' && a.from === 'deck') ?? null;
    if (beat.lit.t === 'discard') return legalActions(viewFor(s, 0)).find((a) => a.t === 'Draw' && a.from === 'discard') ?? null;
    if (beat.lit.t === 'end') return legalActions(viewFor(s, 0)).find((a) => a.t === 'EndAct') ?? null;
    return suggestMove(lesson, s) ?? fallback(s);
  };

  it('following the light, playing randomly, and tapping only the lit target all keep it true', () => {
    for (const lesson of LESSONS) {
      for (const [name, choose] of [
        ['follower', (s: State) => suggestMove(lesson, s) ?? fallback(s)],
        ['random', (() => { const rand = mulberry32(lesson.level * 1009); return (s: State) => {
          const legal = legalActions(viewFor(s, 0));
          return legal[Math.floor(rand() * legal.length)] ?? null;
        }; })()],
        ['lit target', (s: State) => litChoice(lesson, s)],
      ] as const) {
        let s = lessonOpening(lesson);
        for (let i = 0; i < 700 && s.phase !== 'GAME_OVER'; i++) {
          if (s.actor === 0) {
            // The powers the page offers (none before the level that teaches each one).
            const legal = lessonLegal(lesson, s);
            if (powers(legal).length) {
              const beat = lessonBeat(lesson, s, { card: null, placing: null, throwPending: null, seen: new Set(), powerSeen: ALL_POWERS });
              expect(beat?.lit.t, `L${lesson.level} ${name} beat`).not.toBe('end');
              expect(suggestMove(lesson, s)?.t, `L${lesson.level} ${name} move`).not.toBe('EndAct');
            }
            const a = choose(s);
            if (!a) break;
            s = apply(s, a);
          } else s = apply(s, opponentMove(lesson, s));
        }
        expect(s.phase, `L${lesson.level} ${name} finished`).toBe('GAME_OVER');
      }
    }
  });
});

describe('per-action mastery fade', () => {
  afterEach(() => { vi.useRealTimers(); });

  const tier = (
    m: ReturnType<typeof freshMastery>,
    level: number,
    kind: Parameters<typeof displayTier>[0]['kind'],
    extra: Partial<Parameters<typeof displayTier>[0]> = {},
  ) => displayTier({
    mastery: m, level, kind, newActions: lessonFor(level)?.newActions ?? [], ...extra,
  });

  it('a repeated action walks SPOTLIGHT → GUIDE → WHISPER → SILENT', () => {
    expect([0, 1, 2, 3, 9].map(tierOf)).toEqual(['spotlight', 'guide', 'whisper', 'silent', 'silent']);
    let m = freshMastery();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(tier(m, 1, 'draw'));
      m = recordAction(m, 'draw', { level: 1, tier: tier(m, 1, 'draw') });
    }
    expect(seen).toEqual(['spotlight', 'guide', 'whisper', 'silent']);
    // The window fades with it: a whisper is one word, silence is the calm neutral state.
    const beat = lessonBeat(lessonFor(1)!, apply(lessonOpening(lessonFor(1)!), { t: 'Draw', from: 'deck' }), {
      card: null, placing: null, throwPending: null, seen: new Set(['1:intro:tree', '1:intro:their-home', '1:intro:first-draw', '1:idea:first-grow']),
    });
    expect(beat?.say).toBe(LESSON.chooseCard);
    expect(presentedLessonBeat(beat, 'whisper')?.say).toBe(LESSON.chooseCard);
    expect(presentedLessonBeat(beat, 'whisper')?.line).toBeUndefined();
    expect(presentedLessonBeat(beat, 'silent')).toBeNull();
    expect(presentedLessonBeat(beat, 'spotlight')?.say).toBe(beat?.say);
  });

  it('L2-L9 spend at most one new-idea spotlight; L1 may show its three', () => {
    const l2 = lessonFor(2)!;
    let m = freshMastery();
    expect(tier(m, 2, 'strengthen')).toBe('spotlight');
    m = recordAction(m, 'strengthen', { level: 2, tier: 'spotlight', newActions: l2.newActions });
    // Take over is also new in L2, but the level's one spotlight is spent.
    expect(tier(m, 2, 'take')).toBe('guide');
    // A repeat action is never a spotlight, and after L1 nothing can force one back.
    expect(tier(m, 2, 'strengthen', { escalation: true })).toBe('guide');
    for (const kind of ['draw', 'grow', 'throw'] as const) expect(tier(freshMastery(), 1, kind)).toBe('spotlight');
    expect(tier(freshMastery(), 10, 'bloom')).not.toBe('spotlight');
  });

  it('escalation lasts only for that moment; a wrong tap never resets mastery', () => {
    let m = recordAction(recordAction(recordAction(freshMastery(), 'draw', { level: 1, tier: 'guide' }), 'draw', { level: 1, tier: 'guide' }), 'draw', { level: 1, tier: 'guide' });
    expect(tier(m, 1, 'draw')).toBe('silent');
    expect(tier(m, 1, 'draw', { escalation: true })).toBe('whisper');
    // No escalation on the next look, and the count is untouched.
    expect(tier(m, 1, 'draw')).toBe('silent');
    expect(m.counts.draw).toBe(3);
    let two = recordAction(freshMastery(), 'grow', { level: 1, tier: 'guide' });
    two = recordAction(two, 'grow', { level: 1, tier: 'guide' });
    expect(tier(two, 1, 'grow')).toBe('whisper');
    expect(tier(two, 1, 'grow', { escalation: true })).toBe('guide');
    expect(tier(two, 2, 'grow', { escalation: true })).toBe('guide');
  });

  it('the safety net is 6 s whisper, 12 s guide, 20 s light guide (with fake timers)', () => {
    vi.useFakeTimers();
    const stages: number[] = [];
    const watch = createIdleWatch((s) => stages.push(s));
    watch.reset();
    vi.advanceTimersByTime(5_999);
    expect(stages).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(stages).toEqual([1]);
    vi.advanceTimersByTime(6_000);
    expect(stages).toEqual([1, 2]);
    vi.advanceTimersByTime(8_000);
    expect(stages).toEqual([1, 2, 3]);
    // Any touch restarts it.
    watch.reset();
    vi.advanceTimersByTime(6_000);
    expect(stages).toEqual([1, 2, 3, 1]);
    watch.stop();
  });

  it('the lesson version is bumped, so explain-once and mastery start clean', () => {
    expect(LESSON_VERSION).toBe(3);
    // Level 1 was re-issued at version 4 (2026-10-24) when it stopped offering Overgrow: an
    // unfinished pre-fix level-1 save must restart, never resume under the old, taking-enabled
    // rules. Every other lesson keeps the shared version, so their saves and teaching are untouched.
    for (const l of LESSONS) expect(l.version, `L${l.level}`).toBe(l.level === 1 ? LESSON_VERSION + 1 : LESSON_VERSION);
    // Saves round-trip under that version; a record from another version is ignored.
    const saved = encodeMastery(recordHello(recordAction(freshMastery(), 'draw', { level: 1, tier: 'guide' }), 'bloom'));
    const read = decodeMastery(saved, LESSON_VERSION);
    expect(read.counts.draw).toBe(1);
    expect(read.hellos).toEqual(['bloom']);
    expect(decodeMastery(saved, LESSON_VERSION + 1)).toEqual(freshMastery(LESSON_VERSION + 1));
    expect(decodeMastery('{not json', LESSON_VERSION)).toEqual(freshMastery());
  });

  it('a new power hello fires once per power and never again', () => {
    const l10 = lessonFor(10)!;
    const seen = (...powers: ('bloom' | 'bomb' | 'blast')[]) => new Set(powers);
    const baseCtx = { card: null, placing: null, throwPending: null, seen: new Set<string>() };
    // L10's authored hand holds three 5s: Bloom is legal on the first acting turn.
    const bloomState = apply(lessonOpening(l10), { t: 'Draw', from: 'deck' });
    const bloom = lessonBeat(l10, bloomState, { ...baseCtx, powerSeen: seen() });
    expect(bloom?.hello).toBe('bloom');
    expect(bloom?.say).toBe(LESSON.bloomHello);
    // A Bomb becomes legal once an enemy tile touches our network. With Bloom's hello remembered,
    // the Bomb's own hello fires (once).
    const bombReady = {
      ...bloomState,
      board: { ...bloomState.board, '0,0': { owner: 1 as const, strength: 5 } },
    };
    const bomb = lessonBeat(l10, bombReady, { ...baseCtx, powerSeen: seen('bloom') });
    expect(bomb?.hello).toBe('bomb');
    // Two Bombs in L8's opening, read under L10's rules: a Blast hello.
    const l8 = lessonFor(8)!;
    const blastState = apply(lessonOpening(l8), { t: 'Draw', from: 'deck' });
    const blast = lessonBeat(l10, blastState, { ...baseCtx, powerSeen: seen('bloom', 'bomb') });
    expect(blast?.hello).toBe('blast');
    // Remembered means silent, not repeated.
    expect(lessonBeat(l10, bloomState, { ...baseCtx, powerSeen: seen('bloom', 'bomb', 'blast') })).toBeNull();
    let m = freshMastery();
    m = recordHello(recordHello(m, 'bloom'), 'bloom');
    expect(m.hellos).toEqual(['bloom']);
  });
});

describe('the first turn is the only locked one', () => {
  it('L1-L3 lock the first turn only; L4+ never lock', () => {
    for (const lesson of LESSONS.filter((l) => l.level <= 3)) {
      let s = lessonOpening(lesson);
      expect(lessonLocked(lesson, s), `L${lesson.level} turn 1`).toBe(true);
      s = apply(s, { t: 'Draw', from: 'deck' });
      expect(lessonLocked(lesson, s), `L${lesson.level} after draw`).toBe(true);
      s = apply(s, suggestMove(lesson, s)!);
      if (s.phase === 'ACT') s = apply(s, suggestMove(lesson, s)!);
      if (s.phase === 'ACT') s = apply(s, { t: 'EndAct' });
      const throwId = s.hands[0][0]!.id;
      s = apply(s, { t: 'Discard', card: throwId });
      expect(lessonLocked(lesson, s), `L${lesson.level} turn 2`).toBe(false);
    }
    for (const lesson of LESSONS.filter((l) => l.level >= 4)) {
      expect(lessonLocked(lesson, lessonOpening(lesson)), `L${lesson.level}`).toBe(false);
    }
  });
});

describe('the lesson’s two voices (display + info box)', () => {
  const base = { stuck: false, answer: null as string | null, restartLine: LESSON.restartLine };

  it('an explanation goes in the box; the display keeps the score', () => {
    expect(lessonVoiceFor({ ...base, beat: { line: 'This is your home.' } }))
      .toEqual({ box: 'This is your home.', display: null, restart: false });
  });

  it('an action goes on the display; the box stays empty', () => {
    expect(lessonVoiceFor({ ...base, beat: { say: LESSON.tapDraw } }))
      .toEqual({ box: null, display: LESSON.tapDraw, restart: false });
  });

  it('a notification brings its own explanation, never the same words twice', () => {
    const voice = lessonVoiceFor({ ...base, beat: { say: LESSON.lastTurn, line: LESSON.lastTurnLine } });
    expect(voice).toEqual({ box: LESSON.lastTurnLine, display: LESSON.lastTurn, restart: false });
    expect(voice.box).not.toBe(voice.display);
  });

  it('a wrong tap owns the display and never the box', () => {
    expect(lessonVoiceFor({ ...base, beat: { say: LESSON.tapDraw }, answer: 'TOO WEAK: 2 VS 4' }))
      .toEqual({ box: null, display: 'TOO WEAK: 2 VS 4', restart: false });
  });

  it('a lesson that cannot finish explains it and offers START AGAIN in the box, no display label', () => {
    // Owner, 2026-10-22: the way out is one tap that restarts the level in place, never a trip to
    // the menu. It is the ONE button the box ever holds, and only while the lesson is stuck.
    expect(lessonVoiceFor({ ...base, stuck: true, beat: { line: 'x' } }))
      .toEqual({ box: LESSON.restartLine, display: null, restart: true });
    expect(LESSON.restartLine).not.toMatch(/menu/i);
    expect(LESSON.startAgain).toBe('START AGAIN');
  });

  it('a silent step says nothing at all (no empty box, no display text)', () => {
    expect(lessonVoiceFor({ ...base, beat: null })).toEqual({ box: null, display: null, restart: false });
  });
});

describe('level 1 teaches the tile’s rank and the pile count once', () => {
  it('right after the first Grow the PLACED TILE is lit (not the score); at the last cards the Draw pile and its count are lit', () => {
    const l = lessonFor(1)!;
    let s = lessonOpening(l);
    const seen = new Set<string>();
    const lits: Record<string, string> = {};
    let grewAt: { key: string; owner: number | null; strength: number; litKey: string } | null = null;
    for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
      if (s.actor === 0) {
        const b = lessonBeat(l, s, { card: null, placing: null, throwPending: null, seen });
        if (b?.explain) {
          lits[b.id] = b.lit.t;
          // The grow explanation must point at the tile that was just placed: the newest Sprout
          // in my history. Owner, 2026-10-20: it used to light the score display instead.
          if (b.id === '1:grew' && b.lit.t === 'hex') {
            const sprout = [...(s.history ?? [])].reverse()
              .find((e): e is Extract<Event, { t: 'Sprout' }> => e.t === 'Sprout' && e.player === 0);
            const tile = s.board[b.lit.key];
            grewAt = {
              key: sprout ? coordKey(sprout.coord) : '',
              owner: tile ? tile.owner : null,
              strength: tile ? tile.strength : -1,
              litKey: b.lit.key,
            };
          }
          seen.add(b.id);
          continue;
        }
        const a = suggestMove(l, s);
        const legal = legalActions(viewFor(s, 0));
        s = apply(s, a ?? legal.find((x) => x.t === 'EndAct') ?? legal[0]!);
      } else s = apply(s, opponentMove(l, s));
    }
    expect(lits['1:grew']).toBe('hex');
    expect(lits['1:grew']).not.toBe('score');
    expect(grewAt).not.toBeNull();
    // The lit hex IS the tile the Sprout placed, it is mine, and its number is the card's rank.
    expect(grewAt!.litKey).toBe(grewAt!.key);
    expect(grewAt!.owner).toBe(0);
    expect(grewAt!.strength).toBeGreaterThanOrEqual(1);
    expect(lits['1:pile-low']).toBe('deckCount');
    // Only level 1 lights them: the other lessons never do.
    for (const other of LESSONS.filter((x) => x.level > 1)) {
      let t = lessonOpening(other);
      const seen2 = new Set<string>();
      for (let i = 0; i < 400 && t.phase !== 'GAME_OVER'; i++) {
        if (t.actor === 0) {
          const b = lessonBeat(other, t, { card: null, placing: null, throwPending: null, seen: seen2 });
          expect(['score', 'deckCount']).not.toContain(b?.lit.t);
          if (b?.explain) { seen2.add(b.id); continue; }
          const a = suggestMove(other, t);
          const legal = legalActions(viewFor(t, 0));
          t = apply(t, a ?? legal.find((x) => x.t === 'EndAct') ?? legal[0]!);
        } else t = apply(t, opponentMove(other, t));
      }
    }
  });
});
