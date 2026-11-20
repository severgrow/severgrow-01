// Postgres/Supabase adapter for push subscriptions and the once-only send ledger (migration 0031).
//
// RLS is enabled and anon/authenticated are revoked in the migration; only the API server's role
// reaches these tables. Nothing here returns the private VAPID material — there is none in a row.
import type { PgPool } from '../storage/postgres.js';
import type { PendingChallenge, PushKind, PushStore, PushSubscriptionRecord } from './types.js';

const number = (value: unknown): number => Number(value ?? 0);
const text = (value: unknown): string => String(value ?? '');
const nullableText = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const fromRow = (row: Record<string, unknown>): PushSubscriptionRecord => ({
  playerId: text(row.player_id),
  endpoint: text(row.endpoint),
  p256dh: text(row.p256dh),
  auth: text(row.auth),
  userAgent: nullableText(row.user_agent),
  createdAt: number(row.created_at),
  lastSeenAt: number(row.last_seen_at),
});

export const postgresPushStore = (pool: PgPool): PushStore => ({
  async save(record) {
    // `unique (endpoint)` is the identity scoping: re-pointing this browser to another account
    // replaces the old owner atomically, so the previous account can never be pushed on this phone.
    await pool.query(
      `insert into push_subscriptions (player_id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, $6)
       on conflict (endpoint) do update set
         player_id = excluded.player_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         last_seen_at = excluded.last_seen_at`,
      [record.playerId, record.endpoint, record.p256dh, record.auth, record.userAgent ?? null, record.lastSeenAt],
    );
  },

  async remove(playerId, endpoint) {
    const result = await pool.query(
      'delete from push_subscriptions where player_id = $1 and endpoint = $2 returning endpoint',
      [playerId, endpoint],
    );
    return result.rows.length > 0;
  },

  async forPlayer(playerId) {
    const result = await pool.query(
      `select player_id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at
         from push_subscriptions where player_id = $1 order by created_at asc`,
      [playerId],
    );
    return result.rows.map((row) => fromRow(row as Record<string, unknown>));
  },

  async countForPlayer(playerId) {
    const result = await pool.query('select count(*)::int as n from push_subscriptions where player_id = $1', [playerId]);
    return number((result.rows[0] as { n?: unknown } | undefined)?.n);
  },

  async claim(playerId, dedupeKey, kind: PushKind, now) {
    // The primary key (player_id, dedupe_key) is the real once-only guard, across isolates.
    const result = await pool.query(
      `insert into push_sends (player_id, dedupe_key, kind, claimed_at)
       values ($1, $2, $3, $4)
       on conflict (player_id, dedupe_key) do nothing
       returning player_id`,
      [playerId, dedupeKey, kind, now],
    );
    return result.rows.length > 0;
  },

  async revoke(playerId, endpoint) {
    await pool.query('delete from push_subscriptions where player_id = $1 and endpoint = $2', [playerId, endpoint]);
  },

  async pendingChallenges(now, limit) {
    try {
      const result = await pool.query(
        `select c.id, c.cell_id, c.challenger_id, c.defender_id, c.expires_at, p.display_name
           from world_challenges c
           left join players p on p.id = c.challenger_id
          where c.status = 'pending' and c.expires_at > $1
          order by c.expires_at asc
          limit $2`,
        [now, limit],
      );
      return result.rows.map((raw): PendingChallenge => {
        const row = raw as Record<string, unknown>;
        return {
          id: text(row.id),
          cellId: text(row.cell_id),
          challengerId: text(row.challenger_id),
          defenderId: text(row.defender_id),
          challengerName: nullableText(row.display_name),
          expiresAt: number(row.expires_at),
        };
      });
    } catch (error) {
      // Migration 0014 not applied yet: the reminder sweep has nothing to read. The feature is
      // additive and must never break a deployment whose world tables are older.
      if ((error as { code?: unknown } | null)?.code === '42P01') return [];
      throw error;
    }
  },
});
