// RESUMABLE VERIFICATION (owner report, 2026-11-12: "I don't see seeds payout for level 80 and 81").
//
// The server proves a win by replaying every bot move, and the Edge runtime stops a request after
// about 2 s of CPU (HTTP 546). A long game, or a rival game from the previous bot version (3.4-6.3 s),
// could never finish inside one request, so its proof stayed queued and never paid. Now a page that
// asks for it gets the check in SLICES: the server verifies as many bot moves as fit its budget and
// answers 202 with a signed token naming the opening and how many bot moves are already proven; the
// page sends the same proof back with the token and the server carries on. The token is bound to
// the player, the exact proof, the opening and the position, and it expires.
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, campaignDeal } from '../../src/campaign/index.js';
import { apply, viewFor } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { botSeed } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION, chooseBotAction } from '../../src/bots/versions.js';
import { stepCampaignProof, verifyCampaignProof } from '../src/seeds/verify.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import type { PlayerRecord, Storage } from '../src/storage/types.js';

const level = CAMPAIGN_LEVELS.find((l) => l.number === 33)!;
const win = (() => {
  // A real won game on a random deal: the stronger bot plays the player's seat until one wins.
  for (let deal = 1; deal < 60; deal++) {
    const dealSeed = 7000 + deal * 13;
    let state = campaignDeal(level, dealSeed);
    const actions: Action[] = [];
    while (state.phase !== 'GAME_OVER' && actions.length < 400) {
      const actor = state.actor;
      const botLevel = actor === 0 ? 9 : level.botLevel;
      const action = chooseBotAction(viewFor(state, actor), botLevel,
        botSeed(state.seed ^ (actor === 0 ? 0x9e3779b9 : 0), botLevel, state.turnNumber, state.history?.length ?? 0));
      actions.push(action);
      state = apply(state, action);
    }
    if (state.result?.winner === 0) return { actions, dealSeed, won: true };
  }
  return { actions: [] as Action[], dealSeed: 0, won: false };
})();

/** A clock that moves one unit per reading: a budget of N lets about N bot moves through. */
const ticking = () => { let t = 0; return () => t++; };

describe('stepping a proof', () => {
  it('a tiny budget pauses again and again, and the slices end on exactly the full answer', () => {
    expect(win.won).toBe(true);
    const full = verifyCampaignProof(level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed);
    const clock = ticking();
    let resume: { opening: number; at: number } | null = null;
    let pauses = 0;
    for (let round = 0; round < 500; round++) {
      const step = stepCampaignProof(level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed, resume, { clock, budget: 1 });
      if (step.kind === 'done') {
        expect(step.verified).toEqual(full);
        expect(pauses).toBeGreaterThan(2);
        return;
      }
      pauses++;
      expect(step.at).toBeGreaterThan(resume?.at ?? 0);
      resume = { opening: step.opening, at: step.at };
    }
    throw new Error('never finished');
  });

  it('a tampered bot move is still caught after a pause', () => {
    const clock = ticking();
    const altered = [...win.actions];
    // The last bot move before the end.
    let state = campaignDeal(level, win.dealSeed);
    let lastBot = -1;
    for (let i = 0; i < altered.length; i++) { if (state.actor === 1) lastBot = i; state = apply(state, altered[i]!); }
    altered[lastBot] = { t: 'EndAct' };
    let resume: { opening: number; at: number } | null = null;
    for (let round = 0; round < 500; round++) {
      const step = stepCampaignProof(level.id, altered, CURRENT_BOT_VERSION, win.dealSeed, resume, { clock, budget: 1 });
      if (step.kind === 'done') { expect(step.verified).toBeNull(); return; }
      resume = { opening: step.opening, at: step.at };
    }
    throw new Error('never finished');
  });
});

describe('the service in slices', () => {
  const setup = (sliceMs = 1) => {
    const matches = { hitRateLimit: async () => ({ ok: true }) } as unknown as Storage;
    const economy = new WorldEconomyService(new MemoryWorldEconomyStore(), matches, () => 1_760_000_000_000,
      { resumeSecret: 'test-secret-of-sixteen-plus', sliceMs, clock: ticking() });
    return economy;
  };
  const me = { id: '00000000-0000-4000-8000-0000000000a1' } as PlayerRecord;
  const other = { id: '00000000-0000-4000-8000-0000000000b2' } as PlayerRecord;

  it('answers with a token until done, then pays once', async () => {
    const economy = setup();
    let token: string | null = null;
    for (let round = 0; round < 500; round++) {
      const step = await economy.campaignStep(me, level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed, token);
      if (step.kind === 'paid') {
        expect(step.reward.awarded).toBeGreaterThan(0);
        expect(round).toBeGreaterThan(1);
        return;
      }
      expect(typeof step.resume).toBe('string');
      token = step.resume;
    }
    throw new Error('never paid');
  });

  it('refuses a token that is forged, another player\'s, or for a different proof', async () => {
    const economy = setup();
    const first = await economy.campaignStep(me, level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed, null);
    expect(first.kind).toBe('resume');
    const token = first.kind === 'resume' ? first.resume : '';
    const [body] = token.split('.');
    await expect(economy.campaignStep(me, level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed, `${body}.${'0'.repeat(64)}`)).rejects.toThrow();
    await expect(economy.campaignStep(other, level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed, token)).rejects.toThrow();
    await expect(economy.campaignStep(me, level.id, win.actions.slice(0, -1), CURRENT_BOT_VERSION, win.dealSeed, token)).rejects.toThrow();
  });

  it('a page that does not ask for slices is checked whole, exactly as before', async () => {
    const economy = setup();
    const paid = await economy.campaign(me, level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed);
    expect(paid.awarded).toBeGreaterThan(0);
  });

  it('with a generous budget the first answer is the payment', async () => {
    const economy = setup(1_000_000);
    const step = await economy.campaignStep(me, level.id, win.actions, CURRENT_BOT_VERSION, win.dealSeed, null);
    expect(step.kind).toBe('paid');
  });
});

describe('POST /v1/seeds/campaign in slices', () => {
  it('202 with a resume token until done, then 200 with the reward; without `resumable` it is one 200', async () => {
    const { createWorldEconomyRouter } = await import('../src/seeds/router.js');
    const matches = { hitRateLimit: async () => ({ ok: true }) } as unknown as Storage;
    const economy = new WorldEconomyService(new MemoryWorldEconomyStore(), matches, () => 1_760_000_000_000,
      { resumeSecret: 'route-secret-of-sixteen-plus', sliceMs: 1, clock: ticking() });
    const me = { id: '00000000-0000-4000-8000-0000000000c3' } as PlayerRecord;
    const router = createWorldEconomyRouter({ economy, authenticate: async () => me });
    const post = (body: Record<string, unknown>) => router(new Request('http://x/v1/seeds/campaign', {
      method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body),
    }), '/v1/seeds/campaign');
    const base = { levelId: level.id, dealSeed: win.dealSeed, actions: win.actions, botVersion: CURRENT_BOT_VERSION, resumable: true };
    let resume: string | undefined;
    let rounds = 0;
    for (;;) {
      const out = await post(resume ? { ...base, resume } : base);
      rounds++;
      if (out!.status === 200) { expect((out!.body as { reward: { awarded: number } }).reward.awarded).toBeGreaterThan(0); break; }
      expect(out!.status).toBe(202);
      resume = (out!.body as { resume: string }).resume;
      if (rounds > 500) throw new Error('never paid');
    }
    expect(rounds).toBeGreaterThan(2);
    // Another player, the old way (no slices): checked whole, one answer.
    const other = { id: '00000000-0000-4000-8000-0000000000d4' } as PlayerRecord;
    const whole = createWorldEconomyRouter({ economy, authenticate: async () => other });
    const once = await whole(new Request('http://x/v1/seeds/campaign', {
      method: 'POST', headers: { authorization: 'Bearer t' },
      body: JSON.stringify({ levelId: level.id, dealSeed: win.dealSeed, actions: win.actions, botVersion: CURRENT_BOT_VERSION }),
    }), '/v1/seeds/campaign');
    expect(once!.status).toBe(200);
  });
});
