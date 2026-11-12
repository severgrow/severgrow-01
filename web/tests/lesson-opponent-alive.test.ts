// THE OPPONENT FEELS LIKE AN OPPONENT (owner, 2026-11-04: "new beta testers [say] levels 2-9 feel
// broken because the ai opp is not doing much - make sure it makes more actions especially from
// lesson 4 onwards, so player feel like there's opponent ... Don't change much but improve that in a
// very smart way not breaking anything").
//
// Measured before the change (casual player, 200 games a level): levels 2-8 grew exactly one tile
// every turn and never more; level 9's real bot (level 4) did NOTHING on 39% of its turns, a
// deliberate "laziness" dial tuned for the campaign ladder. Owner, later the same day: "Remove the
// skipping growth in all levels really": that fix lives in the bots (tests/bots/keeps-growing.test.ts).
import { chooseKeepsGrowing } from '../../src/bots/keeps-growing.js';
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, mulberry32, neighbors, scores, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CURRENT_BOT_VERSION, chooseBotAction } from '../../src/bots/versions.js';
import { LESSONS, lessonFor, lessonLegal, lessonOpening, suggestMove } from '../src/lessons/lessons.js';
import type { Lesson } from '../src/lessons/lessons.js';
import { lessonOpponentAction } from '../src/lessons/opponent.js';

const boardMove = (a: Action) => a.t === 'Sprout' || a.t === 'Bloom' || a.t === 'PlayFruit' || a.t === 'MegaBomb';

type Turn = { board: number; blooms: number; couldAct: boolean; first: Action | null; before: State };

/** Plays a lesson; returns every opponent turn: how many board moves, and whether it could move. */
const opponentTurns = (lesson: Lesson, me: (s: State) => Action, guard = 800): { turns: Turn[]; end: State } => {
  let s = lessonOpening(lesson);
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  for (let i = 0; i < guard && s.phase !== 'GAME_OVER'; i++) {
    if (s.actor === 1) {
      if (s.phase === 'ACT' && !cur) {
        cur = { board: 0, blooms: 0, couldAct: legalActions(viewFor(s, 1)).some(boardMove), first: null, before: s };
        turns.push(cur);
      }
      const a = lessonOpponentAction(lesson, s);
      if (cur && boardMove(a)) { cur.board++; if (a.t === 'Bloom') cur.blooms++; cur.first ??= a; }
      s = apply(s, a);
      if (a.t === 'Discard') cur = null;
    } else {
      s = apply(s, me(s));
    }
  }
  return { turns, end: s };
};

const casual = (lesson: Lesson, seed: number) => {
  const rand = mulberry32(seed * 131 + lesson.level);
  return (s: State): Action => {
    const offered = s.phase === 'ACT' ? lessonLegal(lesson, s) : legalActions(viewFor(s, 0));
    const grows = offered.filter(boardMove);
    if (s.phase === 'ACT' && grows.length && rand() < .8 && !s.sproutsThisTurn) return grows[Math.floor(rand() * grows.length)]!;
    return offered.find((a) => a.t === 'EndAct') ?? offered[Math.floor(rand() * offered.length)]!;
  };
};
const guided = (lesson: Lesson) => (s: State): Action =>
  suggestMove(lesson, s) ?? (legalActions(viewFor(s, 0)).find((a) => a.t === 'EndAct') ?? legalActions(viewFor(s, 0))[0]!);

describe('the opponent always takes its turn', () => {
  it('level 9: the real bot never ends a turn having done nothing while it could move', () => {
    const l9 = lessonFor(9)!;
    let turns = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const t of opponentTurns(l9, casual(l9, seed)).turns) {
        turns++;
        if (t.couldAct) expect(t.board, `L9 seed ${seed} turn ${t.before.turnNumber}`).toBeGreaterThan(0);
      }
    }
    expect(turns).toBeGreaterThan(200);
  });

  it('levels 9 and 10 play the real bot of the current version (never skips its grow, since bots-v0.11)', () => {
    expect(lessonFor(9)!.opponent).toEqual({ bot: 4 });
    expect(lessonFor(10)!.opponent).toEqual({ bot: 1 });
    // bots-v0.12 (2026-11-12) added the rivals on top of v0.11's rule; the current chooser still keeps growing.
    expect(CURRENT_BOT_VERSION).toBe('bots-v0.12');
    expect(chooseBotAction).toBe(chooseKeepsGrowing);
  });

  it('levels 1-3 keep exactly the opponent they had', () => {
    expect(lessonFor(1)!.opponent).toEqual({ script: { growOn: [2] } });
    expect(lessonFor(2)!.opponent).toEqual({ script: { avoid: ['0,0'] } });
    expect(lessonFor(3)!.opponent).toEqual({ script: { prefer: ['0,0'] } });
  });
});

describe('from level 4 it plays like someone across the table', () => {
  const SCRIPTED = LESSONS.filter((l) => l.level >= 4 && 'script' in l.opponent);

  it('it heads for your land: its grow lands next to your tiles whenever such a grow is open', () => {
    let contested = 0;
    for (const l of SCRIPTED) {
      for (let seed = 1; seed <= 8; seed++) {
        for (const t of opponentTurns(l, casual(l, seed)).turns) {
          const a = t.first;
          if (!a || a.t !== 'Sprout' || t.before.board[coordKey(a.coord)]) continue; // a strengthen or take
          const touchesYou = (c: { q: number; r: number }) => neighbors(c, t.before.config.boardRadius).some((n) => t.before.board[coordKey(n)]?.owner === 0);
          const open = legalActions(viewFor(t.before, 1)).some((x) => x.t === 'Sprout' && !t.before.board[coordKey(x.coord)] && touchesYou(x.coord));
          if (open && touchesYou(a.coord)) contested++;
          // never further from you than it needs to be
          if (open) expect(touchesYou(a.coord), `L${l.level} seed ${seed} ${coordKey(a.coord)}`).toBe(true);
        }
      }
    }
    expect(contested).toBeGreaterThan(20);
  });

  it('from level 5 (where Bloom is taught) it Blooms too when it can afford to: a turn of two moves', () => {
    // A Bloom never puts it level with you or ahead (see the next test), so it blooms when you lead
    // by enough: following the light, levels 7 and 8 see it; a casual player sees it in levels 6-8 now and then. Level 5
    // is YOUR Bloom lesson: you never lead by enough there, so it never upstages you with one.
    const twoMoves = (l: Lesson, me: (s: State) => Action) => opponentTurns(l, me).turns.some((t) => t.blooms > 0 && t.board >= 2);
    for (const level of [7, 8]) expect(twoMoves(lessonFor(level)!, guided(lessonFor(level)!)), `L${level} guided`).toBe(true);
    let seen = 0;
    for (const l of SCRIPTED.filter((x) => x.level >= 6)) seen += Array.from({ length: 40 }, (_, i) => twoMoves(l, casual(l, i + 1))).filter(Boolean).length;
    expect(seen, 'casual games in levels 6-8 with a two-move turn').toBeGreaterThan(5);
  });

  it('a Bloom never puts it level with you or ahead on points: the lesson stays yours to win', () => {
    for (const l of SCRIPTED.filter((x) => x.level >= 5)) {
      for (let seed = 1; seed <= 20; seed++) {
        let s = lessonOpening(l);
        const me = casual(l, seed);
        for (let i = 0; i < 800 && s.phase !== 'GAME_OVER'; i++) {
          const a = s.actor === 1 ? lessonOpponentAction(l, s) : me(s);
          const next = apply(s, a);
          if (s.actor === 1 && a.t === 'Bloom') { const [you, it] = scores(next); expect(it, `L${l.level} seed ${seed}`).toBeLessThan(you); }
          s = next;
        }
      }
    }
  });

  it('never shows a power before the lesson teaches it: no Bloom in level 4', () => {
    const l4 = lessonFor(4)!;
    for (let seed = 1; seed <= 20; seed++) {
      expect(opponentTurns(l4, casual(l4, seed)).turns.every((t) => t.blooms === 0)).toBe(true);
    }
  });

  it('a Bloom only lands on open ground on its own side of the fight: it never takes your tiles', () => {
    for (const l of SCRIPTED.filter((x) => x.level >= 5)) {
      for (let seed = 1; seed <= 10; seed++) {
        let s = lessonOpening(l);
        const me = casual(l, seed);
        for (let i = 0; i < 800 && s.phase !== 'GAME_OVER'; i++) {
          const a = s.actor === 1 ? lessonOpponentAction(l, s) : me(s);
          if (s.actor === 1 && a.t === 'Bloom') for (const h of a.hexes) expect(s.board[coordKey(h)] ?? null, `L${l.level} ${coordKey(h)}`).toBeNull();
          s = apply(s, a);
        }
      }
    }
  });

  it('it still never comes near a lesson\'s key hex', () => {
    for (const l of SCRIPTED) {
      if (!('script' in l.opponent)) continue;
      const avoid = new Set(l.opponent.script.avoid ?? []);
      if (!avoid.size) continue;
      for (const t of opponentTurns(l, guided(l)).turns) {
        if (t.first?.t === 'Sprout') expect(avoid.has(coordKey(t.first.coord))).toBe(false);
      }
    }
  });
});
