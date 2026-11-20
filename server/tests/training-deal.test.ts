// A PRACTICE GAME THE PHONE DEALT (owner, 2026-11-16: "Practice ... should be nearly instant"; asked,
// he chose the campaign's random-deal method). Measured on /test against the live server: when no
// ticket is on the shelf the tap waited for one, 3.3 s for a returning player and up to 9.4 s for a new
// one (the server's write requests are at times slow). Now the phone deals at once from its own seed
// and the server, when the proof arrives, issues the matching ticket itself and checks it exactly like
// any other Training proof. These pin what that must never allow.
import { describe, expect, it } from 'vitest';
import { apply, newMatch, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed } from '../../src/bots/levels.js';
import { botFor, CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import type { PlayerRecord, Storage } from '../src/storage/types.js';

const alice = { id: '00000000-0000-4000-8000-0000000000a1' } as PlayerRecord;
const bob = { id: '00000000-0000-4000-8000-0000000000b2' } as PlayerRecord;
const OPPONENT = 1;

/** A real game: a strong bot plays the human's side, the Training bot plays the other. */
const play = (seed: number, botLevel: number): { actions: Action[]; winner: 0 | 1 | null } => {
  const bot = botFor(CURRENT_BOT_VERSION)!;
  let state: State = newMatch(seed);
  const actions: Action[] = [];
  for (let i = 0; i < 1500 && state.phase !== 'GAME_OVER'; i++) {
    const seat = state.actor as 0 | 1;
    const level = seat === 0 ? 9 : botLevel;
    const action = bot(viewFor(state, seat), level as Parameters<typeof bot>[1], botSeed(state.seed, level, state.turnNumber, state.history?.length ?? 0));
    actions.push(action);
    state = apply(state, action);
  }
  return { actions, winner: state.result?.winner ?? null };
};
/** The first seed from `from` whose game the human side wins. */
const winningDeal = (from: number) => {
  for (let seed = from; seed < from + 60; seed++) {
    const game = play(seed, OPPONENT);
    if (game.winner === 0) return { seed, actions: game.actions };
  }
  throw new Error('no winning deal found');
};

const setup = () => {
  const hits: string[] = [];
  const matches = { hitRateLimit: async (bucket: string) => { hits.push(bucket); return { ok: true, count: 1 }; } } as unknown as Storage;
  const store = new MemoryWorldEconomyStore();
  return { economy: new WorldEconomyService(store, matches), store, hits };
};

describe('a Practice game the phone dealt', () => {
  const win = winningDeal(1000);

  it('pays a verified win, through the same Training receipt as a ticket', async () => {
    const { economy } = setup();
    const id = await economy.dealTicket(alice, win.seed, OPPONENT);
    const reward = await economy.training(alice, id, win.actions, CURRENT_BOT_VERSION);
    expect(reward.awarded).toBeGreaterThan(0);
  });

  it('the same deal never pays twice (same ticket, same receipt)', async () => {
    const { economy } = setup();
    const first = await economy.dealTicket(alice, win.seed, OPPONENT);
    await economy.training(alice, first, win.actions, CURRENT_BOT_VERSION);
    const again = await economy.dealTicket(alice, win.seed, OPPONENT);
    expect(again).toBe(first);
    const second = await economy.training(alice, again, win.actions, CURRENT_BOT_VERSION);
    expect(second.replayed).toBe(true);
  });

  it('keeps the bot level of the first claim: a second claim with another level cannot re-check it easier', async () => {
    const { economy } = setup();
    const first = await economy.dealTicket(alice, win.seed, OPPONENT);
    expect(await economy.dealTicket(alice, win.seed, 7)).toBe(first);
  });

  it('is the player\'s own: the same seed is a different ticket for another player', async () => {
    const { economy } = setup();
    expect(await economy.dealTicket(alice, win.seed, OPPONENT)).not.toBe(await economy.dealTicket(bob, win.seed, OPPONENT));
  });

  it('spends the hourly Training ticket budget once, when the ticket is first made', async () => {
    const { economy, hits } = setup();
    await economy.dealTicket(alice, win.seed, OPPONENT);
    await economy.dealTicket(alice, win.seed, OPPONENT);
    expect(hits.filter((b) => b === `seeds:ticket:${alice.id}`)).toHaveLength(1);
  });

  it('refuses a seed or a bot level the game cannot deal', async () => {
    const { economy } = setup();
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      await expect(economy.dealTicket(alice, seed, OPPONENT)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    for (const level of [0, 13, 2.5]) {
      await expect(economy.dealTicket(alice, win.seed, level)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
  });

  it('a replay that is not that deal\'s game is refused, not paid', async () => {
    const { economy } = setup();
    const id = await economy.dealTicket(alice, win.seed + 7777, OPPONENT);
    await expect(economy.training(alice, id, win.actions, CURRENT_BOT_VERSION)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('is a uuid, as the ticket table requires', async () => {
    const { economy } = setup();
    expect(await economy.dealTicket(alice, win.seed, OPPONENT)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

// THE ROUTE: `POST /v1/seeds/training` with `deal` instead of `ticketId`, whole and in slices.
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { TRAINING_DEALS_FEATURE, SERVER_FEATURES } from '../src/fetch-app.js';

describe('the Training route takes a deal', () => {
  const win = winningDeal(1000);
  const harness = () => {
    const storage = new MemoryStorage();
    const service = new WorldEconomyService(new MemoryWorldEconomyStore(), storage);
    const router = createWorldEconomyRouter({ economy: service, authenticate: async () => alice });
    const post = async (body: unknown) => {
      const request = new Request('http://test.local/v1/seeds/training', {
        method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return (await router(request, '/v1/seeds/training'))!;
    };
    return { post };
  };

  it('pays a deal sent whole', async () => {
    const res = await harness().post({ deal: { seed: win.seed, botLevel: OPPONENT }, actions: win.actions, botVersion: CURRENT_BOT_VERSION });
    expect(res.status).toBe(200);
    const reward = (res.body as { reward: { awarded: number; serverNow?: number } }).reward;
    expect(reward.awarded).toBeGreaterThan(0);
    // The finished card words the daily cap's wait from the SERVER's clock (owner ask, 2026-11-20),
    // so the settle wire carries it rather than letting the device guess.
    expect(Number.isFinite(reward.serverNow)).toBe(true);
  });

  it('pays a deal sent in slices (resume tokens), as a page sends it', async () => {
    const h = harness();
    let resume: string | undefined;
    for (let round = 0; round < 20; round++) {
      const res = await h.post({ deal: { seed: win.seed, botLevel: OPPONENT }, actions: win.actions, botVersion: CURRENT_BOT_VERSION, resumable: true, ...(resume ? { resume } : {}) });
      if (res.status === 202) { resume = (res.body as { resume: string }).resume; continue; }
      expect(res.status).toBe(200);
      expect((res.body as { reward: { awarded: number } }).reward.awarded).toBeGreaterThan(0);
      return;
    }
    throw new Error('never finished');
  });

  it('a body with neither a ticket nor a deal is refused as before', async () => {
    await expect(harness().post({ actions: win.actions, botVersion: CURRENT_BOT_VERSION })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('the server says so in its health features, so a page knows it may send deals', () => {
    expect(TRAINING_DEALS_FEATURE).toBe('training-deals');
    expect(SERVER_FEATURES).toContain(TRAINING_DEALS_FEATURE);
  });
});
