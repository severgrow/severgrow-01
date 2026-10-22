// The mutual rematch on REAL Postgres (migration 0015). The memory store proves the rules; this
// proves the unique `matches.rematch_of` index really turns two simultaneous presses into one match.
// Opt-in like the other integration suites: REQUIRE_DATABASE=1 and DATABASE_URL.
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';

const url = process.env.DATABASE_URL;
const enabled = process.env.REQUIRE_DATABASE === '1' && !!url;

describe.skipIf(!enabled)('mutual rematch on real Postgres', () => {
  const pool: PgPool | null = enabled ? poolFromUrl(url!) : null;
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> } | null)?.end?.(); });
  const service = (): MatchService => new MatchService({
    storage: postgresStorage(pool!),
    config: {
      ...DEFAULT_SERVER_CONFIG,
      rateLimits: { ...DEFAULT_SERVER_CONFIG.rateLimits, guestPerIpPerHour: 1e6, joinPerPlayerPerHour: 1e6, joinPerIpPerHour: 1e6, createPerPlayerPerHour: 1e6, createPerIpPerHour: 1e6 },
    },
  });

  it('two simultaneous presses make exactly one active match with both players seated', async () => {
    const svc = service();
    const a = await svc.createGuest('Alder');
    const b = await svc.createGuest('Birch');
    const pa = await svc.authenticate(a.token);
    const pb = await svc.authenticate(b.token);
    const created = await svc.createMatch(pa);
    await svc.joinMatch(pb, created.match.inviteCode!);
    await svc.resign(pb, created.match.matchId);
    const [x, y] = await Promise.all([svc.rematch(pa, created.match.matchId), svc.rematch(pb, created.match.matchId)]);
    expect(x.match.matchId).toBe(y.match.matchId);
    const { rows } = await pool!.query('select count(*)::int as n from matches where rematch_of = $1', [created.match.matchId]);
    expect(Number(rows[0]?.n)).toBe(1);
    expect((await svc.getMatch(pa, x.match.matchId)).status).toBe('active');
    expect((await svc.rematch(pa, created.match.matchId)).match.matchId).toBe(x.match.matchId);
  });
});
