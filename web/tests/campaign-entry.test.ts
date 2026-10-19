// THE CAMPAIGN ENTRY (menu label + press). The bug this covers was a mismatch between the two: the
// label came from progress, the press preferred a saved match, so an old replay could make the entry
// say LEVEL 70 and open level 31. These cases pin the decision, not the DOM.
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { campaignEntry } from '../src/logic/campaign.js';
import type { CampaignProgress } from '../src/logic/campaign.js';

const progress = (unlocked: number, completed: number[]): CampaignProgress => ({
  version: 1,
  unlocked,
  completed: completed.map((n) => CAMPAIGN_LEVELS[n - 1]!.id),
  best: {},
});
const lvl = (n: number) => CAMPAIGN_LEVELS[n - 1]!;

describe('campaignEntry decides what the entry does', () => {
  it('starts the next unfinished level when nothing is saved', () => {
    const e = campaignEntry(progress(31, range(30)), null);
    expect(e).toEqual({ kind: 'start', level: lvl(31) });
  });

  it('resumes without asking when the saved match IS the next unfinished level', () => {
    // The common case. A question here would be pure friction.
    const e = campaignEntry(progress(31, range(30)), lvl(31));
    expect(e).toEqual({ kind: 'resume', level: lvl(31) });
  });

  it('asks only when the saved match is a DIFFERENT level', () => {
    // The reported bug: everything is done, an old replay of 31 is unfinished.
    const e = campaignEntry(progress(70, range(70)), lvl(31));
    expect(e.kind).toBe('list');
    // And with 70 still open, the same old replay must produce a choice, not a silent resume.
    const open = campaignEntry(progress(70, range(69)), lvl(31));
    expect(open).toEqual({ kind: 'ask', next: lvl(70), saved: lvl(31) });
  });

  it('asks when the saved match is AHEAD of the next unfinished level', () => {
    // Reachable by replaying a later level after clearing an earlier one out of order.
    const e = campaignEntry(progress(40, range(40).filter((n) => n !== 35)), lvl(38));
    expect(e).toEqual({ kind: 'ask', next: lvl(35), saved: lvl(38) });
  });

  it('opens the list, and claims no level number, once every built level is complete', () => {
    // LEVEL 70 as a label would promise a level; there is none left, so the entry stops saying it.
    expect(campaignEntry(progress(70, range(70)), null)).toEqual({ kind: 'list' });
    expect(campaignEntry(progress(70, range(70)), lvl(70))).toEqual({ kind: 'list' });
  });

  it('never asks on a fresh save: level 1 is a start', () => {
    expect(campaignEntry(progress(1, []), null)).toEqual({ kind: 'start', level: lvl(1) });
  });
});

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}
