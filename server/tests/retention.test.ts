// REPLAY RETENTION (owner decision, 2026-10-25): "keep each player's last 10 finished duels AND
// their moves … Do NOT delete anything already there."
//
// The rule is one pure function (server/src/retention.ts). These tests drive the REAL housekeeping
// sweep over a real sixteen-duel history and check the three promises the replay list makes:
//   * a player with 15+ finished duels keeps exactly the 10 newest, WITH their moves;
//   * other players' duels are untouched — including an old duel shared with the trimmed player,
//     which is protected because it is inside the OTHER player's ten;
//   * nothing inside the age floor is ever pruned, and an unfinished duel never is.
import { describe, expect, it } from 'vitest';
import { makeLiveHarness } from './live-harness.js';
import { FINISHED_REPLAYS_KEEP, FINISHED_REPLAYS_MIN_AGE_MS, prunableMatches } from '../src/retention.js';

const DAY = 24 * 60 * 60 * 1000;
const h = makeLiveHarness();

describe('the retention rule (pure)', () => {
  const now = 1_000 * DAY;
  const row = (id: string, finishedAt: number, players: string[]) => ({ id, finishedAt, players });

  it('keeps the newest ten per player and offers only older ones', () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(`m${i}`, now - (60 - i) * DAY, ['a', 'b']));
    const doomed = prunableMatches(rows, now);
    expect(doomed).toHaveLength(5);
    // The five OLDEST go; the ten newest are never in the list.
    expect(doomed).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  it('never prunes inside the age floor, however many duels a player has', () => {
    const fresh = Array.from({ length: 15 }, (_, i) => row(`f${i}`, now - i * 1_000, ['a']));
    expect(prunableMatches(fresh, now)).toEqual([]);
    expect(FINISHED_REPLAYS_MIN_AGE_MS).toBeGreaterThan(7 * DAY);
  });

  it('a shared match is protected by EITHER player being short of ten', () => {
    const mine = Array.from({ length: 12 }, (_, i) => row(`mine${i}`, now - (50 + i) * DAY, ['a']));
    // `b` only ever played this one old duel, so it is b's newest — a cannot lose it.
    const shared = row('shared', now - 90 * DAY, ['a', 'b']);
    const doomed = prunableMatches([...mine, shared], now);
    expect(doomed).not.toContain('shared');
    expect(doomed).toHaveLength(2); // a's own two oldest, which nobody else played
  });

  it('is deterministic when two duels ended in the same millisecond', () => {
    // Twelve duels with an identical `finishedAt`: the tie is broken by id, so the SAME two always
    // go — whichever order the rows arrive in.
    const rows = Array.from({ length: 12 }, (_, i) => row(`t${String(i).padStart(2, '0')}`, now - 40 * DAY, ['a']));
    expect(prunableMatches(rows, now)).toEqual(['t10', 't11']);
    expect(prunableMatches([...rows].reverse(), now)).toEqual(['t10', 't11']);
  });

  it('counts FRESH duels against the ten, so an old one beyond them goes', () => {
    // Three played this week and twelve old: the newest ten are those three plus the seven newest
    // old ones, so five old duels are beyond the promise and may go. (Under-pruning here would
    // quietly keep 13.)
    const fresh = Array.from({ length: 3 }, (_, i) => row(`fresh${i}`, now - (i + 1) * DAY, ['a']));
    const old = Array.from({ length: 12 }, (_, i) => row(`old${i}`, now - (40 + i) * DAY, ['a']));
    const doomed = prunableMatches([...fresh, ...old], now);
    expect(doomed).toHaveLength(5);
    expect(doomed).toEqual(['old11', 'old10', 'old9', 'old8', 'old7']);
    for (const f of fresh) expect(doomed).not.toContain(f.id);
  });
});

describe('the sweep applies it to real stored matches', () => {
  it('a player with 15 finished duels keeps exactly the 10 newest, with their moves', async () => {
    const now = h.now();
    const me = await h.guest();
    const rival = await h.guest();

    /** One real finished duel between `me` and `rival`, ended at `at`, with real committed moves. */
    const duel = async (at: number): Promise<string> => {
      const created = await h.service.createMatch(me.player);
      await h.service.joinMatch(rival.player, created.match.inviteCode);
      const actor = await h.actorOf(created.match.matchId, me.player, rival.player);
      await h.playTurn(actor, created.match.matchId);
      await h.memory.seedFinished(created.match.matchId, at);
      return created.match.matchId;
    };

    const fifteen: { id: string; at: number }[] = [];
    for (let i = 0; i < 15; i++) fifteen.push({ id: await duel(now - (100 - i) * DAY), at: now - (100 - i) * DAY });

    // An old duel between two OTHER players (1 finished each: both protected).
    const other = await h.pair();
    await h.memory.seedFinished(other.matchId, now - 120 * DAY);
    // An old duel shared with the trimmed player: their 16th, but the partner's first.
    const partner = await h.guest();
    const sharedCreated = await h.service.createMatch(me.player);
    await h.service.joinMatch(partner.player, sharedCreated.match.inviteCode);
    await h.memory.seedFinished(sharedCreated.match.matchId, now - 125 * DAY);
    const sharedId = sharedCreated.match.matchId;

    const kept = fifteen.slice(5);
    const gone = fifteen.slice(0, 5);
    expect(kept).toHaveLength(FINISHED_REPLAYS_KEEP);
    for (const k of kept) expect((await h.memory.movesOf(k.id, 0)).length).toBeGreaterThan(0);

    const swept = await h.memory.sweep(now, 30 * DAY);
    expect(swept.prunedMatches).toBe(gone.length);

    for (const k of kept) {
      expect(await h.memory.matchById(k.id)).not.toBeNull();
      expect((await h.memory.movesOf(k.id, 0)).length).toBeGreaterThan(0); // moves survived with it
    }
    for (const g of gone) {
      expect(await h.memory.matchById(g.id)).toBeNull();
      expect(await h.memory.movesOf(g.id, 0)).toHaveLength(0);
    }
    // Other players' duels are untouched, and so is the shared one (protected by its partner).
    expect(await h.memory.matchById(other.matchId)).not.toBeNull();
    expect(await h.memory.matchById(sharedId)).not.toBeNull();
  });

  it('never prunes a duel inside the age floor, and never an unfinished one', async () => {
    const now = h.now();
    const fresh = await h.pair();
    await h.memory.seedFinished(fresh.matchId, now - DAY);
    const active = await h.pair();
    const swept = await h.memory.sweep(now, 30 * DAY);
    expect(swept.prunedMatches).toBe(0);
    expect(await h.memory.matchById(fresh.matchId)).not.toBeNull();
    expect(await h.memory.matchById(active.matchId)).not.toBeNull();
  });

  it('counts a fresh duel against the ten, so the 13th old one is pruned with its moves', async () => {
    // A dedicated harness: the point is the MIX of fresh and old, and no other test's history
    // should be able to change which ten are protected.
    const local = makeLiveHarness();
    const now = local.now();
    const me = await local.guest();
    const rival = await local.guest();
    const duel = async (at: number): Promise<string> => {
      const created = await local.service.createMatch(me.player);
      await local.service.joinMatch(rival.player, created.match.inviteCode);
      const actor = await local.actorOf(created.match.matchId, me.player, rival.player);
      await local.playTurn(actor, created.match.matchId);
      await local.memory.seedFinished(created.match.matchId, at);
      return created.match.matchId;
    };
    // Three played this week, twelve old ones.
    const fresh = [await duel(now - DAY), await duel(now - 2 * DAY), await duel(now - 3 * DAY)];
    const old: string[] = [];
    for (let i = 0; i < 12; i++) old.push(await duel(now - (40 + i) * DAY));

    const swept = await local.memory.sweep(now, 30 * DAY);
    expect(swept.prunedMatches).toBe(5); // the newest ten are 3 fresh + the 7 newest old
    for (const id of fresh) expect(await local.memory.matchById(id)).not.toBeNull();
    for (const id of old.slice(0, 7)) expect(await local.memory.matchById(id)).not.toBeNull();
    for (const id of old.slice(7)) {
      expect(await local.memory.matchById(id)).toBeNull();
      expect(await local.memory.movesOf(id, 0)).toHaveLength(0);
    }
  });

  it('reports the count on the wire, and a second sweep finds nothing to do', async () => {
    const now = h.now();
    const me = await h.guest();
    const rival = await h.guest();
    for (let i = 0; i < 12; i++) {
      const created = await h.service.createMatch(me.player);
      await h.service.joinMatch(rival.player, created.match.inviteCode);
      await h.memory.seedFinished(created.match.matchId, now - (50 - i) * DAY);
    }
    const first = await h.service.sweep(null, { internal: true });
    expect(first.prunedMatches).toBe(2);
    const second = await h.service.sweep(null, { internal: true });
    expect(second.prunedMatches).toBe(0);
  });
});
