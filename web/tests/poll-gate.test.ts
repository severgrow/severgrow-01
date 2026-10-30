// The lobby's 2 s polls: a hidden tab asks nothing, and a slow request is never stacked on.
//
// 2026-10-30 (owner: "phone is still getting warm"): the invite/waiting screen and the parked
// "find opponent" search each fired a GET every two seconds regardless of `document.hidden`. On a
// pocketed phone that is a radio wake-up and a repaint every 2 s; on a stalled connection it is
// four requests in flight at once. `pollDue` is the one decision both ask, so it is proved here
// without a browser.
import { describe, expect, it } from 'vitest';
import { pollDue } from '../src/online/poll-gate.js';

describe('the lobby poll gate', () => {
  it('polls when the tab is visible and the previous request has settled', () => {
    expect(pollDue({ hidden: false, inFlight: false })).toBe(true);
  });

  it('asks nothing while the tab is hidden, even with nothing in flight', () => {
    expect(pollDue({ hidden: true, inFlight: false })).toBe(false);
  });

  it('does not stack a second request behind one that is still out (a stalled network)', () => {
    expect(pollDue({ hidden: false, inFlight: true })).toBe(false);
  });

  it('asks nothing when it is BOTH hidden and waiting on the network', () => {
    expect(pollDue({ hidden: true, inFlight: true })).toBe(false);
  });

  it('is a plain predicate: the same context always gives the same answer', () => {
    const context = { hidden: false, inFlight: false };
    expect(pollDue(context)).toBe(pollDue({ ...context }));
  });
});
