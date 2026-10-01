import { describe, expect, it } from 'vitest';
import { coordKey } from '../../src/engine/index.js';
import { cutLoss, threats } from '../src/analysis.js';
import { opportunities, weakSpots } from '../src/logic/weakspots.js';
import { customBoard, findState, rootFan } from './ui-helpers.js';
import type { State } from '../../src/engine/index.js';

/** The first position (over several games) where `pred` holds. */
const findAny = (pred: (s: State) => boolean): State => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = findState(seed, pred);
    if (s) return s;
  }
  throw new Error('no such position');
};
import { viewFor } from '../../src/engine/index.js';

describe('weak spots and opportunities', () => {
  it('weak spots are my tiles whose loss cuts the most, biggest first, with the number lost', () => {
    const s = findAny((x) => x.turnNumber >= 10 && threats(viewFor(x, 0), 0).length > 0);
    const v = viewFor(s, 0);
    const spots = weakSpots(v);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots).toEqual(threats(v, 0));
    for (const w of spots) {
      expect(v.board[w.key]?.owner).toBe(0);
      expect(w.loss).toBe(cutLoss(v, w.key).length);
    }
    for (let i = 1; i < spots.length; i++) expect(spots[i - 1]!.loss).toBeGreaterThanOrEqual(spots[i]!.loss);
  });

  it("opportunities are the bot's weak links, with how many tiles I would cut off", () => {
    const s = findAny((x) => x.turnNumber >= 10 && threats(viewFor(x, 0), 1).length > 0);
    const v = viewFor(s, 0);
    const ops = opportunities(v);
    expect(ops).toEqual(threats(v, 1));
    for (const o of ops) expect(v.board[o.key]?.owner).toBe(1);
  });

  it('a lone line from the root: the tile next to the root is the weakest spot', () => {
    const base = customBoard({});
    const { a, b } = rootFan(base, 0);
    const s = customBoard({ [coordKey(a)]: { owner: 0, strength: 2 }, [coordKey(b)]: { owner: 0, strength: 2 } });
    // No bot tile nearby, so threats() (reach-limited) may be empty; the full list ignores reach.
    const all = weakSpots(viewFor(s, 0), { anyReach: true, minLoss: 2 });
    expect(all[0]).toEqual({ key: coordKey(a), loss: 2 });
  });
});
