// UI overhaul item 19: the opponent's turn: what is involved, the camera nudge, Replay speed.
import { describe, expect, it } from 'vitest';
import { buildSteps } from '../src/logic/anim.js';
import type { Step } from '../src/logic/anim.js';
import { NUDGE, REPLAY_BEAT_MS, REPLAY_SPEED, actorOf, involvedKeys, nudgeToward, replayDurationScale } from '../src/logic/opponent.js';
import { MOTION } from '../src/logic/motion.js';
import { playGame } from './ui-helpers.js';

const steps = (): Step[] => {
  const out: Step[] = [];
  for (const seed of [2, 9]) playGame(seed, ({ before, action, after }) => out.push(...buildSteps(before, action, after, 0)));
  return out;
};

describe("the opponent's turn", () => {
  const all = steps();

  it('Replay is a RATE below live, and its duration scale is above live', () => {
    // Owner, 2026-10-25: the replay read as rushed. It is a PLAYBACK RATE: 0.6 = 60% of live.
    expect(REPLAY_SPEED).toBe(0.6);
    expect(REPLAY_SPEED).toBeLessThan(1);
    // `timeScale` is a DURATION multiplier, so the conversion is exactly one division, tested here
    // rather than read backwards in a comment: 0.6 → a replay lasts ~1.67× as long as live.
    expect(replayDurationScale(REPLAY_SPEED)).toBeCloseTo(1 / 0.6, 6);
    expect(replayDurationScale(1)).toBe(1);
    expect(replayDurationScale(0.5)).toBe(2);
    // A nonsense rate can never collapse a replay to instant.
    expect(replayDurationScale(0)).toBeLessThanOrEqual(5);
  });

  it('the beat between the enemy\'s actions is one of the game\'s own tempo tokens', () => {
    // Not a second motion system: the beat IS a quick beat.
    expect(REPLAY_BEAT_MS).toBe(MOTION.quick);
    expect(REPLAY_BEAT_MS).toBeGreaterThan(0);
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
