// Guests earn Seeds (encourage login to keep them), but placing a planet tile needs an account
// (owner, 2026-11-08).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import type { PlayerRecord } from '../src/storage/types.js';

const NOW = Date.UTC(2026, 10, 8, 12);

const guest = (id: string): PlayerRecord => ({
  id, kind: 'guest', displayName: null, createdAt: NOW, upgradedAt: null,
});
const account = (id: string): PlayerRecord => ({
  id, kind: 'account', displayName: 'Bloom', createdAt: NOW, upgradedAt: NOW,
});

describe('planet tile claim is account-only', () => {
  it('refuses a guest with FORBIDDEN, and still lets a signed-in account through the gate', async () => {
    const storage = new MemoryStorage();
    const store = new MemoryWorldEconomyStore();
    const service = new WorldEconomyService(store, storage, () => NOW);
    store.wallets.set('guest-1', { balance: 500, lifetimeEarned: 500, lifetimeSpent: 0, worldInvitationSeen: true });
    store.wallets.set('acct-1', { balance: 500, lifetimeEarned: 500, lifetimeSpent: 0, worldInvitationSeen: true });

    await expect(service.claim(guest('guest-1'), '0,0', 'request-guest1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<ApiError>);

    // Account passes the identity gate (the store may still refuse for map rules — that is separate).
    try {
      await service.claim(account('acct-1'), '0,0', 'request-acct01');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).not.toBe('FORBIDDEN');
    }
  });
});
