// Phase 0: one scheduler, one outstanding frame, coalesced work and honest pause gates.
import { describe, expect, it } from 'vitest';
import { FrameScheduler } from '../src/logic/scheduler.js';

const harness = (opts: { paused?: () => boolean } = {}) => {
  let next = 1;
  let queued = new Map<number, (t: number) => void>();
  const requested: number[] = [];
  const scheduler = new FrameScheduler({
    requestFrame: (cb) => {
      const id = next++;
      queued.set(id, cb);
      requested.push(id);
      return id;
    },
    cancelFrame: (id) => queued.delete(id),
    now: () => 0,
    ...opts,
  });
  const advance = (t: number) => {
    const frame = [...queued.values()];
    queued = new Map();
    for (const cb of frame) cb(t);
  };
  return { scheduler, advance, queued: () => queued, requested };
};

describe('the one frame scheduler', () => {
  it('starts only with work and keeps exactly one frame in flight', () => {
    const { scheduler, advance, queued } = harness();
    expect(scheduler.running()).toBe(false);
    expect(scheduler.subscriberCount()).toBe(0);

    const seen: number[] = [];
    const off = scheduler.subscribe(({ now }) => seen.push(now));
    expect(scheduler.running()).toBe(true);
    expect(queued().size).toBe(1);

    advance(16);
    expect(seen).toEqual([16]);
    expect(queued().size).toBe(1); // the subscriber keeps the loop alive, never duplicates it
    advance(32);
    expect(seen).toEqual([16, 32]);

    off();
    expect(scheduler.subscriberCount()).toBe(0);
    expect(scheduler.running()).toBe(false);
  });

  it('coalesces a keyed non-urgent job: many requests, one run', () => {
    const { scheduler, advance, queued } = harness();
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) scheduler.request('pointer', () => seen.push(`job${i}`));
    expect(scheduler.pendingJobs()).toBe(1);
    expect(queued().size).toBe(1); // still one frame

    advance(16);
    expect(seen).toEqual(['job19']);
    expect(scheduler.pendingJobs()).toBe(0);
    expect(scheduler.running()).toBe(false);
  });

  it('runs urgent work before ordinary work in the same frame', () => {
    const { scheduler, advance } = harness();
    const order: string[] = [];
    scheduler.subscribe(() => order.push('ordinary'));
    scheduler.subscribe(() => order.push('urgent'), { urgent: true });
    scheduler.request('job', () => order.push('job'));
    advance(16);
    expect(order).toEqual(['urgent', 'job', 'ordinary']);
  });

  it('pauses on a gate, keeps subscribers, and resumes on wake', () => {
    const { scheduler, advance, queued } = harness();
    let paused = true;
    scheduler.addGate(() => paused);
    let ticks = 0;
    const off = scheduler.subscribe(() => ticks++);
    expect(scheduler.running()).toBe(false); // starts only when not paused
    expect(queued().size).toBe(0);

    paused = false;
    scheduler.wake();
    expect(scheduler.running()).toBe(true);
    advance(16);
    expect(ticks).toBe(1);

    paused = true;
    scheduler.wake();
    advance(32); // the already-requested frame runs, sees the gate, and stops
    expect(ticks).toBe(1);
    expect(scheduler.running()).toBe(false);

    paused = false;
    scheduler.wake();
    expect(scheduler.running()).toBe(true);
    off();
  });

  it('a job requested during a frame runs on the next frame, not as a nested loop', () => {
    const { scheduler, advance, queued } = harness();
    const seen: number[] = [];
    const off = scheduler.subscribe(({ now }) => {
      seen.push(now);
      scheduler.request('tail', ({ now: tailNow }) => seen.push(tailNow));
    });
    advance(16);
    expect(seen).toEqual([16]);
    expect(queued().size).toBe(1); // one frame for the subscriber plus the new job
    advance(32);
    expect(seen).toEqual([16, 32, 32]);
    off();
  });
});
