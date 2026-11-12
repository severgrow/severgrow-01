// THE DUEL'S SEEDS LINE COMES FROM THE SERVER (owner report, 2026-10-24).
//
// The online result card showed nothing when a duel paid, so a real 15-Seed win was silent and only
// turned up later in the wallet — very plausibly what made the owner report "seeds pending or shit
// like that". The card cannot compute the number itself (a daily cap pays 0, and a resign or a
// timeout pays nothing at all), so `settleOnline` now REPORTS each seat's award and the finished
// view carries it on that seat's own payload.
//
// These tests pin the things that make that report trustworthy. Every one of them plays or finishes a
// REAL match through the service — none of them edits a stored record to fake a game over, because
// the guard being tested (`state.phase === 'GAME_OVER'`) is exactly what a fake would skip.
import { describe, expect, it } from 'vitest';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { viewFor } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { BETA_PAYOUT_MULTIPLIER, SEED_ECONOMY } from '../src/seeds/config.js';
import type { PlayerRecord } from '../src/storage/types.js';

const config = (): ServerConfig => ({
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
  },
});

const harness = () => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  const economy = new WorldEconomyService(store, storage, () => 1_000_000);
  const service = new MatchService({ storage, config: config(), now: () => 1_000_000, economy });
  return { storage, store, economy, service, wallet: (id: string) => store.wallet(id) };
};

const guest = async (service: MatchService, name: string) => {
  const created = await service.createGuest(name);
  return service.authenticate(created.token);
};

/** Two guests in one ACTIVE duel. */
const duel = async (h: ReturnType<typeof harness>, openQueue = false) => {
  const a = await guest(h.service, 'A');
  const b = await guest(h.service, 'B');
  const created = await h.service.createMatch(a);
  if (openQueue) {
    // `openQueue` is what picks the queue rate over the friend rate; it is a record flag, not a
    // different kind of match, so the duel plays identically.
    const record = await h.storage.matchById(created.match.matchId);
    await h.storage.createMatch({ ...record!, openQueue: true });
  }
  await h.service.joinMatch(b, created.match.inviteCode);
  return { a, b, matchId: created.match.matchId };
};

/** Plays the match out for real, both seats, until the engine says GAME_OVER. */
const playToEnd = async (h: ReturnType<typeof harness>, matchId: string, a: PlayerRecord, b: PlayerRecord) => {
  for (let i = 0; i < 500; i += 1) {
    const record = await h.storage.matchById(matchId);
    if (!record || record.status === 'finished') return record;
    const actor = record.state.actor;
    const action = GreedyBot.chooseAction(viewFor(record.state, actor));
    await h.service.submitAction(actor === 0 ? a : b, matchId, {
      expectedRevision: record.revision,
      requestId: `move-${i}`,
      action,
    });
  }
  throw new Error('the duel did not finish within 500 moves');
};

describe('a finished duel reports what each seat was paid', () => {
  it('the winner gets +15 and the loser +4, on their OWN payloads', async () => {
    const h = harness();
    const { a, b, matchId } = await duel(h);
    const finished = await playToEnd(h, matchId, a, b);
    expect(finished?.status).toBe('finished');
    expect(finished?.state.phase).toBe('GAME_OVER');

    const winnerView = await h.service.viewPayload(a, matchId);
    const loserView = await h.service.viewPayload(b, matchId);
    // Both seats are told their own figure, and the figures are the economy's own numbers rather
    // than a second table written into the payload.
    const seen = [winnerView.seeds?.awarded, loserView.seeds?.awarded].sort((x, y) => (y ?? 0) - (x ?? 0));
    expect(seen).toEqual([
      SEED_ECONOMY.online.friend.win * BETA_PAYOUT_MULTIPLIER,
      SEED_ECONOMY.online.friend.loss * BETA_PAYOUT_MULTIPLIER,
    ]);
    expect(winnerView.seeds?.reason).toBeNull();
    expect(loserView.seeds?.reason).toBeNull();
  });

  it('the reported amount is the RECEIPT\'s own number, not a second table in the payload', async () => {
    const h = harness();
    const { a, b, matchId } = await duel(h);
    await playToEnd(h, matchId, a, b);
    // Capture the receipts the settle wrote, then read the view.
    const receipts = [...h.store.receipts.entries()]
      .filter(([key]) => key.includes(matchId))
      .map(([, receipt]) => receipt);
    expect(receipts.length).toBe(2);

    for (const player of [a, b]) {
      const view = await h.service.viewPayload(player, matchId);
      const own = receipts.find((r) => r.input.playerId === player.id)!;
      expect(view.seeds).toEqual({ awarded: own.awarded, reason: own.reason });
      // And the ledger agrees with both: two sources, one number.
      const ledger = h.store.ledger.filter((entry) => entry.playerId === player.id && entry.sourceKey === `duel:${matchId}`);
      expect(ledger.reduce((sum, entry) => sum + entry.delta, 0)).toBe(view.seeds!.awarded);
    }
  });

  it('viewing the finished match again neither pays twice nor changes the report', async () => {
    const h = harness();
    const { a, b, matchId } = await duel(h);
    await playToEnd(h, matchId, a, b);

    const first = await h.service.viewPayload(a, matchId);
    const afterFirst = (await h.wallet(a.id)).balance;
    const second = await h.service.viewPayload(a, matchId);
    const third = await h.service.viewPayload(a, matchId);

    expect(first.seeds).toEqual(second.seeds);
    expect(second.seeds).toEqual(third.seeds);
    expect((await h.wallet(a.id)).balance).toBe(afterFirst);
  });

  it('a resignation reports NOTHING: that card must never look like a paid win', async () => {
    const h = harness();
    const { a, b, matchId } = await duel(h);
    // B resigns mid-game: A wins the duel, but a resignation pays nobody by rule.
    await h.service.resign(b, matchId);

    const winnerView = await h.service.viewPayload(a, matchId);
    expect(winnerView.status).toBe('finished');
    expect(winnerView.result?.reason).toBe('resigned');
    expect(winnerView.seeds).toBeUndefined();
    expect((await h.wallet(a.id)).balance).toBe(0);
    expect((await h.wallet(b.id)).balance).toBe(0);
  });

  it('an UNFINISHED match carries no award at all', async () => {
    const h = harness();
    const { a, matchId } = await duel(h);
    const view = await h.service.viewPayload(a, matchId);
    expect(view.status).toBe('active');
    expect(view.seeds).toBeUndefined();
  });
});
