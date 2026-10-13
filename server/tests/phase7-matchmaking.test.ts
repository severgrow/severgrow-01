// Phase 7 — Find Opponent open-queue pairing (flagged client; server always available).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

describe('Phase 7 queue design', () => {
  it('uses matches.open_queue, not a separate matchmaking_queue table', () => {
    const sql = readFileSync(new URL('../migrations/0003_open_queue.sql', import.meta.url), 'utf8')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    expect(sql).toContain('alter table matches add column if not exists open_queue boolean');
    expect(sql).toContain('matches_open_queue_waiting_idx');
    expect(sql).toContain("where status = 'waiting' and open_queue = true");

    // The original plan mentioned a separate queue table; it was never created. Pin that.
    const dir = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const text = readFileSync(new URL(file, dir), 'utf8').toLowerCase();
      expect(text, `${file} must not introduce a separate queue table`).not.toContain('matchmaking_queue');
    }
  });
});

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
