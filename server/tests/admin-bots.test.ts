// The bot/human split (owner, 2026-10-24): "i mainly care about not confusing bots with real players
// who are testing the game".
//
// Three categories, and only the first is ever hidden:
//   1. automated accounts (a test marker, written by a harness at creation or by the conservative
//      backfill) — hidden from the human views, listed on the Bots tab;
//   2. real people testing the game — humans. They are NEVER hidden, even when their generated
//      nature name looks exactly like a bot's (it always does: a guest name comes from the id);
//   3. regular players — humans.
//
// The owner's override is the correction path: it is stored on the row, it survives a reload, and it
// moves the account between the human list and the Bots tab on every read afterwards.
import { describe, expect, it } from 'vitest';
import { classificationOf, shapePlayers, type PlayerFacts } from '../src/admin/players.js';
import { MatchService } from '../src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryFeedbackStore } from '../src/feedback/feedback.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { MemoryIdentityLinkStore } from '../src/accounts/accounts.js';
import { memoryAdminStore } from '../src/admin/memory.js';
import { postgresAdminStore } from '../src/admin/postgres.js';
import type { PlayerRecord } from '../src/storage/types.js';

const NOW = 1_760_000_000_000;
const DAY = 86_400_000;
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const facts = (over: Partial<PlayerFacts> = {}): PlayerFacts => ({
  id: uuid(1),
  displayName: 'AmberFox',
  kind: 'guest',
  createdAt: NOW - 10 * DAY,
  google: false,
  presenceAt: null,
  isTest: false,
  testReason: null,
  testOverride: null,
  matches: { played: 0, finished: 0, wins: 0, lastAt: null, lastStatus: null },
  campaign: { highest: null, clears: 0, lastAt: null, lastLevel: null },
  reports: { count: 0, lastAt: null },
  tiles: { count: 0, lastAt: null },
  seeds: 0,
  ...over,
});

describe('classificationOf: the one decision every screen reads', () => {
  it('never calls a human a bot, whatever their name looks like', () => {
    // "AmberFox" is exactly the shape of a generated guest name. It is not evidence.
    expect(classificationOf({ isTest: false, testReason: null, testOverride: null }).classification).toBe('human');
    expect(classificationOf({ isTest: false, testReason: null, testOverride: null }).reason).toBe(
      'No test marker: treated as a real player.',
    );
  });

  it('a marked row is a bot, and says why', () => {
    const marked = classificationOf({ isTest: true, testReason: 'Tagged at creation by an automated harness.', testOverride: null });
    expect(marked.classification).toBe('bot');
    expect(marked.reason).toBe('Tagged at creation by an automated harness.');
    expect(marked.overridden).toBe(false);
    // A row marked before reasons were recorded still reads honestly rather than guessing.
    expect(classificationOf({ isTest: true, testReason: null, testOverride: null }).reason).toBe(
      'Marked as test data in the database (no reason recorded).',
    );
  });

  it("the owner's override wins over the marker, in both directions", () => {
    const alwaysHuman = classificationOf({ isTest: true, testReason: 'Backfill: …', testOverride: false });
    expect(alwaysHuman.classification).toBe('human');
    expect(alwaysHuman.overridden).toBe(true);
    expect(alwaysHuman.reason).toContain('Owner override');

    const alwaysBot = classificationOf({ isTest: false, testReason: null, testOverride: true });
    expect(alwaysBot.classification).toBe('bot');
    expect(alwaysBot.overridden).toBe(true);
  });

  it('is deterministic: the same facts always give the same word', () => {
    const input = { isTest: true, testReason: 'Backfill: burst.', testOverride: null };
    expect(classificationOf(input)).toEqual(classificationOf({ ...input }));
  });
});

describe('shapePlayers counts humans and bots separately, so a total never lies', () => {
  const rows = [
    facts({ id: uuid(1), displayName: 'RealFriend', isTest: false, createdAt: NOW - 2 * DAY, presenceAt: NOW - 60_000 }),
    facts({ id: uuid(2), displayName: 'AmberFox', isTest: false, createdAt: NOW - 3 * DAY }),
    facts({ id: uuid(3), displayName: 'CoralBear', isTest: true, testReason: 'Backfill: burst.', createdAt: NOW - 60 * 60 * 1000 }),
    facts({ id: uuid(4), displayName: 'JadeCreek', isTest: true, testReason: 'Backfill: burst.', createdAt: NOW - 20 * DAY }),
    facts({ id: uuid(5), displayName: 'KeptHuman', isTest: true, testReason: 'Backfill: burst.', testOverride: false, createdAt: NOW - 4 * DAY }),
  ];

  it('splits the rows, and humans + bots always add up to the total', () => {
    const shaped = shapePlayers(rows, NOW);
    expect(shaped.total).toBe(5);
    expect(shaped.summary.humans).toBe(3); // 2 real + 1 owner-kept
    expect(shaped.summary.bots).toBe(2);
    expect(shaped.summary.humans + shaped.summary.bots).toBe(shaped.total);
    // "Players" is the human number, never the mixed one.
    expect(shaped.summary.players).toBe(3);
  });

  it('counts only bots for the "testing right now" signal', () => {
    const shaped = shapePlayers(rows, NOW);
    expect(shaped.summary.botsCreated24h).toBe(1); // uuid(3), an hour old
    expect(shaped.summary.botsActive24h).toBe(1); // uuid(4) is 20 days old and silent
  });

  it('carries the reason on every row, so the owner can judge it', () => {
    const shaped = shapePlayers(rows, NOW);
    const byId = new Map(shaped.rows.map((row) => [row.id, row]));
    expect(byId.get(uuid(3))!.classification).toBe('bot');
    expect(byId.get(uuid(3))!.classificationReason).toBe('Backfill: burst.');
    expect(byId.get(uuid(5))!.classification).toBe('human');
    expect(byId.get(uuid(5))!.classificationReason).toContain('Owner override');
  });
});

// ------------------------------------------------------------------ the in-memory store
const setup = () => {
  const storage = new MemoryStorage();
  const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], adminPlayerIds: [uuid(1)] };
  const feedback = new MemoryFeedbackStore();
  const economy = new MemoryWorldEconomyStore();
  const links = new MemoryIdentityLinkStore();
  const service = new MatchService({ storage, config, now: () => NOW });
  const store = memoryAdminStore({ storage, feedback, economy, links });
  const put = async (record: PlayerRecord): Promise<PlayerRecord> => {
    await storage.createPlayer(record);
    return record;
  };
  return { storage, service, store, feedback, economy, links, put };
};
const player = (n: number, over: Partial<PlayerRecord> = {}): PlayerRecord => ({
  id: uuid(n),
  kind: 'guest',
  displayName: `Player${n}`,
  createdAt: NOW - DAY,
  upgradedAt: null,
  ...over,
});

describe('the Bots tab data and the owner override, against the in-memory store', () => {
  it('lists a marked account as a bot, and keeps a human with a bot-shaped name in the human list', async () => {
    const t = setup();
    await t.put(player(1, { kind: 'account', displayName: 'Owner' }));
    await t.put(player(2, { displayName: 'AmberFox' })); // human, generated-looking name
    await t.put(player(3, { displayName: 'CoralBear', isTest: true, testReason: 'Backfill: burst.' }));

    const all = await t.store.players(NOW);
    expect(all.total).toBe(3);
    expect(all.summary.humans).toBe(2);
    expect(all.summary.bots).toBe(1);
    const bot = all.rows.find((row) => row.id === uuid(3))!;
    expect(bot.classification).toBe('bot');
    expect(bot.classificationReason).toBe('Backfill: burst.');
    const human = all.rows.find((row) => row.id === uuid(2))!;
    expect(human.classification).toBe('human');
  });

  it("the owner's override persists and moves the account between the two lists", async () => {
    const t = setup();
    await t.put(player(1, { kind: 'account', displayName: 'Owner' }));
    await t.put(player(3, { displayName: 'CoralBear', isTest: true, testReason: 'Backfill: burst.' }));

    const before = await t.store.players(NOW);
    expect(before.summary.bots).toBe(1);
    expect(before.summary.humans).toBe(1);

    expect(await t.store.setPlayerVisibility({ playerId: uuid(3), override: false, actorId: uuid(1), now: NOW })).not.toBeNull();

    const after = await t.store.players(NOW);
    expect(after.summary.bots).toBe(0);
    expect(after.summary.humans).toBe(2);
    expect(after.rows.find((row) => row.id === uuid(3))!.classification).toBe('human');
  });

  it('an override back to auto restores the stored marker', async () => {
    const t = setup();
    await t.put(player(1, { kind: 'account', displayName: 'Owner' }));
    await t.put(player(3, { displayName: 'CoralBear', isTest: true, testReason: 'Backfill: burst.' }));
    await t.store.setPlayerVisibility({ playerId: uuid(3), override: false, actorId: uuid(1), now: NOW });
    await t.store.setPlayerVisibility({ playerId: uuid(3), override: null, actorId: uuid(1), now: NOW + 1 });
    const after = await t.store.players(NOW + 2);
    expect(after.summary.bots).toBe(1);
    expect(after.rows.find((row) => row.id === uuid(3))!.classificationReason).toBe('Backfill: burst.');
  });

  it('a bot is still absent from every other screen (a lookup does not find it)', async () => {
    const t = setup();
    await t.put(player(1, { kind: 'account', displayName: 'Owner' }));
    await t.put(player(3, { displayName: 'CoralBear', isTest: true, testReason: 'Backfill: burst.' }));
    expect(await t.store.playerLookup({ id: uuid(3) })).toBeNull();
    const funnel = await t.store.funnel(NOW);
    expect(funnel.totals.players).toBe(1);
  });

  it('the override is one scoped UPDATE and an audit row in the same transaction (real SQL)', async () => {
    const sql: string[] = [];
    const query = async (text: string): Promise<{ rows: Record<string, unknown>[] }> => {
      sql.push(text);
      // The player row the UPDATE returns; everything else (begin/insert/commit) has no rows.
      if (/^\s*update players set test_override/.test(text)) {
        return { rows: [{ is_test: true, test_reason: 'Backfill: burst.', test_override: false }] };
      }
      return { rows: [] };
    };
    const store = postgresAdminStore({ query, connect: async () => ({ query, release: () => undefined }) });
    await store.setPlayerVisibility({ playerId: uuid(3), override: false, actorId: uuid(1), now: NOW });
    const joined = sql.join(' ').replace(/\s+/g, ' ');
    // Scoped by the id — never a table sweep — and it writes the correction, not the marker.
    expect(joined).toMatch(/update players set test_override = \$2 where id = \$1/);
    expect(joined).toMatch(/insert into admin_audit/);
    expect(joined).toMatch(/'player\.visibility'/);
    expect(sql[0]).toMatch(/begin/i);
    expect(sql[sql.length - 1]).toMatch(/rollback|commit/i);
  });

  it('overriding to human makes that player findable, because the owner said so', async () => {
    const t = setup();
    await t.put(player(1, { kind: 'account', displayName: 'Owner' }));
    await t.put(player(3, { displayName: 'CoralBear', isTest: true, testReason: 'Backfill: burst.' }));
    await t.store.setPlayerVisibility({ playerId: uuid(3), override: false, actorId: uuid(1), now: NOW });
    const found = await t.store.playerLookup({ id: uuid(3) });
    expect(found?.player.id).toBe(uuid(3));
  });
});
