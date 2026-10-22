// The owner's two dashboard edits (2026-10-22: "allocate seeds to any accounts, and also edit the
// world map ... so I can simulate manually"). Both are admin-only, both are audited, and neither may
// create or lose a Seed silently: an adjustment is one ledger row in its own category, and a tile
// edit that lands on an open Territory challenge refunds the escrow before the tile changes hands.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { hashToken, newId, newToken } from '../src/ids.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { createFetchApp } from '../src/fetch-app.js';
import { chainRouters } from '../src/feedback/feedback.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { memoryAdminStore } from '../src/admin/memory.js';
import { createAdminRouter } from '../src/admin/router.js';
import type { AdminAuditEntry, AdminStore } from '../src/admin/types.js';
import { WORLD_CELLS, worldNeighbours } from '../src/world.js';
import { SEED_ECONOMY } from '../src/seeds/config.js';

const ADMIN_ID = '37e3d4d0-a34c-45b3-bc61-992fcf392912';
const NOW = 1_760_000_000_000;

const setup = () => {
  const storage = new MemoryStorage();
  const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], adminPlayerIds: [ADMIN_ID] };
  const economy = new MemoryWorldEconomyStore();
  const service = new MatchService({ storage, config, now: () => NOW });
  const base = memoryAdminStore({ storage, feedback: null as never, economy, links: null as never });
  const audits: AdminAuditEntry[] = [];
  const store: AdminStore = { ...base, audit: async (entry) => { audits.push(entry); await base.audit(entry); } };
  const admin = createAdminRouter({
    store, economy, authenticate: (t) => service.authenticate(t), config, now: () => NOW,
    rulesVersion: service.rulesVersion, storage, log: () => undefined,
  });
  const app = createFetchApp({ service, config, live: chainRouters(async () => null, admin) });
  const makePlayer = async (id: string | null, name: string): Promise<{ player: PlayerRecord; token: string }> => {
    const player: PlayerRecord = { id: id ?? newId(), kind: 'account', displayName: name, createdAt: NOW, upgradedAt: NOW };
    await storage.createPlayer(player);
    const token = newToken();
    await storage.issueToken({ id: newId(), playerId: player.id, tokenHash: hashToken(token), createdAt: NOW, revokedAt: null });
    return { player, token };
  };
  return { storage, economy, store, audits, app, makePlayer };
};

const call = async (app: (req: Request) => Promise<Response>, path: string, token: string | null, body: unknown) => {
  const res = await app(new Request(`http://x${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const ADJUST = '/v1/admin/seeds/adjust';
const CELL = '/v1/admin/world/cell';
const pair = (() => {
  for (const cell of WORLD_CELLS) {
    const near = worldNeighbours(cell.id);
    if (near.length) return { target: cell.id, near: near[0]! };
  }
  throw new Error('no adjacent pair');
})();

describe('admin edits are admin-only', () => {
  it('refuses both edits with no token (401) and with a normal player token (403), changing nothing', async () => {
    const t = setup();
    const player = await t.makePlayer(null, 'Player');
    for (const [path, body] of [[ADJUST, { playerId: player.player.id, delta: 500, requestId: 'req-00000001' }], [CELL, { cellId: pair.target, ownerId: player.player.id }]] as const) {
      expect((await call(t.app, path, null, body)).status).toBe(401);
      expect((await call(t.app, path, player.token, body)).status).toBe(403);
    }
    expect((await t.economy.wallet(player.player.id)).balance).toBe(0);
    expect(t.economy.claims.size).toBe(0);
    expect(t.economy.ledger).toHaveLength(0);
  });
});

describe('admin: allocate Seeds', () => {
  it('adds and removes Seeds as one ledger row each, audited, never below zero', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'RYK');
    const player = await t.makePlayer(null, 'Tester');
    const id = player.player.id;

    const add = await call(t.app, ADJUST, admin.token, { playerId: id, delta: 500, reason: 'challenge test', requestId: 'req-add-0001' });
    expect(add.status).toBe(200);
    expect(add.body).toMatchObject({ ok: true, balance: 500, delta: 500, replayed: false });
    expect((await t.economy.wallet(id)).balance).toBe(500);

    const remove = await call(t.app, ADJUST, admin.token, { playerId: id, delta: -200, requestId: 'req-take-0001' });
    expect(remove.body).toMatchObject({ ok: true, balance: 300 });

    // Below zero is refused, not clamped: the owner sees the real balance and nothing is written.
    const tooMuch = await call(t.app, ADJUST, admin.token, { playerId: id, delta: -301, requestId: 'req-take-0002' });
    expect(tooMuch.status).toBe(400);
    expect((await t.economy.wallet(id)).balance).toBe(300);

    const rows = t.economy.ledger.filter((e) => e.playerId === id);
    expect(rows.map((e) => [e.category, e.delta, e.balanceAfter])).toEqual([['admin_adjust', 500, 500], ['admin_adjust', -200, 300]]);
    const audit = t.audits;
    expect(audit.filter((a) => a.action === 'seeds.adjust').map((a) => a.detail)).toEqual([
      expect.objectContaining({ delta: 500, balanceAfter: 500, reason: 'challenge test' }),
      expect.objectContaining({ delta: -200, balanceAfter: 300 }),
    ]);
  });

  it('a retried request id applies once', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'RYK');
    const player = await t.makePlayer(null, 'Tester');
    const body = { playerId: player.player.id, delta: 250, requestId: 'req-retry-001' };
    await call(t.app, ADJUST, admin.token, body);
    const again = await call(t.app, ADJUST, admin.token, body);
    expect(again.body).toMatchObject({ ok: true, balance: 250, replayed: true });
    expect((await t.economy.wallet(player.player.id)).balance).toBe(250);
  });

  it('refuses an unknown player, a zero or fractional amount, and a missing request id', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'RYK');
    const player = await t.makePlayer(null, 'Tester');
    expect((await call(t.app, ADJUST, admin.token, { playerId: newId(), delta: 5, requestId: 'req-ghost-01' })).status).toBe(404);
    for (const delta of [0, 1.5, 'lots', 2_000_000]) {
      expect((await call(t.app, ADJUST, admin.token, { playerId: player.player.id, delta, requestId: 'req-bad-0001' })).status, String(delta)).toBe(400);
    }
    expect((await call(t.app, ADJUST, admin.token, { playerId: player.player.id, delta: 5 })).status).toBe(400);
    expect(t.economy.ledger).toHaveLength(0);
  });
});

describe('admin: edit the world map', () => {
  it('gives any cell to any player and clears it again, free, ignoring adjacency, bumping the revision', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'RYK');
    const a = await t.makePlayer(null, 'A');
    const b = await t.makePlayer(null, 'B');
    const before = t.economy.revision;

    const given = await call(t.app, CELL, admin.token, { cellId: pair.target, ownerId: a.player.id });
    expect(given.status).toBe(200);
    expect(given.body).toMatchObject({ ok: true, cellId: pair.target, previousOwnerId: null, ownerId: a.player.id, changed: true });
    expect(t.economy.claims.get(pair.target)?.ownerId).toBe(a.player.id);
    expect((await t.economy.wallet(a.player.id)).balance).toBe(0); // free: no Seed moved

    // A far cell for the same player: the claim adjacency rule does not bind the owner's edits.
    const far = WORLD_CELLS.find((c) => c.id !== pair.target && !worldNeighbours(pair.target).includes(c.id))!.id;
    expect((await call(t.app, CELL, admin.token, { cellId: far, ownerId: a.player.id })).status).toBe(200);

    expect((await call(t.app, CELL, admin.token, { cellId: pair.target, ownerId: b.player.id })).body).toMatchObject({ previousOwnerId: a.player.id, ownerId: b.player.id });
    expect((await call(t.app, CELL, admin.token, { cellId: pair.target, ownerId: null })).body).toMatchObject({ previousOwnerId: b.player.id, ownerId: null, changed: true });
    expect(t.economy.claims.has(pair.target)).toBe(false);
    expect(t.economy.revision).toBe(before + 4);

    // Setting what is already there is a no-op: no revision bump.
    expect((await call(t.app, CELL, admin.token, { cellId: pair.target, ownerId: null })).body).toMatchObject({ changed: false });
    expect(t.economy.revision).toBe(before + 4);
    expect(t.economy.ledger).toHaveLength(0);

    const audit = t.audits;
    expect(audit.filter((x) => x.action === 'world.cell')).toHaveLength(4);
  });

  it('refuses rock / an unknown cell and an unknown player', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'RYK');
    const a = await t.makePlayer(null, 'A');
    expect((await call(t.app, CELL, admin.token, { cellId: '999,999', ownerId: a.player.id })).status).toBe(400);
    expect((await call(t.app, CELL, admin.token, { cellId: pair.target, ownerId: newId() })).status).toBe(404);
    expect(t.economy.claims.size).toBe(0);
  });

  it('an edit on a challenged cell closes the challenge and refunds the escrow first', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'RYK');
    const a = await t.makePlayer(null, 'Challenger');
    const b = await t.makePlayer(null, 'Defender');
    const c = await t.makePlayer(null, 'Newcomer');
    t.economy.claims.set(pair.near, { cellId: pair.near, ownerId: a.player.id, ownerName: null, ownerLevel: null, claimedAt: NOW });
    t.economy.claims.set(pair.target, { cellId: pair.target, ownerId: b.player.id, ownerName: null, ownerLevel: null, claimedAt: NOW });
    t.economy.wallets.set(a.player.id, { balance: SEED_ECONOMY.tileCost, lifetimeEarned: SEED_ECONOMY.tileCost, lifetimeSpent: 0, worldInvitationSeen: true });
    const sent = await t.economy.sendChallenge({ challengerId: a.player.id, cellId: pair.target, requestId: 'req-chal-0001', stake: SEED_ECONOMY.tileCost, now: NOW });
    expect(sent.ok).toBe(true);
    expect((await t.economy.wallet(a.player.id)).balance).toBe(0);

    const out = await call(t.app, CELL, admin.token, { cellId: pair.target, ownerId: c.player.id });
    expect(out.body).toMatchObject({ ok: true, challengesClosed: 1 });
    expect(t.economy.claims.get(pair.target)?.ownerId).toBe(c.player.id);
    expect((await t.economy.wallet(a.player.id)).balance).toBe(SEED_ECONOMY.tileCost);
    if (sent.ok) expect((await t.economy.challenge(sent.challenge.id))?.status).toBe('stale');
  });
});
