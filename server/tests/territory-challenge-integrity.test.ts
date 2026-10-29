// A STAKE IS A PROMISE, AND EACH TILE CAN BACK ONLY ONE (2026-10-29 abuse pass).
//
// Challenging is free (owner, 2026-10-29): the challenger puts one of their own tiles at stake. The
// nearest own tile used to be chosen with no regard for what else was already riding on it, so a
// player holding ONE tile could stake it in three challenges at once. Lose all three and only the
// first winner could collect; the other two defenders won a duel and got nothing. The same hole let a
// tile that someone else was already challenging be staked again.
//
// The rule now: a tile already staked in one of your open challenges, or contested by an open
// challenge, is not offered again. The next-nearest free tile is staked instead; with none left the
// send is refused as NO_TILE, before anything is promised. Everything else stays generous: still
// free, still up to three open challenges, no cooldowns.
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { WORLD_CELLS, worldNeighbours } from '../src/world.js';
import { stakedCellFor } from '../src/seeds/stake.js';
import type { PlayerRecord } from '../src/storage/types.js';

const START = Date.UTC(2026, 9, 29, 12);
const player = (id: string): PlayerRecord => ({ id, kind: 'guest', displayName: id, createdAt: START, upgradedAt: null });

/** A home tile with three distinct neighbours: the challenger lives at `home`, rivals around it. */
const ring = (() => {
  for (const cell of WORLD_CELLS) {
    const n = worldNeighbours(cell.id);
    if (n.length >= 4) return { home: cell.id, n };
  }
  throw new Error('the world must hold a cell with four neighbours');
})();

const harness = async () => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  const service = new WorldEconomyService(store, storage, () => START);
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(player) as [PlayerRecord, PlayerRecord, PlayerRecord, PlayerRecord];
  for (const p of [a, b, c, d]) await storage.createPlayer(p);
  const own = (cellId: string, ownerId: string) =>
    store.claims.set(cellId, { cellId, ownerId, ownerName: null, ownerLevel: null, claimedAt: START });
  return { storage, store, service, a, b, c, d, own };
};

describe('one tile backs one stake', () => {
  it('a player with ONE tile cannot promise it in a second challenge', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    h.own(ring.n[0]!, 'b');
    h.own(ring.n[1]!, 'c');
    const first = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-first-1');
    expect(first.ok && first.challenge.stakeCellId).toBe(ring.home);
    const second = await h.service.sendChallenge(h.a, ring.n[1]!, 'req-second-1');
    expect(second).toEqual({ ok: false, code: 'NO_TILE' });
  });

  it('with a second tile, the second challenge stakes THAT tile, so both defenders can collect', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    h.own(ring.n[2]!, 'a');
    h.own(ring.n[0]!, 'b');
    h.own(ring.n[1]!, 'c');
    const first = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-first-2');
    const second = await h.service.sendChallenge(h.a, ring.n[1]!, 'req-second-2');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.challenge.stakeCellId).not.toBe(second.challenge.stakeCellId);
    expect(new Set([first.challenge.stakeCellId, second.challenge.stakeCellId])).toEqual(new Set([ring.home, ring.n[2]!]));
  });

  it('a tile someone else is challenging cannot be staked again', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    h.own(ring.n[0]!, 'b');
    h.own(ring.n[1]!, 'd');
    // d challenges a's only tile: it is now contested
    const incoming = await h.service.sendChallenge(h.d, ring.home, 'req-incoming-3');
    expect(incoming.ok).toBe(true);
    const out = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-outgoing-3');
    expect(out).toEqual({ ok: false, code: 'NO_TILE' });
  });

  it('a stake frees up again once its challenge closes (declined)', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    h.own(ring.n[0]!, 'b');
    h.own(ring.n[1]!, 'c');
    const first = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-first-4');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await h.service.respond(h.b, first.challenge.id, false);
    const again = await h.service.sendChallenge(h.a, ring.n[1]!, 'req-again-4');
    expect(again.ok && again.challenge.stakeCellId).toBe(ring.home);
  });

  it('a replayed send still returns its original challenge (the stake rule never breaks a retry)', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    h.own(ring.n[0]!, 'b');
    const first = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-replay-5');
    const replay = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-replay-5');
    expect(first.ok && replay.ok && replay.replayed && replay.challenge.id === first.challenge.id).toBe(true);
  });

  it('a staked tile cannot be sold out from under its challenge', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    h.own(ring.n[0]!, 'b');
    await h.service.sendChallenge(h.a, ring.n[0]!, 'req-sell-6');
    const sale = await h.service.sell(h.a, ring.home, 'req-sale-6');
    expect(sale).toMatchObject({ ok: false, code: 'CELL_BUSY' });
  });
});

describe('stakedCellFor: the one definition, with the unavailable set', () => {
  it('skips unavailable tiles and falls back to the next nearest, deterministically', () => {
    const claims = [{ cellId: ring.home, ownerId: 'a' }, { cellId: ring.n[2]!, ownerId: 'a' }];
    expect(stakedCellFor('a', ring.n[0]!, claims, new Set([ring.home]))).toBe(ring.n[2]);
    expect(stakedCellFor('a', ring.n[0]!, claims, new Set([ring.home, ring.n[2]!]))).toBeNull();
  });
});
