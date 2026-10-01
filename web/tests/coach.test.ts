import { describe, expect, it } from 'vitest';
import { apply, newGame } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { coachStep } from '../src/coach.js';
import { LITE } from '../src/presets.js';

describe('guided first turn', () => {
  it('walks through draw, play, discard, then a wrap-up', () => {
    let s: State = newGame(3, LITE);
    expect(coachStep(s, false)?.id).toBe('draw');
    s = apply(s, { t: 'Draw', from: 'deck' });
    expect(coachStep(s, false)?.id).toBe('play');
    s = apply(s, { t: 'EndAct' });
    expect(coachStep(s, false)?.id).toBe('discard');
    s = apply(s, { t: 'Discard', card: s.hands[0][0]!.id });
    expect(coachStep(s, false)?.id).toBe('end'); // Classic-style KNOCK phase: end the turn
    s = apply(s, { t: 'Continue' });
    expect(coachStep(s, false)?.id).toBe('done');
  });

  it('stays hidden once finished', () => {
    expect(coachStep(newGame(3, LITE), true)).toBeNull();
  });

  it('every step has short text', () => {
    const s = newGame(3, LITE);
    const step = coachStep(s, false)!;
    expect(step.title.length).toBeGreaterThan(3);
    expect(step.text.length).toBeLessThan(140);
  });
});
