// Phase 7 — Find Opponent open-queue pairing (flagged client; server always available).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

describe('Phase 7 findOpponent', () => {
  it('creates an open-queue waiting match when the pool is empty', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const a = await service.createGuest('A');
    const pa = await service.authenticate(a.token);
    const found = await service.findOpponent(pa);
    expect(found.paired).toBe(false);
    expect(found.match.status).toBe('waiting');
    expect(found.player.seat).toBe(0);
  });

  it('pairs a second finder into the waiting open-queue match', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const a = await service.createGuest('A');
    const b = await service.createGuest('B');
    const pa = await service.authenticate(a.token);
    const pb = await service.authenticate(b.token);
    const first = await service.findOpponent(pa);
    expect(first.paired).toBe(false);
    const second = await service.findOpponent(pb);
    expect(second.paired).toBe(true);
    expect(second.match.status).toBe('active');
    expect(second.match.matchId).toBe(first.match.matchId);
    expect(second.player.seat).toBe(1);
  });

  it('does not put invite matches into the open queue', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const a = await service.createGuest('A');
    const b = await service.createGuest('B');
    const pa = await service.authenticate(a.token);
    const pb = await service.authenticate(b.token);
    await service.createMatch(pa); // invite-only
    const found = await service.findOpponent(pb);
    expect(found.paired).toBe(false);
    expect(found.match.status).toBe('waiting');
  });
});
