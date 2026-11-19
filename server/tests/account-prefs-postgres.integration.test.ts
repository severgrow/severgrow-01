// Settings, lesson progress and tips on REAL Postgres (migration 0030): merged, never overwritten,
// and two devices posting at the same moment both keep their part.
// REQUIRE_DATABASE=1 DATABASE_URL=postgres://postgres@127.0.0.1:55432/futalive PGSSL=disable
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import type { PgPool } from '../src/storage/postgres.js';
import { postgresStorage } from '../src/storage/postgres.js';
import { EMPTY_PREFS } from '../src/account-prefs.js';

const url = process.env.DATABASE_URL;
const enabled = process.env.REQUIRE_DATABASE === '1' && !!url;

describe.skipIf(!enabled)('account preferences on real Postgres', () => {
  let pool: PgPool;
  beforeAll(() => { pool = poolFromUrl(url!); });
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> }).end?.(); });

  it('two devices at once: both choices and both tips are kept', async () => {
    const storage = postgresStorage(pool);
    const id = randomUUID();
    await pool.query(`insert into players (id, kind, created_at, is_test) values ($1, 'account', 1, true)`, [id]);
    expect(await storage.accountPrefsOf(id)).toBeNull();
    await Promise.all([
      storage.mergeAccountPrefs(id, { ...EMPTY_PREFS, fields: { sound: { v: true, at: 10 } }, tips: ['fruit'] }, 100),
      storage.mergeAccountPrefs(id, { ...EMPTY_PREFS, fields: { handSide: { v: 'left', at: 20 } }, tips: ['draw'] }, 100),
    ]);
    expect(await storage.accountPrefsOf(id)).toEqual({
      fields: { handSide: { v: 'left', at: 20 }, sound: { v: true, at: 10 } }, tips: ['draw', 'fruit'], lessons: null,
    });
    // an older device later: nothing goes back
    await storage.mergeAccountPrefs(id, { ...EMPTY_PREFS, fields: { sound: { v: false, at: 5 } } }, 200);
    expect((await storage.accountPrefsOf(id))!.fields.sound).toEqual({ v: true, at: 10 });
  });
});
