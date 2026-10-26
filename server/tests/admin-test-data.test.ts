// The test-data marker (migration 0013) on the dashboard reads, tested two ways:
//
//   1. FUNCTIONAL, against the in-memory store — a marked player and a marked match are excluded
//      from EVERY admin read, and a real player is never hidden by a match they played.
//   2. SQL GUARD — every statement the real (Postgres) store runs against a player/match table
//      carries an `is_test` filter. The in-memory store is a separate implementation, so its own
//      behaviour cannot catch a live query that forgot the filter; this drives the real store
//      against a recording pool and asserts the SQL itself.
//
// This mirrors the case-insensitive-search fix's "assert the real SQL" pattern in admin.test.ts.
import { describe, expect, it } from 'vitest';
import { MatchService } from '../src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryFeedbackStore } from '../src/feedback/feedback.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { BETA_PAYOUT_MULTIPLIER, SEED_ECONOMY } from '../src/seeds/config.js';
import { MemoryIdentityLinkStore } from '../src/accounts/accounts.js';
import { memoryAdminStore } from '../src/admin/memory.js';
import { postgresAdminStore } from '../src/admin/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';
import type { MatchRecord, PlayerRecord } from '../src/storage/types.js';

const NOW = 1_760_000_000_000;
const DAY = 86_400_000;

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const player = (n: number, over: Partial<PlayerRecord> = {}): PlayerRecord => ({
  id: uuid(n),
  kind: 'guest',
  displayName: `Player${n}`,
  createdAt: NOW - DAY,
  upgradedAt: null,
  ...over,
});

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
  /** Flip the match's own marker directly (the tools do this with SQL; a test does it here). */
  const markMatch = (id: string): void => {
    const map = (storage as unknown as { matches: Map<string, MatchRecord> }).matches;
    const row = map.get(id);
    if (row) map.set(id, { ...row, isTest: true });
  };
  return { storage, service, store, feedback, economy, links, put, markMatch };
};

type Ctx = ReturnType<typeof setup>;

/** A real player and a marked one, each funded enough to buy a tile and holding one claim. */
const seedEconomyAndWorld = async (t: Ctx): Promise<{ realId: string; markedId: string }> => {
  const realId = uuid(1);
  const markedId = uuid(2);
  for (const id of [realId, markedId]) {
    for (let i = 0; i < 4; i += 1) {
      await t.economy.settle({ playerId: id, sourceKey: `${id}-win-${i}`, mode: 'queue', outcome: 'win', opponentId: null, now: NOW - 4_000 + i });
    }
  }
  expect((await t.economy.claim(realId, '0,0', `real-claim`, NOW - 1_000)).ok).toBe(true);
  expect((await t.economy.claim(markedId, '1,0', `marked-claim`, NOW - 1_000)).ok).toBe(true);
  return { realId, markedId };
};

describe('a marked player and a marked match are invisible on every admin read', () => {
  it('players, funnel, matches, detail, world, economy, ledger, campaign and reports all exclude them', async () => {
    const t = setup();
    // 8 players: 1,3,4,5,6,7 real; 2 and 8 marked.
    await t.put(player(1, { kind: 'account', displayName: 'RealOne' }));
    for (const n of [3, 4, 5, 6, 7]) await t.put(player(n));
    const m1 = await t.put(player(2, { isTest: true, displayName: 'MarkedOne' }));
    const m2 = await t.put(player(8, { isTest: true, displayName: 'MarkedTwo' }));

    // A visible match: two real players, no marked participant.
    const visible = await t.service.createMatch(player(3), {}, null);
    await t.service.joinMatch(player(4), visible.match.inviteCode, null);
    // A match whose own flag is set (both participants real): hidden by the row flag alone.
    const flagged = await t.service.createMatch(player(5), {}, null);
    await t.service.joinMatch(player(6), flagged.match.inviteCode, null);
    t.markMatch(flagged.match.matchId);
    // A match with no flag whose participants are BOTH marked: hidden by the participant rule.
    const byParticipants = await t.service.createMatch(m1, {}, null);
    await t.service.joinMatch(m2, byParticipants.match.inviteCode, null);
    // A mixed match: a real player and a marked guest. Hidden, and the real player stays visible.
    const mixed = await t.service.createMatch(player(7), {}, null);
    await t.service.joinMatch(m1, mixed.match.inviteCode, null);

    const { realId, markedId } = await seedEconomyAndWorld(t);

    await t.feedback.insert({ id: uuid(90), createdAt: NOW - 100, kind: 'report', playerId: uuid(1), message: 'from a real player', context: {}, build: null, userAgent: null });
    await t.feedback.insert({ id: uuid(91), createdAt: NOW - 99, kind: 'report', playerId: markedId, message: 'Test testera testuje test', context: {}, build: null, userAgent: null });
    t.links.rows.push({ provider: 'google', subject: 'real-subject', playerId: uuid(1), createdAt: NOW - 50 });
    t.links.rows.push({ provider: 'google', subject: 'marked-subject', playerId: markedId, createdAt: NOW - 49 });

    // --- matches list / detail ------------------------------------------------
    const list = await t.store.matches({ limit: 50 });
    expect(list.rows.map((row) => row.id)).toEqual([visible.match.matchId]);
    expect(list.total).toBe(1);
    expect(await t.store.matchDetail(flagged.match.matchId, 50)).toBeNull();
    expect(await t.store.matchDetail(byParticipants.match.matchId, 50)).toBeNull();
    expect(await t.store.matchDetail(mixed.match.matchId, 50)).toBeNull();
    expect((await t.store.matchDetail(visible.match.matchId, 50))?.match.id).toBe(visible.match.matchId);

    // --- player lookup -------------------------------------------------------
    // A marked player is not findable at all…
    expect(await t.store.playerLookup({ name: 'MarkedOne' })).toBeNull();
    expect(await t.store.playerLookup({ id: m1.id })).toBeNull();
    // …and a REAL player is found, but their mixed test match is not in their history.
    const found = await t.store.playerLookup({ name: 'Player7' });
    expect(found?.player.id).toBe(player(7).id);
    expect(found?.matches.total).toBe(0);

    // --- overview / counts ---------------------------------------------------
    const overview = await t.store.overview(NOW);
    // Only the one visible match counts (the flagged, all-marked and mixed ones do not).
    expect(overview.matches.byStatus.finished + overview.matches.byStatus.active + overview.matches.byStatus.waiting).toBe(1);
    const counts = await t.store.countsSince(NOW - DAY, NOW);
    expect(counts.matches).toBe(1);
    expect(counts.claims).toBe(1); // only the real claim
    expect(counts.reports).toBe(1); // only the real report

    // --- rules drift / stuck -------------------------------------------------
    const drift = await t.store.rulesVersionCounts();
    expect(drift).toHaveLength(1);
    expect(drift[0]!.n).toBe(1);
    const stuck = await t.store.stuck(NOW, { guestMaxAgeMs: 0, waitingExpireMs: 1, turnTimeoutMs: 1 });
    // guestMaxAgeMs 0 makes every guest "cleanup eligible" — only the 5 real guests are reported.
    expect(stuck.cleanupEligibleGuests.count).toBe(5);
    expect(stuck.expiredActive.count + stuck.expiredWaiting.count).toBe(0);

    // --- funnel --------------------------------------------------------------
    const funnel = await t.store.funnel(NOW);
    // 6 real players (1 account + 5 guests); the 2 marked ones are not counted.
    expect(funnel.totals.players).toBe(6);
    expect(funnel.totals.accounts).toBe(1);
    expect(funnel.accountsLinkedByDay.reduce((n, day) => n + day.n, 0)).toBe(1);

    // --- world ---------------------------------------------------------------
    const world = await t.store.world(NOW);
    expect(world.totalClaims).toBe(1);
    expect(world.owners).toBe(1);
    expect(world.recentClaims.map((c) => c.ownerId)).toEqual([realId]);
    expect(world.claimsByDayIndex.flatMap((day) => day.claims).map((c) => c.ownerId)).toEqual([realId]);

    // --- economy / ledger / campaign -----------------------------------------
    const economy = await t.store.economy(NOW);
    expect(economy.totals.wallets).toBe(1);
    expect(economy.totals.lifetimeEarned).toBe(4 * SEED_ECONOMY.online.queue.win * BETA_PAYOUT_MULTIPLIER);
    expect(economy.totals.lifetimeSpent).toBe(100);
    expect(economy.receipts.awarded).toBe(4);
    const ledger = await t.store.ledger({ limit: 200 });
    expect(ledger.total).toBe(5); // 4 wins + 1 tile, all the real player's
    expect(ledger.rows.every((row) => row.playerId === realId)).toBe(true);
    const campaign = await t.store.campaign();
    expect(campaign.attempts).toBe(0);

    // --- reports -------------------------------------------------------------
    const reports = await t.store.reports({ limit: 50 });
    expect(reports.rows.map((row) => row.message)).toEqual(['from a real player']);
    // A marked report cannot be triaged: it is simply not found.
    expect(await t.store.triage({ reportId: uuid(91), status: 'resolved', note: '', actorId: uuid(1), now: NOW })).toBeNull();
  });
});

// ------------------------------------------------------------------ the SQL guard

/** A pool that records every statement and answers nothing but a plausible `players` lookup. */
const recordingPool = (): { pool: PgPool; sql: string[] } => {
  const sql: string[] = [];
  const playerRow = { id: uuid(1), kind: 'guest', display_name: 'Player1', created_at: NOW, upgraded_at: null, is_test: false };
  const query = async (text: string): Promise<{ rows: Record<string, unknown>[] }> => {
    sql.push(text);
    if (/^\s*select \* from players\b/.test(text)) return { rows: [playerRow] };
    return { rows: [] };
  };
  return { pool: { query, connect: async () => ({ query, release: () => undefined }) }, sql };
};

const SENSITIVE_TABLE = /\b(players|matches|world_claims|seed_wallets|seed_ledger|seed_reward_receipts|feedback_reports|player_identities)\b/;

describe('the real SQL store filters test data in every read', () => {
  it('no read statement touches a player/match table without an is_test check', async () => {
    const { pool, sql } = recordingPool();
    const store = postgresAdminStore(pool);
    const windows = { guestMaxAgeMs: 1_000, waitingExpireMs: 1_000, turnTimeoutMs: 1_000 };
    const reads: [string, () => Promise<unknown>][] = [
      ['countsSince', () => store.countsSince(NOW - DAY, NOW)],
      ['overview', () => store.overview(NOW)],
      ['reports', () => store.reports({ limit: 5 })],
      ['stuck', () => store.stuck(NOW, windows)],
      ['rulesVersionCounts', () => store.rulesVersionCounts()],
      ['funnel', () => store.funnel(NOW)],
      ['economy', () => store.economy(NOW)],
      ['playerLookup', () => store.playerLookup({ name: 'Player1' })],
      ['matches', () => store.matches({ limit: 5 })],
      ['ledger', () => store.ledger({ limit: 5 })],
      ['world', () => store.world(NOW)],
      ['campaign', () => store.campaign()],
    ];
    for (const [name, run] of reads) {
      sql.length = 0;
      await run();
      expect(sql.length, `${name} issued no SQL`).toBeGreaterThan(0);
      for (const statement of sql) {
        if (!SENSITIVE_TABLE.test(statement)) continue;
        expect(statement, `${name} ran a query without the test filter: ${statement.replace(/\s+/g, ' ').slice(0, 160)}`).toMatch(/is_test/);
      }
    }
  });

  it('matchDetail refuses a marked match by filtering in SQL (not by fetching then hiding)', async () => {
    const { pool, sql } = recordingPool();
    const store = postgresAdminStore(pool);
    sql.length = 0;
    await store.matchDetail(uuid(3), 50);
    // The match lookup itself must carry the filter; the moves read is not player/match data.
    const matchQuery = sql.find((s) => /\bfrom matches m\b/.test(s));
    expect(matchQuery, 'matchDetail did not read the match row').toBeTruthy();
    expect(matchQuery!).toMatch(/is_test/);
    // The move timeline must survive the double-encoded `events` column: every live row is a JSON
    // STRING around an array, and a bare jsonb_array_length() raised "cannot get array length of a
    // scalar", failing the whole screen. The read now handles the array, the string, and neither.
    // (the match read also counts moves in a subquery, so pick the timeline read itself)
    const movesQuery = sql.find((s) => /\bfrom match_moves where match_id = \$1\b/.test(s));
    expect(movesQuery, 'matchDetail did not read the moves').toBeTruthy();
    expect(movesQuery!).toMatch(/jsonb_typeof\(events\)/);
    expect(movesQuery!).toMatch(/#>> '\{\}'/);
  });
});
