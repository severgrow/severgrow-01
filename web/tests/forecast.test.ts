// UI overhaul items 8 and 10: the forecast matches what the engine really does, never changes
// anything, and the Smart / Always / Never confirmation follows its rules.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, score, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State } from '../../src/engine/index.js';
import { CONFIRM_RULES, forecastMove, needsConfirm, riskReasons, rootBlocked } from '../src/logic/forecast.js';
import type { Forecast } from '../src/logic/forecast.js';
import { customBoard, playGame } from './ui-helpers.js';

const tilesOf = (s: State, p: Player) => Object.keys(s.board).filter((k) => s.board[k]?.owner === p && !s.board[k]!.root);

describe('the forecast matches the engine', () => {
  it('tiles, points, replaced, cuts on both sides: equal to the real result, in real positions', () => {
    let checked = 0;
    for (const seed of [2, 5, 9]) {
      let i = 0;
      playGame(seed, ({ after }) => {
        if (after.phase !== 'ACT' || i++ % 2) return;
        const me = after.actor;
        const opp: Player = me === 0 ? 1 : 0;
        const v = viewFor(after, me);
        const before = JSON.stringify(v);
        for (const a of legalActions(v).filter((x) => x.t === 'MeldRun' || x.t === 'MeldSet' || x.t === 'Sprout' || x.t === 'Fruit').slice(0, 12)) {
          const f = forecastMove(v, a)!;
          const real = apply(after, a);
          const mineBefore = new Set(tilesOf(after, me));
          const mineAfter = new Set(tilesOf(real, me));
          const lostMine = [...mineBefore].filter((k) => !mineAfter.has(k)).sort();
          const theirsBefore = tilesOf(after, opp);
          const theirsLost = theirsBefore.filter((k) => real.board[k]?.owner !== opp);
          expect(f.points, JSON.stringify(a)).toBe(score(real, me) - score(after, me));
          expect(f.cutMine).toEqual(lostMine);
          expect(f.cutTheirs.length + f.replaced + (a.t === 'Fruit' ? 1 : 0)).toBe(theirsLost.length);
          for (const k of f.cutTheirs) expect(real.board[k]?.owner).not.toBe(opp);
          checked++;
        }
        expect(JSON.stringify(v)).toBe(before);
      }, 400);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('throwing: only the last card is flagged', () => {
    const s = playGame(4, undefined, 3);
    const v = viewFor(s, s.actor);
    const d = { t: 'Discard', card: v.hand[0]!.id } as Action;
    expect(forecastMove(v, d)!.lastCard).toBe(v.hand.length === 1);
    expect(forecastMove({ ...v, hand: [v.hand[0]!] }, d)!.lastCard).toBe(true);
  });

  it('draws and ending the Grow step have no forecast', () => {
    const s = playGame(4, undefined, 0);
    const v = viewFor(s, s.actor);
    for (const a of legalActions(v).filter((x) => x.t === 'Draw')) expect(forecastMove(v, a)).toBeNull();
  });

  it("the root check: blocked neighbours and whether one is the opponent's", () => {
    const s = customBoard({ '-1,1': { owner: 1, strength: 3 }, '-2,1': { owner: 1, strength: 3 } });
    const r = rootBlocked(s, 0);
    expect(r.byEnemy).toBe(true);
    expect(r.blocked).toBeGreaterThanOrEqual(2);
    expect(rootBlocked(customBoard({}), 0).byEnemy).toBe(false);
  });
});

const base: Forecast = { kind: 'grow', tiles: 1, points: 1, replaced: 0, cutTheirs: [], cutMine: [], atRisk: null, atRiskBefore: 0, wins: false, lastCard: false, rootDanger: false };
const f = (o: Partial<Forecast>): Forecast => ({ ...base, ...o });

describe('Smart, Always and Never', () => {
  it('a safe move: Smart places it at once; Always asks; Never never asks', () => {
    expect(needsConfirm('smart', base)).toBe(false);
    expect(needsConfirm('always', base)).toBe(true);
    expect(needsConfirm('never', base)).toBe(false);
    expect(needsConfirm('smart', null)).toBe(false);
  });

  const risky: [string, Partial<Forecast>][] = [
    [`leaves ${CONFIRM_RULES.atRisk}+ of my tiles cuttable (and worse than before)`, { atRisk: { key: '0,0', loss: CONFIRM_RULES.atRisk }, atRiskBefore: 0 }],
    ['cuts my own tiles', { cutMine: ['0,0'] }],
    ['uses Fruit', { kind: 'fruit', cutMine: ['0,0', '1,0', '1,-1'] }],
    ['plays my last card', { lastCard: true }],
    ['makes my root easy to strangle', { rootDanger: true }],
  ];
  for (const [name, o] of risky) {
    it(`Smart asks when the move ${name}; Never does not; Always does`, () => {
      expect(needsConfirm('smart', f(o))).toBe(true);
      expect(needsConfirm('never', f(o))).toBe(false);
      expect(needsConfirm('always', f(o))).toBe(true);
      expect(riskReasons(f(o)).length).toBeGreaterThan(0);
    });
  }

  it('not risky: a smaller cut than the threshold, or no worse than before, or a winning move', () => {
    expect(needsConfirm('smart', f({ atRisk: { key: '0,0', loss: CONFIRM_RULES.atRisk - 1 } }))).toBe(false);
    expect(needsConfirm('smart', f({ atRisk: { key: '0,0', loss: 5 }, atRiskBefore: 5 }))).toBe(false);
    expect(needsConfirm('smart', f({ wins: true, cutMine: ['0,0'] }))).toBe(false);
  });

  it('throwing a card: only the last one asks (Smart and Always); other throws never ask', () => {
    const t = f({ kind: 'throw', tiles: 0, points: 0 });
    for (const m of ['smart', 'always', 'never'] as const) expect(needsConfirm(m, t)).toBe(false);
    expect(needsConfirm('smart', { ...t, lastCard: true })).toBe(true);
    expect(needsConfirm('always', { ...t, lastCard: true })).toBe(true);
    expect(needsConfirm('never', { ...t, lastCard: true })).toBe(false);
  });

  it('the thresholds are config values', () => {
    const strict = { ...CONFIRM_RULES, atRisk: 2 };
    expect(needsConfirm('smart', f({ atRisk: { key: '0,0', loss: 2 } }), strict)).toBe(true);
    expect(needsConfirm('smart', f({ atRisk: { key: '0,0', loss: 2 } }))).toBe(false);
  });
});
