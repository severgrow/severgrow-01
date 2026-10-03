// UI overhaul item 19: the opponent's turn: what is involved, the camera nudge, Replay speed.
import { describe, expect, it } from 'vitest';
import { buildSteps } from '../src/logic/anim.js';
import type { Step } from '../src/logic/anim.js';
import { NUDGE, REPLAY_SPEED, actorOf, involvedKeys, nudgeToward } from '../src/logic/opponent.js';
import { playGame } from './ui-helpers.js';

const steps = (): Step[] => {
  const out: Step[] = [];
  for (const seed of [2, 9]) playGame(seed, ({ before, action, after }) => out.push(...buildSteps(before, action, after, 0)));
  return out;
};

describe("the opponent's turn", () => {
  const all = steps();

  it('Replay is slower than live, not by much', () => {
    expect(REPLAY_SPEED).toBe(0.75);
  });

  it('every board step names the hexes it is about; they are real board hexes', () => {
    let n = 0;
    for (const s of all) {
      const keys = involvedKeys(s);
      if (s.k === 'grow' || s.k === 'sever' || s.k === 'strengthen' || s.k === 'fruit') {
        expect(keys.length).toBeGreaterThan(0);
        n++;
      }
      for (const k of keys) expect(k).toMatch(/^-?\d+,-?\d+$/);
    }
    expect(n).toBeGreaterThan(20);
  });

  it('a cut is "by" the one who cut, not the one who lost tiles', () => {
    const cuts = all.filter((s): s is Extract<Step, { k: 'sever' }> => s.k === 'sever');
    expect(cuts.length).toBeGreaterThan(0);
    for (const c of cuts) expect(actorOf(c)).toBe(c.by);
  });

  it('the camera nudge is tiny (at most 1.5% each way) and points toward the action', () => {
    for (const s of all) {
      const v = nudgeToward(involvedKeys(s), 200, 170);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(NUDGE);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(NUDGE);
    }
    expect(nudgeToward([], 200, 170)).toEqual({ x: 0, y: 0 });
    expect(nudgeToward(['0,0'], 200, 170)).toEqual({ x: 0, y: 0 });
    const right = nudgeToward(['3,0'], 200, 170);
    expect(right.x).toBeGreaterThan(0);
  });

  it('no step changes anything (pure)', () => {
    const s = all.find((x) => x.k === 'grow')!;
    const copy = JSON.stringify(s);
    involvedKeys(s);
    actorOf(s);
    expect(JSON.stringify(s)).toBe(copy);
  });
});
