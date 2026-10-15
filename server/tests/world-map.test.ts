// The shared world map (the seed spike): a finished duel leaves ONE permanent mark.
//
// This is deliberately NOT a territory system — no regions, no income, no claim/defend. These
// tests pin only what the spike promises:
//   * win a duel and you earn exactly ONE tile, and the same duel can never award twice;
//   * placement is decided ENTIRELY on the server from data the server owns, so a client cannot
//     steer a cell (there is no endpoint that accepts one, and the hash input is the server-minted
//     match id);
//   * beat a player who holds a tile and you TAKE that tile from them (the challenge rule);
//   * the map is a PUBLIC read — no account needed to look at it.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { WORLD_MAP_CELLS, planWorldPlacement, worldMapCell } from '../src/world.js';

const config = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: 10_000,
  waitingExpireMs: 3_600_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 10_000,
    joinPerPlayerPerHour: 10_000,
    joinPerIpPerHour: 10_000,
    createPerPlayerPerHour: 10_000,
    createPerIpPerHour: 10_000,
    worldPerIpPerHour: 10_000,
  },
  ...overrides,
});

const harness = (overrides: Partial<ServerConfig> = {}) => {
  const storage = new MemoryStorage();
  const cfg = config(overrides);
  const service = new MatchService({ storage, config: cfg, now: () => 1_000_000 });
  return { storage, service, cfg };
};

const guest = async (service: MatchService, name: string) => {
  const created = await service.createGuest(name);
  return { token: created.token, player: await service.authenticate(created.token) };
};

/** Drive a real duel to a finish by resigning: the resigning player loses, the other wins. */
const duelWhere = async (
  service: MatchService,
  winner: Awaited<ReturnType<typeof guest>>,
  loser: Awaited<ReturnType<typeof guest>>,
) => {
  const created = await service.createMatch(winner.player);
  await service.joinMatch(loser.player, created.match.inviteCode);
  await service.resign(loser.player, created.match.matchId);
  return created.match.matchId;
};

describe('planWorldPlacement (pure)', () => {
  it('is deterministic: the same input always plans the same cell', () => {
    const input = { matchId: 'match-abc', winnerId: 'w', loserId: 'l', tiles: [] };
    const first = planWorldPlacement(input);
    const second = planWorldPlacement(input);
    expect(first).toEqual(second);
  });

  it('derives the free cell from the match id, so two matches differ', () => {
    const a = planWorldPlacement({ matchId: 'match-a', winnerId: 'w', loserId: 'l', tiles: [] });
    const b = planWorldPlacement({ matchId: 'match-b', winnerId: 'w', loserId: 'l', tiles: [] });
    expect(a.kind).toBe('claim');
    expect(b.kind).toBe('claim');
    // Not a hard guarantee for every pair, but these two ids must not collide.
    expect(worldMapCell('match-a')).not.toBe(worldMapCell('match-b'));
  });

  it('TAKES the beaten opponent\'s tile before claiming a free one', () => {
    // The loser holds cell 5; the winner holds nothing.
    const plan = planWorldPlacement({
      matchId: 'match-a',
      winnerId: 'w',
      loserId: 'l',
      tiles: [{ cell: 5, ownerId: 'l' }],
    });
    expect(plan).toEqual({ kind: 'takeover', cell: 5 });
  });

  it('never returns a cell outside the fixed grid', () => {
    const plan = planWorldPlacement({ matchId: 'match-a', winnerId: 'w', loserId: 'l', tiles: [] });
    expect(plan.kind).toBe('claim');
    if (plan.kind === 'claim') {
      expect(plan.cell).toBeGreaterThanOrEqual(0);
      expect(plan.cell).toBeLessThan(WORLD_MAP_CELLS);
    }
  });

  it('awards nothing when the map is full and the opponent holds no tile', () => {
    const full = Array.from({ length: WORLD_MAP_CELLS }, (_, cell) => ({ cell, ownerId: `other-${cell}` }));
    const plan = planWorldPlacement({ matchId: 'match-a', winnerId: 'w', loserId: 'l', tiles: full });
    expect(plan).toEqual({ kind: 'none' });
  });
});

describe('worldMapCell', () => {
  it('is stable for a given match id and inside the grid', () => {
    const cell = worldMapCell('match-abc');
    expect(worldMapCell('match-abc')).toBe(cell);
    expect(cell).toBeGreaterThanOrEqual(0);
    expect(cell).toBeLessThan(WORLD_MAP_CELLS);
  });
});

describe('winning a duel awards one tile', () => {
  it('a won duel puts exactly one tile on the shared map, held by the winner', async () => {
    const { service } = harness();
    const a = await guest(service, 'Winner');
    const b = await guest(service, 'Loser');

    expect((await service.worldMap()).filled).toBe(0);
    await duelWhere(service, a, b);

    const map = await service.worldMap();
    expect(map.filled).toBe(1);
    expect(map.tiles).toHaveLength(1);
    // Guests get a generated nature name, so assert against the winner's REAL display name.
    expect(map.tiles[0]!.ownerName).toBe(a.player.displayName);
    expect(map.tiles[0]!.tookOver).toBe(false);
    expect(map.cells).toBe(WORLD_MAP_CELLS);
  });

  it('never awards the SAME duel twice, however often the finish is observed', async () => {
    const { service, storage } = harness();
    const a = await guest(service, 'Winner');
    const b = await guest(service, 'Loser');
    const matchId = await duelWhere(service, a, b);

    // Re-running the award for the same finished match must be a no-op (match_id is unique).
    const finished = await storage.matchById(matchId);
    expect(finished).not.toBeNull();
    await service.awardDuelTile(finished!);
    await service.awardDuelTile(finished!);

    expect((await service.worldMap()).filled).toBe(1);
  });

  it('the challenge rule: beating a tile holder TAKES their tile rather than adding a new one', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const b = await guest(service, 'B');

    // A beats B: A claims the first tile.
    await duelWhere(service, a, b);
    const afterFirst = await service.worldMap();
    expect(afterFirst.filled).toBe(1);
    const claimedCell = afterFirst.tiles[0]!.cell;
    expect(afterFirst.tiles[0]!.ownerName).toBe(a.player.displayName);

    // B beats A: B takes A's tile. The map does NOT grow.
    await duelWhere(service, b, a);
    const afterSecond = await service.worldMap();
    expect(afterSecond.filled).toBe(1);
    expect(afterSecond.tiles[0]!.cell).toBe(claimedCell);
    expect(afterSecond.tiles[0]!.ownerName).toBe(b.player.displayName);
    expect(afterSecond.tiles[0]!.tookOver).toBe(true);
  });
});

describe('a client cannot place a tile', () => {
  it('GET /v1/world is a public read that needs no account', async () => {
    const { service, cfg } = harness();
    const app = createFetchApp({ service, config: cfg });
    const a = await guest(service, 'Winner');
    const b = await guest(service, 'Loser');
    await duelWhere(service, a, b);

    const res = await app(new Request('http://localhost/v1/world'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; filled: number; tiles: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.filled).toBe(1);
    expect(body.tiles).toHaveLength(1);
  });

  it('there is no endpoint that writes a tile — a POST is not routed', async () => {
    const { service, cfg } = harness();
    const app = createFetchApp({ service, config: cfg });
    const res = await app(
      new Request('http://localhost/v1/world', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cell: 3, ownerId: 'me' }),
      }),
    );
    expect(res.status).not.toBe(200);
    // Nothing was written.
    expect((await service.worldMap()).filled).toBe(0);
  });

  it('an unplayed match awards nothing (only a FINISHED duel with a winner counts)', async () => {
    const { service, storage } = harness();
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);
    const active = await storage.matchById(created.match.matchId);
    expect(active).not.toBeNull();
    expect(await service.awardDuelTile(active!)).toBeNull();
    expect((await service.worldMap()).filled).toBe(0);
  });
});
