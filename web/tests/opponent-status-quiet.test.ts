// The live status is re-read every second during Blitz (10 s otherwise). Each reading used to
// re-notify every listener even when nothing changed, and the listeners repaint the presence
// labels (forced layout). Only a CHANGE notifies (measured on online entry, 2026-11-10).
import { describe, expect, it } from 'vitest';
import { publishOpponentStatus, subscribeOpponentStatus } from '../src/online/live/opponent-status.js';

const wire = (matchId: string, presence: 'online' | 'offline') => ({ matchId, opponent: { presence } }) as never;

describe('opponent status notifies only on a change', () => {
  it('the same reading again is silent; a change, a new match or leaving notifies', () => {
    const seen: string[] = [];
    const off = subscribeOpponentStatus('q1', (s) => seen.push(s));
    expect(seen).toEqual(['unknown']);
    publishOpponentStatus('q1', wire('q1', 'online'));
    publishOpponentStatus('q1', wire('q1', 'online'));
    publishOpponentStatus('q1', wire('q1', 'online'));
    expect(seen).toEqual(['unknown', 'online']);
    publishOpponentStatus('q1', wire('q1', 'offline'));
    expect(seen).toEqual(['unknown', 'online', 'away']);
    publishOpponentStatus(null, null);
    expect(seen).toEqual(['unknown', 'online', 'away', 'unknown']);
    off();
  });
});
