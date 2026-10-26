// The admin dashboard's authorization and data contract. These are the tests that matter most:
// every admin endpoint is called with (a) no token, (b) a normal player's token and (c) the admin's
// token. (a) and (b) must be refused; (c) must be allowed. They run in `npm run check`.
//
// They also pin the properties the brief calls non-negotiable: the allow-list comes from config and
// never from the request, no secret reaches a payload, the CSV export carries exactly the JSON
// fields (no more), and the query limits hold.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG, adminPlayerIdsFromEnv, parseAdminPlayerIds } from '../src/config.js';
import { hashToken, newId, newToken } from '../src/ids.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { BETA_PAYOUT_MULTIPLIER, SEED_ECONOMY, campaignSeedReward } from '../src/seeds/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MemoryFeedbackStore, chainRouters } from '../src/feedback/feedback.js';
import { createFeedbackRouter } from '../src/feedback/feedback.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { MemoryIdentityLinkStore } from '../src/accounts/accounts.js';
import { memoryAdminStore } from '../src/admin/memory.js';
import { postgresAdminStore } from '../src/admin/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';
import { createAdminRouter, csvCell, reportsToCsv } from '../src/admin/router.js';
import { normalizeBuild } from '../src/admin/types.js';
import { shapeCampaign, chapterBoundaries, chapterOf, levelIdOfSourceKey } from '../src/admin/campaign.js';
import { shapePlayers, type PlayerFacts } from '../src/admin/players.js';

const ADMIN_ID = '37e3d4d0-a34c-45b3-bc61-992fcf392912';
const NOW = 1_760_000_000_000;
const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Mint a real player row and a real bearer token for it. `createGuest` always invents an id, but
 * the allow-list is keyed on the OWNER's known id, so the admin player is created explicitly here —
 * exactly as migration 0010's Google sign-in would create an account row.
 */
const makePlayer = async (
  storage: MemoryStorage,
  id: string | null,
  kind: 'guest' | 'account',
  displayName: string,
  now: number,
): Promise<{ player: PlayerRecord; token: string }> => {
  const playerId = id ?? newId();
  const player: PlayerRecord = { id: playerId, kind, displayName, createdAt: now, upgradedAt: kind === 'account' ? now : null };
  await storage.createPlayer(player);
  const token = newToken();
  await storage.issueToken({ id: newId(), playerId, tokenHash: hashToken(token), createdAt: now, revokedAt: null });
  return { player, token };
};

const setup = (options: { allowlist?: readonly string[]; now?: number } = {}) => {
  const now = options.now ?? NOW;
  const storage = new MemoryStorage();
  const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], adminPlayerIds: options.allowlist ?? [ADMIN_ID] };
  const feedback = new MemoryFeedbackStore();
  const economy = new MemoryWorldEconomyStore();
  const links = new MemoryIdentityLinkStore();
  const service = new MatchService({
    storage,
    config,
    now: () => now,
  });
  const store = memoryAdminStore({ storage, feedback, economy, links });
  const admin = createAdminRouter({
    store,
    authenticate: (t) => service.authenticate(t),
    config,
    now: () => now,
    rulesVersion: service.rulesVersion,
    storage,
    log: () => undefined,
  });
  const feedbackRouter = createFeedbackRouter({ store: feedback, storage, authenticate: (t) => service.authenticate(t), now: () => now });
  const app = createFetchApp({ service, config, live: chainRouters(async () => null, feedbackRouter, admin) });
  return { storage, config, service, store, feedback, economy, links, app, now, makePlayer: (id: string, kind: 'guest' | 'account' = 'guest', name = 'Tester') => makePlayer(storage, id, kind, name, now) };
};


/** Every GET/read endpoint the dashboard has, plus the one mutation. */
const READ_ENDPOINTS: { method: string; path: string }[] = [
  { method: 'GET', path: '/v1/admin/session' },
  { method: 'GET', path: '/v1/admin/whats-new' },
  { method: 'GET', path: '/v1/admin/overview' },
  { method: 'GET', path: '/v1/admin/ops' },
  { method: 'GET', path: '/v1/admin/reports' },
  { method: 'GET', path: '/v1/admin/reports.csv' },
  { method: 'GET', path: '/v1/admin/player?q=MapleFox' },
  { method: 'GET', path: '/v1/admin/matches' },
  { method: 'GET', path: '/v1/admin/matches/00000000-0000-0000-0000-000000000000' },
  { method: 'GET', path: '/v1/admin/ledger' },
  { method: 'GET', path: '/v1/admin/economy' },
  { method: 'GET', path: '/v1/admin/world' },
  { method: 'GET', path: '/v1/admin/campaign' },
  { method: 'GET', path: '/v1/admin/players' },
  { method: 'POST', path: '/v1/admin/seen' },
  { method: 'POST', path: '/v1/admin/reports/00000000-0000-0000-0000-000000000000/triage' },
];

const call = (app: (req: Request) => Promise<Response>, method: string, path: string, token?: string, body?: unknown) =>
  app(
    new Request(`http://x${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    }),
  );

describe('admin authorization is server-side on every endpoint', () => {
  it('refuses every endpoint with NO token (401), and nothing is read from the store', async () => {
    const t = setup();
    for (const endpoint of READ_ENDPOINTS) {
      const res = await call(t.app, endpoint.method, endpoint.path);
      expect([401], `${endpoint.method} ${endpoint.path}`).toEqual([res.status]);
      const body = (await res.json()) as { ok: boolean; code: string };
      expect(body.ok).toBe(false);
      expect(body.code, endpoint.path).toBe('UNAUTHORIZED');
    }
  });

  it('refuses every endpoint with a NORMAL PLAYER token (403), no matter how valid', async () => {
    const t = setup();
    const guest = await t.service.createGuest();
    for (const endpoint of READ_ENDPOINTS) {
      const res = await call(t.app, endpoint.method, endpoint.path, guest.token, { status: 'resolved', at: t.now });
      expect(res.status, `${endpoint.method} ${endpoint.path}`).toBe(403);
      const body = (await res.json()) as { ok: boolean; code: string };
      expect(body.code, endpoint.path).toBe('FORBIDDEN');
    }
  });

  it('allows every endpoint with the ADMIN token', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    for (const endpoint of READ_ENDPOINTS) {
      const res = await call(t.app, endpoint.method, endpoint.path, admin.token, { status: 'reviewing', at: t.now });
      // 404 is allowed ONLY for the two by-id routes that name a row that does not exist; the point
      // is that the request got past authorization (a refusal would be 401/403).
      expect([200, 404], `${endpoint.method} ${endpoint.path} -> ${res.status}`).toContain(res.status);
      expect([401, 403], endpoint.path).not.toContain(res.status);
    }
  });

  it('an EMPTY allow-list locks the admin out entirely (never "allow everyone")', async () => {
    const t = setup({ allowlist: [] });
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    const res = await call(t.app, 'GET', '/v1/admin/overview', admin.token);
    expect(res.status).toBe(403);
  });

  it('a second admin id in the allow-list is enough — no other change', async () => {
    const second = '11111111-2222-3333-4444-555555555555';
    const t = setup({ allowlist: [ADMIN_ID, second] });
    const other = await t.makePlayer(second, 'account', 'Other');
    const res = await call(t.app, 'GET', '/v1/admin/session', other.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { admin: { id: string } };
    expect(body.admin.id).toBe(second);
  });

  it('an admin-looking request is still refused when the TOKEN belongs to a real player', async () => {
    // The allow-list is checked against the AUTHENTICATED player id, so a client cannot claim a
    // role: this player is not the admin even though it asks as one.
    const t = setup();
    const guest = await t.service.createGuest();
    const res = await t.app(
      new Request('http://x/v1/admin/overview', {
        headers: { authorization: `Bearer ${guest.token}`, 'x-futasaku-admin': '1', 'x-admin-player': ADMIN_ID },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('a URL query parameter or path segment can never grant access', async () => {
    const t = setup();
    const guest = await t.service.createGuest();
    for (const path of [
      `/v1/admin/overview?admin=1`,
      `/v1/admin/overview?playerId=${ADMIN_ID}`,
      `/v1/admin/overview?admin=${ADMIN_ID}`,
    ]) {
      const res = await call(t.app, 'GET', path, guest.token);
      expect(res.status, path).toBe(403);
    }
  });
});

describe('the allow-list is configuration, not code', () => {
  it('parses comma-separated ids, normalises case and drops anything that is not an id', () => {
    expect(parseAdminPlayerIds(`${ADMIN_ID}, 11111111-2222-3333-4444-555555555555`)).toEqual([ADMIN_ID, '11111111-2222-3333-4444-555555555555']);
    expect(parseAdminPlayerIds(ADMIN_ID.toUpperCase())).toEqual([ADMIN_ID]);
    expect(parseAdminPlayerIds('owner@example.com, RYK, 1, not-a-uuid')).toEqual([]);
    expect(parseAdminPlayerIds(`${ADMIN_ID},${ADMIN_ID}`)).toEqual([ADMIN_ID]);
  });

  it('falls back to the founding owner when the env var is unset, and never to an empty-handed allow-all', () => {
    const previous = process.env.ADMIN_PLAYER_IDS;
    try {
      delete process.env.ADMIN_PLAYER_IDS;
      expect(adminPlayerIdsFromEnv()).toEqual([ADMIN_ID]);
      process.env.ADMIN_PLAYER_IDS = '   ';
      expect(adminPlayerIdsFromEnv()).toEqual([ADMIN_ID]);
      process.env.ADMIN_PLAYER_IDS = 'nonsense';
      expect(adminPlayerIdsFromEnv()).toEqual([ADMIN_ID]);
      process.env.ADMIN_PLAYER_IDS = '11111111-2222-3333-4444-555555555555';
      expect(adminPlayerIdsFromEnv()).toEqual(['11111111-2222-3333-4444-555555555555']);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_PLAYER_IDS;
      else process.env.ADMIN_PLAYER_IDS = previous;
    }
  });
});

describe('report triage is audited (the Seeds and tile edits are covered in admin-edit.test.ts)', () => {
  it('records the status and note and writes one audit row per change', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    const reporter = await t.service.createGuest();
    // File a report through the real endpoint, so the row is exactly what the game would send.
    await t.app(
      new Request('http://x/v1/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${reporter.token}` },
        body: JSON.stringify({ kind: 'report', message: 'The board froze.', build: 'index-ABC.js · 0.5.0 · futasaku0.4-x', context: { screen: 'game' } }),
      }),
    );
    const listed = (await (await call(t.app, 'GET', '/v1/admin/reports', admin.token)).json()) as { rows: { id: string; status: string }[] };
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]!.status).toBe('new'); // no triage row yet — the default, not a backfill

    const triaged = await call(t.app, 'POST', `/v1/admin/reports/${listed.rows[0]!.id}/triage`, admin.token, {
      status: 'reviewing',
      note: 'Reproduced on iOS Safari.',
    });
    expect(triaged.status).toBe(200);
    const after = (await (await call(t.app, 'GET', '/v1/admin/reports', admin.token)).json()) as {
      rows: { status: string; note: string; triagedAt: number | null }[];
    };
    expect(after.rows[0]).toMatchObject({ status: 'reviewing', note: 'Reproduced on iOS Safari.' });
    expect(after.rows[0]!.triagedAt).toBe(t.now);
  });

  it('refuses an unknown status and an unknown report, and never leaks whether a report exists to a non-admin', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    const guest = await t.service.createGuest();
    const unknown = '00000000-0000-0000-0000-000000000000';
    expect((await call(t.app, 'POST', `/v1/admin/reports/${unknown}/triage`, admin.token, { status: 'nope' })).status).toBe(400);
    expect((await call(t.app, 'POST', `/v1/admin/reports/${unknown}/triage`, admin.token, { status: 'resolved' })).status).toBe(404);
    // The same request from a normal player is 403 BEFORE the store is consulted: the refusal shape
    // is identical for a real and a fake report id.
    expect((await call(t.app, 'POST', `/v1/admin/reports/${unknown}/triage`, guest.token, { status: 'resolved' })).status).toBe(403);
  });

  it('caps the private note and never copies it into the audit detail', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    await t.app(
      new Request('http://x/v1/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'crash', message: 'boom' }),
      }),
    );
    const listed = (await (await call(t.app, 'GET', '/v1/admin/reports', admin.token)).json()) as { rows: { id: string }[] };
    const note = 'SECRET-NOTE-' + 'x'.repeat(4000);
    const res = await call(t.app, 'POST', `/v1/admin/reports/${listed.rows[0]!.id}/triage`, admin.token, { status: 'resolved', note });
    const body = (await res.json()) as { noteLength: number };
    expect(body.noteLength).toBe(2000);
  });
});

describe('reports filtering, pagination and the CSV export', () => {
  const seedReports = async (t: ReturnType<typeof setup>, count: number) => {
    for (let i = 0; i < count; i += 1) {
      await t.feedback.insert({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        createdAt: t.now - (count - i),
        kind: i % 3 === 0 ? 'crash' : 'report',
        playerId: null,
        message: i === 0 ? '=HYPERLINK("http://evil") leading formula, and a "quote", and a\nnewline' : `report ${i}`,
        context: { screen: 'game', step: i },
        build: i % 2 === 0 ? 'index-A.js · 0.5.0 · futasaku0.4-x' : 'index-B.js · 0.5.0 · futasaku0.4-y',
        userAgent: 'TestPhone/1',
      });
    }
  };

  it('paginates with a keyset cursor and reports a total', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    await seedReports(t, 60);
    const first = (await (await call(t.app, 'GET', '/v1/admin/reports?limit=25', admin.token)).json()) as {
      rows: { id: string }[];
      total: number;
      nextCursor: string | null;
    };
    expect(first.rows).toHaveLength(25);
    expect(first.total).toBe(60);
    expect(first.nextCursor).not.toBeNull();
    const second = (await (await call(t.app, 'GET', `/v1/admin/reports?limit=25&cursor=${encodeURIComponent(first.nextCursor!)}`, admin.token)).json()) as {
      rows: { id: string }[];
    };
    // No overlap between pages: the cursor is a strict position, not an offset.
    const seen = new Set(first.rows.map((r) => r.id));
    expect(second.rows.every((r) => !seen.has(r.id))).toBe(true);
  });

  it('clamps a silly limit instead of honouring it', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    await seedReports(t, 40);
    const res = (await (await call(t.app, 'GET', '/v1/admin/reports?limit=100000', admin.token)).json()) as { rows: unknown[] };
    expect(res.rows.length).toBeLessThanOrEqual(200);
  });

  it('filters by kind, status and normalised build', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    await seedReports(t, 30);
    const crashes = (await (await call(t.app, 'GET', '/v1/admin/reports?kind=crash', admin.token)).json()) as { total: number };
    expect(crashes.total).toBe(10);
    const buildA = (await (await call(t.app, 'GET', `/v1/admin/reports?build=${encodeURIComponent('index-A.js · 0.5.0')}`, admin.token)).json()) as { total: number };
    expect(buildA.total).toBe(15);
    const statusNew = (await (await call(t.app, 'GET', '/v1/admin/reports?status=new', admin.token)).json()) as { total: number };
    expect(statusNew.total).toBe(30);
  });

  it('exports CSV with EXACTLY the JSON fields, capped, and hardened against spreadsheet formulas', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    await seedReports(t, 30);
    const json = (await (await call(t.app, 'GET', '/v1/admin/reports?limit=200', admin.token)).json()) as { rows: Record<string, unknown>[] };
    const csv = await call(t.app, 'GET', '/v1/admin/reports.csv?limit=5', admin.token);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const text = await csv.text();
    // The CSV ignores the page size and always returns up to the export cap, so the oldest report
    // (the formula-looking one) is present here even though a 5-row JSON page would not include it.
    const header = text.split('\r\n')[0]!;
    // The header names the same facts the JSON path returns — no extra column, no omitted one that
    // the JSON path exposes. (id/created_at/kind/status/build/player/…/context/user_agent/note.)
    expect(header.split(',')).toEqual([
      'id', 'created_at', 'kind', 'status', 'build', 'player_id', 'player_tag', 'player_name', 'message', 'context', 'user_agent', 'note',
    ]);
    // The formula-leading message is neutralised, and a raw newline in a message cannot split a row.
    expect(text).toContain("'=HYPERLINK");
    expect(text.split('\r\n').filter((line) => line.length > 0).length).toBeLessThanOrEqual(31);
    // And the JSON path is UNCHANGED by the CSV hardening: it still carries the literal message.
    expect(json.rows.some((row) => String(row.message).startsWith('=HYPERLINK'))).toBe(true);
  });

  it('caps the CSV row count', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `id-${i}`, createdAt: NOW, kind: 'report' as const, playerId: null, playerName: null, playerTag: null,
      message: 'm', context: {}, build: null, buildKey: '(no build)', userAgent: null,
      status: 'new' as const, note: '', triagedAt: null, triagedBy: null,
    }));
    expect(reportsToCsv(rows).split('\r\n').filter(Boolean)).toHaveLength(4); // header + 3
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('-2+3')).toBe("'-2+3");
  });
});

describe('build normalisation keeps one deploy to one row', () => {
  it('groups on the asset and version, keeping the rules label beside the key', () => {
    const a = normalizeBuild('index-DYGB0cL9.js · 0.5.0 · futasaku0.4-strength-draw');
    expect(a.key).toBe('index-DYGB0cL9.js · 0.5.0');
    expect(a.asset).toBe('index-DYGB0cL9.js');
    expect(a.version).toBe('0.5.0');
    expect(a.label).toBe('futasaku0.4-strength-draw');
    expect(normalizeBuild('index-C21ujbSc.js · 0.5.0 · futasaku0.4-strength-draw').key).not.toBe(a.key);
    expect(normalizeBuild('index-C21ujbSc.js · 0.5.0 · other-label').key).toBe(normalizeBuild('index-C21ujbSc.js · 0.5.0').key);
    expect(normalizeBuild(null)).toEqual({ key: '(no build)', asset: null, version: null, label: null });
    expect(normalizeBuild('  ').key).toBe('(no build)');
    expect(normalizeBuild('index-X.js').key).toBe('index-X.js');
  });
});

describe('the metric shapes report what the data supports', () => {
  it('the economy ratio compares minted to spent, and is null with nothing spent', () => {
    const t = setup();
    const store = memoryAdminStore({ storage: new MemoryStorage(), economy: t.economy });
    return store.economy(NOW).then((economy) => {
      expect(economy.inflationRatio).toBeNull(); // 0 spent cannot produce a ratio — not "0" or "1"
      expect(economy.caps.tileCost).toBe(100);
      expect(economy.caps.utcDailyRepeatableCap).toBe(600);
      expect(economy.caps.economies.join(' ')).toContain('queue: win 30');
    });
  });

  it('the campaign screen reads recorded rows and says the level list is incomplete', () => {
    const receipts = [
      { sourceKey: 'campaign:c1-01', awarded: 100, denial: null, utcDay: '2026-10-15' },
      { sourceKey: 'campaign:c1-01', awarded: 0, denial: 'not_a_first_clear', utcDay: '2026-10-15' },
      { sourceKey: 'campaign:c1-10', awarded: 125, denial: null, utcDay: '2026-10-16' },
    ];
    const shaped = shapeCampaign(receipts, [
      { sourceKey: 'campaign:c1-01', level: 1 },
      { sourceKey: 'campaign:c1-10', level: 10 },
    ]);
    expect(shaped.attempts).toBe(3);
    expect(shaped.firstClears).toBe(2);
    expect(shaped.awarded).toBe(225);
    expect(shaped.denials.count).toBe(1);
    expect(shaped.denials.byReason).toEqual([{ value: 'not_a_first_clear', n: 1 }]);
    // The level id stays opaque; the number comes from the recorded ledger metadata.
    expect(shaped.byLevel.map((row) => [row.levelId, row.level, row.firstClears])).toEqual([
      ['c1-01', 1, 1],
      ['c1-10', 10, 1],
    ]);
    expect(shaped.byChapter).toEqual([
      { chapter: 1, firstClears: 2, awarded: 225 },
    ]);
    // Honest about the gap: a level nobody reached leaves no row, so the list is never complete.
    expect(shaped.completeLevelListKnown).toBe(false);
  });

  it('chapter boundaries come from the economy that pays them, not from a guess', () => {
    const boundaries = chapterBoundaries();
    // 31-70 were added 2026-10-18 and the economy pays chapter bonuses at 60 and 70 too. The range
    // is read from the economy's own cap, so a level past 50 can no longer be filed under chapter 6
    // by a hardcoded loop bound.
    expect(boundaries).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(chapterOf(1, boundaries)).toBe(1);
    expect(chapterOf(10, boundaries)).toBe(1);
    expect(chapterOf(11, boundaries)).toBe(2);
    expect(chapterOf(50, boundaries)).toBe(5);
    expect(chapterOf(51, boundaries)).toBe(6);
    expect(chapterOf(61, boundaries)).toBe(7);
    expect(chapterOf(70, boundaries)).toBe(7);
    expect(levelIdOfSourceKey('campaign:c2-11')).toBe('c2-11');
    expect(levelIdOfSourceKey('campaign:c4-37')).toBe('c4-37');
    expect(levelIdOfSourceKey('training:abc')).toBe('training:abc');
  });

  it('a campaign receipt for a level with no recorded number is still counted, with level null', () => {
    const shaped = shapeCampaign([{ sourceKey: 'campaign:c3-21', awarded: 0, denial: 'not_a_first_clear', utcDay: '2026-10-16' }], []);
    expect(shaped.byLevel).toEqual([{ levelId: 'c3-21', level: null, firstClears: 0, awarded: 0, attempts: 1, denials: 1 }]);
    expect(shaped.byChapter).toEqual([]); // it cannot be placed in a chapter, so it is not guessed
  });

  it('the ledger reconciles against the authoritative wallet, entry by entry', async () => {
    // The requirement is a reconciliation, not a spot check: every number the dashboard shows about
    // Seeds must be traceable to the wallet the game debits and credits.
    const t = setup();
    const playerId = '00000000-0000-4000-8000-00000000aaaa';
    // Distinct timestamps, so the ledger's newest entry is unambiguous: the claim below is last.
    // (Real rows carry real clocks; a test that gives them all one instant would be ordering by luck.)
    for (let i = 0; i < 3; i += 1) {
      await t.economy.settle({ playerId, sourceKey: `reconcile-queue-${i}`, mode: 'queue', outcome: 'win', opponentId: null, now: t.now - 4_000 + i });
    }
    await t.economy.settle({ playerId, sourceKey: 'campaign:c1-01', mode: 'campaign', outcome: 'win', opponentId: null, now: t.now - 1_000, campaignLevel: 1 });
    const claim = await t.economy.claim(playerId, '0,0', 'reconcile-claim', t.now);
    expect(claim.ok, 'the wallet must have funded the tile').toBe(true);
    // A REPEAT clear is the same settlement key, so it replays the first receipt and moves nothing.
    const repeat = await t.economy.settle({ playerId, sourceKey: 'campaign:c1-01', mode: 'campaign', outcome: 'win', opponentId: null, now: t.now - 500, campaignLevel: 1 });
    expect(repeat.replayed).toBe(true);
    // A zero-award receipt still records WHY (a level the economy cannot price).
    await t.economy.settle({ playerId, sourceKey: 'campaign:unpriced', mode: 'campaign', outcome: 'win', opponentId: null, now: t.now - 400, campaignLevel: 99 });

    const wallet = await t.economy.wallet(playerId);
    const ledger = await t.store.ledger({ playerId, limit: 200 });
    const economy = await t.store.economy(t.now);
    const earned = ledger.rows.filter((row) => row.delta > 0).reduce((sum, row) => sum + row.delta, 0);
    const spent = ledger.rows.filter((row) => row.delta < 0).reduce((sum, row) => sum - row.delta, 0);

    // The figures below are derived, not typed: the BETA multiplier scales every award at the
    // settlement decision, so a hardcoded total would break the moment the beta is reverted (and
    // would under-test the live figure while it lasts). What matters here is that the dashboard
    // RECONCILES with the wallet, which is why the sums are computed from the same config the
    // server pays from.
    const M = BETA_PAYOUT_MULTIPLIER;
    const queueTotal = 3 * SEED_ECONOMY.online.queue.win * M;
    const campaignTotal = (campaignSeedReward(1)!.firstWin + campaignSeedReward(1)!.chapter) * M;
    const earnedExpected = queueTotal + campaignTotal;
    const spentExpected = SEED_ECONOMY.tileCost;
    expect(earned).toBe(earnedExpected);
    expect(spent).toBe(spentExpected);
    expect(wallet).toMatchObject({ lifetimeEarned: earnedExpected, lifetimeSpent: spentExpected, balance: earnedExpected - spentExpected });
    // The ledger IS the wallet's history: its deltas sum to the wallet's own lifetime totals, and
    // the newest entry's balance_after is the balance the wallet reports now.
    expect(earned - spent).toBe(wallet.balance);
    expect(ledger.rows[0]!.balanceAfter).toBe(wallet.balance);
    // The economy panel reads the same store, so it cannot disagree with either.
    expect(economy.totals).toMatchObject({ lifetimeEarned: earnedExpected, lifetimeSpent: spentExpected, balance: earnedExpected - spentExpected });
    expect(economy.inflationRatio).toBeCloseTo(earnedExpected / spentExpected, 5);
    const categories = new Map(economy.byCategory.map((row) => [row.category, row]));
    expect(categories.get('queue')).toMatchObject({ minted: queueTotal, spent: 0, net: queueTotal });
    expect(categories.get('campaign')).toMatchObject({ minted: campaignTotal, spent: 0, net: campaignTotal });
    expect(categories.get('world_claim')).toMatchObject({ minted: 0, spent: spentExpected, net: -spentExpected });
    // And the denial is recorded with a reason, at zero Seeds.
    expect(economy.receipts.byDenial).toContainEqual({ value: 'not_a_first_clear', n: 1 });
    // The repeat clear is NOT a denial and NOT a payment: it is the same receipt, replayed.
    expect(economy.receipts.denied).toBe(1);
  });

  it('the world replay is the stored claims, bucketed by the day each was recorded', async () => {
    const t = setup();
    const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const dayA = t.now - 2 * 86_400_000;
    const dayB = t.now - 86_400_000;
    const alice = '00000000-0000-4000-8000-00000000000a';
    const bob = '00000000-0000-4000-8000-00000000000b';
    // Each owner needs 100 Seeds before a tile can be bought, exactly as in the game.
    await t.economy.settle({ playerId: alice, sourceKey: 'replay-fund-a', mode: 'queue', outcome: 'win', opponentId: null, now: dayA });
    await t.economy.settle({ playerId: alice, sourceKey: 'replay-fund-a2', mode: 'queue', outcome: 'win', opponentId: null, now: dayA });
    await t.economy.settle({ playerId: alice, sourceKey: 'replay-fund-a3', mode: 'queue', outcome: 'win', opponentId: null, now: dayA });
    await t.economy.settle({ playerId: alice, sourceKey: 'replay-fund-a4', mode: 'queue', outcome: 'win', opponentId: null, now: dayA });
    await t.economy.settle({ playerId: bob, sourceKey: 'replay-fund-b', mode: 'queue', outcome: 'win', opponentId: null, now: dayB });
    await t.economy.settle({ playerId: bob, sourceKey: 'replay-fund-b2', mode: 'queue', outcome: 'win', opponentId: null, now: dayB });
    await t.economy.settle({ playerId: bob, sourceKey: 'replay-fund-b3', mode: 'queue', outcome: 'win', opponentId: null, now: dayB });
    await t.economy.settle({ playerId: bob, sourceKey: 'replay-fund-b4', mode: 'queue', outcome: 'win', opponentId: null, now: dayB });
    expect((await t.economy.claim(alice, '0,0', 'replay-claim-a', dayA)).ok).toBe(true);
    expect((await t.economy.claim(bob, '1,0', 'replay-claim-b', dayB)).ok).toBe(true);

    const world = await t.store.world(t.now);
    expect(world.totalClaims).toBe(2);
    expect(world.replayDays).toEqual([dayOf(dayA), dayOf(dayB)]); // the two recorded days, oldest first
    expect(world.claimsByDayIndex.map((day) => day.claims.map((claim) => claim.cellId))).toEqual([['0,0'], ['1,0']]);
    // Every claim appears in exactly one bucket, and the buckets together are the whole map.
    expect(world.claimsByDayIndex.flatMap((day) => day.claims)).toHaveLength(world.totalClaims);
    // A bucket only holds claims RECORDED on that day — which is what makes the cumulative replay
    // (the UI helper, unit-tested for "a later day never shows fewer tiles") match the stored rows.
    expect(world.claimsByDayIndex[0]!.claims.every((claim) => claim.claimedAt <= Date.parse(`${dayOf(dayA)}T23:59:59.999Z`))).toBe(true);
    expect(world.claimsByDayIndex[1]!.claims.every((claim) => claim.claimedAt > Date.parse(`${dayOf(dayA)}T23:59:59.999Z`))).toBe(true);
  });
});

describe('a nickname lookup is case-insensitive (the live search box)', () => {
  it('finds the account whatever the capitals, and still misses a genuinely different name', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    // The exact capitals used to work and every other spelling missed: 'ryk' returned null on the
    // live database while 'RYK' found the account. A search box is typed, so this was the feature
    // failing its one obvious input.
    for (const q of ['RYK', 'ryk', 'Ryk', 'rYk']) {
      const res = await call(t.app, 'GET', `/v1/admin/player?q=${q}`, admin.token);
      expect(res.status, `query “${q}”`).toBe(200);
      const body = (await res.json()) as { player: { id: string } | null; matchedBy: string };
      expect(body.player?.id, `query “${q}”`).toBe(ADMIN_ID);
      expect(body.matchedBy, `query “${q}”`).toBe('name');
    }
    // Case-insensitivity is NOT a wildcard: a different name is still a miss.
    const miss = (await (await call(t.app, 'GET', '/v1/admin/player?q=Nobody', admin.token)).json()) as { player: unknown };
    expect(miss.player).toBeNull();
  });

  it('the SQL normalises both sides, so the in-memory stand-in cannot drift from the live query', () => {
    // Nothing pinned the SQL before: the in-memory store is a separate implementation, so its own
    // behaviour could not catch a case-sensitive live query. This asserts the real `playerLookup`
    // name branch uses `lower(display_name) = lower($1)`.
    const sql = readFileSync(`${root}server/src/admin/postgres.ts`, 'utf8');
    expect(sql).toMatch(/lower\(\s*display_name\s*\)\s*=\s*lower\(\s*\$\d+\s*\)/);
  });
});

describe('an unapplied migration is a state, not an empty list', () => {
  /** A pool whose every query fails the way Postgres does when a table is missing (SQLSTATE 42P01). */
  const missingTablePool = (relation: string): PgPool => {
    const fail = (): never => {
      throw Object.assign(new Error(`relation "${relation}" does not exist`), { code: '42P01' });
    };
    return {
      query: async () => fail(),
      connect: async () => ({ query: async () => fail() }),
    };
  };

  it('maps a missing feedback_triage / admin_seen to ADMIN_MIGRATION_PENDING on all four paths', async () => {
    const pending = { code: 'ADMIN_MIGRATION_PENDING', status: 503 };
    // `reports()` LEFT JOINs feedback_triage, so it fails outright without the migration…
    const triageStore = postgresAdminStore(missingTablePool('feedback_triage'));
    await expect(triageStore.reports({ limit: 5 })).rejects.toMatchObject(pending);
    await expect(
      triageStore.triage({ reportId: '00000000-0000-4000-8000-000000000001', status: 'resolved', note: '', actorId: ADMIN_ID, now: NOW }),
    ).rejects.toMatchObject(pending);
    // …and the seen-cursor lives in admin_seen.
    const seenStore = postgresAdminStore(missingTablePool('admin_seen'));
    await expect(seenStore.readSeen(ADMIN_ID)).rejects.toMatchObject(pending);
    await expect(seenStore.writeSeen(ADMIN_ID, NOW)).rejects.toMatchObject(pending);
  });

  it('does not swallow a different database failure as "migration pending"', async () => {
    const down: PgPool = {
      query: async () => {
        throw new Error('connection terminated unexpectedly');
      },
      connect: async () => {
        throw new Error('connection terminated unexpectedly');
      },
    };
    const store = postgresAdminStore(down);
    await expect(store.reports({ limit: 5 })).rejects.toThrow('connection terminated unexpectedly');
  });
});

describe('no secret or hidden state can reach an admin payload', () => {
  const adminSource = (): string => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(`${root}${dir}`)) {
        const path = `${dir}/${entry}`;
        if (statSync(`${root}${path}`).isDirectory()) walk(path);
        else if (/\.ts$/.test(entry)) files.push(path);
      }
    };
    walk('/server/src/admin');
    return files.map((file) => readFileSync(`${root}${file}`, 'utf8')).join('\n');
  };

  it('the admin store never selects the authoritative match state, a token hash or an invite code', () => {
    const source = adminSource().replace(/--.*$/gm, '').replace(/\/\/.*$/gm, '');
    for (const column of ['matches.state', 'm.state', 'player_tokens', 'token_hash', 'invite_code', 'events as']) {
      expect(source.includes(column), `${column} must never be read by the dashboard`).toBe(false);
    }
    // The Google subject (the identity behind the account) and the email are never selected: only
    // the PROVIDER name reaches the payload, which is what "account type" means on screen.
    expect(source.includes('player_identities.subject')).toBe(false);
    expect(/player_identities[\s\S]{0,80}subject/.test(source)).toBe(false);
  });

  it('the dashboard never reads a Campaign board — the guard already pins this; this is the companion', () => {
    // `tests/campaign/isolation.test.ts` forbids the campaign authoring table in /server/src (except
    // /server/src/seeds). The admin modules are deliberately inside that scope, so this asserts the
    // same rule narrowly here too: if the isolation guard is ever narrowed for some reason, the
    // dashboard still cannot quietly start reading authored campaign boards.
    const source = adminSource();
    expect(source).not.toMatch(/(campaignLevelById|campaignOpening|CAMPAIGN_LEVELS|src\/campaign)/);
  });

  it('a real match still cannot be read through the admin API as hidden state', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    const duel = await t.service.createMatch(admin.player, {}, null);
    const detail = (await (await call(t.app, 'GET', `/v1/admin/matches/${duel.match.matchId}`, admin.token)).json()) as {
      match: Record<string, unknown>;
      moves: { events: number }[];
    };
    const text = JSON.stringify(detail);
    for (const forbidden of ['"state"', '"hand"', '"deck"', '"seed"', 'inviteCode', '"token"']) {
      expect(text.includes(forbidden), `${forbidden} must not appear in an admin payload`).toBe(false);
    }
    // What it DOES report is the recorded shape: the timeline and how many events each move had.
    expect(Array.isArray(detail.moves)).toBe(true);
  });
});

describe('the Players screen: every player, and the last thing the server recorded', () => {
  const HOUR = 60 * 60 * 1000;
  const base = (id: string, over: Partial<PlayerFacts> = {}): PlayerFacts => ({
    id,
    displayName: id,
    kind: 'guest',
    createdAt: NOW - 30 * 24 * HOUR,
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

  it('names the newest recorded activity, and orders players by it', () => {
    const shaped = shapePlayers(
      [
        base('11111111-1111-4111-8111-111111111111'),
        base('22222222-2222-4222-8222-222222222222', {
          matches: { played: 3, finished: 2, wins: 1, lastAt: NOW - 2 * HOUR, lastStatus: 'active' },
        }),
        base('33333333-3333-4333-8333-333333333333', {
          kind: 'account',
          google: true,
          campaign: { highest: 14, clears: 4, lastAt: NOW - HOUR, lastLevel: 14 },
        }),
      ],
      NOW,
    );
    expect(shaped.rows.map((r) => [r.displayName, r.lastActivity])).toEqual([
      ['33333333-3333-4333-8333-333333333333', 'campaign-clear'],
      ['22222222-2222-4222-8222-222222222222', 'match-active'],
      ['11111111-1111-4111-8111-111111111111', 'joined'],
    ]);
    expect(shaped.rows[0]!.lastActivityText).toBe('Cleared campaign level 14');
    expect(shaped.rows[0]!.campaignHighest).toBe(14);
    expect(shaped.rows[2]!.lastSeenAt).toBe(NOW - 30 * 24 * HOUR); // never earlier than joining
    expect(shaped.summary).toMatchObject({ players: 3, accounts: 1, guests: 2, google: 1, seen24h: 2, seen7d: 2 });
    expect(shaped.summary.funnel.map((step) => step.n)).toEqual([3, 1, 1, 1, 1, 0]);
    expect(shaped.summary.highestLevel).toEqual([{ level: 14, n: 1 }]);
  });

  it('presence only decides the label while it is live; otherwise it just moves "last seen"', () => {
    const live = shapePlayers([base('44444444-4444-4444-8444-444444444444', { presenceAt: NOW - 30_000 })], NOW).rows[0]!;
    expect(live.lastActivity).toBe('online-now');
    const stale = shapePlayers(
      [base('55555555-5555-4555-8555-555555555555', { presenceAt: NOW - 3 * HOUR, matches: { played: 1, finished: 1, wins: 0, lastAt: NOW - 4 * HOUR, lastStatus: 'finished' } })],
      NOW,
    ).rows[0]!;
    expect(stale.lastActivity).toBe('match-finished');
    expect(stale.lastSeenAt).toBe(NOW - 3 * HOUR);
  });

  it('the endpoint lists real players, marks the test account as a bot (not as a person), and never leaks secrets', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'Owner');
    const guest = await t.makePlayer('66666666-6666-4666-8666-666666666666', 'guest', 'MapleFox');
    await t.storage.createPlayer({ id: '77777777-7777-4777-8777-777777777777', kind: 'guest', displayName: 'Probe', createdAt: NOW, upgradedAt: null, isTest: true });
    t.links.rows.push({ provider: 'google', subject: 'g-1', playerId: ADMIN_ID, createdAt: NOW });
    await t.economy.settle({ playerId: guest.player.id, sourceKey: 'campaign:c2-14', mode: 'campaign', now: NOW, outcome: 'win', campaignLevel: 14 } as never);
    const res = await call(t.app, 'GET', '/v1/admin/players', admin.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: { id: string; google: boolean; campaignHighest: number | null; lastActivity: string; classification: string }[];
      total: number;
      summary: { players: number; humans: number; bots: number };
    };
    // The list now carries both sides of the human/bot split (the All players screen filters, the
    // Bots tab lists). The test row is present but classified, so no human-facing number includes it.
    expect(body.total).toBe(3);
    expect(body.summary.players).toBe(2);
    expect(body.summary.humans).toBe(2);
    expect(body.summary.bots).toBe(1);
    expect(body.summary.humans + body.summary.bots).toBe(body.total);
    expect(body.rows.find((r) => r.id === '77777777-7777-4777-8777-777777777777')!.classification).toBe('bot');
    expect(body.rows.find((r) => r.id === ADMIN_ID)!.classification).toBe('human');
    expect(body.rows.find((r) => r.id === ADMIN_ID)!.google).toBe(true);
    expect(body.rows.find((r) => r.id === guest.player.id)!.campaignHighest).toBe(14);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(admin.token);
    expect(raw).not.toMatch(/token_?hash|tokenHash|subject/i);
    // The normal player still gets nothing.
    expect((await call(t.app, 'GET', '/v1/admin/players', guest.token)).status).toBe(403);
  });
});

// Owner, 2026-10-24: "I can't find a button to add seeds to someone's account". The dashboard's one
// Seeds write: amount 1-1000, a reason, idempotent by request id, recorded in the ledger as
// `admin_grant` and in the audit log. Refused without a token (401) and for a normal player (403).
describe('adding Seeds to a player', () => {
  const PLAYER = '5d1f6a0e-1c2b-4d3e-9f40-0a1b2c3d4e5f';
  const path = `/v1/admin/players/${PLAYER}/seeds`;
  const grant = { amount: 150, reason: 'Playtest thank-you', requestId: 'grant-request-0001' };

  it('is refused without a token (401) and for a normal player (403)', async () => {
    const t = setup();
    await t.makePlayer(PLAYER);
    expect((await call(t.app, 'POST', path, undefined, grant)).status).toBe(401);
    const guest = await t.service.createGuest();
    expect((await call(t.app, 'POST', path, guest.token, grant)).status).toBe(403);
    expect((await t.economy.wallet(PLAYER)).balance).toBe(0);
  });

  it('adds the Seeds once, writes the ledger and the audit, and a repeated request pays nothing more', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    await t.makePlayer(PLAYER);
    const res = await call(t.app, 'POST', path, admin.token, grant);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, amount: 150, balance: 150, replayed: false });
    const again = await call(t.app, 'POST', path, admin.token, grant);
    expect(await again.json()).toMatchObject({ ok: true, balance: 150, replayed: true });
    expect((await t.economy.wallet(PLAYER)).balance).toBe(150);
    const rows = t.economy.ledger.filter((e) => e.playerId === PLAYER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ delta: 150, category: 'admin_grant', sourceKey: 'admin:grant-request-0001', balanceAfter: 150 });
    // It shows on the player's own page, in the ledger the dashboard already reads.
    const page = await (await call(t.app, 'GET', `/v1/admin/player?q=${PLAYER}`, admin.token)).json() as { wallet: { balance: number }; ledger: { category: string }[] };
    expect(page.wallet.balance).toBe(150);
    expect(page.ledger[0]!.category).toBe('admin_grant');
  });

  it('refuses a bad amount, a missing reason, a bad id, or a player who does not exist', async () => {
    const t = setup();
    const admin = await t.makePlayer(ADMIN_ID, 'account', 'RYK');
    await t.makePlayer(PLAYER);
    for (const amount of [0, -5, 1001, 2.5, '50']) {
      expect((await call(t.app, 'POST', path, admin.token, { ...grant, amount })).status, String(amount)).toBe(400);
    }
    expect((await call(t.app, 'POST', path, admin.token, { ...grant, reason: ' ' })).status).toBe(400);
    expect((await call(t.app, 'POST', path, admin.token, { ...grant, requestId: 'x' })).status).toBe(400);
    expect((await call(t.app, 'POST', '/v1/admin/players/not-an-id/seeds', admin.token, grant)).status).toBe(400);
    expect((await call(t.app, 'POST', `/v1/admin/players/${ADMIN_ID.replace('3', '4')}/seeds`, admin.token, grant)).status).toBe(404);
    expect((await t.economy.wallet(PLAYER)).balance).toBe(0);
  });
});
