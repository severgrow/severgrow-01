// WEBKIT LIFTS A DRAG AS "CANCEL, THEN UP" (CI trace on 28b88c91, blast-input-ios): the iPhone engine
// reported the end of a cockpit Blast drag as pointercancel immediately followed by pointerup at the
// same point, and the drag layer dropped the move on the cancel. A cancel on a drag in motion now
// waits one beat: a release inside it is the lift (the move commits), nothing is a real cancel.
import { describe, expect, it } from 'vitest';
import { LIFT_AFTER_CANCEL_MS, liftAfterCancel } from '../src/ui/lift-after-cancel.js';

const clock = () => {
  let t = 0;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    schedule: (fn: () => void, ms: number) => { const job = { at: t + ms, fn }; timers.push(job); return job; },
    clear: (job: unknown) => { const i = timers.indexOf(job as never); if (i >= 0) timers.splice(i, 1); },
    advance: (ms: number) => { t += ms; for (const job of [...timers]) if (job.at <= t) { timers.splice(timers.indexOf(job), 1); job.fn(); } },
  };
};

describe('a cancel followed by a release is a lift', () => {
  it('a release right after a cancel commits once, and the cancel never fires', () => {
    const c = clock();
    const log: string[] = [];
    const gate = liftAfterCancel({ schedule: c.schedule, clear: c.clear });
    gate.cancel(() => log.push('cancel'));
    c.advance(5);
    expect(gate.release(() => log.push('commit'))).toBe(true);
    c.advance(LIFT_AFTER_CANCEL_MS * 2);
    expect(log).toEqual(['commit']);
  });
  it('a cancel with no release is a real cancel, after one beat', () => {
    const c = clock();
    const log: string[] = [];
    const gate = liftAfterCancel({ schedule: c.schedule, clear: c.clear });
    gate.cancel(() => log.push('cancel'));
    c.advance(LIFT_AFTER_CANCEL_MS - 1);
    expect(log).toEqual([]);
    c.advance(1);
    expect(log).toEqual(['cancel']);
    // a late release after the beat is not a lift
    expect(gate.release(() => log.push('commit'))).toBe(false);
    expect(log).toEqual(['cancel']);
  });
  it('the beat is short: a person never waits for a cancelled card', () => {
    expect(LIFT_AFTER_CANCEL_MS).toBeLessThanOrEqual(150);
  });
  it('reset drops a waiting cancel without firing anything', () => {
    const c = clock();
    const log: string[] = [];
    const gate = liftAfterCancel({ schedule: c.schedule, clear: c.clear });
    gate.cancel(() => log.push('cancel'));
    gate.reset();
    c.advance(LIFT_AFTER_CANCEL_MS * 2);
    expect(log).toEqual([]);
    expect(gate.pending()).toBe(false);
  });
});
