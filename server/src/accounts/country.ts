// THE STORED COUNTRY (migration 0031), the only durable record of where a player's flag comes from.
//
// Written ONCE at sign-in (accounts.ts) or guest creation (fetch-app.ts) from the edge's own geo
// header, and read by the public profile. A later sign-in from another country replaces it: the flag
// says where the player last signed in from, which is the honest thing a stored fact can say.
//
// Both implementations tolerate a database where 0031 has not been applied yet: a missing table
// reads as "unknown" (no flag) and a write is a quiet no-op, exactly as the streak store treats
// migration 0028. Nothing else may be swallowed.
import type { PgPool } from '../storage/postgres.js';
import { isCountryCode, normalizeCountry } from '../country-code.js';

export type CountryStore = {
  /** Remember this player's country. A no-op when the value is not a country code. */
  save(playerId: string, country: string, now: number): Promise<void>;
  /** The stored code, or null when the player has none (or the table is not applied yet). */
  read(playerId: string): Promise<string | null>;
};

/** Postgres "undefined table": the server code arrived before migration 0031. */
const missingTable = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === '42P01';

export const postgresCountryStore = (pool: PgPool): CountryStore => ({
  async save(playerId, country, now) {
    const code = normalizeCountry(country);
    if (!code) return;
    try {
      await pool.query(
        `insert into player_countries (player_id, country, updated_at) values ($1, $2, $3)
         on conflict (player_id) do update set country = excluded.country, updated_at = excluded.updated_at`,
        [playerId, code, now],
      );
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
  },
  async read(playerId) {
    try {
      const { rows } = await pool.query('select country from player_countries where player_id = $1', [playerId]);
      return normalizeCountry(rows[0]?.country);
    } catch (error) {
      if (missingTable(error)) return null;
      throw error;
    }
  },
});

/** The in-memory twin, for tests and the dev server. */
export const memoryCountryStore = (): CountryStore & { readonly rows: Map<string, string> } => {
  const rows = new Map<string, string>();
  return {
    rows,
    async save(playerId, country) {
      const code = normalizeCountry(country);
      if (code) rows.set(playerId, code);
    },
    async read(playerId) { return rows.get(playerId) ?? null; },
  };
};

/** The country a request came from, ready for `save`. Null keeps the promise at "no country". */
export const storedCountry = (value: string | null): string | null => (isCountryCode(value) ? normalizeCountry(value) : null);
