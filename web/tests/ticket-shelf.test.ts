// READY TRAINING TICKETS (owner, 2026-11-13: Practice "takes few seconds to start ... should be way
// quicker and snappy"; then: "bounded and reusable ... invalidate them on account changes, expiry or
// relevant level changes"). One ticket per (tier, level), per account, fetched ahead, taken at the tap.
import { describe, expect, it, vi } from 'vitest';
import type { KeyValue } from '../../server/src/client.js';
import { fillTicketShelf, shelfNeeds, takeShelfTicket } from '../src/online/ticket-shelf.js';
import { ACCOUNT_BOUND_KEYS } from '../src/accounts/signout-reset.js';
import { TICKET_SHELF_KEY } from '../src/online/ticket-shelf.js';

const kv = (): KeyValue => {
  const data = new Map<string, string>();
  return { get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); }, remove: (k) => { data.delete(k); } };
};
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const issuer = (playerId: string) => vi.fn(async (botLevel: number) => ({ id: `t-${botLevel}-${Math.random()}`, seed: 1000 + botLevel, playerId, expiresAt: NOW + 7 * DAY }));

describe('the ticket shelf is bounded and reusable', () => {
  it('fills each missing tier once; opening the menu again or switching tier fetches nothing', async () => {
    const store = kv();
    const request = issuer('p1');
    const wanted = [{ tier: 'easy', tierLevel: 3 }, { tier: 'medium', tierLevel: 5 }, { tier: 'hard', tierLevel: 9 }];
    await fillTicketShelf(store, 'p1', wanted, (l) => (l === 9 ? 11 : l), request, NOW);
    expect(request).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 5; i++) await fillTicketShelf(store, 'p1', wanted, (l) => l, request, NOW);
    expect(request).toHaveBeenCalledTimes(3);
    expect(takeShelfTicket(store, 'p1', 'hard', 9, NOW)).toMatchObject({ botLevel: 11, seed: 1011 });
    expect(takeShelfTicket(store, 'p1', 'hard', 9, NOW)).toBeNull();
  });

  it('a level change fetches only the new level and keeps the old one for later (nothing wasted)', async () => {
    const store = kv();
    const request = issuer('p1');
    await fillTicketShelf(store, 'p1', [{ tier: 'medium', tierLevel: 5 }], (l) => l, request, NOW);
    await fillTicketShelf(store, 'p1', [{ tier: 'medium', tierLevel: 6 }], (l) => l, request, NOW);
    expect(request).toHaveBeenCalledTimes(2);
    expect(takeShelfTicket(store, 'p1', 'medium', 5, NOW)).not.toBeNull();
    expect(takeShelfTicket(store, 'p1', 'medium', 6, NOW)).not.toBeNull();
  });

  it('a ticket is only ever used by the account it was issued to', async () => {
    const store = kv();
    await fillTicketShelf(store, 'p1', [{ tier: 'easy', tierLevel: 3 }], (l) => l, issuer('p1'), NOW);
    expect(takeShelfTicket(store, 'p2', 'easy', 3, NOW)).toBeNull();
    expect(takeShelfTicket(store, null, 'easy', 3, NOW)).toBeNull();
    // An answer that comes back for another account (it changed mid-request) is not kept.
    await fillTicketShelf(store, 'p3', [{ tier: 'easy', tierLevel: 3 }], (l) => l, issuer('p4'), NOW);
    expect(shelfNeeds(store, 'p3', [{ tier: 'easy', tierLevel: 3 }], NOW)).toHaveLength(1);
  });

  it('an expiring ticket is never used; a failed request keeps nothing', async () => {
    const store = kv();
    await fillTicketShelf(store, 'p1', [{ tier: 'easy', tierLevel: 3 }], (l) => l, async () => ({ id: 'a', seed: 1, playerId: 'p1', expiresAt: NOW + 1000 }), NOW);
    expect(takeShelfTicket(store, 'p1', 'easy', 3, NOW)).toBeNull();
    await fillTicketShelf(store, 'p1', [{ tier: 'easy', tierLevel: 4 }], (l) => l, async () => null, NOW);
    expect(shelfNeeds(store, 'p1', [{ tier: 'easy', tierLevel: 4 }], NOW)).toHaveLength(1);
  });

  it('sign-out clears the shelf', () => {
    expect(ACCOUNT_BOUND_KEYS).toContain(TICKET_SHELF_KEY);
  });
});
