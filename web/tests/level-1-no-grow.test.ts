// LEVEL 1 — the first level must not permit taking the opponent's tile.
//
// The owner's report: level 1's opponent barely moves, so once a player discovered Grow they could
// take its only grown tile long before level 2 explains that a stronger tile may take a weaker one.
// Level 1 now withholds Overgrow in its lesson data. This suite drives the REAL level-1 opening and
// the REAL scripted opponent, and checks both the engine's legal moves and the affordances the page
// derives from them. Level 2, which teaches taking, must still allow it.
import { describe, expect, it } from 'vitest';
import { apply, claimBlocker, coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { LESSON } from '../../src/strings.js';
import {
  goalDone, lessonFor, lessonLegal, lessonOpening, suggestMove,
} from '../src/lessons/lessons.js';
import type { Lesson } from '../src/lessons/lessons.js';
import { scriptedOpponentAction } from '../src/lessons/opponent.js';
import { tapAnswer } from '../src/lessons/answer.js';
import { targetHexes, targetKinds } from '../src/logic/interaction.js';
import type { Sel } from '../src/logic/interaction.js';
import { intelTips } from '../src/logic/intel-guide.js';
import { howToReferenceHtml } from '../src/logic/howto-reference.js';

const YOU = 0 as const;
const THEM = 1 as const;
const L1 = lessonFor(1)!;
const L2 = lessonFor(2)!;

const opponentMove = (lesson: Lesson, s: State): Action => {
  if (!('script' in lesson.opponent)) throw new Error('this suite only uses scripted lessons');
  return scriptedOpponentAction(s, lesson.opponent.script)!;
};

const cardOf = (s: State, id: number) => s.hands[YOU].find((c) => c.id === id)!;

/** Every legal growth of mine that would land on their ground (Sprout or Bloom). */
const growthOnTheirGround = (s: State, legal = legalActions(viewFor(s, YOU))): Action[] =>
  legal.filter((a) =>
    a.t === 'Sprout' ? s.board[coordKey(a.coord)]?.owner === THEM
    : a.t === 'Bloom' ? a.hexes.some((h) => s.board[coordKey(h)]?.owner === THEM)
    : false,
  );

/** A deterministic player turn: grow on the named hexes in order, else end; throw the lowest card. */
const myTurn = (s: State, targets: string[]): State => {
  let x = s;
  let next = 0;
  for (let guard = 0; guard < 30 && x.phase !== 'GAME_OVER' && x.actor === YOU; guard++) {
    const legal = legalActions(viewFor(x, YOU));
    if (x.phase === 'DRAW') { x = apply(x, legal.find((a) => a.t === 'Draw' && a.from === 'deck')!); continue; }
    if (x.phase === 'DISCARD') {
      const throws = legal.filter((a): a is Extract<Action, { t: 'Discard' }> => a.t === 'Discard');
      throws.sort((a, b) => cardOf(x, a.card).rank - cardOf(x, b.card).rank || a.card - b.card);
      x = apply(x, throws[0]!); continue;
    }
    if (x.phase === 'ACT') {
      const target = targets[next];
      const grow = target ? legal.find((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout' && coordKey(a.coord) === target) : undefined;
      if (grow) { x = apply(x, grow); next++; continue; }
      x = apply(x, legal.find((a) => a.t === 'EndAct')!); continue;
    }
    break;
  }
  return x;
};

const botTurn = (s: State, lesson: Lesson): State => {
  let x = s;
  for (let i = 0; i < 20 && x.phase !== 'GAME_OVER' && x.actor === THEM; i++) {
    x = apply(x, opponentMove(lesson, x));
  }
  return x;
};

describe('level 1: taking their tile is impossible, not merely hidden', () => {
  it('the level withholds Overgrow in its lesson data, and no other lesson does', () => {
    expect(L1.position.seed).toBe(96001);
    expect(L1.position.rules?.allowOvergrow).toBe(false);
    expect(lessonOpening(L1).config.allowOvergrow).toBe(false);
    for (const lesson of [L2, lessonFor(3)!, lessonFor(10)!]) {
      expect(lesson.position.rules?.allowOvergrow, `L${lesson.level}`).toBeUndefined();
      expect(lessonOpening(lesson).config.allowOvergrow, `L${lesson.level}`).toBe(true);
    }
  });

  it('the exact reported line is refused: the bot grows at 1,-1 and the player cannot take it', () => {
    // Turn 1: grow (-1,1). Bot 1 does not grow on its first turn. Turn 2: grow (0,0). Bot 2 now
    // grows its one tile, at 1,-1 strength 2. Turn 3: the player used to be able to Grow over it.
    let s = lessonOpening(L1);
    s = myTurn(s, ['-1,1']);
    expect(s.actor).toBe(THEM);
    s = botTurn(s, L1);
    s = myTurn(s, ['0,0']);
    expect(s.actor).toBe(THEM);
    s = botTurn(s, L1);
    expect(s.board['1,-1']).toEqual({ owner: THEM, strength: 2 });
    s = apply(s, { t: 'Draw', from: 'deck' });

    const legal = legalActions(viewFor(s, YOU));
    expect(legal.filter((a) => a.t === 'Sprout' && coordKey(a.coord) === '1,-1')).toHaveLength(0);
    expect(growthOnTheirGround(s, legal)).toHaveLength(0);
    expect(claimBlocker(viewFor(s, YOU), YOU, { q: 1, r: -1 }, 9)).toBe('OVERGROW_FORBIDDEN');

    // Even a forced call is refused by the engine and changes nothing.
    const forced = { t: 'Sprout' as const, card: s.hands[YOU].find((c) => c.rank > 2)!.id, coord: { q: 1, r: -1 } };
    expect(() => apply(s, forced)).toThrow(/OVERGROW_FORBIDDEN/);
    expect(s.board['1,-1']).toEqual({ owner: THEM, strength: 2 });

    // The page has nothing to offer there: that hex is not a target, and a tap says why.
    const v = viewFor(s, YOU);
    for (const c of s.hands[YOU]) {
      const sel: Sel = { card: c.id, hex: null, kind: null, option: 0 };
      expect(targetHexes(v, legal, sel).has('1,-1'), `card ${c.id}`).toBe(false);
    }
    expect(tapAnswer(s, forced.card, { t: 'hex', key: '1,-1' })).toBe(LESSON.theirTileSafe);
  });

  it('does not invite it in the Tips tab or the How-to reference; level 2 still does', () => {
    const v1 = viewFor(lessonOpening(L1), YOU);
    expect(intelTips(v1).map((t) => t.id)).not.toContain('stronger');
    expect(howToReferenceHtml(v1.config)).not.toMatch(/can overgrow/);
    const v2 = viewFor(lessonOpening(L2), YOU);
    expect(intelTips(v2).map((t) => t.id)).toContain('stronger');
    expect(howToReferenceHtml(v2.config)).toMatch(/can overgrow/);
  });

  it('following the light still wins level 1, and never lights their ground', () => {
    let s = lessonOpening(L1);
    for (let i = 0; i < 400 && s.phase !== 'GAME_OVER'; i++) {
      if (s.actor === YOU) {
        const v = viewFor(s, YOU);
        const engine = legalActions(v);
        expect(growthOnTheirGround(s, engine), `turn ${s.turnNumber}`).toHaveLength(0);
        // Both the engine's list and the lesson's narrowed offer: no target on their tile, and no
        // "replace" affordance for any card in the fan (this is what the board renders).
        for (const c of s.hands[YOU]) {
          const sel: Sel = { card: c.id, hex: null, kind: null, option: 0 };
          for (const key of targetHexes(v, engine, sel)) expect(s.board[key]?.owner, `turn ${s.turnNumber} ${key}`).not.toBe(THEM);
          for (const key of targetHexes(v, lessonLegal(L1, s), sel)) expect(s.board[key]?.owner, `offered ${key}`).not.toBe(THEM);
          for (const [key, kind] of targetKinds(v, engine, sel)) {
            expect(kind, `turn ${s.turnNumber} ${key}`).not.toBe('replace');
          }
        }
        const a = suggestMove(L1, s);
        if (!a) { s = apply(s, engine.find((x) => x.t === 'EndAct') ?? engine[0]!); continue; }
        s = apply(s, a);
      } else {
        s = apply(s, opponentMove(L1, s));
      }
    }
    expect(s.phase).toBe('GAME_OVER');
    expect(s.result?.winner, JSON.stringify(s.result)).toBe(0);
    expect(goalDone({ t: 'grow' }, s)).toBe(true);
  });
});

describe('level 2 still teaches taking, exactly as before', () => {
  it('offers the Grow onto their 0,0 with the 8, and the page shows the "replace" target', () => {
    let s = apply(lessonOpening(L2), { t: 'Draw', from: 'deck' });
    const legal = legalActions(viewFor(s, YOU));
    const take = legal.find((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout' && coordKey(a.coord) === '0,0');
    expect(take).toBeDefined();
    expect(s.board['0,0']).toEqual({ owner: THEM, strength: 4 });
    expect(cardOf(s, take!.card).rank).toBe(8);
    const v = viewFor(s, YOU);
    const sel: Sel = { card: take!.card, hex: null, kind: null, option: 0 };
    expect(targetHexes(v, legal, sel).has('0,0')).toBe(true);
    expect(targetKinds(v, legal, sel).get('0,0')).toBe('replace');
    const after = apply(s, take!);
    expect(after.board['0,0']).toEqual({ owner: YOU, strength: 8 });
    expect(after.history?.at(-1)).toMatchObject({ t: 'Overgrow', player: YOU, coord: { q: 0, r: 0 }, oldOwner: THEM });
  });
});
