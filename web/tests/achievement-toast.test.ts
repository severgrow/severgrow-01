// A QUIET ACHIEVEMENT LINE.
//
// Levels 1–10 stay quiet: an achievement earned there is saved and does not pop, and it does not
// replay once the player has cleared level 10. The same id never shows twice, including after a
// refresh. Reduced motion is the line with no travel. The Seeds table is not part of this surface
// and must stay exactly as it was.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { KeyValue } from '../../server/src/client.js';
import { ACHIEVEMENTS } from '../../server/src/seeds/achievements.js';
import { planSeedReward } from '../../server/src/seeds/rewards.js';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
import {
  ACHIEVEMENT_TOAST_CSS,
  ACHIEVEMENT_TOAST_DWELL_MS,
  emptyAchievementToastMemory,
  achievementToastEnter,
  achievementToastExit,
  achievementToastMotion,
  achievementToastQuiet,
  offerAchievementToasts,
  readAchievementToastMemory,
  releaseAchievementToasts,
  writeAchievementToastMemory,
  type AchievementToastMemory,
  type AchievementToastOffer,
} from '../src/player/achievement-toast.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const source = readFileSync(`${root}/web/src/player/achievement-toast.ts`, 'utf8');
const main = readFileSync(`${root}/web/src/main.ts`, 'utf8');

const store = (): { m: Map<string, string>; kv: KeyValue } => {
  const m = new Map<string, string>();
  return {
    m,
    kv: {
      get: (k) => m.get(k) ?? null,
      set: (k, v) => void m.set(k, v),
      remove: (k) => void m.delete(k),
    },
  };
};

/** A player the line has already met, with nothing earned yet. The first real read is this. */
const baselined = (over: Partial<AchievementToastMemory> = {}): AchievementToastMemory => ({
  baselined: true,
  seen: [],
  held: [],
  ...over,
});

const offer = (
  memory: AchievementToastMemory,
  over: Partial<AchievementToastOffer> = {},
) => offerAchievementToasts(memory, {
  doneIds: [],
  campaignLevel: null,
  clearedThrough: 10,
  covered: false,
  ...over,
});

const REWARD_TABLE: readonly (readonly [string, number, number])[] = [
  ['roots', 100, 1],
  ['neighbours', 50, 1],
  ['throw-down', 75, 1],
  ['stand-ground', 75, 1],
  ['holding', 100, 3],
  ['conqueror', 150, 1],
  ['podium', 100, 1],
  ['estate', 250, 10],
  ['home-guard', 75, 1],
  ['ground-taken', 75, 1],
  ['first-crossing', 100, 1],
  ['three-crossings', 100, 3],
  ['ten-crossings', 150, 10],
  ['running-sap', 100, 3],
  ['long-growth', 150, 5],
  ['live-wood', 100, 1],
  ['higher-branch', 75, 1],
  ['unsevered', 100, 1],
  ['caught-knock', 100, 1],
  ['bloom-and-nothing', 125, 1],
  ['cut-and-standing', 125, 1],
  ['ringed-root', 150, 1],
  ['last-light', 125, 1],
  ['quiet-table', 100, 1],
  ['open-door', 75, 1],
  ['company', 50, 1],
  ['grove-of-friends', 100, 3],
  ['generous-host', 50, 1],
  ['first-clearing', 75, 1],
  ['five-clearings', 100, 5],
  ['ten-clearings', 125, 10],
  ['whole-chapter', 200, 1],
  ['last-lesson', 100, 1],
  ['clean-hands', 125, 1],
  ['quick-work', 125, 1],
];

describe('no popup through campaign levels 1–10', () => {
  it('is quiet on every level from 1 to 10, and while level 10 is not yet cleared', () => {
    for (let level = 1; level <= 10; level++) {
      expect(achievementToastQuiet(level, 10)).toBe(true);
      expect(achievementToastQuiet(level, 0)).toBe(true);
    }
    expect(achievementToastQuiet(null, 9)).toBe(true);
    expect(achievementToastQuiet(null, 0)).toBe(true);
    expect(achievementToastQuiet(11, 10)).toBe(false);
    expect(achievementToastQuiet(null, 10)).toBe(false);
  });

  it('saves an unlock earned on levels 1–10 and does not show it', () => {
    for (const level of [1, 5, 10]) {
      const decided = offer(baselined(), {
        doneIds: ['first-clearing'],
        campaignLevel: level,
        clearedThrough: level - 1,
      });
      expect(decided.show).toEqual([]);
      expect(decided.memory.seen).toEqual(['first-clearing']);
      expect(decided.memory.held).toEqual([]);
    }
  });

  it('does not replay that batch once the player has cleared level 10', () => {
    const during = offer(baselined(), {
      doneIds: ['first-clearing', 'last-lesson'],
      campaignLevel: 10,
      clearedThrough: 9,
    });
    expect(during.show).toEqual([]);
    const later = offer(during.memory, {
      doneIds: ['first-clearing', 'last-lesson'],
      campaignLevel: null,
      clearedThrough: 10,
    });
    expect(later.show).toEqual([]);
    const level11 = offer(during.memory, {
      doneIds: ['first-clearing', 'last-lesson', 'roots'],
      campaignLevel: 11,
      clearedThrough: 10,
    });
    expect(level11.show).toEqual(['roots']);
  });

  it('stays quiet on the menu between early levels, then allows a new one after level 10', () => {
    const between = offer(baselined(), {
      doneIds: ['roots'],
      campaignLevel: null,
      clearedThrough: 4,
    });
    expect(between.show).toEqual([]);
    expect(between.memory.seen).toContain('roots');
    const after = offer(between.memory, {
      doneIds: ['roots', 'estate'],
      campaignLevel: null,
      clearedThrough: 10,
    });
    expect(after.show).toEqual(['estate']);
  });

  it('swallows a line that was only waiting, so a replay of an early level does not release it later', () => {
    const held = offer(baselined(), {
      doneIds: ['estate'],
      campaignLevel: 12,
      clearedThrough: 11,
      covered: true,
    });
    expect(held.show).toEqual([]);
    expect(held.memory.held).toEqual(['estate']);
    const replay = offer(held.memory, {
      doneIds: ['estate'],
      campaignLevel: 3,
      clearedThrough: 11,
      covered: false,
    });
    expect(replay.show).toEqual([]);
    expect(replay.memory.seen).toContain('estate');
    expect(replay.memory.held).toEqual([]);
    expect(offer(replay.memory, { doneIds: ['estate'], campaignLevel: null, clearedThrough: 11 }).show).toEqual([]);
  });
});

describe('the same achievement is shown once', () => {
  it('shows a new id after level 10, and a second read does not show it again', () => {
    const first = offer(baselined(), { doneIds: ['roots', 'neighbours'] });
    expect(first.show).toEqual(['roots', 'neighbours']);
    const again = offer(first.memory, { doneIds: ['roots', 'neighbours'] });
    expect(again.show).toEqual([]);
    expect(again.memory.seen).toEqual(['roots', 'neighbours']);
  });

  it('does not show the backlog the first time this device sees a list', () => {
    const firstSight = offer(emptyAchievementToastMemory(), {
      doneIds: ['roots', 'first-clearing', 'estate'],
      campaignLevel: 12,
      clearedThrough: 11,
    });
    expect(firstSight.show).toEqual([]);
    expect(firstSight.memory.baselined).toBe(true);
    expect(firstSight.memory.seen).toEqual(['roots', 'first-clearing', 'estate']);
    const earnedAfter = offer(firstSight.memory, {
      doneIds: ['roots', 'first-clearing', 'estate', 'conqueror'],
      campaignLevel: 12,
      clearedThrough: 11,
    });
    expect(earnedAfter.show).toEqual(['conqueror']);
  });

  it('remembers across a refresh', () => {
    const { kv } = store();
    const shown = offer(baselined(), { doneIds: ['podium'] });
    expect(shown.show).toEqual(['podium']);
    writeAchievementToastMemory(kv, 'player-a', shown.memory);
    const restored = readAchievementToastMemory(kv, 'player-a');
    expect(offer(restored, { doneIds: ['podium'] }).show).toEqual([]);
    expect(readAchievementToastMemory(kv, 'player-b').baselined).toBe(false);
  });

  it('holds a line while a Blitz decision or the victory card is up, then shows it once', () => {
    const held = offer(baselined(), { doneIds: ['live-wood'], covered: true });
    expect(held.show).toEqual([]);
    expect(held.memory.seen).toEqual([]);
    expect(held.memory.held).toEqual(['live-wood']);
    const still = releaseAchievementToasts(held.memory, {
      campaignLevel: null,
      clearedThrough: 10,
      covered: true,
    });
    expect(still.show).toEqual([]);
    const free = releaseAchievementToasts(still.memory, {
      campaignLevel: null,
      clearedThrough: 10,
      covered: false,
    });
    expect(free.show).toEqual(['live-wood']);
    expect(free.memory.held).toEqual([]);
    expect(releaseAchievementToasts(free.memory, {
      campaignLevel: null,
      clearedThrough: 10,
      covered: false,
    }).show).toEqual([]);
  });

  it('does not treat a release before the first list as a baseline', () => {
    const released = releaseAchievementToasts(emptyAchievementToastMemory(), {
      campaignLevel: 12,
      clearedThrough: 11,
      covered: false,
    });
    expect(released.show).toEqual([]);
    expect(released.memory.baselined).toBe(false);
  });
});

describe('reduced motion has no animation', () => {
  it('does not travel and does not build frames', () => {
    expect(achievementToastMotion(true)).toEqual({ animate: false, travelPx: 0, durationMs: 0 });
    expect(achievementToastEnter(true)).toBeNull();
    expect(achievementToastExit(true)).toBeNull();
  });

  it('uses the interface travel when motion is on, and nothing longer', () => {
    const motion = achievementToastMotion(false);
    expect(motion).toEqual({
      animate: true,
      travelPx: INTERFACE_MOTION.travel,
      durationMs: INTERFACE_MOTION.open,
    });
    expect(motion.travelPx).toBeLessThanOrEqual(4);
    const enter = achievementToastEnter(false);
    expect(enter).not.toBeNull();
    expect(enter?.frames[0]?.translate).toBe(`0 ${INTERFACE_MOTION.travel}px`);
    expect(enter?.durationMs).toBe(INTERFACE_MOTION.open);
    expect(achievementToastExit(false)?.durationMs).toBe(INTERFACE_MOTION.close);
  });

  it('keeps the plate still: no keyframes, no loop, and both reduce paths cancel motion', () => {
    expect(ACHIEVEMENT_TOAST_CSS).not.toMatch(/@keyframes/);
    expect(ACHIEVEMENT_TOAST_CSS).not.toMatch(/infinite/);
    expect(ACHIEVEMENT_TOAST_CSS).toContain('animation: none');
    expect(ACHIEVEMENT_TOAST_CSS).toContain('transition: none');
    expect(ACHIEVEMENT_TOAST_CSS).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(ACHIEVEMENT_TOAST_CSS).toContain('html.reduce-motion');
    expect(ACHIEVEMENT_TOAST_CSS).toContain('[data-motion="still"]');
    expect(source).not.toContain('requestAnimationFrame');
    expect(source).not.toContain('setInterval');
    expect(ACHIEVEMENT_TOAST_DWELL_MS).toBeGreaterThan(0);
    expect(ACHIEVEMENT_TOAST_DWELL_MS).toBeLessThan(10_000);
  });
});

describe('the reward table is unchanged', () => {
  it('pays each achievement the amount written on it, once, and not the beta doubling', () => {
    expect(ACHIEVEMENTS.map((a) => [a.id, a.seeds, a.goal] as const)).toEqual(REWARD_TABLE);
    const day = { modePaid: 0, pairPaid: 0, totalEarned: 0 };
    for (const achievement of ACHIEVEMENTS) {
      const paid = planSeedReward({
        playerId: 'p1',
        sourceKey: `achievement:${achievement.id}`,
        mode: 'campaign',
        outcome: 'win',
        opponentId: null,
        now: 0,
        achievementSeeds: achievement.seeds,
      }, day);
      expect(paid, achievement.id).toEqual({ amount: achievement.seeds, reason: null });
    }
  });
});

describe('the line itself', () => {
  it('is a non-blocking dark-glass note under its own root, with no confetti and no sound', () => {
    expect(ACHIEVEMENT_TOAST_CSS).toContain('#achievement-toast');
    expect(ACHIEVEMENT_TOAST_CSS).toContain('pointer-events: none');
    expect(ACHIEVEMENT_TOAST_CSS).toContain('var(--dark-glass)');
    expect(ACHIEVEMENT_TOAST_CSS).toContain('var(--dark-glass-blur)');
    expect(ACHIEVEMENT_TOAST_CSS).toContain('border: 0');
    expect(ACHIEVEMENT_TOAST_CSS).not.toMatch(/confetti/i);
    expect(source).not.toMatch(/confetti|Audio\(|\.cue\(|sound\(/);
    expect(main).not.toContain('mountAchievementToast');
    expect(main).not.toContain('achievement-toast');
  });
});
