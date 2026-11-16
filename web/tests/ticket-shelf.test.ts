// READY TRAINING TICKETS (owner, 2026-11-13: Practice "takes few seconds to start ... should be way
// quicker and snappy"; then: "bounded and reusable ... invalidate them on account changes, expiry or
// relevant level changes"). One ticket per (tier, level), per account, fetched ahead, taken at the tap.
import { describe, expect, it, vi } from 'vitest';
import type { KeyValue } from '../../server/src/client.js';
import { ensureShelfTicket, fillTicketShelf, shelfNeeds, takeShelfTicket } from '../src/online/ticket-shelf.js';
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

describe('the tap takes the ticket, or the remainder of the fill already on its way', () => {
  it('a ticket already on the shelf is returned with NO request at all', async () => {
    const store = kv();
    const request = issuer('p1');
    await fillTicketShelf(store, 'p1', [{ tier: 'easy', tierLevel: 3 }], (l) => l, request, NOW);
    request.mockClear();
    const taken = await ensureShelfTicket(store, 'p1', { tier: 'easy', tierLevel: 3 }, (l) => l, request, 8_000, NOW);
    expect(taken).toMatchObject({ seed: 1003 });
    expect(request).not.toHaveBeenCalled();
    // ...and it is single-use, exactly like `takeShelfTicket`.
    expect(await ensureShelfTicket(store, 'p1', { tier: 'easy', tierLevel: 3 }, (l) => l, request, 0, NOW)).toMatchObject({ seed: 1003 });
  });

  it('an empty shelf is filled once and the ticket is returned', async () => {
    const store = kv();
    const request = issuer('p1');
    const taken = await ensureShelfTicket(store, 'p1', { tier: 'medium', tierLevel: 5 }, (l) => l, request, 8_000, NOW);
    expect(taken).toMatchObject({ tier: 'medium', tierLevel: 5, seed: 1005 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a second call for the same tier shares the request already in flight (never two tickets)', async () => {
    const store = kv();
    let release: (v: { id: string; seed: number; playerId: string; expiresAt: number }) => void = () => undefined;
    const request = vi.fn(() => new Promise<{ id: string; seed: number; playerId: string; expiresAt: number }>((resolve) => { release = resolve; }));
    const first = ensureShelfTicket(store, 'p1', { tier: 'hard', tierLevel: 9 }, (l) => l, request, 8_000, NOW);
    const second = ensureShelfTicket(store, 'p1', { tier: 'hard', tierLevel: 9 }, (l) => l, request, 8_000, NOW);
    release({ id: 'one', seed: 2222, playerId: 'p1', expiresAt: NOW + 7 * DAY });
    const [a, b] = await Promise.all([first, second]);
    expect(request).toHaveBeenCalledTimes(1);
    // The one ticket goes to one of them; the other is told so instead of waiting for a second.
    expect([a?.seed, b?.seed].filter((s) => s === 2222)).toHaveLength(1);
  });

  it('a deadline gives up without throwing, and the fill still lands on the shelf for the next match', async () => {
    const store = kv();
    const request = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return { id: 'late', seed: 3333, playerId: 'p1', expiresAt: NOW + 7 * DAY };
    });
    const taken = await ensureShelfTicket(store, 'p1', { tier: 'easy', tierLevel: 3 }, (l) => l, request, 1, NOW);
    expect(taken).toBeNull();
    await new Promise((r) => setTimeout(r, 80));
    // Nothing was posted twice, and the ticket is waiting for the next game rather than wasted.
    expect(request).toHaveBeenCalledTimes(1);
    expect(takeShelfTicket(store, 'p1', 'easy', 3, NOW)).toMatchObject({ seed: 3333 });
  });

  it('no account means no ticket and no request', async () => {
    const store = kv();
    const request = issuer('p1');
    expect(await ensureShelfTicket(store, null, { tier: 'easy', tierLevel: 3 }, (l) => l, request, 8_000, NOW)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
