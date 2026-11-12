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
