import { describe, expect, it } from 'vitest';
import { coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, View } from '../../src/engine/index.js';
import { simulate, threats } from '../src/analysis.js';
import { moveHexes } from '../src/names.js';
import { chipText, previewMove } from '../src/logic/preview.js';
import { findState } from './ui-helpers.js';

const boardMove = (a: Action) => a.t === 'Bloom' || a.t === 'Sprout';

/** Mid-game positions where the human (player 0) is choosing board moves. */
const positions = (): View[] => {
  const out: View[] = [];
  for (const seed of [3, 11, 29]) {
    const s = findState(seed, (x) => x.actor === 0 && x.phase === 'ACT' && x.turnNumber >= 6 && legalActions(viewFor(x, 0)).some(boardMove));
    if (s) out.push(viewFor(s, 0));
  }
  return out;
};

describe('move preview', () => {
  const views = positions();

  it('finds test positions', () => expect(views.length).toBe(3));

  it('ghosts sit exactly where the move grows, with the strength they will have, and nothing is changed', () => {
    for (const v of views) {
      const frozen = JSON.stringify(v);
      for (const a of legalActions(v).filter(boardMove)) {
        const p = previewMove(v, a)!;
        if (a.t === 'Sprout' && v.board[coordKey(a.coord)]?.owner === v.player) {
          // v0.5 Strengthen: no new tile; the ghost shows the new number on my own tile
          expect(p.placed).toBe(0);
          expect(p.ghosts).toEqual([{ key: coordKey(a.coord), strength: v.hand.find((c) => c.id === a.card)!.rank, replaces: false }]);
          expect(p.chip).toBe(`Strengthen ${v.board[coordKey(a.coord)]!.strength} → ${p.ghosts[0]!.strength}`);
          continue;
        }
        expect(p.ghosts.map((g) => g.key).sort()).toEqual(moveHexes(a).map(coordKey).sort());
        const sim = simulate(v, a)!;
        expect(p.placed).toBe(sim.placed);
        expect(p.replaced).toBe(sim.taken);
        expect(p.ghosts.filter((g) => g.replaces).length).toBe(sim.taken);
        expect(p.cuts).toBe(sim.botCut);
        expect(p.cutKeys.length).toBe(sim.botCut);
        for (const k of p.cutKeys) {
          expect(v.board[k]?.owner).toBe(1);
          expect(sim.board[k] ?? null).toBeNull();
        }
        expect(p.wins).toBe(sim.wins);
        for (const g of p.ghosts) expect(g.strength).toBeGreaterThanOrEqual(1);
        const after = threats({ config: v.config, terrain: v.terrain, board: sim.board }, v.player)[0]?.loss ?? 0;
        const before = threats(v, v.player)[0]?.loss ?? 0;
        expect(p.warning).toBe(after > before && !sim.wins ? `Your opponent could cut ${after} of your tiles.` : null);
      }
      expect(JSON.stringify(v)).toBe(frozen); // never mutates
    }
  });

  it('non-board moves have no preview', () => {
    const v = views[0]!;
    expect(previewMove(v, { t: 'EndAct' })).toBeNull();
    expect(previewMove(v, { t: 'Draw', from: 'deck' })).toBeNull();
  });

  it('the result chip reads like "+3 tiles, replaces 1, cuts 4"', () => {
    expect(chipText({ placed: 3, replaced: 1, cuts: 4, wins: false })).toBe('+3 tiles, replaces 1, cuts 4');
    expect(chipText({ placed: 1, replaced: 0, cuts: 0, wins: false })).toBe('+1 tile');
    expect(chipText({ placed: 2, replaced: 0, cuts: 1, wins: false })).toBe('+2 tiles, cuts 1');
    expect(chipText({ placed: 2, replaced: 0, cuts: 0, wins: true })).toBe('+2 tiles, wins the game');
  });
});

describe('points in the preview', () => {
  it('the chip ends with the points the move gains', () => {
    expect(chipText({ placed: 3, replaced: 1, cuts: 4, wins: false, points: 7 })).toBe('+3 tiles, replaces 1, cuts 4 · +7 points');
    expect(chipText({ placed: 1, replaced: 0, cuts: 0, wins: false, points: 1 })).toBe('+1 tile · +1 point');
    expect(chipText({ placed: 1, replaced: 0, cuts: 0, wins: false, points: 0 })).toBe('+1 tile · +0 points');
  });
});
