// THE DUEL RESULT CARD'S SEEDS LINE (owner report, 2026-10-24: "double check if seeds are being
// paid out each game like initially planned - there was some issues with 'seeds pending' or shit
// like that").
//
// Online duels DO pay: `settleOnline` writes one receipt per seat (friend 15/4, queue 30/8,
// draw 6/12 — server/src/seeds/config.ts), and the auditor found it working on production. But the
// finish card said NOTHING, so a 15-Seed win was silent and the player only found the money later
// in the menu wallet. That is the perception bug this file guards.
//
// THE RULE: the card shows what the server REPORTED for this seat, and nothing when it reported
// nothing. It must never derive an amount, because the client cannot know the two things that
// decide it:
//   * a daily cap (`mode_daily_limit`, `opponent_daily_limit`, `global_daily_limit`) pays 0 and
//     writes a 0-value receipt — server/src/seeds/rewards.ts `planSeedReward`;
//   * a resignation or a timeout pays nothing at all, by design (`settleOnline` returns early).
// A guessed "+15" that the wallet never received is worse than silence, so silence is the default.
//
// NOT reachable today: no payload the client gets carries the award. `MatchViewPayload` and
// `MatchSummary` both stop at `result: OnlineGameResult`, and `settleOnline` returns void. So the
// read is written against an OPTIONAL field and shows nothing in practice; the ONE server change
// that turns it on is named on `MatchDriverSnapshot.seeds` (web/src/online/types.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { duelSeedsMessage, seedReward } from '../src/ui/seed-reveal.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const snapshotTypes = read('../src/online/types.ts');

describe('a duel shows the Seeds it actually paid — and nothing it cannot know', () => {
  it('shows NOTHING when the server reported no award (today: no payload carries one)', () => {
    // The whole point of the guard: absent is the normal case, and absent means no line at all.
    expect(duelSeedsMessage(null)).toBe('');
    expect(duelSeedsMessage(undefined)).toBe('');
    expect(seedReward(duelSeedsMessage(null))).toEqual({ kind: 'none' });
  });

  it('shows the amount the server reported, as the campaign card does', () => {
    expect(duelSeedsMessage({ awarded: 15, reason: null })).toBe('+15 Seeds');
    expect(duelSeedsMessage({ awarded: 4, reason: null })).toBe('+4 Seeds');
    // It must parse back through the ONE parser the card uses, as a real animated award.
    expect(seedReward(duelSeedsMessage({ awarded: 15, reason: null }))).toEqual({ kind: 'award', amount: 15 });
  });

  it('a cap is a calm notice, never "+0", and a draw that pays nothing stays silent', () => {
    for (const reason of ['mode_daily_limit', 'opponent_daily_limit', 'global_daily_limit']) {
      expect(duelSeedsMessage({ awarded: 0, reason })).toBe('Seed limit reached today');
    }
    // A draw's own denial is not a limit: the house pays nothing for it, so there is nothing to say.
    expect(duelSeedsMessage({ awarded: 0, reason: 'no_draw_reward' })).toBe('');
    expect(duelSeedsMessage({ awarded: 0, reason: null })).toBe('');
  });

  it('never paints a broken number from a junk payload', () => {
    for (const awarded of [Number.NaN, -1, -0.5, Number.POSITIVE_INFINITY]) {
      expect(duelSeedsMessage({ awarded, reason: null }), String(awarded)).toBe('');
    }
    // A fraction is floored, not rounded up: the wallet stores whole Seeds.
    expect(duelSeedsMessage({ awarded: 14.9, reason: null })).toBe('+14 Seeds');
  });
});

describe('the shared Seeds paragraph cannot leak between modes', () => {
  it('the duel branch RESETS the line before it paints its own', () => {
    // `seedRewardMessage` is module-level and shared by offline, campaign, lessons and duels. If the
    // duel branch simply left it alone, the previous offline game's "+15 Seeds" would appear on a
    // duel's card. `clearGoSeeds()` is that reset, and it must come before the paint.
    const start = main.indexOf('if (isOnlineDuel()) {');
    expect(start, 'the duel branch must exist').toBeGreaterThan(-1);
    const branch = main.slice(start, main.indexOf('const won = info.title === RESULT.won;', start));
    const reset = branch.indexOf('clearGoSeeds();');
    const assign = branch.indexOf('duelSeedsMessage(');
    const paint = branch.indexOf('paintGoSeeds();');
    expect(reset, 'the duel branch resets the shared paragraph').toBeGreaterThan(-1);
    expect(assign, 'the duel branch assigns its own message').toBeGreaterThan(reset);
    expect(paint, 'the duel branch paints it').toBeGreaterThan(assign);
  });

  it('the amount comes from the server payload, never from the mode or the outcome', () => {
    // A client-side rate table would be a guess: caps and resignations both pay 0.
    expect(main).toMatch(/duelSeedsMessage\(snapshot\.seeds \?\? null\)/);
    expect(main).not.toMatch(/SEED_ECONOMY/);
    expect(main).not.toMatch(/friend:\s*\{\s*win:/);
  });

  it('the optional field is the ONE server change, and it is named where the client reads it', () => {
    expect(snapshotTypes).toMatch(/seeds\?: \{ awarded: number; reason: string \| null \}/);
    // The doc names where the server would fill it, so the next agent does not have to rediscover it.
    expect(snapshotTypes).toMatch(/MatchViewPayload/);
    expect(snapshotTypes).toMatch(/settleOnline/);
  });
});

describe('the server rules the client mirrors', () => {
  it('a resignation and a timeout still pay nothing — if that changes, this fails on purpose', () => {
    // `settleOnline`'s early return is the reason a resign win must show no Seeds line. The server
    // now RETURNS its per-seat awards, so the guard returns an empty map rather than bare `void`;
    // what must not change is that it returns BEFORE settling and names both reasons. If the server
    // ever starts paying these, this fails on purpose: the client's assumptions need a decision,
    // not a silent mismatch.
    const service = read('../../server/src/seeds/service.ts');
    const guard = /async settleOnline[\s\S]{0,500}?return new Map\(\);/.exec(service)?.[0] ?? '';
    expect(guard).toContain("'resigned'");
    expect(guard).toContain("'timeout'");
  });
});
