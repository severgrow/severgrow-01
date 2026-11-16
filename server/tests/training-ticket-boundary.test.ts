// THE TRAINING TICKET'S BOT-LEVEL BOUNDARY. The page can only ask for a Training match at a bot
// level the game has (1-9, plus the rivals 10-12 that Hard and Blitz rotate in since 2026-11-12); the server's guard is its own copy of that top, `MAX_TRAINING_BOT`.
// These tests pin the exact boundary, so widening or moving it later is one constant and provable.
import { describe, expect, it } from 'vitest';
import { MAX_TRAINING_BOT } from '../src/seeds/config.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import type { PlayerRecord, Storage } from '../src/storage/types.js';

const player = { id: '00000000-0000-4000-8000-0000000000aa' } as PlayerRecord;
const matches = { hitRateLimit: async () => ({ ok: true }) } as unknown as Storage;
const economy = () => new WorldEconomyService(new MemoryWorldEconomyStore(), matches);

describe('the Training ticket bot-level boundary', () => {
  it('is 12, the top of the bots a Training match can face (the ladder 1-9 plus the rivals, 2026-11-12)', () => {
    expect(MAX_TRAINING_BOT).toBe(12);
  });

  it('issues a ticket AT the boundary', async () => {
    const ticket = await economy().issueTraining(player, MAX_TRAINING_BOT);
    expect(ticket.botLevel).toBe(MAX_TRAINING_BOT);
    expect(ticket.id).not.toBe('');
    expect(ticket.expiresAt).toBeGreaterThan(0);
  });

  it('refuses one level ABOVE the boundary with the existing error', async () => {
    await expect(economy().issueTraining(player, MAX_TRAINING_BOT + 1)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'Invalid Training level.',
    });
  });

  it('still refuses a level below the ladder and a non-integer', async () => {
    for (const bad of [0, -1, MAX_TRAINING_BOT + 0.5]) {
      await expect(economy().issueTraining(player, bad)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
  });
});

// THE DATABASE MUST ACCEPT EVERY LEVEL THE CODE ISSUES (found 2026-11-16 against the live server:
// a Training ticket for bot 9 was issued, for bots 10 and 12 the server answered 500). Migration 0011
// created `training_seed_tickets.bot_level` with `check (bot_level between 1 and 9)`; the rivals 10-12
// joined the code on 2026-11-12 (MAX_TRAINING_BOT) but no migration widened the column, so a Hard or
// Blitz Practice whose rotation picked a rival could not get a ticket: the tap waited out its budget and
// the game paid no Seeds. This pins the LAST word the migrations say about that check to the code's top.
describe('the database accepts every Training bot level the code issues', () => {
  it('the newest bot_level check on training_seed_tickets allows up to MAX_TRAINING_BOT', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../migrations/', import.meta.url);
    let top: number | null = null;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(new URL(file, dir), 'utf8');
      const table = /training_seed_tickets[\s\S]*?bot_level[^;]*?between\s+1\s+and\s+(\d+)/gi;
      for (const m of sql.matchAll(table)) top = Number(m[1]);
    }
    expect(top).toBe(MAX_TRAINING_BOT);
  });
});
