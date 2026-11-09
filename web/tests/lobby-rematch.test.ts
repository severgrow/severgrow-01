// Your matches: a finished row can challenge the same player again (owner, 2026-11-09).
import { describe, expect, it } from 'vitest';
import { toLobbyRow } from '../src/online/lobby.js';
import { needsMyResponse } from '../src/online/match-attention.js';
import { ONLINE } from '../../src/strings.js';

const finished = { matchId: 'm', status: 'finished', mySeat: 0, turnPlayer: null, turnDeadlineAt: null, opponentName: 'MapleFox', lastActivityAt: 0, unseenTurn: false, revision: 9, graceUsed: [0, 0], gracePeriods: 1, result: null } as const;

describe('the Rematch key on a finished row', () => {
  it('every finished game with an opponent offers it', () => {
    expect(toLobbyRow(finished as never, 0).rematch).toBe('offer');
    expect(toLobbyRow({ ...finished, opponentName: null } as never, 0).rematch).toBeNull();
    expect(toLobbyRow({ ...finished, status: 'active', turnPlayer: 1 } as never, 0).rematch).toBeNull();
  });
  it("the opponent's waiting rematch is called out and counts as needing my response", () => {
    const row = toLobbyRow({ ...finished, rematch: 'theirs' } as never, 0);
    expect(row.rematch).toBe('theirs');
    expect(row.statusWord).toBe(ONLINE.rowRematchTheirs);
    expect(needsMyResponse({ ...finished, rematch: 'theirs' } as never)).toBe(true);
    expect(needsMyResponse({ ...finished, rematch: 'mine' } as never)).toBe(false);
    expect(toLobbyRow({ ...finished, rematch: 'mine' } as never, 0).statusWord).toBe(ONLINE.rowRematchMine);
  });
});
