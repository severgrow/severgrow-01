// ACHIEVEMENTS — the whole set (owner, 2026-10-29: "turn it into achievements and pay seeds for
// those"; owner, 2026-10-30: "around 35 ... online games, campaign, inviting a friend ... make some
// smart ones"). Server-verified, one-time, earned once, and grouped in the page.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import {
  ACHIEVEMENTS,
  FACTS_SOURCES,
  achievementFacts,
  achievementViews,
} from '../src/seeds/achievements.js';
import type { AchievementHistory, DuelView } from '../src/seeds/achievements.js';
import type { CampaignClear, WorldEconomyStore } from '../src/seeds/types.js';
import { SEED_ECONOMY } from '../src/seeds/config.js';
import { WORLD_CELLS, worldNeighbours } from '../src/world.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { campaignOpening, CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { apply, viewFor, DEFAULT_CONFIG } from '../../src/engine/index.js';
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

  it('names only tables the service actually reads, one aggregated read per source', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/seeds/service.ts', import.meta.url)), 'utf8');
    // The fact sources as the AGGREGATE reads added for the 2026-11-01 cost fix: never one query
    // per duel (`movesOf(`) or per opponent (`campaignHighestLevel(`).
    for (const read of ['claimedCells(', 'challengesInvolving(', 'listMatchesForPlayer(', 'movesOfMatches(', 'receiptRows(', 'campaignClears(', 'campaignHighestLevels(']) {
      expect(source).toContain(read);
    }
    // The removed per-duel read: the achievements history no longer asks for one move log at a time.
    // (The single-opponent `campaignHighestLevel` method still exists for the wallet's own level.)
    expect(source, 'one move log per duel is the N+1 that was removed').not.toContain('this.matches.movesOf(');
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

/**
 * THE COST OF ONE ACHIEVEMENTS READ (owner report, 2026-11-01: the deployed endpoint answered HTTP
 * 546 after ~100 s and the key never appeared). The old read asked the database for one move log per
 * finished duel and one campaign level per opponent: an N+1 that grew with the player's history.
 *
 * This drives the REAL Postgres adapters through a recording fake pool and asserts the shape of the
 * read itself: one statement per fact source, so the total is a small CONSTANT whether the player
 * has 3 finished duels or 12. The rules are unchanged; only the fetching is.
 */
type Call = { text: string; values: readonly unknown[] };

const fakePool = () => {
  const calls: Call[] = [];
  const scripts: { match: string; rows: PgRow[] }[] = [];
  const respond = (text: string, values: readonly unknown[]): PgQueryResult => {
    calls.push({ text, values });
    for (const script of scripts) if (text.includes(script.match)) return { rows: script.rows };
    return { rows: [] };
  };
  const client = { query: async (text: string, values: readonly unknown[] = []) => respond(text, values) };
  const pool: PgPool = {
    query: async (text, values = []) => respond(text, values),
    connect: async () => client,
  };
  return {
    pool,
    calls,
    script: (match: string, rows: PgRow[]) => void scripts.push({ match, rows }),
    statements: () => calls.map((call) => call.text.replace(/\s+/g, ' ').trim()),
  };
};

const finishedMatchRow = (id: string, opponentId: string): PgRow => ({
  id,
  invite_code: `INV-${id}`,
  rules_version: 'test',
  seed: '1',
  config: JSON.stringify(DEFAULT_CONFIG),
  starting_player: 0,
  status: 'finished',
  revision: '3',
  state: JSON.stringify({ board: {} }),
  result: JSON.stringify({ winner: 1, reason: 'knock', scores: [0, 0] }),
  created_at: '1',
  updated_at: '2',
  finished_at: '3',
  my_seat: 0,
  my_last_seen_at: '3',
  opponent_id: opponentId,
  opponent_name: opponentId,
});

const moveRow = (matchId: string, revision: number): PgRow => ({
  match_id: matchId,
  revision: String(revision),
  seat: 0,
  player_id: 'me',
  action: JSON.stringify({ t: 'Bloom' }),
  events: JSON.stringify([{ t: 'Sever', player: 0 }]),
  request_id: `${matchId}-${revision}`,
  created_at: '1',
});

const measureAchievementsRead = async (matches: number, opponents: number) => {
  const fake = fakePool();
  fake.script('from world_claims', [
    { cell_id: '0,0', owner_id: 'me' },
    { cell_id: '0,1', owner_id: 'them' },
  ]);
  fake.script('from world_challenges', []);
  // The receipts of this player: one claimed achievement and one campaign clear.
  fake.script('from seed_reward_receipts where player_id=$1 order by created_at asc', [
    { source_key: 'achievement:roots', mode: 'campaign', opponent_id: null, utc_day: '2026-10-30', awarded: 100, created_at: '1' },
    { source_key: 'campaign:c1-01', mode: 'campaign', opponent_id: null, utc_day: '2026-10-30', awarded: 100, created_at: '2' },
  ]);
  fake.script('information_schema.tables', [{ table_name: 'campaign_clears' }]);
  fake.script('from campaign_clears', []);
  fake.script('from match_participants self', Array.from({ length: matches }, (_, i) =>
    finishedMatchRow(`m${i}`, `op${i % Math.max(1, opponents)}`)));
  fake.script('from match_moves', Array.from({ length: matches }, (_, i) => moveRow(`m${i}`, 1)));
  // The one grouped opponent-level read.
  fake.script('group by player_id', Array.from({ length: opponents }, (_, i) => ({ player_id: `op${i}`, level: '5' })));

  const store = postgresWorldEconomyStore(fake.pool);
  const storage = postgresStorage(fake.pool);
  const service = new WorldEconomyService(store, storage, () => START);
  const views = await service.achievements(player('me'));
  return { statements: fake.statements(), views };
};

describe('the cost of the achievements read', () => {
  it('is a small constant number of statements, not one per duel or per opponent', async () => {
    const small = await measureAchievementsRead(3, 2);
    const big = await measureAchievementsRead(12, 6);

    expect(small.views).toHaveLength(35);
    expect(big.views).toHaveLength(35);
    // Small, and — the point — IDENTICAL for four times the history.
    expect(small.statements.length).toBeLessThanOrEqual(9);
    expect(big.statements.length).toBe(small.statements.length);

    // Exactly ONE aggregate read of each fact source.
    const count = (needle: string) => big.statements.filter((text) => text.includes(needle)).length;
    expect(count('from match_moves'), 'one move aggregate, never one per duel').toBe(1);
    expect(count('from match_participants self'), 'one match list').toBe(1);
    expect(count('from seed_reward_receipts where player_id=$1 order by created_at asc'), 'one receipt read').toBe(1);
    expect(count('group by player_id'), 'one grouped opponent-level read').toBe(1);
    expect(count('from world_claims')).toBe(1);
    expect(count('from world_challenges')).toBe(1);
    // The removed N+1 shapes are gone.
    expect(big.statements.some((text) => text === 'select * from match_moves where match_id = $1 and revision > $2 order by revision asc')).toBe(false);
  });

  it('reads the facts ONE AT A TIME, never in parallel against the two-connection pool', async () => {
    // THE production bug (2026-11-02). Five reads fired with Promise.all against an Edge pool of
    // max: 2 (server/src/storage/pool-config.ts). Three queued behind the two in flight and the
    // request never returned: no headers, no body, not even a log line, while every single-query
    // route beside it on the same token stayed under 0.6 s. It answered 0.27 s on one call and hung
    // for 90 s on the next. Sequential awaits fixed it (measured: 20/20 calls, 0.22-0.55 s).
    //
    // This test watches OVERLAP rather than the source text: each fake read records when it starts
    // and ends, and no two may be in flight at the same time.
    let inFlight = 0;
    let worstOverlap = 0;
    const wrap = <T,>(fn: () => Promise<T>) => async (): Promise<T> => {
      inFlight += 1;
      worstOverlap = Math.max(worstOverlap, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      try {
        return await fn();
      } finally {
        inFlight -= 1;
      }
    };
    const store = {
      claimedCells: wrap(async () => []),
      challengesInvolving: wrap(async () => []),
      receiptRows: wrap(async () => []),
      campaignClears: wrap(async () => []),
    } as unknown as WorldEconomyStore;
    const storage = {
      listMatchesForPlayer: wrap(async () => []),
      movesOfMatches: wrap(async () => []),
    } as unknown as Storage;
    const service = new WorldEconomyService(store, storage, () => START);
    const views = await service.achievements(player('me'));
    expect(views).toHaveLength(35);
    expect(worstOverlap, 'at most one fact read in flight at a time').toBe(1);
  });

  it('never abandons a database query to hit a deadline (the cause of the hung pool)', async () => {
    // Measured on the deployed function: a deadline that RESOLVED early did not cancel the queries
    // underneath it. They kept holding a connection from the Edge pool (max 2), so two abandoned
    // reads wedged it and later requests waited 800-2900 s for a connection. The safeguard is the
    // constant cost (one read per fact source), so the answer must be the real answer — no worker
    // may be left running behind an early return.
    let settled = false;
    const store = {
      claimedCells: async () => {
        await new Promise((r) => setTimeout(r, 30));
        settled = true;
        return [];
      },
      challengesInvolving: async () => [],
      receiptRows: async () => [],
      campaignClears: async () => [],
    } as unknown as WorldEconomyStore;
    const service = new WorldEconomyService(store, new MemoryStorage(), () => START);
    await service.achievements(player('slow'));
    // By the time the call returned, every underlying read had finished.
    expect(settled).toBe(true);
  });

  it('the source has no timeout race around the read', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(fileURLToPath(new URL('../src/seeds/service.ts', import.meta.url)), 'utf8');
    expect(source).toMatch(/async achievements\(player: PlayerRecord\)/);
    // No Promise.race, no deadline constant: a resolved-early race leaks its queries.
    expect(source).not.toMatch(/Promise\.race\(/);
    expect(source).not.toContain('ACHIEVEMENTS_READ_DEADLINE_MS');
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
