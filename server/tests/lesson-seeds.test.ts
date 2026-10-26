// Level 10, the final lesson, pays 100 Seeds once (owner, 2026-10-24). The server replays the game
// against the real bot from the lesson's one opening (web/src/lessons/final.ts), exactly as it
// replays a Campaign level; levels 1-9 pay nothing and no other lesson id is accepted.
import { describe, expect, it } from 'vitest';
import { apply, viewFor } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { FINAL_LESSON, finalLessonOpening } from '../../web/src/lessons/final.js';
import { LESSONS, lessonOpening } from '../../web/src/lessons/lessons.js';
import { BETA_PAYOUT_MULTIPLIER, LESSON_SEED_REWARD } from '../src/seeds/config.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { planSeedReward } from '../src/seeds/rewards.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { verifyLessonProof } from '../src/seeds/verify.js';
import type { PlayerRecord, Storage } from '../src/storage/types.js';

/** A real level-10 game the player wins: a strong bot plays my side, the lesson's bot the other. */
const genuineWin = (): Action[] => {
  for (const salt of [0x9e3779b9, 0x1234567, 0x7f4a7c15, 0x2545f491]) {
    let state = finalLessonOpening();
    const actions: Action[] = [];
    while (state.phase !== 'GAME_OVER' && actions.length < 400) {
      const actor = state.actor;
      const botLevel = actor === 0 ? 9 : FINAL_LESSON.botLevel;
      const action = chooseLevelAction(viewFor(state, actor), botLevel,
        botSeed(state.seed ^ (actor === 0 ? salt : 0), botLevel, state.turnNumber, state.history?.length ?? 0));
      actions.push(action);
      state = apply(state, action);
    }
    if (state.result?.winner === 0) return actions;
  }
  throw new Error('no winning line found');
};

const player = { id: '00000000-0000-4000-8000-000000000010' } as PlayerRecord;
const matches = { hitRateLimit: async () => ({ ok: true }) } as unknown as Storage;

describe('the final lesson pays 100 Seeds once', () => {
  it('the lesson plays the very opening the server replays', () => {
    const ten = LESSONS.find((l) => l.level === 10)!;
    expect(JSON.stringify(lessonOpening(ten))).toBe(JSON.stringify(finalLessonOpening()));
    expect(ten.opponent).toEqual({ bot: FINAL_LESSON.botLevel });
  });

  it('a genuine win verifies; a cut-short or altered replay does not; no other lesson id is accepted', () => {
    const actions = genuineWin();
    expect(verifyLessonProof(FINAL_LESSON.id, actions, CURRENT_BOT_VERSION)?.winner).toBe(0);
    expect(verifyLessonProof(FINAL_LESSON.id, actions.slice(0, -1), CURRENT_BOT_VERSION)).toBeNull();
    expect(verifyLessonProof('lesson-9', actions, CURRENT_BOT_VERSION)).toBeNull();
    const bot = actions.findIndex((_, i) => i > 3);
    const altered = [...actions];
    altered[bot] = { t: 'EndAct' };
    expect(verifyLessonProof(FINAL_LESSON.id, altered, CURRENT_BOT_VERSION)).toBeNull();
  });

  it('pays the owner\'s 100 on the first win, and never twice', async () => {
    const store = new MemoryWorldEconomyStore();
    const economy = new WorldEconomyService(store, matches);
    const actions = genuineWin();
    const first = await economy.campaign(player, FINAL_LESSON.id, actions, CURRENT_BOT_VERSION);
    // The owner's figure is 100; the BETA multiplier scales what is actually credited (see
    // `BETA_PAYOUT_MULTIPLIER`). Pinning both keeps the owner's number honest while letting the
    // temporary doubling be reverted by one constant.
    expect(LESSON_SEED_REWARD.seeds).toBe(100);
    const paid = 100 * BETA_PAYOUT_MULTIPLIER;
    expect(first.awarded).toBe(paid);
    expect(first.wallet.balance).toBe(paid);
    const again = await economy.campaign(player, FINAL_LESSON.id, actions, CURRENT_BOT_VERSION);
    expect(again.replayed).toBe(true);
    expect((await store.wallet(player.id)).balance).toBe(paid);
  });

  it('a loss or a made-up result is refused', async () => {
    const economy = new WorldEconomyService(new MemoryWorldEconomyStore(), matches);
    await expect(economy.campaign(player, FINAL_LESSON.id, [{ t: 'EndAct' }], CURRENT_BOT_VERSION)).rejects.toThrow(/could not be verified/);
    await expect(economy.campaign(player, 'lesson-3', genuineWin(), CURRENT_BOT_VERSION)).rejects.toThrow(/not available/);
  });

  it('only level 10 pays, and only the amount the owner set', () => {
    expect(LESSON_SEED_REWARD).toEqual({ level: 10, seeds: 100 });
    const base = { playerId: player.id, sourceKey: 'lesson:9', mode: 'campaign' as const, outcome: 'win' as const, opponentId: null, now: 0 };
    expect(planSeedReward({ ...base, lessonLevel: 9 }, { modePaid: 0, pairPaid: 0, totalEarned: 0 }).amount).toBe(0);
    expect(planSeedReward({ ...base, lessonLevel: 10 }, { modePaid: 0, pairPaid: 0, totalEarned: 0 }).amount)
      .toBe(100 * BETA_PAYOUT_MULTIPLIER);
  });
});
