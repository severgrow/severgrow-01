// The ONE place the "test/verification traffic" marker (migration 0013, `players.is_test` /
// `matches.is_test`) is written by tooling.
//
// Why direct SQL and not an API field: the public API is what real players hit, and giving it a way
// to set `is_test` is a surface nobody needs — the only consequence would be hiding yourself from a
// dashboard, but a marker a player can set is not a marker. The tools already hold the database
// connection they create rows with, so they flag their own creations here, immediately.
//
// Guarantees:
//   * SCOPED: every statement is `where id = any($1::uuid[])` or "a match one of these players is
//     in" — never a table sweep, never a wildcard;
//   * IDEMPOTENT: only rows that are not already marked are updated;
//   * FAIL-LOUD: `markTestRowsOrFail` refuses (non-zero exit) when there is no database to mark,
//     so a live-target run can never silently skip marking and pollute the dashboard.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import type { PgPool } from '../src/storage/postgres.js';

export type MarkInput = { playerIds?: readonly string[]; matchIds?: readonly string[] };
export type MarkResult = { players: number; matches: number };

/**
 * `DATABASE_URL` from the environment, or from the repo's git-ignored `.env`. Tools are sometimes
 * started with a bare `npx tsx …` (no `--env-file`), and a marker that only works under one launch
 * style is a marker that will be skipped by accident.
 */
export const databaseUrlForMarking = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const fromEnv = env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(fileURLToPath(new URL('../../.env', import.meta.url)), 'utf8');
    for (const line of text.split('\n')) {
      const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
      if (match) return match[1]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env — the caller decides whether that is fatal */
  }
  return null;
};

/** Flip the marker on every row these ids touch. Returns how many rows CHANGED (already-marked = 0). */
export const markTestRows = async (pool: PgPool, input: MarkInput): Promise<MarkResult> => {
  const playerIds = [...new Set((input.playerIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const matchIds = [...new Set((input.matchIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (playerIds.length === 0 && matchIds.length === 0) return { players: 0, matches: 0 };

  const players = await pool.query(
    'update players set is_test = true where id = any($1::uuid[]) and is_test = false returning id',
    [playerIds],
  );
  // Every match the run created, PLUS any match one of its players was seated in: a tool that only
  // tracks player ids (the rehearsal mints guests and finds their matches by id) must still mark the
  // match, or the match list and counts stay polluted even though the players are hidden.
  const matches = await pool.query(
    `update matches set is_test = true
       where is_test = false
         and (id = any($1::uuid[])
              or exists (select 1 from match_participants mp where mp.match_id = matches.id and mp.player_id = any($2::uuid[])))
       returning id`,
    [matchIds, playerIds],
  );
  return { players: players.rows.length, matches: matches.rows.length };
};

/** Open a pool, mark, close. Returns null (and closes nothing) when there is no database. */
export const markTestRowsViaDatabaseUrl = async (input: MarkInput, url: string | null = databaseUrlForMarking()): Promise<MarkResult | null> => {
  if (!url) return null;
  const pool = poolFromUrl(url, { max: 1 });
  try {
    return await markTestRows(pool, input);
  } finally {
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
  }
};

/** The loud version the live-target tools use: no database ⇒ no way to mark ⇒ refuse to continue. */
export const markTestRowsOrFail = async (tool: string, input: MarkInput): Promise<MarkResult> => {
  // Nothing created ⇒ nothing to mark ⇒ no database needed (a read-only invocation stays free).
  if ((input.playerIds ?? []).filter(Boolean).length === 0 && (input.matchIds ?? []).filter(Boolean).length === 0) {
    return { players: 0, matches: 0 };
  }
  const url = databaseUrlForMarking();
  if (!url) {
    throw new Error(
      `${tool} created rows on a real project but could not mark them as test: DATABASE_URL is not set ` +
        `(put it in .env, which is git-ignored). Refusing to leave unmarked test rows behind.`,
    );
  }
  const result = await markTestRowsViaDatabaseUrl(input, url);
  return result ?? { players: 0, matches: 0 };
};
