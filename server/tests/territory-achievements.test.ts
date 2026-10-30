// ACHIEVEMENTS — the whole set (owner, 2026-10-29: "turn it into achievements and pay seeds for
// those"; owner, 2026-10-30: "around 35 ... online games, campaign, inviting a friend ... make some
// smart ones"). Server-verified, one-time, earned once, and grouped in the page.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import {
  ACHIEVEMENTS,
  FACTS_SOURCES,
  achievementFacts,
  achievementViews,
} from '../src/seeds/achievements.js';
import type { AchievementHistory, DuelView } from '../src/seeds/achievements.js';
import type { CampaignClear } from '../src/seeds/types.js';
import { SEED_ECONOMY } from '../src/seeds/config.js';
import { WORLD_CELLS, worldNeighbours } from '../src/world.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { campaignOpening, CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { apply, viewFor } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';

const START = Date.UTC(2026, 9, 30, 12);
const player = (id: string): PlayerRecord => ({ id, kind: 'guest', displayName: id, createdAt: START, upgradedAt: null });
const ring = (() => {
  for (const cell of WORLD_CELLS) { const n = worldNeighbours(cell.id); if (n.length >= 4) return { home: cell.id, n }; }
  throw new Error('no ring');
})();

let duelClock = START;
const duel = (over: Partial<DuelView> = {}): DuelView => ({
  opponentId: 'them', kind: 'duel', openQueue: false, live: false, finishedAt: (duelClock += 1_000),
  won: false, draw: false, undercut: false, reason: 'knock', myCuts: 0, myBlooms: 0, myOtherGrows: 0,
  throwDraws: 0, megaBomb: false, rootSurrounded: false, creator: false, ...over,
});
const clear = (over: Partial<CampaignClear> = {}): CampaignClear => ({
  levelKey: 'c2-11', levelNumber: 11, turns: 20, throwDraws: 2, blooms: 2, grows: 1, finishedAt: START, ...over,
});
const history = (over: Partial<AchievementHistory> = {}): AchievementHistory => ({
  playerId: 'me',
  claims: [],
  challenges: [],
  duels: [],
  campaign: { highestLevel: null, chaptersCleared: 0, lessonCleared: false, clears: [] },
  opponentLevels: {},
  ...over,
});
const done = (id: string, h: AchievementHistory): boolean =>
  achievementViews(achievementFacts(h), new Set()).find((view) => view.id === id)!.done;

describe('the set', () => {
  it('is exactly 35 achievements with unique ids, names and sources', () => {
    expect(ACHIEVEMENTS).toHaveLength(35);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(35);
    for (const a of ACHIEVEMENTS) expect(FACTS_SOURCES).toContain(a.source);
    // The original generous first step is still the tile it pays back.
    expect(ACHIEVEMENTS[0]).toMatchObject({ id: 'roots', goal: 1, seeds: SEED_ECONOMY.tileCost });
  });

  it('covers every mode the owner named', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.group))).toEqual(new Set(['territory', 'duels', 'craft', 'company', 'campaign']));
    expect(ACHIEVEMENTS.filter((a) => a.group === 'territory')).toHaveLength(10);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'duels')).toHaveLength(9);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'craft')).toHaveLength(5);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'company')).toHaveLength(4);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'campaign')).toHaveLength(7);
  });

  it('names only tables the service actually reads', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/seeds/service.ts', import.meta.url)), 'utf8');
    for (const read of ['store.world(', 'challengesInvolving(', 'listMatchesForPlayer(', 'movesOf(', 'receiptRows(', 'campaignClears(']) {
      expect(source).toContain(read);
    }
    expect([...FACTS_SOURCES].sort()).toEqual([
      'campaign_clears', 'match_moves', 'matches', 'seed_reward_receipts', 'world_challenges', 'world_claims',
    ]);
  });

  it('gives every achievement its own receipt key, so none can be paid twice', () => {
    const keys = ACHIEVEMENTS.map((a) => `achievement:${a.id}`);
    expect(new Set(keys).size).toBe(35);
    const views = achievementViews(achievementFacts(history()), new Set(keys));
    expect(views.every((view) => view.claimed)).toBe(true);
  });

  it('caps progress at the goal and marks done/claimed', () => {
    const views = achievementViews(achievementFacts(history({
      claims: Array.from({ length: 12 }, (_, i) => ({ cellId: `c${i}`, ownerId: 'me' })),
      campaign: { highestLevel: 7, chaptersCleared: 0, lessonCleared: false, clears: [] },
    })), new Set(['achievement:roots']));
    expect(views.find((v) => v.id === 'estate')).toMatchObject({ progress: 10, goal: 10, done: true, claimed: false });
    expect(views.find((v) => v.id === 'roots')).toMatchObject({ done: true, claimed: true });
    expect(views.find((v) => v.id === 'ten-clearings')).toMatchObject({ progress: 7, goal: 10, done: false });
  });
});

/**
 * ONE ROW PER ACHIEVEMENT: a hand-built history that earns it, and one that does not. The set of
 * ids here must equal the set of definitions, so a new achievement without a proof fails this test.
 */
describe('every condition, earned and not earned', () => {
  const cases: { id: string; earned: AchievementHistory; not: AchievementHistory }[] = [
    { id: 'roots', earned: history({ claims: [{ cellId: ring.home, ownerId: 'me' }] }), not: history() },
    {
      id: 'neighbours',
      earned: history({ claims: [{ cellId: ring.home, ownerId: 'me' }, { cellId: ring.n[0]!, ownerId: 'them' }] }),
      not: history({ claims: [{ cellId: ring.home, ownerId: 'me' }] }),
    },
    { id: 'throw-down', earned: history({ challenges: [{ challengerId: 'me', defenderId: 'them', status: 'pending', matchId: null, winnerId: null }] }), not: history() },
    {
      id: 'stand-ground',
      earned: history({ challenges: [{ challengerId: 'them', defenderId: 'me', status: 'accepted', matchId: 'm', winnerId: null }] }),
      not: history({ challenges: [{ challengerId: 'them', defenderId: 'me', status: 'pending', matchId: null, winnerId: null }] }),
    },
    { id: 'holding', earned: history({ claims: [0, 1, 2].map((i) => ({ cellId: `h${i}`, ownerId: 'me' })) }), not: history({ claims: [0, 1].map((i) => ({ cellId: `h${i}`, ownerId: 'me' })) }) },
    {
      id: 'conqueror',
      earned: history({ challenges: [{ challengerId: 'me', defenderId: 'them', status: 'resolved', matchId: 'm', winnerId: 'me' }] }),
      not: history({ challenges: [{ challengerId: 'me', defenderId: 'them', status: 'pending', matchId: null, winnerId: null }] }),
    },
    { id: 'podium', earned: history({ claims: [{ cellId: ring.home, ownerId: 'me' }] }), not: history() },
    { id: 'estate', earned: history({ claims: Array.from({ length: 10 }, (_, i) => ({ cellId: `e${i}`, ownerId: 'me' })) }), not: history({ claims: Array.from({ length: 9 }, (_, i) => ({ cellId: `e${i}`, ownerId: 'me' })) }) },
    {
      id: 'home-guard',
      earned: history({ challenges: [{ challengerId: 'them', defenderId: 'me', status: 'resolved', matchId: 'm', winnerId: 'me' }] }),
      not: history({ challenges: [{ challengerId: 'them', defenderId: 'me', status: 'resolved', matchId: 'm', winnerId: 'them' }] }),
    },
    {
      id: 'ground-taken',
      earned: history({ challenges: [{ challengerId: 'me', defenderId: 'them', status: 'resolved', matchId: 'm', winnerId: 'me' }] }),
      not: history({ challenges: [{ challengerId: 'me', defenderId: 'them', status: 'resolved', matchId: 'm', winnerId: 'them' }] }),
    },

    { id: 'first-crossing', earned: history({ duels: [duel({ won: true })] }), not: history({ duels: [duel({ won: false })] }) },
    { id: 'three-crossings', earned: history({ duels: [duel({ won: true }), duel({ won: true }), duel({ won: true })] }), not: history({ duels: [duel({ won: true }), duel({ won: true })] }) },
    { id: 'ten-crossings', earned: history({ duels: Array.from({ length: 10 }, () => duel({ won: true })) }), not: history({ duels: Array.from({ length: 9 }, () => duel({ won: true })) }) },
    { id: 'running-sap', earned: history({ duels: [duel({ won: true }), duel({ won: true }), duel({ won: true })] }), not: history({ duels: [duel({ won: true }), duel({ won: true })] }) },
    { id: 'long-growth', earned: history({ duels: Array.from({ length: 5 }, () => duel({ won: true })) }), not: history({ duels: Array.from({ length: 4 }, () => duel({ won: true })) }) },
    { id: 'live-wood', earned: history({ duels: [duel({ won: true, live: true })] }), not: history({ duels: [duel({ won: true, live: false })] }) },
    {
      id: 'higher-branch',
      earned: history({ campaign: { highestLevel: 3, chaptersCleared: 0, lessonCleared: false, clears: [] }, opponentLevels: { them: 4 }, duels: [duel({ won: true })] }),
      not: history({ campaign: { highestLevel: 3, chaptersCleared: 0, lessonCleared: false, clears: [] }, opponentLevels: { them: 3 }, duels: [duel({ won: true })] }),
    },
    { id: 'unsevered', earned: history({ duels: [duel({ won: true, myCuts: 0 })] }), not: history({ duels: [duel({ won: true, myCuts: 1 })] }) },
    { id: 'caught-knock', earned: history({ duels: [duel({ won: true, undercut: true })] }), not: history({ duels: [duel({ won: true, undercut: false })] }) },

    { id: 'bloom-and-nothing', earned: history({ duels: [duel({ won: true, myBlooms: 3, myOtherGrows: 0 })] }), not: history({ duels: [duel({ won: true, myBlooms: 3, myOtherGrows: 1 })] }) },
    { id: 'cut-and-standing', earned: history({ duels: [duel({ won: true, myCuts: 1 })] }), not: history({ duels: [duel({ won: true, myCuts: 0 })] }) },
    { id: 'ringed-root', earned: history({ duels: [duel({ won: true, rootSurrounded: true })] }), not: history({ duels: [duel({ won: true, rootSurrounded: false })] }) },
    { id: 'last-light', earned: history({ duels: [duel({ won: true, reason: 'deck_exhaustion' })] }), not: history({ duels: [duel({ won: true, reason: 'knock' })] }) },
    { id: 'quiet-table', earned: history({ duels: [duel({ throwDraws: 0 })] }), not: history({ duels: [duel({ throwDraws: 1 })] }) },

    { id: 'open-door', earned: history({ duels: [duel({ won: true, creator: true })] }), not: history({ duels: [duel({ won: true, creator: false })] }) },
    { id: 'company', earned: history({ duels: [duel({ kind: 'duel', openQueue: false })] }), not: history({ duels: [duel({ kind: 'duel', openQueue: true })] }) },
    {
      id: 'grove-of-friends',
      earned: history({ duels: [duel({ opponentId: 'a' }), duel({ opponentId: 'b' }), duel({ opponentId: 'c' })] }),
      not: history({ duels: [duel({ opponentId: 'a' }), duel({ opponentId: 'b' })] }),
    },
    { id: 'generous-host', earned: history({ duels: [duel({ won: false, draw: false, creator: true })] }), not: history({ duels: [duel({ won: true, creator: true })] }) },

    { id: 'first-clearing', earned: history({ campaign: { highestLevel: 1, chaptersCleared: 0, lessonCleared: false, clears: [] } }), not: history() },
    { id: 'five-clearings', earned: history({ campaign: { highestLevel: 5, chaptersCleared: 0, lessonCleared: false, clears: [] } }), not: history({ campaign: { highestLevel: 4, chaptersCleared: 0, lessonCleared: false, clears: [] } }) },
    { id: 'ten-clearings', earned: history({ campaign: { highestLevel: 10, chaptersCleared: 1, lessonCleared: true, clears: [] } }), not: history({ campaign: { highestLevel: 9, chaptersCleared: 0, lessonCleared: false, clears: [] } }) },
    { id: 'whole-chapter', earned: history({ campaign: { highestLevel: 20, chaptersCleared: 2, lessonCleared: true, clears: [] } }), not: history({ campaign: { highestLevel: 9, chaptersCleared: 0, lessonCleared: false, clears: [] } }) },
    { id: 'last-lesson', earned: history({ campaign: { highestLevel: 10, chaptersCleared: 1, lessonCleared: true, clears: [] } }), not: history({ campaign: { highestLevel: 9, chaptersCleared: 0, lessonCleared: false, clears: [] } }) },
    { id: 'clean-hands', earned: history({ campaign: { highestLevel: 11, chaptersCleared: 1, lessonCleared: true, clears: [clear({ throwDraws: 0 })] } }), not: history({ campaign: { highestLevel: 11, chaptersCleared: 1, lessonCleared: true, clears: [clear({ throwDraws: 2 })] } }) },
    { id: 'quick-work', earned: history({ campaign: { highestLevel: 11, chaptersCleared: 1, lessonCleared: true, clears: [clear({ turns: 12 })] } }), not: history({ campaign: { highestLevel: 11, chaptersCleared: 1, lessonCleared: true, clears: [clear({ turns: 13 })] } }) },
  ];

  it('covers every definition exactly once', () => {
    expect(cases.map((c) => c.id).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  for (const { id, earned, not } of cases) {
    it(`${id}: earned from the history, not earned without it`, () => {
      expect(done(id, earned)).toBe(true);
      expect(done(id, not)).toBe(false);
    });
  }
});

const harness = async () => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  let clock = START;
  const service = new WorldEconomyService(store, storage, () => clock);
  const [a, b] = [player('a'), player('b')];
  await storage.createPlayer(a); await storage.createPlayer(b);
  const own = (cellId: string, ownerId: string) =>
    store.claims.set(cellId, { cellId, ownerId, ownerName: null, ownerLevel: null, claimedAt: clock });
  return { storage, store, service, a, b, own, advance: (ms: number) => { clock += ms; } };
};

describe('claiming', () => {
  it('pays the fixed amount once, outside the daily cap, and a retry replays it', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    const first = await h.service.claimAchievement(h.a, 'roots');
    expect(first).toMatchObject({ ok: true, awarded: 100, replayed: false });
    expect((await h.store.wallet('a')).balance).toBe(100);
    const again = await h.service.claimAchievement(h.a, 'roots');
    expect(again).toMatchObject({ ok: true, awarded: 100, replayed: true });
    expect((await h.store.wallet('a')).balance).toBe(100);
    expect((await h.service.achievements(h.a)).find((v) => v.id === 'roots')).toMatchObject({ claimed: true });
  });

  it('refuses an achievement not earned yet, and pays nothing', async () => {
    const h = await harness();
    expect(await h.service.claimAchievement(h.a, 'roots')).toEqual({ ok: false, code: 'NOT_EARNED' });
    expect((await h.store.wallet('a')).balance).toBe(0);
  });

  it('stays claimed after the tiles are gone (selling cannot re-arm it)', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    await h.service.claimAchievement(h.a, 'roots');
    h.store.claims.delete(ring.home);
    expect(await h.service.claimAchievement(h.a, 'roots')).toMatchObject({ ok: true, replayed: true });
    expect((await h.store.wallet('a')).balance).toBe(100);
  });

  it('rejects an unknown id', async () => {
    const h = await harness();
    await expect(h.service.claimAchievement(h.a, 'free-money')).rejects.toThrow();
  });

  it('a sent challenge earns throw-down; the defender who accepts earns stand-ground', async () => {
    const h = await harness();
    h.own(ring.home, 'a'); h.own(ring.n[0]!, 'b');
    const sent = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-ach-1');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect((await h.service.claimAchievement(h.a, 'throw-down')).ok).toBe(true);
    expect(await h.service.claimAchievement(h.b, 'stand-ground')).toEqual({ ok: false, code: 'NOT_EARNED' });
    await h.service.respond(h.b, sent.challenge.id, true);
    expect((await h.service.claimAchievement(h.b, 'stand-ground')).ok).toBe(true);
  });
});

/** A genuine (server-replayed) Campaign win, so the clear-shape recording is real, not a stub. */
const genuineWin = (level = CAMPAIGN_LEVELS[0]!): Action[] => {
  let state = campaignOpening(level);
  const actions: Action[] = [];
  while (state.phase !== 'GAME_OVER' && actions.length < 300) {
    const actor = state.actor;
    const botLevel = actor === 0 ? 9 : level.botLevel;
    const action = chooseLevelAction(viewFor(state, actor), botLevel,
      botSeed(state.seed ^ (actor === 0 ? 0x9e3779b9 : 0), botLevel, state.turnNumber, state.history?.length ?? 0));
    actions.push(action);
    state = apply(state, action);
  }
  expect(state.result?.winner).toBe(0);
  return actions;
};

describe('campaign clears (migration 0021)', () => {
  it('records the verified shape and keeps the best attempt per level', async () => {
    const h = await harness();
    await h.service.campaign(h.a, CAMPAIGN_LEVELS[0]!.id, genuineWin(), CURRENT_BOT_VERSION);
    const first = await h.store.campaignClears('a');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ levelKey: CAMPAIGN_LEVELS[0]!.id, levelNumber: CAMPAIGN_LEVELS[0]!.number });
    expect(first[0]!.turns).toBeGreaterThan(0);
    expect(first[0]!.throwDraws).toBeGreaterThanOrEqual(0);
    await h.store.recordCampaignClear('a', { ...first[0]!, turns: 3, throwDraws: 0, blooms: 9, grows: 0 });
    const best = (await h.store.campaignClears('a'))[0]!;
    expect(best).toMatchObject({ turns: 3, throwDraws: 0, blooms: 9, grows: 0 });
  });

  it('the achievement page reads the receipts and the clear shape without inventing anything', async () => {
    const h = await harness();
    expect((await h.service.achievements(h.a)).find((v) => v.id === 'clean-hands')).toMatchObject({ progress: 0, done: false });
    await h.store.recordCampaignClear('a', clear({ throwDraws: 0, turns: 9 }));
    await h.store.settle({
      playerId: 'a', sourceKey: `campaign:${CAMPAIGN_LEVELS[0]!.id}`, mode: 'campaign', outcome: 'win',
      opponentId: null, now: START, campaignLevel: CAMPAIGN_LEVELS[0]!.number,
    });
    const views = await h.service.achievements(h.a);
    expect(views.find((v) => v.id === 'clean-hands')).toMatchObject({ progress: 1, done: true });
    expect(views.find((v) => v.id === 'quick-work')).toMatchObject({ progress: 1, done: true });
    expect(views.find((v) => v.id === 'first-clearing')).toMatchObject({ progress: 1, done: true });
  });
});

describe('HTTP', () => {
  it('lists all 35 and claims with a bearer token, 409 for an unearned claim', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    const router = createWorldEconomyRouter({ economy: h.service, authenticate: async (t) => { if (t !== 'tok-a') throw new Error('auth'); return h.a; } });
    const req = (method: string, path: string, body?: unknown) => router(new Request(`http://x${path}`, {
      method, headers: { authorization: 'Bearer tok-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    }), path);
    const list = await req('GET', '/v1/seeds/achievements');
    expect(list?.status).toBe(200);
    const views = (list!.body as { achievements: { id: string; done: boolean; group: string }[] }).achievements;
    expect(views).toHaveLength(35);
    expect(views.map((v) => v.id)).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(views.find((v) => v.id === 'roots')?.done).toBe(true);
    expect((await req('POST', '/v1/seeds/achievements/claim', { id: 'roots' }))?.status).toBe(200);
    const unearned = await req('POST', '/v1/seeds/achievements/claim', { id: 'estate' });
    expect(unearned?.status).toBe(409);
    expect(unearned?.body).toMatchObject({ ok: false, code: 'NOT_EARNED' });
  });
});

describe('admin', () => {
  it('the Campaign screen never counts an achievement as a level', async () => {
    const { shapeCampaign } = await import('../src/admin/campaign.js');
    const shaped = shapeCampaign([
      { sourceKey: 'achievement:roots', awarded: 100, denial: null, utcDay: '2026-10-30' },
      { sourceKey: 'campaign:c1-01', awarded: 100, denial: null, utcDay: '2026-10-30' },
    ], []);
    expect(JSON.stringify(shaped)).not.toContain('achievement');
  });
});
