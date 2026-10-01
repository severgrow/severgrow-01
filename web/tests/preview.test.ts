import { describe, expect, it } from 'vitest';
import { coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, View } from '../../src/engine/index.js';
import { simulate, threats } from '../src/analysis.js';
import { moveHexes } from '../src/names.js';
import { chipText, previewMove } from '../src/logic/preview.js';
import { findState } from './ui-helpers.js';

const boardMove = (a: Action) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout';

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
        expect(p.ghosts.map((g) => g.key).sort()).toEqual(moveHexes(a).map(coordKey).sort());
        const sim = simulate(v, a)!;
        expect(p.placed).toBe(sim.placed);
        expect(p.replaced).toBe(sim.taken);
        expect(p.ghosts.filter((g) => g.replaces).length).toBe(sim.taken);
        expect(p.cuts).toBe(sim.botCut);
        expect(p.wins).toBe(sim.wins);
        for (const g of p.ghosts) expect(g.strength).toBeGreaterThanOrEqual(1);
        const after = threats({ config: v.config, terrain: v.terrain, board: sim.board }, v.player)[0]?.loss ?? 0;
        const before = threats(v, v.player)[0]?.loss ?? 0;
        expect(p.warning).toBe(after > before && !sim.wins ? `The bot could cut ${after} of your tiles.` : null);
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
