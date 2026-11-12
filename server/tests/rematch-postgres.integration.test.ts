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
  // OWNER CHANGED THE RULE (2026-11-11): the second searcher continues the pair's existing game.
  it('Find Opponent with someone you already have a game with continues that game', async () => {
    const svc = service();
    // a test database: take any older parked searches out of the queue so only these two meet
    await pool!.query("update matches set open_queue = false where status = 'waiting' and open_queue = true");
    const pa = await svc.authenticate((await svc.createGuest('Alder')).token);
    const pb = await svc.authenticate((await svc.createGuest('Birch')).token);
    const shared = await svc.createMatch(pa);
    await svc.joinMatch(pb, shared.match.inviteCode!);
    const parked = await svc.findOpponent(pa);
    expect(parked.paired).toBe(false);
    const bSearch = await svc.findOpponent(pb);
    expect(bSearch.paired).toBe(true);
    expect(bSearch.match.matchId).toBe(shared.match.matchId);
    await expect(svc.getMatch(pa, parked.match.matchId)).rejects.toThrow();
  });
  // The owner's FRESH-GUEST case (2026-11-12): the one-game-per-pair rule is pair-scoped, so an
  // open game against a THIRD party must never stop either searcher meeting a stranger.
  it('a player with an open game against a third party still pairs with a fresh stranger', async () => {
    const svc = service();
    await pool!.query("update matches set open_queue = false where status = 'waiting' and open_queue = true");
    const pa = await svc.authenticate((await svc.createGuest('Alder')).token);
    const third = await svc.authenticate((await svc.createGuest('Cedar')).token);
    const pfresh = await svc.authenticate((await svc.createGuest('Birch')).token);
    const other = await svc.createMatch(pa);
    await svc.joinMatch(third, other.match.inviteCode!);

    const freshFind = await svc.findOpponent(pfresh);
    expect(freshFind.paired).toBe(false);
    const aFind = await svc.findOpponent(pa);
    expect(aFind.paired).toBe(true);
    expect(aFind.match.matchId).toBe(freshFind.match.matchId);
    expect(aFind.match.matchId).not.toBe(other.match.matchId);
  });
});
