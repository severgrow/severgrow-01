// AN ACCOUNT'S PLACE IS READ FROM ITS OWN RECEIPTS (owner report, 2026-10-25).
//
// There is no campaign table. The furthest Campaign level a player has a verified first-clear
// receipt for IS their place, and `GET /v1/seeds/wallet` now carries it as `campaignHighestLevel`
// beside the wallet the client already reads. The read has no player id in the request at all: the
// player comes from the bearer token, so one account can never ask for another's place.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';

const config = (): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 10_000,
    joinPerPlayerPerHour: 10_000,
    joinPerIpPerHour: 10_000,
    createPerPlayerPerHour: 10_000,
    createPerIpPerHour: 10_000,
  },
});

const harness = () => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  const economy = new WorldEconomyService(store, storage, () => 1_000_000);
  const service = new MatchService({ storage, config: config(), now: () => 1_000_000, economy });
  const router = createWorldEconomyRouter({ economy, authenticate: (token) => service.authenticate(token) });
  return { storage, store, economy, service, router };
};

/** A signed-in-style account: a real player row and a real token from the service. */
const player = async (h: ReturnType<typeof harness>) => {
  const created = await h.service.createGuest();
  return { token: created.token, record: await h.service.authenticate(created.token) };
};

/** A verified campaign clear, recorded exactly the way the settle path writes one. */
const cleared = async (h: ReturnType<typeof harness>, playerId: string, level: number) => {
  const id = `c${Math.ceil(level / 10)}-${String(level).padStart(2, '0')}`;
  await h.store.settle({
    playerId, sourceKey: `campaign:${id}`, mode: 'campaign', outcome: 'win',
    opponentId: null, now: Date.UTC(2026, 9, 1), campaignLevel: level,
  });
};

const wallet = (h: ReturnType<typeof harness>, token: string | null, search = '') =>
  h.router(new Request(`https://futasaku.test/v1/seeds/wallet${search}`, {
    method: 'GET',
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  }), '/v1/seeds/wallet');

describe("the wallet read also reports the account's furthest cleared Campaign level", () => {
  it('is the highest campaign receipt, null when the player has never cleared one', async () => {
    const h = harness();
    const a = await player(h);
    const fresh = await wallet(h, a.token);
    expect(fresh?.status).toBe(200);
    expect(fresh?.body).toMatchObject({ ok: true, campaignHighestLevel: null });

    for (const level of [1, 2, 11, 17, 36]) await cleared(h, a.record.id, level);
    const res = await wallet(h, a.token);
    expect(res?.status).toBe(200);
    expect(res?.body).toMatchObject({ ok: true, campaignHighestLevel: 36 });
  });

  it('counts only this player’s own campaign receipts', async () => {
    const h = harness();
    const a = await player(h);
    const b = await player(h);
    for (const level of [1, 11, 36]) await cleared(h, a.record.id, level);
    await cleared(h, b.record.id, 5);

    expect((await wallet(h, a.token))?.body).toMatchObject({ campaignHighestLevel: 36 });
    expect((await wallet(h, b.token))?.body).toMatchObject({ campaignHighestLevel: 5 });
  });

  it('ignores a playerId in the query: the token alone decides whose place is read', async () => {
    const h = harness();
    const a = await player(h);
    const b = await player(h);
    await cleared(h, a.record.id, 36);
    await cleared(h, b.record.id, 5);

    // The attempt at a cross-player read: A's token, B's id in the URL.
    const res = await wallet(h, a.token, `?playerId=${encodeURIComponent(b.record.id)}`);
    expect(res?.status).toBe(200);
    expect(res?.body).toMatchObject({ campaignHighestLevel: 36 });
    expect((res?.body as { campaignHighestLevel: number }).campaignHighestLevel).not.toBe(5);
  });

  it('refuses an unauthenticated or unknown token', async () => {
    const h = harness();
    await expect(wallet(h, null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(wallet(h, 'not-a-real-token')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('the store read is the same number the public map shows for the tile owner', async () => {
    const h = harness();
    const a = await player(h);
    // Levels 1-3 pay 50 and 4-6 pay 15, so the wallet can afford the 100-Seed first claim.
    for (const level of [1, 2, 3, 4, 5, 6]) await cleared(h, a.record.id, level);
    expect((await h.store.claim(a.record.id, '0,0', 'request-abc123', 2)).ok).toBe(true);
    const snapshot = await h.store.world();
    expect(snapshot.claims[0]?.ownerLevel).toBe(6);
    expect(await h.store.campaignHighestLevel(a.record.id)).toBe(6);
  });
});
