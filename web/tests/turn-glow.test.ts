// The turn-start glow is a wave across the hand, not one flat wash — and it costs no time.
// Owner, 2026-11-20: "find another 3 animations that can be easily improved for max satisfaction
// joy dopamine". This is the most repeated moment in the game, so the contract is strict:
//   - every card lights in turn (a real sweep, not a simultaneous fade);
//   - the sweep ends exactly on the beat the caller asked for (a turn is never longer);
//   - Reduce motion / Speed off: NO glow at all.
import { describe, expect, it } from 'vitest';
import { GLOW_STEP_MAX, turnGlowMs, turnGlowPlan } from '../src/logic/turn-glow.js';
import { GLOW_BEAT } from '../src/logic/motion.js';

describe('the turn-start glow is a wave', () => {
  it('every card waits its turn: a real beat between neighbours', () => {
    const p = turnGlowPlan(GLOW_BEAT, 6, true)!;
    expect(p.stepMs).toBeGreaterThanOrEqual(1);
    expect(p.stepMs).toBeLessThanOrEqual(GLOW_STEP_MAX);
    expect(p.tailMs).toBe(p.stepMs * 5);
    expect(p.tailMs).toBeGreaterThan(100); // six cards really are read as one sweep
  });

  it('the wave ends exactly on the beat: no card outlives the glow it replaced', () => {
    for (const cards of [1, 2, 4, 6, 8, 9]) {
      for (const ms of [450, 900, 1800]) {
        const p = turnGlowPlan(ms, cards, true)!;
        expect(p.tailMs + p.cardMs).toBe(ms);
        expect(p.cardMs).toBeGreaterThan(0);
      }
    }
  });

  it('a full hand stays one gesture: the step shrinks rather than queueing up', () => {
    const four = turnGlowPlan(GLOW_BEAT, 4, true)!;
    const nine = turnGlowPlan(GLOW_BEAT, 9, true)!;
    expect(nine.stepMs).toBeLessThanOrEqual(four.stepMs);
    expect(nine.tailMs).toBeLessThanOrEqual(GLOW_BEAT / 3 + GLOW_STEP_MAX);
  });

  it('a single card is the old glow exactly (no wave to spend)', () => {
    expect(turnGlowPlan(GLOW_BEAT, 1, true)).toEqual({ cardMs: GLOW_BEAT, stepMs: 0, tailMs: 0 });
  });

  it('Reduce motion and Speed off give NOTHING, not a slower glow', () => {
    expect(turnGlowPlan(GLOW_BEAT, 6, false)).toBeNull();
  });

  it('the pace is the beat that was already shipping (900 at Normal, quicker on Fast)', () => {
    expect(turnGlowMs(1)).toBe(GLOW_BEAT);
    expect(turnGlowMs(0.5)).toBe(450);
    expect(turnGlowMs(0)).toBe(450); // Speed off never speeds the glow up into a flash
  });
});
