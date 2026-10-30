// Territory challenges — with the owner's 2026-10-29 rule: CHALLENGING IS FREE, AND EACH SIDE RISKS
// A TILE. These are unit tests over the in-memory store + service + router, proving the new model:
//
//   * a send debits NOTHING and writes NO ledger row;
//   * the challenger's own nearest tile is the stake (deterministic on ties), and a player with no
//     tile is refused with a clear error;
//   * challenger wins → takes the contested tile, keeps the stake tile (defender −1, challenger +1);
//   * defender wins   → takes the challenger's stake tile, keeps the contested tile (defender +1,
//                        challenger −1); exactly one tile moves;
//   * a draw moves nothing;
//   * settlement is automatic on a read once the duel is finished, and idempotent under both clients;
//   * expiry still forfeits the CONTESTED tile to the challenger, never debits the defender, and the
//     challenger's own staked tile is not lost;
//   * migration 0019 is idempotent by construction.
//
// RULE CHANGE NOTE: this file previously pinned the 50-Seed escrow/refund/TAKE-THE-GROUND model. That
// is no longer the owner's rule, so those expectations were rewritten (not weakened) to the tile-stake
// model above. The legacy Seed rows that already exist are still covered by their own test.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { WORLD_CELL_IDS, WORLD_CELLS, worldNeighbours } from '../src/world.js';
import { WORLD_CHALLENGE_OPEN_LIMIT, WORLD_CHALLENGE_STALE_MS, WORLD_CHALLENGE_TTL_MS } from '../src/seeds/config.js';
import { stakedCellFor } from '../src/seeds/stake.js';
import type { PlayerRecord } from '../src/storage/types.js';

const START = Date.UTC(2026, 9, 21, 12);

const player = (id: string, displayName: string): PlayerRecord => ({
  id, kind: 'guest', displayName, createdAt: START, upgradedAt: null,
});

/** A challenger-adjacent pair: `target` is the defender's tile, `near`/`near2` are the challenger's. */
const pair = ((): { target: string; near: string; near2: string } => {
  for (const cell of WORLD_CELLS) {
    const neighbours = worldNeighbours(cell.id);
    if (neighbours.length >= 3) return { target: cell.id, near: neighbours[0]!, near2: neighbours[1]! };
  }
  throw new Error('the frozen world must contain a cell with three neighbours');
})();

/** A valid map cell that touches neither side of the contested pair. */
const FAR = WORLD_CELLS.find((cell) =>
  cell.id !== pair.target && cell.id !== pair.near && cell.id !== pair.near2 &&
  !worldNeighbours(pair.target).includes(cell.id) && !worldNeighbours(cell.id).includes(pair.target))!.id;

/** Two neighbours tie on distance; the LOWER CELL ID must win, in either insertion order. */
const tiedStake = (): string => (pair.near < pair.near2 ? pair.near : pair.near2);

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
  const tiles = (playerId: string) =>
    [...store.claims.values()].filter((claim) => claim.ownerId === playerId).map((claim) => claim.cellId);
  const finish = async (matchId: string, winnerId: string | null, actorId: string) => {
    const participants = await storage.participantsOf(matchId);
    const winnerSeat = winnerId === null ? null : participants.find((p) => p.playerId === winnerId)!.seat;
    return (await storage.resignMatch(matchId, actorId, clock, {
      winner: winnerSeat, reason: 'resigned', scores: [0, 0],
    }))!;
  };
  return {
    storage, store, service, a, b, c, register, own, fund, balances, tiles, finish,
    now: () => clock,
    advance: (ms: number) => { clock += ms; },
  };
};

const send = (h: ReturnType<typeof makeHarness>, challenger: PlayerRecord, cellId: string, requestId: string) =>
  h.service.sendChallenge(challenger, cellId, requestId);

const accept = async (h: ReturnType<typeof makeHarness>, challengeId: string) =>
  h.service.respond(h.b, challengeId, true);

describe('the stake is chosen, free, and never a Seed', () => {
  it('chooses the challenger’s nearest own tile, deterministically on ties', () => {
    const claims = [
      { cellId: pair.near2, ownerId: 'a' },
      { cellId: FAR, ownerId: 'a' },
      { cellId: pair.near, ownerId: 'a' },
      { cellId: pair.target, ownerId: 'b' },
    ];
    const chosen = stakedCellFor('a', pair.target, claims);
    expect(chosen).toBe(tiedStake());
    // Insertion order cannot change the answer: the tie-break is the lowest cell id.
    expect(stakedCellFor('a', pair.target, [...claims].reverse())).toBe(chosen);
    // Only the challenger's own tiles are eligible.
    expect(stakedCellFor('c', pair.target, claims)).toBeNull();
  });

  it('sends for FREE: no wallet debit, no ledger row, stake 0, the tile recorded', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.near2, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, 0);
    h.fund(h.b.id, 0);

    const out = await send(h, h.a, pair.target, 'challenge-request-1');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.challenge).toMatchObject({
      cellId: pair.target, challengerId: h.a.id, defenderId: h.b.id,
      status: 'pending', stake: 0, stakeCellId: tiedStake(),
      challengerName: 'BloomHeron', defenderName: 'RYK',
    });
    expect(await h.balances([h.a.id, h.b.id])).toEqual([0, 0]);
    expect(h.store.ledger).toHaveLength(0);
    expect(h.store.challenges.size).toBe(1);
  });

  it('refuses a challenger with no tile of their own with NO_TILE', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b, h.c);
    h.own(pair.target, h.b.id);
    // `c` owns nothing at all: there is no tile to put at stake.
    expect(await send(h, h.c, pair.target, 'no-tile-request')).toMatchObject({ ok: false, code: 'NO_TILE' });
    expect(h.store.ledger).toHaveLength(0);
  });

  it('refuses your own tile, an adjacent-less tile, an unowned cell and rock', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b, h.c);
    h.own(pair.target, h.a.id); // my own tile
    h.own(FAR, h.c.id); // a holder far away
    const farOwn = WORLD_CELLS.find((cell) => cell.id !== pair.target && cell.id !== FAR && !h.store.claims.has(cell.id))!.id;
    h.own(farOwn, h.a.id);

    expect(await send(h, h.a, pair.target, 'own-tile-request')).toMatchObject({ ok: false, code: 'OWN_TILE' });
    expect(await send(h, h.c, pair.target, 'far-request')).toMatchObject({ ok: false, code: 'NOT_ADJACENT' });
    const free = WORLD_CELLS.find((cell) => !h.store.claims.has(cell.id) && cell.id !== pair.target)!.id;
    expect(await send(h, h.a, free, 'free-request')).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    expect(await send(h, h.a, '99,99', 'rock-request')).toMatchObject({ ok: false, code: 'INVALID_CELL' });
    expect(WORLD_CELL_IDS.has('99,99')).toBe(false);
    expect(h.store.ledger).toHaveLength(0);
  });

  it('keeps ONE open challenge per cell and at most three outgoing', async () => {
    const h = makeHarness();
    const hub = WORLD_CELLS.find((cell) => worldNeighbours(cell.id).length >= 4)!.id;
    const targets = worldNeighbours(hub).slice(0, 4);
    const defenders = targets.map((_, index) => player(`cap-defender-${index}`, `Defender ${index}`));
    await h.register(h.a, ...defenders);
    h.own(hub, h.a.id);
    for (const [index, cellId] of targets.entries()) h.own(cellId, defenders[index]!.id);
    // One tile backs one stake (territory-challenge-integrity.test.ts), so the cap is reached with
    // enough tiles to back three challenges: three more of a's, away from the contested ring.
    const near = new Set([hub, ...targets, ...targets.flatMap((t) => worldNeighbours(t))]);
    for (const cell of WORLD_CELLS.filter((c) => !near.has(c.id)).slice(0, 3)) h.own(cell.id, h.a.id);

    expect((await send(h, h.a, targets[0]!, 'first-request-1')).ok).toBe(true);
    expect(await send(h, h.a, targets[0]!, 'first-request-2')).toMatchObject({ ok: false, code: 'CELL_BUSY' });
    for (let index = 1; index < WORLD_CHALLENGE_OPEN_LIMIT; index++) {
      expect((await send(h, h.a, targets[index]!, `cap-request-${index}`)).ok).toBe(true);
    }
    expect(await send(h, h.a, targets[3]!, 'cap-request-3')).toMatchObject({ ok: false, code: 'TOO_MANY_OPEN' });
    expect(h.store.ledger).toHaveLength(0);
  });

  it('replays a send with the same request id without a second row', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);

    const first = await send(h, h.a, pair.target, 'same-request-id');
    const again = await send(h, h.a, pair.target, 'same-request-id');
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.challenge.id).toBe(first.challenge.id);
    expect(again.challenge.stakeCellId).toBe(first.challenge.stakeCellId);
    expect(again.replayed).toBe(true);
    expect(h.store.challenges.size).toBe(1);
    expect(h.store.ledger).toHaveLength(0);
  });

  it('declining changes nothing: no tile, no Seed, no ledger row', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.b.id, 40);
    const before = await h.balances([h.a.id, h.b.id]);

    const sent = await send(h, h.a, pair.target, 'decline-request');
    if (!sent.ok) throw new Error('send failed');
    const declined = await h.service.respond(h.b, sent.challenge.id, false);
    expect(declined.challenge.status).toBe('declined');
    const again = await h.service.respond(h.b, sent.challenge.id, false);
    expect(again.challenge.status).toBe('declined');

    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
    expect(h.store.claims.get(pair.near)?.ownerId).toBe(h.a.id);
    expect(h.store.ledger).toHaveLength(0);
  });
});

describe('the winner takes the loser’s tile', () => {
  it('challenger wins: takes the contested tile and KEEPS the staked tile', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near2, h.a.id);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, 30);
    h.fund(h.b.id, 70);
    const revisionBefore = h.store.revision;

    const sent = await send(h, h.a, pair.target, 'challenger-win-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await accept(h, sent.challenge.id);
    await h.finish(accepted.matchId!, h.a.id, h.a.id);

    // NO CONFIRM: the read settles it.
    const list = await h.service.challenges(h.a);
    expect(list.outgoing[0]).toMatchObject({ status: 'resolved', winnerId: h.a.id, cellId: pair.target });

    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.a.id);
    expect(h.store.claims.get(tiedStake())?.ownerId).toBe(h.a.id);
    expect(h.tiles(h.b.id)).toHaveLength(0);
    expect(h.tiles(h.a.id).sort()).toEqual([pair.near, pair.near2, pair.target].sort());
    expect(h.store.revision).toBe(revisionBefore + 1);
    // No Seeds moved: not on the send, not on the settlement.
    expect(await h.balances([h.a.id, h.b.id])).toEqual([30, 70]);
    expect(h.store.ledger).toHaveLength(0);
  });

  it('defender wins: takes the challenger’s staked tile and KEEPS the contested tile', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.near2, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.a.id, 30);
    h.fund(h.b.id, 70);
    const revisionBefore = h.store.revision;

    const sent = await send(h, h.a, pair.target, 'defender-win-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await accept(h, sent.challenge.id);
    await h.finish(accepted.matchId!, h.b.id, h.b.id);

    const settled = await h.service.challenges(h.b);
    expect(settled.outgoing).toHaveLength(0);
    expect(settled.incoming).toHaveLength(0);
    expect(await h.store.challenge(sent.challenge.id)).toMatchObject({ status: 'resolved', winnerId: h.b.id });

    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
    // The loser (the challenger) lost exactly the auto-chosen stake tile.
    expect(h.store.claims.get(tiedStake())?.ownerId).toBe(h.b.id);
    const otherOwn = tiedStake() === pair.near ? pair.near2 : pair.near;
    expect(h.store.claims.get(otherOwn)?.ownerId).toBe(h.a.id);
    expect(h.tiles(h.a.id)).toHaveLength(1);
    expect(h.tiles(h.b.id).sort()).toEqual([pair.target, tiedStake()].sort());
    expect(h.store.revision).toBe(revisionBefore + 1);
    expect(await h.balances([h.a.id, h.b.id])).toEqual([30, 70]);
    expect(h.store.ledger).toHaveLength(0);
  });

  it('a draw moves NOTHING', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    const revisionBefore = h.store.revision;

    const sent = await send(h, h.a, pair.target, 'draw-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await accept(h, sent.challenge.id);
    await h.finish(accepted.matchId!, null, h.a.id);

    await h.service.challenges(h.a);
    expect(await h.store.challenge(sent.challenge.id)).toMatchObject({ status: 'resolved', winnerId: null });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
    expect(h.store.claims.get(pair.near)?.ownerId).toBe(h.a.id);
    expect(h.store.revision).toBe(revisionBefore);
    expect(h.store.ledger).toHaveLength(0);
  });

  it('settles exactly once when both clients read (and confirm) at the same time', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    const revisionBefore = h.store.revision;

    const sent = await send(h, h.a, pair.target, 'race-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await accept(h, sent.challenge.id);
    await h.finish(accepted.matchId!, h.a.id, h.a.id);

    const [first, second] = await Promise.all([
      h.service.confirm(h.a, sent.challenge.id),
      h.service.confirm(h.b, sent.challenge.id),
    ]);
    expect([first.settled, second.settled].filter(Boolean)).toHaveLength(1);
    expect(first.winnerId).toBe(h.a.id);
    expect(second.winnerId).toBe(h.a.id);
    expect(h.store.revision).toBe(revisionBefore + 1);
    // Repeated reads never apply it again.
    await h.service.challenges(h.a);
    await h.service.world();
    expect(h.store.revision).toBe(revisionBefore + 1);
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.a.id);
  });

  it('never settles an unfinished duel; the public map read settles a finished one', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    const sent = await send(h, h.a, pair.target, 'public-settle-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await accept(h, sent.challenge.id);

    await h.service.world();
    expect(await h.store.challenge(sent.challenge.id)).toMatchObject({ status: 'accepted' });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);

    await h.finish(accepted.matchId!, h.a.id, h.a.id);
    await h.service.world();
    expect(await h.store.challenge(sent.challenge.id)).toMatchObject({ status: 'resolved', winnerId: h.a.id });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.a.id);
  });

  // THE ONE NOTIFICATION RULE (owner, 2026-10-30): a Territory lamp lights only for a move of the
  // viewer's own. The wire says whose turn the linked duel is on, computed from the match's actor —
  // exactly one of the two participants sees `true`, and it is the one whose seat is acting.
  it('the wire says whose turn the linked duel is on, for both seats', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    const sent = await send(h, h.a, pair.target, 'wire-turn-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await accept(h, sent.challenge.id);
    const match = await h.storage.matchById(accepted.matchId!);
    const actorSeat = match!.state.actor;

    const challengerList = await h.service.challenges(h.a);
    const defenderList = await h.service.challenges(h.b);
    const challengerView = challengerList.outgoing.find((c) => c.id === sent.challenge.id)!;
    const defenderView = defenderList.incoming.find((c) => c.id === sent.challenge.id)!;
    expect(challengerView.matchWaitingForMe).toBe(actorSeat === 0);
    expect(defenderView.matchWaitingForMe).toBe(actorSeat === 1);
    expect(challengerView.matchWaitingForMe).not.toBe(defenderView.matchWaitingForMe);
  });
});

describe('expiry is still a forfeit, and the staked tile is not lost', () => {
  it('an unanswered challenge forfeits the CONTESTED tile and keeps the challenger’s stake tile', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.b.id, 25);
    const before = await h.balances([h.a.id, h.b.id]);
    const revisionBefore = h.store.revision;

    const sent = await send(h, h.a, pair.target, 'forfeit-request');
    if (!sent.ok) throw new Error('send failed');
    h.advance(WORLD_CHALLENGE_TTL_MS - 60_000);
    expect(await h.service.expireChallenges(h.now())).toBe(0);
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);

    h.advance(60_001);
    expect(await h.service.expireChallenges(h.now())).toBe(1);
    expect(await h.store.challenge(sent.challenge.id)).toMatchObject({ status: 'expired', winnerId: h.a.id });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.a.id);
    // The challenger's own tile was never escrowed, so it is still theirs.
    expect(h.store.claims.get(pair.near)?.ownerId).toBe(h.a.id);
    expect(h.store.revision).toBe(revisionBefore + 1);
    // The defender loses only the tile, never Seeds; no wallet row of any kind is written.
    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    expect(h.store.ledger).toHaveLength(0);
    // A second sweep must not move or pay anything again.
    expect(await h.service.expireChallenges(h.now())).toBe(0);
    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    await expect(h.service.respond(h.b, sent.challenge.id, true)).rejects.toMatchObject({ code: 'CHALLENGE_CLOSED' });
  });

  it('an accepted challenge unsettled for 7 days closes stale and never transfers', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    const before = await h.balances([h.a.id, h.b.id]);

    const sent = await send(h, h.a, pair.target, 'stale-request');
    if (!sent.ok) throw new Error('send failed');
    const accepted = await accept(h, sent.challenge.id);

    h.advance(WORLD_CHALLENGE_STALE_MS + 1);
    expect(await h.service.expireChallenges(h.now())).toBe(1);
    expect(await h.store.challenge(sent.challenge.id)).toMatchObject({ status: 'stale' });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
    expect(h.store.claims.get(pair.near)?.ownerId).toBe(h.a.id);
    expect(await h.balances([h.a.id, h.b.id])).toEqual(before);
    expect(h.store.ledger).toHaveLength(0);

    await h.finish(accepted.matchId!, h.a.id, h.a.id);
    await expect(h.service.confirm(h.a, sent.challenge.id)).rejects.toMatchObject({ code: 'CHALLENGE_CLOSED' });
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
  });

  it('a LEGACY Seed-stake row still settles under its recorded rule (old data stays honest)', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    h.fund(h.b.id, 0);
    // A row written before 2026-10-29: 50 Seeds escrowed, no tile recorded.
    h.store.challenges.set('legacy-1', {
      id: 'legacy-1', cellId: pair.target, challengerId: h.a.id, defenderId: h.b.id,
      status: 'accepted', stake: 50, stakeCellId: null, createdAt: h.now(), expiresAt: h.now() + WORLD_CHALLENGE_TTL_MS,
      respondedAt: h.now(), matchId: null, winnerId: null, resolvedAt: null,
    });
    const result = await h.store.settleChallenge({ id: 'legacy-1', playerId: h.b.id, winnerId: h.b.id, now: h.now() });
    expect(result).toMatchObject({ ok: true, settled: true });
    // The contested tile is untouched; the defender takes the stake the row recorded.
    expect(h.store.claims.get(pair.target)?.ownerId).toBe(h.b.id);
    expect(await h.balances([h.a.id, h.b.id])).toEqual([0, 50]);
    expect(h.store.ledger).toHaveLength(1);
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

  it('is bearer-only, sends idempotently, names the stake, and never exposes a balance', async () => {
    const h = makeHarness();
    await h.register(h.a, h.b);
    h.own(pair.near, h.a.id);
    h.own(pair.target, h.b.id);
    const router = routerFor(h);
    const body = () => ({
      method: 'POST',
      headers: { authorization: 'Bearer token-a', 'content-type': 'application/json' },
      body: JSON.stringify({ cellId: pair.target, requestId: 'route-request-1' }),
    });
    const path = '/v1/world/challenges';

    await expect(router(new Request('http://test.local/v1/world/challenges'), path)).rejects.toMatchObject({ status: 401 });
    const first = await router(new Request('http://test.local/v1/world/challenges', body()), path);
    expect(first?.status).toBe(201);
    const firstBody = first?.body as { ok: boolean; challenge: { id: string; stake: number; stakeCellId: string }; replayed: boolean };
    expect(firstBody.ok).toBe(true);
    expect(firstBody.replayed).toBe(false);
    expect(firstBody.challenge).toMatchObject({ stake: 0, stakeCellId: pair.near });
    expect(JSON.stringify(firstBody)).not.toContain('wallet');
    expect(JSON.stringify(firstBody)).not.toContain('balance');

    const again = await router(new Request('http://test.local/v1/world/challenges', body()), path);
    expect((again?.body as { challenge: { id: string }; replayed: boolean }).challenge.id).toBe(firstBody.challenge.id);
    expect((again?.body as { replayed: boolean }).replayed).toBe(true);

    const list = await router(new Request('http://test.local/v1/world/challenges', {
      headers: { authorization: 'Bearer token-a' },
    }), path);
    expect(list?.status).toBe(200);
    const listBody = list?.body as { incoming: unknown[]; outgoing: { id: string; status: string; stakeCellId: string }[] };
    expect(listBody.incoming).toHaveLength(0);
    expect(listBody.outgoing[0]).toMatchObject({ id: firstBody.challenge.id, status: 'pending', stakeCellId: pair.near });
    expect(JSON.stringify(listBody)).not.toContain('wallet');

    const respond = await router(new Request('http://test.local/v1/world/challenges/' + firstBody.challenge.id + '/respond', {
      method: 'POST',
      headers: { authorization: 'Bearer token-b', 'content-type': 'application/json' },
      body: JSON.stringify({ accept: false }),
    }), `/v1/world/challenges/${firstBody.challenge.id}/respond`);
    expect(respond?.status).toBe(200);
    expect((respond?.body as { challenge: { status: string } }).challenge.status).toBe('declined');
  });
});

describe('migration 0019', () => {
  const sql = readFileSync(new URL('../migrations/0019_challenge_tile_stake.sql', import.meta.url), 'utf8');
  const squashed = sql.replace(/\s+/g, ' ').toLowerCase();

  it('adds the stake column without an unsafe foreign key, and a guarded stake check', () => {
    expect(squashed).toContain('alter table world_challenges add column if not exists stake_cell_id text');
    expect(squashed).toContain('check (stake >= 0)');
    // A CHECK is swapped inside a DO block that first drops the old definition, so a re-run is a no-op.
    expect(squashed).toContain('do $$');
    expect(squashed).toContain('pg_get_constraintdef');
    expect(squashed).toContain("execute format('alter table world_challenges drop constraint %i', existing.conname)");
  });

  it('is idempotent and keeps the historical stake column', () => {
    expect(squashed).not.toContain('drop column');
    expect(squashed).toContain('create index if not exists world_challenges_stake_cell_idx');
    expect(squashed).toContain('create index if not exists world_challenges_accepted_idx');
    // The historical column is deliberately kept for old rows; only NEW sends write 0.
    expect(squashed).toContain('`stake` is kept');
  });
});
