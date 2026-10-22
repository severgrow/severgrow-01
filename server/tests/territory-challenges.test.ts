// Territory challenges — the paid-tile loop (docs/TERRITORY-CHALLENGES.md, owner's four decisions).
//
// These are unit tests over the in-memory store + service + router. They prove the rules that can be
// proven without a second human: adjacency, one open challenge per cell, the escrow, first-confirmed
// settlement, the 24 h forfeit, the 7-day stale close, and — above all — that Seeds CONSERVE. The
// real Postgres adapter and a live two-account pass are separate, explicit gaps.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { WORLD_CELL_IDS, WORLD_CELLS, worldNeighbours } from '../src/world.js';
import { SEED_ECONOMY, WORLD_CHALLENGE_STALE_MS, WORLD_CHALLENGE_TTL_MS } from '../src/seeds/config.js';
import type { PlayerRecord } from '../src/storage/types.js';

const START = Date.UTC(2026, 9, 21, 12);

const player = (id: string, displayName: string): PlayerRecord => ({
  id, kind: 'guest', displayName, createdAt: START, upgradedAt: null,
});

/** A challenger-adjacent pair: `target` is the defender's tile, `near` is the challenger's. */
const pair = ((): { target: string; near: string; near2: string } => {
  for (const cell of WORLD_CELLS) {
    const neighbours = worldNeighbours(cell.id);
    if (neighbours.length >= 2) return { target: cell.id, near: neighbours[0]!, near2: neighbours[1]! };
  }
  throw new Error('the frozen world must contain a cell with two neighbours');
})();

/** A valid map cell that touches neither side of the contested pair. */
const FAR = WORLD_CELLS.find((cell) =>
  cell.id !== pair.target && cell.id !== pair.near &&
  !worldNeighbours(pair.target).includes(cell.id) && !worldNeighbours(cell.id).includes(pair.target))!.id;

const makeHarness = () => {
  let clock = START;
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  const service = new WorldEconomyService(store, storage, () => clock);
  const a = player('player-a', 'BloomHeron');
  const b = player('player-b', 'RYK');
  const c = player('player-c', 'Lidwingo');
  const register = async (...players: PlayerRecord[]) => {
    for (const p of players) await storage.createPlayer(p);
  };
  const own = (cellId: string, ownerId: string) => {
    store.claims.set(cellId, { cellId, ownerId, ownerName: null, ownerLevel: null, claimedAt: clock });
  };
  const fund = (playerId: string, balance: number) => {
    store.wallets.set(playerId, { balance, lifetimeEarned: balance, lifetimeSpent: 0, worldInvitationSeen: true });
  };
  const balances = async (ids: string[]) => {
    const out: number[] = [];
    for (const id of ids) out.push((await store.wallet(id)).balance);
    return out;
  };
  /** Sum of every signed ledger delta — the conservation check that does not trust the wallets. */
  const ledgerSum = (ids: string[]) =>
    store.ledger.filter((entry) => ids.includes(entry.playerId)).reduce((total, entry) => total + entry.delta, 0);
  const finish = async (matchId: string, winnerId: string, loserId: string) => {
    const participants = await storage.participantsOf(matchId);
    const winnerSeat = participants.find((p) => p.playerId === winnerId)!.seat;
    return (await storage.resignMatch(matchId, loserId, clock, {
      winner: winnerSeat, reason: 'resigned', scores: [0, 0],
    }))!;
  };
  return {
    storage, store, service, a, b, c, register, own, fund, balances, ledgerSum, finish,
    now: () => clock,
    advance: (ms: number) => { clock += ms; },
  };
};

const send = (h: ReturnType<typeof makeHarness>, challenger: PlayerRecord, cellId: string, requestId: string) =>
  h.service.sendChallenge(challenger, cellId, requestId);

describe('territory challenges: the send', () => {
  it('escrows exactly one tile price and creates a pending challenge on an adjacent rival tile', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);

    const out = await send(h, h.a, pair.target, 'challenge-request-1');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.challenge).toMatchObject({
      cellId: pair.target, challengerId: h.a.id, defenderId: h.b.id,
      status: 'pending', stake: SEED_ECONOMY.tileCost, challengerName: 'BloomHeron', defenderName: 'RYK',
    });
    expect((await h.store.wallet(h.a.id)).balance).toBe(0);
    // The escrow is honestly categorised and exactly one row.
    const escrow = h.store.ledger.filter((entry) => entry.category === 'world_challenge');
    expect(escrow).toHaveLength(1);
    expect(escrow[0]).toMatchObject({ playerId: h.a.id, delta: -SEED_ECONOMY.tileCost });
    expect(escrow[0]!.sourceKey).toContain(':escrow');
  });

  it('refuses your own tile, an adjacent-less tile, an unowned cell and rock', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.target, h.a.id); // my own tile
    h.own(FAR, h.c.id); // a holder far away
    h.fund(h.a.id, SEED_ECONOMY.tileCost * 4);
    h.fund(h.c.id, SEED_ECONOMY.tileCost * 4);

    expect(await send(h, h.a, pair.target, 'own-tile-request')).toMatchObject({ ok: false, code: 'OWN_TILE' });
    expect(await send(h, h.c, pair.target, 'far-request')).toMatchObject({ ok: false, code: 'NOT_ADJACENT' });
    // A valid, unowned map cell is not a challenge target: challenges are for held ground only.
    const free = WORLD_CELLS.find((cell) => !h.store.claims.has(cell.id) && cell.id !== pair.target)!.id;
    expect(await send(h, h.a, free, 'free-request')).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    // Rock holds no tile and is not even a world cell.
    expect(await send(h, h.a, '99,99', 'rock-request')).toMatchObject({ ok: false, code: 'INVALID_CELL' });
    expect(WORLD_CELL_IDS.has('99,99')).toBe(false);
    // Not one rejected request took a Seed.
    expect(await h.store.wallet(h.a.id)).toMatchObject({ balance: SEED_ECONOMY.tileCost * 4 });
    expect(h.store.ledger).toHaveLength(0);
  });

  it('enforces ONE open challenge per cell, even from a different challenger', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b, h.c);
    h.own(pair.near, h.a.id);
    h.own(pair.near2, h.c.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost * 2);
    h.fund(h.c.id, SEED_ECONOMY.tileCost);

    expect((await send(h, h.a, pair.target, 'first-challenger-1')).ok).toBe(true);
    expect(await send(h, h.a, pair.target, 'first-challenger-2')).toMatchObject({ ok: false, code: 'CELL_BUSY' });
    expect(await send(h, h.c, pair.target, 'second-challenger')).toMatchObject({ ok: false, code: 'CELL_BUSY' });
    // Only the first send debited a stake.
    expect((await h.store.wallet(h.a.id)).balance).toBe(SEED_ECONOMY.tileCost);
    expect((await h.store.wallet(h.c.id)).balance).toBe(SEED_ECONOMY.tileCost);
  });

  it('holds at most three open outgoing challenges', async () => {
    const h = makeHarness();
    const hub = WORLD_CELLS.find((cell) => worldNeighbours(cell.id).length >= 4)!.id;
    const targets = worldNeighbours(hub).slice(0, 4);
    const defenders = targets.map((_, index) => player(`cap-defender-${index}`, `Defender ${index}`));
    await h.register(h.a, ...defenders);
    h.own(hub, h.a.id);
    for (const [index, cellId] of targets.entries()) h.own(cellId, defenders[index]!.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost * 4);

    for (let index = 0; index < 3; index++) {
      expect((await send(h, h.a, targets[index]!, `cap-request-${index}`)).ok).toBe(true);
    }
    expect(await send(h, h.a, targets[3]!, 'cap-request-3')).toMatchObject({ ok: false, code: 'TOO_MANY_OPEN' });
    // Three escrows, never a fourth.
    expect((await h.store.wallet(h.a.id)).balance).toBe(SEED_ECONOMY.tileCost);
    expect(h.store.ledger.filter((entry) => entry.delta < 0)).toHaveLength(3);
  });

  it('replays a send with the same request id without a second escrow', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);

    const first = await send(h, h.a, pair.target, 'same-request-id');
    const again = await send(h, h.a, pair.target, 'same-request-id');
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.challenge.id).toBe(first.challenge.id);
    expect(again.replayed).toBe(true);
    expect(h.store.challenges.size).toBe(1);
    expect((await h.store.wallet(h.a.id)).balance).toBe(0);
  });
});

describe('territory challenges: decline and conservation', () => {
  it('send -> decline refunds the stake exactly once and conserves Seeds', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);
    h.fund(h.b.id, 40);
    const before = await h.balances([h.a.id, h.b.id]);

    const sent = await send(h, h.a, pair.target, 'decline-request');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect((await h.store.wallet(h.a.id)).balance).toBe(0);

    const declined = await h.service.respond(h.b, sent.challenge.id, false);
    expect(declined.challenge.status).toBe('declined');
    // A retried decline is the original answer, not a second refund.
    const again = await h.service.respond(h.b, sent.challenge.id, false);
    expect(again.challenge.status).toBe('declined');

    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    expect(h.ledgerSum([h.a.id, h.b.id])).toBe(0);
    expect((await h.store.wallet(h.a.id)).balance).toBe(SEED_ECONOMY.tileCost);
    // The tile never moves on a decline.
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
  });
});

describe('territory challenges: accept, linked duel, first-confirmed-wins', () => {
  it('accept creates a kind=territory match; the first confirm transfers the tile and stake once', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);
    h.fund(h.b.id, 0);
    const revisionBefore = h.store.revision;

    const sent = await send(h, h.a, pair.target, 'accept-request');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const accepted = await h.service.respond(h.b, sent.challenge.id, true);
    expect(accepted.challenge.status).toBe('accepted');
    expect(accepted.matchId).not.toBeNull();

    const match = await h.storage.matchById(accepted.matchId!);
    expect(match).toMatchObject({ kind: 'territory', status: 'active' });
    expect((await h.storage.participantsOf(accepted.matchId!)).map((p) => p.playerId).sort())
      .toEqual([h.a.id, h.b.id].sort());
    // A second accept is the original answer.
    expect((await h.service.respond(h.b, sent.challenge.id, true)).challenge.status).toBe('accepted');

    // The duel has not finished: confirmation is refused (only a FINISHED match may settle).
    await expect(h.service.confirm(h.a, sent.challenge.id)).rejects.toMatchObject({ code: 'MATCH_NOT_FINISHED' });

    await h.finish(accepted.matchId!, h.a.id, h.b.id);
    const first = await h.service.confirm(h.a, sent.challenge.id);
    expect(first).toMatchObject({ settled: true, winnerId: h.a.id, cellId: pair.target });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.a.id);
    expect(h.store.revision).toBe(revisionBefore + 1);
    // The challenger wins their own stake back; the defender's balance never changes.
    expect(await h.balances([h.a.id, h.b.id])).toEqual([SEED_ECONOMY.tileCost, 0]);
    expect(h.ledgerSum([h.a.id, h.b.id])).toBe(0);

    // Second confirm (from the loser) replays the stored result and transfers nothing again.
    const second = await h.service.confirm(h.b, sent.challenge.id);
    expect(second).toMatchObject({ settled: false, winnerId: h.a.id, cellId: pair.target, replayed: true });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.a.id);
    expect(h.store.revision).toBe(revisionBefore + 1);
    expect(await h.balances([h.a.id, h.b.id])).toEqual([SEED_ECONOMY.tileCost, 0]);
    expect(h.store.ledger.filter((entry) => entry.delta > 0)).toHaveLength(1);
  });

  it('a defender win keeps the tile and takes the challenger stake (still zero-sum)', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);
    h.fund(h.b.id, 0);
    const before = await h.balances([h.a.id, h.b.id]);

    const sent = await send(h, h.a, pair.target, 'defender-win-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await h.service.respond(h.b, sent.challenge.id, true);
    await h.finish(accepted.matchId!, h.b.id, h.a.id);

    const settled = await h.service.confirm(h.b, sent.challenge.id);
    expect(settled).toMatchObject({ settled: true, winnerId: h.b.id });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
    // Total Seeds are unchanged (100 before, 100 after); the feature's own ledger nets to zero.
    expect(before.reduce((sum, value) => sum + value, 0)).toBe(SEED_ECONOMY.tileCost);
    expect(await h.balances([h.a.id, h.b.id])).toEqual([0, SEED_ECONOMY.tileCost]);
    expect(h.ledgerSum([h.a.id, h.b.id])).toBe(0);
  });

  it('only the two participants may answer or confirm', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b, h.c);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);
    const sent = await send(h, h.a, pair.target, 'stranger-request');
    if (!sent.ok) throw new Error('send failed');
    await expect(h.service.respond(h.c, sent.challenge.id, true)).rejects.toMatchObject({ code: 'CHALLENGE_NOT_FOUND' });
    await expect(h.service.confirm(h.c, sent.challenge.id)).rejects.toMatchObject({ code: 'CHALLENGE_NOT_FOUND' });
  });
});

describe('territory challenges: expiry is a forfeit, stale never transfers', () => {
  it('an unanswered challenge forfeits the tile to the challenger after 24 h, once', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);
    h.fund(h.b.id, 25);
    const before = await h.balances([h.a.id, h.b.id]);
    const revisionBefore = h.store.revision;

    const sent = await send(h, h.a, pair.target, 'forfeit-request');
    if (!sent.ok) throw new Error('send failed');
    // Not yet: 24 h minus a minute is still the defender's window.
    h.advance(WORLD_CHALLENGE_TTL_MS - 60_000);
    expect(await h.service.expireChallenges(h.now())).toBe(0);
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);

    h.advance(60_001);
    expect(await h.service.expireChallenges(h.now())).toBe(1);
    const expired = await h.store.challenge(sent.challenge.id);
    expect(expired).toMatchObject({ status: 'expired', winnerId: h.a.id });
    // The owner's decision: the challenger takes the ground by forfeit.
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.a.id);
    expect(h.store.revision).toBe(revisionBefore + 1);
    // The challenger's own stake comes back; the defender loses only the tile, never Seeds.
    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    expect(h.ledgerSum([h.a.id, h.b.id])).toBe(0);
    // A second sweep must not pay twice or move anything again.
    expect(await h.service.expireChallenges(h.now())).toBe(0);
    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    // A late defender answer is refused: the challenge already forfeited.
    await expect(h.service.respond(h.b, sent.challenge.id, true)).rejects.toMatchObject({ code: 'CHALLENGE_CLOSED' });
    expect(await h.storage.matchesOfPlayer(h.a.id)).toHaveLength(0);
  });

  it('an accepted challenge unsettled for 7 days closes stale, refunds, and never transfers', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);
    h.fund(h.b.id, 0);
    const before = await h.balances([h.a.id, h.b.id]);

    const sent = await send(h, h.a, pair.target, 'stale-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await h.service.respond(h.b, sent.challenge.id, true);
    expect(accepted.challenge.status).toBe('accepted');

    h.advance(WORLD_CHALLENGE_STALE_MS + 1);
    expect(await h.service.expireChallenges(h.now())).toBe(1);
    expect(await h.store.challenge(sent.challenge.id)).toMatchObject({ status: 'stale' });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    expect(h.ledgerSum([h.a.id, h.b.id])).toBe(0);
    // A finished duel cannot be confirmed after the stale close.
    await h.finish(accepted.matchId!, h.a.id, h.b.id);
    await expect(h.service.confirm(h.a, sent.challenge.id)).rejects.toMatchObject({ code: 'CHALLENGE_CLOSED' });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
  });
});

describe('territory challenges: HTTP surface', () => {
  const routerFor = (h: ReturnType<typeof makeHarness>) => createWorldEconomyRouter({
    economy: h.service,
    authenticate: async (token) => {
      if (token === 'token-a') return h.a;
      if (token === 'token-b') return h.b;
      throw Object.assign(new Error('Sign in first.'), { code: 'UNAUTHORIZED', status: 401 });
    },
  });

  it('is bearer-only, sends idempotently, and never exposes a balance', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, SEED_ECONOMY.tileCost);
    const router = routerFor(h);
    const body = () => ({
      method: 'POST',
      headers: { authorization: 'Bearer token-a', 'content-type': 'application/json' },
      body: JSON.stringify({ cellId: pair.target, requestId: 'route-request-1' }),
    });
    const path = '/v1/world/challenges';

    await expect(router(new Request('http://test.local/v1/world/challenges'), path)).rejects.toMatchObject({ status: 401 });
    // A GET with no token is refused too (the map at /v1/world stays public; challenges do not).
    await expect(router(new Request('http://test.local/v1/world/challenges'), path)).rejects.toMatchObject({ status: 401 });

    const first = await router(new Request('http://test.local/v1/world/challenges', body()), path);
    expect(first?.status).toBe(201);
    const firstBody = first?.body as { ok: boolean; challenge: { id: string }; replayed: boolean };
    expect(firstBody.ok).toBe(true);
    expect(firstBody.replayed).toBe(false);
    expect(JSON.stringify(firstBody)).not.toContain('wallet');
    expect(JSON.stringify(firstBody)).not.toContain('balance');

    const again = await router(new Request('http://test.local/v1/world/challenges', body()), path);
    expect((again?.body as { challenge: { id: string }; replayed: boolean }).challenge.id).toBe(firstBody.challenge.id);
    expect((again?.body as { replayed: boolean }).replayed).toBe(true);

    const list = await router(new Request('http://test.local/v1/world/challenges', {
      headers: { authorization: 'Bearer token-a' },
    }), path);
    expect(list?.status).toBe(200);
    const listBody = list?.body as { incoming: unknown[]; outgoing: { id: string; status: string }[] };
    expect(listBody.incoming).toHaveLength(0);
    expect(listBody.outgoing).toHaveLength(1);
    expect(listBody.outgoing[0]).toMatchObject({ id: firstBody.challenge.id, status: 'pending' });
    expect(JSON.stringify(listBody)).not.toContain('wallet');

    const respond = await router(new Request('http://test.local/v1/world/challenges/' + firstBody.challenge.id + '/respond', {
      method: 'POST',
      headers: { authorization: 'Bearer token-b', 'content-type': 'application/json' },
      body: JSON.stringify({ accept: false }),
    }), `/v1/world/challenges/${firstBody.challenge.id}/respond`);
    expect(respond?.status).toBe(200);
    expect((respond?.body as { challenge: { status: string } }).challenge.status).toBe('declined');
    expect((await h.store.wallet(h.a.id)).balance).toBe(SEED_ECONOMY.tileCost);
  });
});

describe('migration 0014', () => {
  const sql = readFileSync(new URL('../migrations/0014_world_challenges.sql', import.meta.url), 'utf8');
  const squashed = sql.replace(/\s+/g, ' ').toLowerCase();

  it('creates the challenge table with the design statuses and one open challenge per cell', () => {
    expect(squashed).toContain('create table if not exists world_challenges');
    for (const status of ['pending', 'accepted', 'declined', 'expired', 'resolved', 'stale']) {
      expect(squashed).toContain(`'${status}'`);
    }
    expect(squashed).toContain('create unique index if not exists world_challenges_one_open_idx');
    expect(squashed).toContain("where status in ('pending', 'accepted')");
    expect(squashed).toContain('unique (challenger_id, request_key)');
    expect(squashed).toContain('check (challenger_id <> defender_id)');
  });

  it('marks territory matches and lets a claim be taken, without weakening security', () => {
    expect(squashed).toContain("alter table matches add column if not exists kind text not null default 'duel'");
    expect(squashed).toContain("check (kind in ('duel', 'territory'))");
    expect(squashed).toContain("check (source in ('legacy', 'purchase', 'challenge', 'admin'))");
    expect(squashed).toContain('alter table world_challenges enable row level security');
    expect(squashed).toContain('revoke all on world_challenges from');
    expect(squashed).not.toContain('create policy');
  });
});
