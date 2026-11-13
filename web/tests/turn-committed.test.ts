// OWNER REPORT (2026-11-13): "after I took my turn, Play online and Your matches still show that it's
// my turn ... it disappeared after like 60 seconds". A committed turn is announced, and the lobby
// re-reads its list at once; a reload asked for while another runs is queued, never dropped (the
// earlier read may predate the turn).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TURN_COMMITTED_EVENT, announceTurnCommitted } from '../src/online/turn-committed.js';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('a committed turn refreshes Your matches at once', () => {
  it('announces on the window', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const seen = vi.fn();
    target.addEventListener(TURN_COMMITTED_EVENT, seen);
    announceTurnCommitted();
    vi.unstubAllGlobals();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('the session announces after both kinds of committed turn; the lobby listens and never drops a reload', () => {
    const session = read('../src/online/duel-session.ts');
    expect(session.match(/announceTurnCommitted\(\);/g)).toHaveLength(2);
    const lobby = read('../src/online/lobby-ui.ts');
    expect(lobby).toMatch(/addEventListener\(TURN_COMMITTED_EVENT, \(\) => \{ void reloadMatches\(\); \}\)/);
    expect(lobby).toMatch(/if \(reloadInFlight\) \{ reloadAgain = true; return; \}/);
    expect(lobby).toMatch(/if \(reloadAgain\) void reloadMatches\(\);/);
  });
});
