// Step 10: local playtest notes for the hidden ?debug=1 page: average time per turn, Undo count,
// empty turns, and where the player paused longest. Kept in this browser only; never sent.
import { describe, expect, it } from 'vitest';
import { emptyNotes, noteEvent, notesSummary } from '../src/logic/playnotes.js';

describe('playtest notes', () => {
  it('times my turns, counts Undo and empty turns, finds the longest pause', () => {
    let n = emptyNotes();
    n = noteEvent(n, { t: 'turnStart', at: 1000 });
    n = noteEvent(n, { t: 'input', at: 3000, where: 'hand' });
    n = noteEvent(n, { t: 'input', at: 11000, where: 'board' }); // 8 s pause before this
    n = noteEvent(n, { t: 'undo', at: 12000 });
    n = noteEvent(n, { t: 'turnEnd', at: 13000 });
    n = noteEvent(n, { t: 'turnStart', at: 20000 });
    n = noteEvent(n, { t: 'empty', at: 20500 });
    n = noteEvent(n, { t: 'turnEnd', at: 21000 });
    const s = notesSummary(n);
    expect(s.turns).toBe(2);
    expect(s.avgTurnMs).toBe((12000 + 1000) / 2);
    expect(s.undos).toBe(1);
    expect(s.emptyTurns).toBe(1);
    expect(s.longestPause).toEqual({ ms: 8000, before: 'board' });
  });
  it('keeps only the latest 500 events, and a summary of nothing is zeros', () => {
    let n = emptyNotes();
    for (let i = 0; i < 700; i++) n = noteEvent(n, { t: 'input', at: i, where: 'hand' });
    expect(n.events.length).toBe(500);
    expect(notesSummary(emptyNotes())).toEqual({ turns: 0, avgTurnMs: 0, undos: 0, emptyTurns: 0, longestPause: null });
  });
});
