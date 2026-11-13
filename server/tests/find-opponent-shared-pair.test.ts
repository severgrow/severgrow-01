// FIND OPPONENT — the owner's two reports (2026-11-11 / 2026-11-12):
//   * "FIND OPPONENT on two devices doesn't start a game" — two players who already share an open
//     game used to park forever (one game per pair; nobody noticed the other search).
//   * "i tried on a fresh guest acc and my RYK acc and didnt connect" — the FRESH case must pair a
//     stranger even when the other searcher already has an open game against a THIRD party. That
//     would fail if the one-game-per-pair rule had ever been global instead of pair-scoped.
//
// The rule the owner chose (2026-11-11): when two searchers already share an open game, OPEN THAT
// SHARED GAME FOR BOTH immediately instead of parking. Continuing a shared game creates no new
// match, so the per-player open-match cap must never block it — only a fresh join or a park.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { RecordingBroadcaster } from '../src/broadcast.js';

const testConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: 10_000,
  waitingExpireMs: 60_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 1000,
    joinPerPlayerPerHour: 1000,
    joinPerIpPerHour: 1000,
    createPerPlayerPerHour: 1000,
    createPerIpPerHour: 1000,
  },
  ...overrides,
});

const harness = (config: ServerConfig = testConfig()) => {
  const storage = new MemoryStorage();
  const broadcaster = new RecordingBroadcaster();
  let now = 1_000_000;
  const service = new MatchService({ storage, config, now: () => now, broadcaster });
  return {
    storage,
    service,
    broadcaster,
    setNow: (t: number) => { now = t; },
  };
};
type Harness = ReturnType<typeof harness>;

const guest = async (h: Harness, name: string) => {
  const created = await h.service.createGuest(name);
  return { token: created.token, player: await h.service.authenticate(created.token) };
};

/** Two players who already share one open (active) game. */
const sharedPair = async (h: Harness) => {
  const a = await guest(h, 'Alder');
  const b = await guest(h, 'Birch');
  const shared = await h.service.createMatch(a.player);
  await h.service.joinMatch(b.player, shared.match.inviteCode!);
  return { a, b, sharedId: shared.match.matchId };
};

const openIds = async (h: Harness, p: { id: string }) =>
  (await h.storage.matchesOfPlayer(p.id)).filter((m) => m.status !== 'finished').map((m) => m.id);

const expectCode = async (promise: Promise<unknown>, code: string): Promise<void> => {
  let caught: unknown;
  try { await promise; } catch (error) { caught = error; }
  expect(caught, `expected ${code}`).toBeInstanceOf(ApiError);
  expect((caught as ApiError).code).toBe(code);
};

describe('Find Opponent when the two searchers already share an open game', () => {
  it('reconnects two already parked searchers who share a game instead of leaving both searching', async () => {
    const h = harness();
    const { a, b, sharedId } = await sharedPair(h);
    const aFind = await h.service.findOpponent(a.player);
    h.setNow(1_011_000); // A was away long enough for B to park a separate search.
    const bFind = await h.service.findOpponent(b.player);
    expect(aFind.paired).toBe(false);
    expect(bFind.paired).toBe(false);
    expect(bFind.match.matchId).not.toBe(aFind.match.matchId);

    // Both pages are now here. A heartbeat must take the SAME continuation path as a fresh Find.
    const resumed = await h.service.findOpponent(a.player);
    expect(resumed.paired).toBe(true);
    expect(resumed.match.matchId).toBe(sharedId);
    expect(await h.storage.openQueueMatchOfPlayer(a.player.id)).toBeNull();
    expect(await h.storage.openQueueMatchOfPlayer(b.player.id)).toBeNull();
    expect(await openIds(h, a.player)).toEqual([sharedId]);
    expect(await openIds(h, b.player)).toEqual([sharedId]);
    expect(h.broadcaster.published.map(p=>p.matchId)).toEqual(expect.arrayContaining([aFind.match.matchId,bFind.match.matchId,sharedId]));
  });
  it('both taps land both players in the SAME shared game, never a second one', async () => {
    const h = harness();
    const { a, b, sharedId } = await sharedPair(h);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false); // A waits first

    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.paired).toBe(true);
    expect(bFind.match.matchId).toBe(sharedId); // their one game, not a new one
    expect(bFind.match.status).toBe('active');

    // A's search is retired; A's only open game is the shared one.
    await expect(h.service.getMatch(a.player, aFind.match.matchId)).rejects.toThrow();
    expect(await openIds(h, a.player)).toEqual([sharedId]);
    expect(await openIds(h, b.player)).toEqual([sharedId]);
  });

  it('the cap never blocks continuing a game the searchers already share (it creates nothing)', async () => {
    const h = harness();
    const { a, b, sharedId } = await sharedPair(h);

    // B is at the per-player limit: one shared game + nine other open invites.
    for (let i = 0; i < DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer - 1; i++) await h.service.createMatch(b.player);
    expect(await openIds(h, b.player)).toHaveLength(DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false);

    // Opening the shared game adds no match, so it is allowed even at the cap.
    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.paired).toBe(true);
    expect(bFind.match.matchId).toBe(sharedId);
  });

  it('the cap still refuses a FRESH pairing (it would create one more open game)', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const capped = await guest(h, 'Capped');
    for (let i = 0; i < DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer; i++) await h.service.createMatch(capped.player);
    const aFind = await h.service.findOpponent(a.player);
    await expectCode(h.service.findOpponent(capped.player), 'TOO_MANY_MATCHES');
    // The waiting search is untouched.
    expect((await h.storage.openQueueMatchOfPlayer(a.player.id))?.id).toBe(aFind.match.matchId);
  });
});

describe('Find Opponent when one searcher already has a game against a THIRD party', () => {
  it('a supplied search id never grants access to another pair or accepts an invalid database id',async()=>{
    const h=harness(),a=await guest(h,'Alder'),b=await guest(h,'Birch'),outsider=await guest(h,'Cedar');
    const original=await h.service.findOpponent(a.player);await h.service.findOpponent(b.player);
    const result=await h.service.findOpponent(outsider.player,null,original.match.matchId);
    expect(result.paired).toBe(false);expect(result.match.matchId).not.toBe(original.match.matchId);
    expect(result.player.seat).toBe(0);
    await expectCode(h.service.findOpponent(outsider.player,null,'not-a-uuid'),'INVALID_REQUEST');
  });
  for(const freshFirst of [true,false])it(`an explicit fresh Find ignores an unmoved OLD search game (stranger first: ${freshFirst})`,async()=>{
    const h=harness(),a=await guest(h,'Alder'),third=await guest(h,'Cedar'),fresh=await guest(h,'Birch');
    const old=await h.service.findOpponent(a.player);await h.service.findOpponent(third.player);
    h.setNow(1_020_000);
    const first=freshFirst?fresh:a,second=freshFirst?a:fresh;
    const parked=await h.service.findOpponent(first.player,null,null);
    expect(parked.paired).toBe(false);expect(parked.match.matchId).not.toBe(old.match.matchId);
    const paired=await h.service.findOpponent(second.player,null,null);
    expect(paired.paired).toBe(true);expect(paired.match.matchId).toBe(parked.match.matchId);
    const caughtUp=await h.service.findOpponent(first.player,null,parked.match.matchId);
    expect(caughtUp.paired).toBe(true);expect(caughtUp.match.matchId).toBe(paired.match.matchId);
    expect((await h.service.getMatch(a.player,old.match.matchId)).status).toBe('active');
  });
  it('pairs with a fresh stranger when the stranger taps first', async () => {
    const h = harness();
    const a = await guest(h, 'Alder'); // will have an open game against Third
    const third = await guest(h, 'Cedar');
    const other = await h.service.createMatch(a.player);
    await h.service.joinMatch(third.player, other.match.inviteCode!);

    const fresh = await guest(h, 'Birch'); // no games at all
    const freshFind = await h.service.findOpponent(fresh.player);
    expect(freshFind.paired).toBe(false);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(true); // NOT a park: the third-party game must not block
    expect(aFind.match.matchId).toBe(freshFind.match.matchId);
    expect(aFind.match.matchId).not.toBe(other.match.matchId);
    expect(aFind.match.status).toBe('active');

    // Both players are in the NEW game; A's third-party game is untouched.
    expect(await openIds(h, a.player)).toEqual(expect.arrayContaining([other.match.matchId, aFind.match.matchId]));
    expect(await openIds(h, fresh.player)).toEqual([aFind.match.matchId]);
    expect((await h.service.getMatch(a.player, other.match.matchId)).status).toBe('active');
  });

  it('pairs with a fresh stranger when the player with the third-party game taps first', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const third = await guest(h, 'Cedar');
    const other = await h.service.createMatch(a.player);
    await h.service.joinMatch(third.player, other.match.inviteCode!);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false); // nobody waiting yet: park

    const fresh = await guest(h, 'Birch');
    const freshFind = await h.service.findOpponent(fresh.player);
    expect(freshFind.paired).toBe(true);
    expect(freshFind.match.matchId).toBe(aFind.match.matchId);
    expect(freshFind.match.matchId).not.toBe(other.match.matchId);
  });
});

// REPEAT FIND MUST RESUME, NEVER DUPLICATE (owner, 2026-11-12). Reproduced on the deployed server:
// A finds (waiting) -> B finds and pairs into it (active, both seats) -> A finds AGAIN -> A got a
// brand-new empty match while B sat in the real one. Both pages looked "searching", in different
// games, forever. The client's findTap() guard is per page, so two devices cannot rely on it.
describe('Find Opponent never starts a second search for the same player', () => {
  it('one player, find twice: the SAME match comes back both times', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const first = await h.service.findOpponent(a.player);
    expect(first.paired).toBe(false);
    const second = await h.service.findOpponent(a.player);
    expect(second.match.matchId).toBe(first.match.matchId);
    expect(second.match.status).toBe('waiting');
    expect(await openIds(h, a.player)).toEqual([first.match.matchId]);
  });

  it('find three times while parked is still one entry', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const first = await h.service.findOpponent(a.player);
    await h.service.findOpponent(a.player);
    const third = await h.service.findOpponent(a.player);
    expect(third.match.matchId).toBe(first.match.matchId);
    expect(await openIds(h, a.player)).toEqual([first.match.matchId]);
  });

  it('after being PAIRED, finding again returns that active game, never a new empty one', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const b = await guest(h, 'Birch');
    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false);
    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.paired).toBe(true);
    expect(bFind.match.matchId).toBe(aFind.match.matchId);

    // THE STRANDING: A's page (or a second device) calls Find again.
    const aAgain = await h.service.findOpponent(a.player);
    expect(aAgain.match.matchId).toBe(aFind.match.matchId);
    expect(aAgain.match.status).toBe('active');
    expect(aAgain.player.status).toBe('active');
    expect(aAgain.paired).toBe(true);
    // No second search is left behind for a stranger to fall into.
    expect(await h.storage.openQueueMatchOfPlayer(a.player.id)).toBeNull();
    expect(await openIds(h, a.player)).toEqual([aFind.match.matchId]);
    expect(await openIds(h, b.player)).toEqual([aFind.match.matchId]);
  });

  it('both seats finding again after a pairing both land in the same active game', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const b = await guest(h, 'Birch');
    const aFind = await h.service.findOpponent(a.player);
    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.match.matchId).toBe(aFind.match.matchId);
    const aAgain = await h.service.findOpponent(a.player);
    const bAgain = await h.service.findOpponent(b.player);
    expect([aAgain.match.matchId, bAgain.match.matchId]).toEqual([aFind.match.matchId, aFind.match.matchId]);
    expect([aAgain.match.status, bAgain.match.status]).toEqual(['active', 'active']);
    expect(await openIds(h, a.player)).toEqual([aFind.match.matchId]);
    expect(await openIds(h, b.player)).toEqual([aFind.match.matchId]);
  });

  it('resuming your own active game wins over joining a stranger waiting in the queue', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const b = await guest(h, 'Birch');
    const stranger = await guest(h, 'Cedar');
    const aFind = await h.service.findOpponent(a.player);
    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.match.matchId).toBe(aFind.match.matchId); // A and B are paired and active
    const strangerFind = await h.service.findOpponent(stranger.player);
    expect(strangerFind.paired).toBe(false); // a real stranger is waiting

    const aAgain = await h.service.findOpponent(a.player);
    // The player goes back to their OWN game, never into a second one; the stranger keeps waiting.
    expect(aAgain.match.matchId).toBe(aFind.match.matchId);
    expect(aAgain.match.status).toBe('active');
    expect((await h.storage.openQueueMatchOfPlayer(stranger.player.id))?.id).toBe(strangerFind.match.matchId);
    expect(await openIds(h, a.player)).toEqual([aFind.match.matchId]);
  });

  it('a game started from an INVITE is not resumed: that is how a player still meets a stranger', async () => {
    const h = harness();
    const { a, sharedId } = await sharedPair(h); // A's shared game came from an invite
    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false); // parks, as before
    expect(aFind.match.matchId).not.toBe(sharedId);
    expect(await openIds(h, a.player)).toEqual(expect.arrayContaining([sharedId, aFind.match.matchId]));
  });
});

describe('Find Opponent happy path (no games anywhere)', () => {
  it('two strangers pair into a new active game', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const b = await guest(h, 'Birch');
    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false);
    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.paired).toBe(true);
    expect(bFind.match.matchId).toBe(aFind.match.matchId);
    expect(bFind.match.status).toBe('active');
    expect(await openIds(h, a.player)).toEqual([aFind.match.matchId]);
    expect(await openIds(h, b.player)).toEqual([aFind.match.matchId]);
  });
});
