// PgPool adapter for postgres.js (Deno Edge / transaction pooler). Uses prepare: false and
// reserved connections so BEGIN / FOR UPDATE / COMMIT stay on one physical connection.
import type { PgClient, PgPool, PgQueryResult, PgRow } from './postgres.js';

/** Minimal surface of `postgres` (postgres.js) that we need. */
export type PostgresJsSql = {
  unsafe(text: string, values?: readonly unknown[]): Promise<readonly PgRow[]>;
  reserve(): Promise<PostgresJsReserved>;
};

export type PostgresJsReserved = {
  unsafe(text: string, values?: readonly unknown[]): Promise<readonly PgRow[]>;
  release(): void;
};

const asResult = (rows: readonly PgRow[]): PgQueryResult => ({ rows: [...rows] });

/** Wrap a postgres.js client as the structural PgPool used by postgresStorage. */
export const poolFromPostgresJs = (sql: PostgresJsSql): PgPool => ({
  async query(text: string, values?: readonly unknown[]): Promise<PgQueryResult> {
    return asResult(await sql.unsafe(text, values ?? []));
  },
  async connect(): Promise<PgClient> {
    const reserved = await sql.reserve();
    return {
      async query(text: string, values?: readonly unknown[]): Promise<PgQueryResult> {
        return asResult(await reserved.unsafe(text, values ?? []));
      },
      release(): void {
        reserved.release();
      },
    };
  },
});
