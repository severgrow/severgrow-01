// Quiet optional "Keep your progress" for guests (owner, 2026-11-08). Dismissible, once, never
// over a Blitz decision. Pure decision rules — no DOM.
import { describe, expect, it } from 'vitest';
import {
  KEEP_PROGRESS_KEY,
  keepProgressDecision,
  parseKeepProgressMemory,
} from '../src/player/keep-progress.js';

describe('keep-progress offer rules', () => {
  it('a guest who has not dismissed may be offered after a level clear', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: parseKeepProgressMemory(null),
      reason: 'level-clear',
      covered: false,
    })).toEqual({ offer: true, memory: { dismissed: false, offered: true } });
  });

  it('a guest may also be offered after a first claim', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: parseKeepProgressMemory(null),
      reason: 'first-claim',
      covered: false,
    }).offer).toBe(true);
  });

  it('signed-in players are never offered', () => {
    expect(keepProgressDecision({
      kind: 'account',
      memory: parseKeepProgressMemory(null),
      reason: 'level-clear',
      covered: false,
    }).offer).toBe(false);
  });

  it('dismissed stays dismissed', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: { dismissed: true, offered: true },
      reason: 'level-clear',
      covered: false,
    }).offer).toBe(false);
  });

  it('already offered is not shown again', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: { dismissed: false, offered: true },
      reason: 'first-claim',
      covered: false,
    }).offer).toBe(false);
  });

  it('a Blitz decision or victory card blocks the offer (no modal over it)', () => {
    expect(keepProgressDecision({
      kind: 'guest',
      memory: parseKeepProgressMemory(null),
      reason: 'level-clear',
      covered: true,
    }).offer).toBe(false);
  });

  it('parses and rejects malformed memory safely', () => {
    expect(parseKeepProgressMemory(null)).toEqual({ dismissed: false, offered: false });
    expect(parseKeepProgressMemory('{bad')).toEqual({ dismissed: false, offered: false });
    expect(parseKeepProgressMemory(JSON.stringify({ dismissed: true, offered: true })))
      .toEqual({ dismissed: true, offered: true });
    expect(KEEP_PROGRESS_KEY).toMatch(/^severgrow\./);
  });
});
