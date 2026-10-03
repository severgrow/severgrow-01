// UI overhaul Part 3: the eye-candy decisions.
import { describe, expect, it } from 'vitest';
import { allNeighbors, coordKey, rootCoord } from '../../src/engine/index.js';
import { deckMoment, rootDanger, rootRhythm, splashPlan, sporesHome } from '../src/logic/candy.js';
import { fixture } from '../../tests/helpers.js';
import { playGame } from './ui-helpers.js';

describe('A. root in danger', () => {
  const f0 = fixture({});
  const root = rootCoord(0, f0.config.rootStyle, f0.config.boardRadius);
  const ring = allNeighbors(root).map(coordKey).filter((k) => k in f0.board);
  const withEnemies = (n: number) => {
    const tiles: Record<string, [0 | 1, number]> = {};
    ring.slice(0, n).forEach((k) => (tiles[k] = [1, 3]));
    return fixture({ tiles });
  };

  it('calm with no opponent next to the root; watch at 4 closed sides; danger at 5 (one from strangled)', () => {
    expect(rootDanger(f0, 0).level).toBe(0);
    const offBoard = 6 - ring.length;
    for (let n = 1; n <= ring.length; n++) {
      const r = rootDanger(withEnemies(n), 0);
      expect(r.closed).toBe(offBoard + n);
      expect(r.level).toBe(offBoard + n >= 5 ? 2 : offBoard + n >= 4 ? 1 : 0);
      expect(r.open.length).toBe(ring.length - n);
    }
  });

  it('rock alone never counts as danger (terrain alone never strangles)', () => {
    expect(rootDanger(fixture({ rock: ring }), 0).level).toBe(0);
  });

  it('in real games, "danger" always means one more closed side would strangle', () => {
    for (const seed of [1, 4, 7]) {
      playGame(seed, ({ after }) => {
        for (const p of [0, 1] as const) {
          const r = rootDanger(after, p);
          if (r.level === 2) expect(r.open.length).toBeLessThanOrEqual(1);
        }
      });
    }
  });

  it('the rhythm: a slow breath when calm, a heartbeat in danger (no faster than 0.9s: never a flicker)', () => {
    expect(rootRhythm(0)).toEqual({ ms: 4200, beat: false });
    expect(rootRhythm(2).beat).toBe(true);
    for (const l of [0, 1, 2] as const) expect(rootRhythm(l).ms).toBeGreaterThanOrEqual(900);
    expect(rootRhythm(2).ms).toBeLessThan(rootRhythm(1).ms);
  });
});

describe('B. splash', () => {
  it('once per visit, short, still with Reduce motion, never when switched off', () => {
    expect(splashPlan({ reduceMotion: false, on: true, shownThisVisit: false })).toEqual({ show: true, ms: 1600, animated: true });
    expect(splashPlan({ reduceMotion: true, on: true, shownThisVisit: false }).animated).toBe(false);
    expect(splashPlan({ reduceMotion: false, on: true, shownThisVisit: true }).show).toBe(false);
    expect(splashPlan({ reduceMotion: false, on: false, shownThisVisit: false }).show).toBe(false);
    expect(splashPlan({ reduceMotion: false, on: true, shownThisVisit: false }).ms).toBeLessThanOrEqual(2000);
  });
});

describe('C. last card', () => {
  it('marks the step to one card and the step to none, once each', () => {
    expect(deckMoment(2, 1)).toBe('last');
    expect(deckMoment(1, 0)).toBe('out');
    expect(deckMoment(5, 0)).toBe('out');
    expect(deckMoment(1, 1)).toBeNull();
    expect(deckMoment(9, 8)).toBeNull();
    expect(deckMoment(0, 0)).toBeNull();
  });
});

describe('D. spores going home', () => {
  it('at most 6, nearest the root first, one after another', () => {
    const s = sporesHome(['3,0', '1,0', '2,0', '0,3', '-1,2', '2,1', '3,-1', '1,1'], '0,0');
    expect(s.length).toBe(6);
    expect(s[0]!.from).toBe('1,0');
    for (let i = 1; i < s.length; i++) expect(s[i]!.delay).toBeGreaterThan(s[i - 1]!.delay);
    expect(sporesHome([], '0,0')).toEqual([]);
  });
});
