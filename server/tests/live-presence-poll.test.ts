// A PLAYER WHO IS POLLING THE DUEL IS ONLINE (owner, 2026-11-13: Blitz on two phones, "it was showing
// the other device was away even tho it was online"). Presence used to come ONLY from the heartbeat
// (every 20 s, stale after 45 s): two lost or slow heartbeats made a player who was reading the duel
// every few seconds "away", and their opponent saw it. The live status read is authenticated and
// comes every few seconds from an open duel, so it now counts as presence too.
import { describe, expect, it } from 'vitest';
import { STALE, makeLiveHarness } from './live-harness.js';

describe('presence from the live status read', () => {
  it('a player whose heartbeats stopped but who keeps reading the duel stays online to the opponent', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    for (let i = 0; i < 6; i++) {
      h.advance(STALE / 3);
      await h.live.status(a, matchId); // A: no heartbeat, only reads
      await h.presence(b, 'in_live');
    }
    const seen = await h.live.status(b, matchId);
    expect(seen.opponent.presence).toBe('online');
    expect(seen.opponent.reconnecting).toBe(false);
  });

  it('a player who neither heartbeats nor reads is still away after the stale window', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    h.advance(STALE + 1);
    await h.presence(b, 'in_live');
    expect((await h.live.status(b, matchId)).opponent.presence).toBe('offline');
  });
});
