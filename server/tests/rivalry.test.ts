// Head-to-head counts — finished duels only, viewer's wins on the left.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import type { MatchRecord, PlayerRecord } from '../src/storage/types.js';
import { CURRENT_RULES_VERSION, newMatch } from '../../src/engine/index.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';

const NOW = Date.UTC(2026, 10, 8, 12);
const VIEWER = '11111111-1111-4111-8111-111111111111';
const RIVAL = '22222222-2222-4222-8222-222222222222';

const player = (id: string, displayName: string | null): PlayerRecord =>
  ({ id, kind: 'account', displayName, createdAt: NOW, upgradedAt: NOW });

const matchRecord = (
  id: string,
  opts: { winner: 0 | 1 | null; status?: 'waiting' | 'active' | 'finished' },
): MatchRecord => {
  const state = newMatch(1);
  const finished = (opts.status ?? 'finished') === 'finished';
  return {
    id,
    inviteCode: `Code${id.slice(0, 4)}`,
    rulesVersion: CURRENT_RULES_VERSION,
    seed: 1,
    config: state.config,
    startingPlayer: 0,
    status: opts.status ?? 'finished',
    revision: 0,
    state,
    result: finished ? { winner: opts.winner, reason: 'knock', scores: [2, 1] } : null,
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: finished ? NOW : null,
    turnDeadlineAt: null,
    turnTimeoutMs: 86_400_000,
    graceUsed: [0, 0],
    gracePeriods: 1,
    graceExtensionMs: 86_400_000,
    turnStartRevision: 0,
    turnStartState: null,
    expiresAt: null,
    openQueue: false,
  };
};

const seedStorage = async (storage: MemoryStorage) => {
  await storage.createPlayer(player(VIEWER, 'BloomHeron'));
  await storage.createPlayer(player(RIVAL, 'MapleFox'));
  const add = async (id: string, winner: 0 | 1 | null, viewerSeat: 0 | 1, status: 'finished' | 'waiting' = 'finished') => {
    await storage.createMatch(matchRecord(id, { winner, status }));
    await storage.addParticipant({ matchId: id, playerId: VIEWER, seat: viewerSeat, joinedAt: NOW, lastSeenAt: NOW });
    await storage.addParticipant({ matchId: id, playerId: RIVAL, seat: viewerSeat === 0 ? 1 : 0, joinedAt: NOW, lastSeenAt: NOW });
  };
  await add('m1', 0, 0);
  await add('m2', 1, 0);
  await add('m3', null, 0);
  await add('waiting', null, 0, 'waiting');
};

describe('storage.headToHead', () => {
  it('counts only finished duels and attributes wins from the viewer seat', async () => {
    const storage = new MemoryStorage();
    await seedStorage(storage);
    expect(await storage.headToHead(VIEWER, RIVAL)).toEqual({ games: 3, youWins: 1, themWins: 1, draws: 1 });
  });

  it('swaps perspective when the viewer sat in the other chair', async () => {
    const storage = new MemoryStorage();
    await storage.createPlayer(player(VIEWER, 'A'));
    await storage.createPlayer(player(RIVAL, 'B'));
    await storage.createMatch(matchRecord('m1', { winner: 0 }));
    await storage.addParticipant({ matchId: 'm1', playerId: VIEWER, seat: 1, joinedAt: NOW, lastSeenAt: NOW });
    await storage.addParticipant({ matchId: 'm1', playerId: RIVAL, seat: 0, joinedAt: NOW, lastSeenAt: NOW });
    expect(await storage.headToHead(VIEWER, RIVAL)).toEqual({ games: 1, youWins: 0, themWins: 1, draws: 0 });
  });
});

describe('GET /v1/players/:id/profile carries headToHead for a rival', () => {
  it('returns the record beside the public profile when the viewer is not the subject', async () => {
    const storage = new MemoryStorage();
    await storage.createPlayer(player(RIVAL, 'MapleFox'));
    const store = new MemoryWorldEconomyStore(storage);
    const economy = new WorldEconomyService(store, storage, () => NOW);
    const service = new MatchService({ storage, config: { ...DEFAULT_SERVER_CONFIG }, economy, now: () => NOW });
    const app = createFetchApp({ service, config: { ...DEFAULT_SERVER_CONFIG }, logger: () => undefined });
    const guest = await service.createGuest();
    const viewer = await service.authenticate(guest.token);
    await storage.createMatch(matchRecord('m4', { winner: 0 }));
    await storage.addParticipant({ matchId: 'm4', playerId: viewer.id, seat: 0, joinedAt: NOW, lastSeenAt: NOW });
    await storage.addParticipant({ matchId: 'm4', playerId: RIVAL, seat: 1, joinedAt: NOW, lastSeenAt: NOW });
    const res = await app(new Request(`http://t/v1/players/${encodeURIComponent(RIVAL)}/profile`, {
      headers: { authorization: `Bearer ${guest.token}` },
    }));
    const body = await res.json() as { headToHead?: { games: number; youWins: number; themWins: number; draws: number } };
    expect(body.headToHead).toEqual({ games: 1, youWins: 1, themWins: 0, draws: 0 });
  });

  it('omits headToHead on your own profile', async () => {
    const storage = new MemoryStorage();
    const store = new MemoryWorldEconomyStore(storage);
    const economy = new WorldEconomyService(store, storage, () => NOW);
    const service = new MatchService({ storage, config: { ...DEFAULT_SERVER_CONFIG }, economy, now: () => NOW });
    const app = createFetchApp({ service, config: { ...DEFAULT_SERVER_CONFIG }, logger: () => undefined });
    const guest = await service.createGuest();
    const viewer = await service.authenticate(guest.token);
    const res = await app(new Request(`http://t/v1/players/${encodeURIComponent(viewer.id)}/profile`, {
      headers: { authorization: `Bearer ${guest.token}` },
    }));
    const body = await res.json() as Record<string, unknown>;
    expect(body.headToHead).toBeUndefined();
  });
});
