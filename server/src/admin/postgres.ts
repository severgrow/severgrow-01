// The admin dashboard's real data source. Every list is bounded (`order by … limit …`), keyset
// paginated where it can grow, and reads ONLY the columns each screen needs.
//
// What this file deliberately never reads: `matches.state` (authoritative hands/deck order),
// `player_tokens` (token hashes), `matches.invite_code`, `match_moves.events` payloads,
// `player_identities.subject` (the Google subject) and any email. The API's response shapes in
// types.ts are the whitelist; nothing here can widen them.
import { WORLD_CELLS, WORLD_VERSION } from '../world.js';
import { SEED_ECONOMY } from '../seeds/config.js';
import { ApiError } from '../errors.js';
import { playerTag } from '../../../src/player-tag.js';
import { shapeCampaign } from './campaign.js';
import { shapePlayers, PLAYERS_LIMIT } from './players.js';
import type { PgPool } from '../storage/postgres.js';
import type {
  AdminAuditEntry,
  AdminBuildRow,
  AdminEconomy,
  AdminLedgerRow,
  AdminMatchDetail,
  AdminMatchRow,
  AdminOverview,
  AdminPlayerResult,
  AdminPlayerRow,
  AdminReportFilter,
  AdminReportRow,
  AdminStore,
  AdminTriageStatus,
} from './types.js';
import { TAG_SCAN_LIMIT, normalizeBuild } from './types.js';
import {
  DAY_MS,
  clampLimit,
  decodeCursor,
  json,
  lastDays,
  modeOf,
  nnum,
  nstr,
  num,
  pageOf,
  str,
  utcDay,
} from './util.js';

const page = pageOf;

// Migration 0012 adds `feedback_triage` and `admin_seen`. Until it is applied, the four paths that
// touch them fail with Postgres 'undefined_table' (SQLSTATE 42P01): `reports()` LEFT JOINs
// `feedback_triage`, so the Reports screen cannot load at all, and the seen-cursor throws.
//
// On the wire a thrown pg error becomes a generic 500 ("Something went wrong on the server."). That
// is indistinguishable from a real bug, and a Reports screen that answers with a blank list reads as
// "no reports" — a lie. So an undefined_admin_table is translated into ONE stable code the dashboard
// renders as a plain "not enabled yet" state instead of an error or an empty list.
const MISSING_ADMIN_TABLES = ['feedback_triage', 'admin_seen'] as const;

const isMissingAdminTable = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message : '';
  // Match on either the SQLSTATE or the message: a fake pool used in a unit test can only set one.
  return (code === '42P01' || /does not exist/i.test(text)) && MISSING_ADMIN_TABLES.some((table) => text.includes(table));
};

/** Run an admin query, mapping "migration 0012 is not applied" to a code the dashboard understands. */
const requireAdminTables = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (isMissingAdminTable(error)) {
      throw new ApiError('ADMIN_MIGRATION_PENDING', 'Triage is not enabled yet: the admin tables (migration 0012) are missing on this database.');
    }
    throw error;
  }
};

// ---------------------------------------------------------------- test-data visibility (migration 0013)
// The dashboard must show REAL activity only. `players.is_test` / `matches.is_test` permanently mark
// rows created by verification/rehearsal/soak/simulation tooling (server/scripts/mark-test-data.ts).
//
// Two rules, deliberately different, because "a run cannot move ANY number" and "a real player is
// never hidden" pull in opposite directions:
//   * a PLAYER is judged by its OWN flag and nothing else — a real player is never hidden because a
//     test match they happened to play, or a test opponent, exists;
//   * a MATCH is judged by its own flag OR by any participant being a marked player, so a test guest
//     who joined a real player's match cannot drag that match, its roster or its seat count into
//     the dashboard. Only the MATCH is hidden; the real player's own row is untouched.
//
// Every read below uses these so the rule cannot drift from the query. A test asserts the SQL.
/** A row that carries the flag itself (`players` / `matches`). */
export const NOT_TEST = (alias: string): string => `${alias}.is_test = false`;
/** A row that OWNS/REFERENCES a player by id (wallets, ledger, receipts, claims, reports, links). */
export const PLAYER_OF_NOT_TEST = (expr: string): string =>
  `not exists (select 1 from players vis_p where vis_p.id = ${expr} and vis_p.is_test)`;
/** A match is visible only when neither it nor any of its participants is marked. */
export const MATCH_VISIBLE = (alias: string): string =>
  `${alias}.is_test = false and not exists (` +
  `select 1 from match_participants vis_mp join players vis_pl on vis_pl.id = vis_mp.player_id ` +
  `where vis_mp.match_id = ${alias}.id and vis_pl.is_test)`;

/**
 * Run the query thunks ONE AT A TIME, in order.
 *
 * Through the deployed Edge runtime (postgres.js against the transaction pooler) a PARALLEL batch of
 * this many statements hangs the request until the platform's 150s idle timeout, while one at a time
 * always answers (~300ms each). Reproduced with the pre-filter SQL too, so it is a runtime quirk, not
 * the test filter. After `world`, `economy` and `stuck` each get their own `Promise.all` replaced
 * here; the smaller/simple batches (`overview`, `ledger`, `matches`, `campaign`, …) are unaffected.
 */
const sequential = async <T extends Record<string, () => Promise<unknown>>>(
  thunks: T,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> => {
  const out: Record<string, unknown> = {};
  for (const [key, thunk] of Object.entries(thunks)) out[key] = await thunk();
  return out as never;
};

export const postgresAdminStore = (pool: PgPool): AdminStore => {

  const showMatch = (row: Record<string, unknown>): AdminMatchRow => ({
    id: str(row.id),
    mode: modeOf(row),
    status: str(row.status),
    rulesVersion: str(row.rules_version),
    revision: num(row.revision),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
    finishedAt: nnum(row.finished_at),
    turnDeadlineAt: nnum(row.turn_deadline_at),
    finishReason: row.result === null || row.result === undefined ? null : (json<{ reason?: string }>(row.result, {}).reason ?? null),
    winnerSeat: row.result === null || row.result === undefined ? null : (json<{ winner?: number | null }>(row.result, {}).winner ?? null),
    players: json<{ seat: number; playerId: string; name: string | null }[]>(row.players, []),
    moveCount: num(row.move_count),
  });

  const MATCH_SELECT = `select m.*,
      (select coalesce(json_agg(json_build_object('seat', p.seat, 'playerId', p.player_id, 'name', pl.display_name) order by p.seat), '[]'::json)
         from match_participants p left join players pl on pl.id = p.player_id where p.match_id = m.id) as players,
      (select count(*)::int from match_moves mv where mv.match_id = m.id) as move_count
    from matches m`;

  /** The report projection: the JSON path and the CSV path share this exact field list. */
  const REPORT_SELECT = `select r.id, r.created_at, r.kind, r.player_id, r.message, r.context, r.build, r.user_agent,
      p.display_name as player_name,
      coalesce(t.status, 'new') as triage_status, coalesce(t.note, '') as triage_note,
      t.updated_at as triaged_at, t.updated_by as triaged_by
    from feedback_reports r
    left join feedback_triage t on t.report_id = r.id
    left join players p on p.id = r.player_id`;

  const reportWhere = (filter: AdminReportFilter): { sql: string; values: unknown[] } => {
    // A report filed by a marked (test) player is test data too — the live database literally held
    // one message reading "Test testera testuje test". A report with NO player (an anonymous crash)
    // is kept: there is no marked author to attribute it to.
    const clauses: string[] = [PLAYER_OF_NOT_TEST('r.player_id')];
    const values: unknown[] = [];
    const add = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filter.kind) clauses.push(`r.kind = ${add(filter.kind)}`);
    if (filter.since !== undefined) clauses.push(`r.created_at >= ${add(filter.since)}`);
    if (filter.until !== undefined) clauses.push(`r.created_at <= ${add(filter.until)}`);
    if (filter.status) clauses.push(`coalesce(t.status, 'new') = ${add(filter.status)}`);
    // A build key is `asset · version`; the stored string is `asset · version · label`. `starts_with`
    // is a literal prefix test (no LIKE wildcards), so an asset name containing `_` cannot widen it.
    if (filter.build) clauses.push(`(r.build = ${add(filter.build)} or starts_with(r.build, ${add(`${filter.build} · `)}))`);
    const cursor = decodeCursor(filter.cursor);
    if (cursor) {
      const at = add(cursor.at);
      const id = add(cursor.id);
      clauses.push(`(r.created_at < ${at} or (r.created_at = ${at} and r.id < ${id}))`);
    }
    return { sql: clauses.length ? ` where ${clauses.join(' and ')}` : '', values };
  };

  return {
    async readSeen(adminId) {
      const { rows } = await requireAdminTables(() =>
        pool.query('select seen_at from admin_seen where admin_player_id = $1', [adminId]),
      );
      return rows[0] ? num(rows[0].seen_at) : null;
    },

    async writeSeen(adminId, at) {
      await requireAdminTables(() =>
        pool.query(
          `insert into admin_seen (admin_player_id, seen_at) values ($1, $2)
           on conflict (admin_player_id) do update set seen_at = greatest(admin_seen.seen_at, excluded.seen_at)`,
          [adminId, at],
        ),
      );
    },

    async countsSince(since, _now) {
      const { rows } = await pool.query(
        `select
           (select count(*)::int from feedback_reports r where r.created_at > $1 and r.kind = 'report' and ${PLAYER_OF_NOT_TEST('r.player_id')}) as reports,
           (select count(*)::int from feedback_reports r where r.created_at > $1 and r.kind = 'crash' and ${PLAYER_OF_NOT_TEST('r.player_id')}) as crashes,
           (select count(*)::int from world_claims c where c.claimed_at > $1 and ${PLAYER_OF_NOT_TEST('c.owner_id')}) as claims,
           (select count(*)::int from matches m where m.created_at > $1 and ${MATCH_VISIBLE('m')}) as matches`,
        [since],
      );
      const row = rows[0] ?? {};
      return { reports: num(row.reports), crashes: num(row.crashes), claims: num(row.claims), matches: num(row.matches) };
    },

    async overview(now) {
      const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
      const weekAgo = now - 7 * DAY_MS;
      const [matches, statuses, byDay, reports, builds, seeds, world] = await Promise.all([
        pool.query(
          `select
             count(*) filter (where finished_at >= $1) as today_total,
             count(*) filter (where finished_at >= $1 and open_queue and live_since is null) as today_queue,
             count(*) filter (where finished_at >= $1 and not open_queue and live_since is null) as today_friend,
             count(*) filter (where finished_at >= $1 and live_since is not null) as today_live,
             count(*) filter (where finished_at >= $2) as week_total,
             count(*) filter (where finished_at >= $2 and open_queue and live_since is null) as week_queue,
             count(*) filter (where finished_at >= $2 and not open_queue and live_since is null) as week_friend,
             count(*) filter (where finished_at >= $2 and live_since is not null) as week_live
           from matches m where m.status = 'finished' and m.finished_at is not null and m.finished_at >= $2
             and ${MATCH_VISIBLE('m')}`,
          [todayStart, weekAgo],
        ),
        pool.query(`select m.status, count(*)::int as n from matches m where ${MATCH_VISIBLE('m')} group by m.status`),
        pool.query(
          `select floor(finished_at / ${DAY_MS})::bigint * ${DAY_MS} as day_ms,
                  count(*) filter (where open_queue and live_since is null)::int as queue,
                  count(*) filter (where not open_queue and live_since is null)::int as friend,
                  count(*) filter (where live_since is not null)::int as live
             from matches m where m.status = 'finished' and m.finished_at >= $1 and m.finished_at <= $2
               and ${MATCH_VISIBLE('m')}
            group by 1 order by 1`,
          [weekAgo, now],
        ),
        pool.query(
          `select
             count(*) filter (where r.created_at >= $1)::int as today,
             count(*) filter (where r.created_at >= $2)::int as week,
             count(*) filter (where r.created_at >= $2 and r.kind = 'crash')::int as crashes,
             count(*) filter (where r.created_at >= $2 and r.kind = 'report')::int as reports
           from feedback_reports r where ${PLAYER_OF_NOT_TEST('r.player_id')}`,
          [todayStart, weekAgo],
        ),
        pool.query(
          `select coalesce(build, '') as build, crashes, reports, total from (
             select coalesce(r.build, '') as build,
                    count(*) filter (where r.kind = 'crash')::int as crashes,
                    count(*) filter (where r.kind = 'report')::int as reports,
                    count(*)::int as total
               from feedback_reports r where r.created_at >= $1 and ${PLAYER_OF_NOT_TEST('r.player_id')} group by 1
           ) t order by total desc, build asc limit 100`,
          [weekAgo],
        ),
        pool.query(
          `select floor(l.created_at / ${DAY_MS})::bigint * ${DAY_MS} as day_ms,
                  coalesce(sum(l.delta) filter (where l.delta > 0), 0)::int as earned,
                  coalesce(sum(-l.delta) filter (where l.delta < 0), 0)::int as spent
             from seed_ledger l where l.created_at >= $1 and l.created_at <= $2
               and ${PLAYER_OF_NOT_TEST('l.player_id')} group by 1 order by 1`,
          [weekAgo, now],
        ),
        pool.query(
          `select count(*)::int as total,
                  count(*) filter (where c.claimed_at >= $1)::int as recent,
                  count(distinct c.owner_id)::int as owners
             from world_claims c where ${PLAYER_OF_NOT_TEST('c.owner_id')}`,
          [weekAgo],
        ),
      ]);

      const m = matches.rows[0] ?? {};
      const statusRow = new Map(statuses.rows.map((r) => [str(r.status), num(r.n)]));
      const days = lastDays(now, 7);
      const dayIndex = new Map(byDay.rows.map((r) => [utcDay(num(r.day_ms)), r]));
      const seedIndex = new Map(seeds.rows.map((r) => [utcDay(num(r.day_ms)), r]));

      // Builds are grouped on the NORMALISED key: a raw free-text `build` column would fragment a
      // single deploy into one row per asset hash.
      const merged = new Map<string, AdminBuildRow>();
      for (const row of builds.rows) {
        const parsed = normalizeBuild(nstr(row.build));
        const existing = merged.get(parsed.key) ?? { ...parsed, crashes: 0, reports: 0, total: 0 };
        existing.crashes += num(row.crashes);
        existing.reports += num(row.reports);
        existing.total += num(row.total);
        merged.set(parsed.key, existing);
      }
      const byBuild = [...merged.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)).slice(0, 50);

      const overview: AdminOverview = {
        serverNow: now,
        rulesVersion: '',
        matches: {
          finishedToday: {
            total: num(m.today_total),
            byMode: { queue: num(m.today_queue), friend: num(m.today_friend), live: num(m.today_live) },
          },
          finished7d: {
            total: num(m.week_total),
            byMode: { queue: num(m.week_queue), friend: num(m.week_friend), live: num(m.week_live) },
          },
          byStatus: {
            waiting: statusRow.get('waiting') ?? 0,
            active: statusRow.get('active') ?? 0,
            finished: statusRow.get('finished') ?? 0,
          },
          finishedByDay: days.map((day) => {
            const row = dayIndex.get(day);
            return { day, queue: num(row?.queue), friend: num(row?.friend), live: num(row?.live) };
          }),
        },
        reports: {
          today: num(reports.rows[0]?.today),
          last7d: num(reports.rows[0]?.week),
          crashes7d: num(reports.rows[0]?.crashes),
          reports7d: num(reports.rows[0]?.reports),
          byBuild,
        },
        seeds: {
          earned7d: seeds.rows.reduce((n, r) => n + num(r.earned), 0),
          spent7d: seeds.rows.reduce((n, r) => n + num(r.spent), 0),
          byDay: days.map((day) => {
            const row = seedIndex.get(day);
            return { day, earned: num(row?.earned), spent: num(row?.spent) };
          }),
        },
        world: {
          totalClaims: num(world.rows[0]?.total),
          claims7d: num(world.rows[0]?.recent),
          cellsTotal: WORLD_CELLS.length,
          owners: num(world.rows[0]?.owners),
        },
        health: { dbOk: true, dbMs: null },
      };
      return overview;
    },

    async reports(filter) {
      const limit = clampLimit(filter.limit);
      const where = reportWhere(filter);
      const [rows, total] = await requireAdminTables(() =>
        Promise.all([
          pool.query(
            `${REPORT_SELECT}${where.sql} order by r.created_at desc, r.id desc limit ${limit}`,
            where.values,
          ),
          pool.query(
            `select count(*)::int as n from feedback_reports r left join feedback_triage t on t.report_id = r.id${where.sql}`,
            where.values,
          ),
        ]),
      );
      const mapped: AdminReportRow[] = rows.rows.map((row) => {
        const parsed = normalizeBuild(nstr(row.build));
        const playerId = nstr(row.player_id);
        return {
          id: str(row.id),
          createdAt: num(row.created_at),
          kind: str(row.kind) === 'crash' ? 'crash' : 'report',
          playerId,
          playerName: nstr(row.player_name),
          playerTag: playerId ? playerTag(playerId) : null,
          message: str(row.message ?? ''),
          context: json<Record<string, unknown>>(row.context, {}),
          build: nstr(row.build),
          buildKey: parsed.key,
          userAgent: nstr(row.user_agent),
          status: str(row.triage_status) as AdminTriageStatus,
          note: str(row.triage_note ?? ''),
          triagedAt: nnum(row.triaged_at),
          triagedBy: nstr(row.triaged_by),
        };
      });
      return page(mapped, num(total.rows[0]?.n), limit, (row) => ({ at: row.createdAt, id: row.id }));
    },

    async triage(input) {
      return requireAdminTables(async () => {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const exists = await client.query(
            `select 1 from feedback_reports r where r.id = $1 and ${PLAYER_OF_NOT_TEST('r.player_id')}`,
            [input.reportId],
          );
          if (exists.rows.length === 0) {
            await client.query('rollback');
            return null;
          }
          const prior = await client.query('select status from feedback_triage where report_id = $1 for update', [input.reportId]);
          const previous = prior.rows[0] ? (str(prior.rows[0].status) as AdminTriageStatus) : null;
          await client.query(
            `insert into feedback_triage (report_id, status, note, updated_at, updated_by) values ($1,$2,$3,$4,$5)
             on conflict (report_id) do update set status = excluded.status, note = excluded.note,
               updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
            [input.reportId, input.status, input.note, input.now, input.actorId],
          );
          await client.query('commit');
          return { changed: previous !== input.status, previous };
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw error;
        } finally {
          client.release?.();
        }
      });
    },

    async audit(entry: AdminAuditEntry) {
      await pool.query(
        `insert into admin_audit (id, actor_id, action, target_type, target_id, detail, created_at)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [entry.id, entry.actorId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.detail), entry.createdAt],
      );
    },

    async stuck(now, windows) {
      const { active, waiting, guests, sample } = await sequential({
        active: () =>
          pool.query(
            `select count(*)::int as n, min(m.turn_deadline_at) as oldest from matches m
              where m.status = 'active' and m.turn_deadline_at is not null and m.turn_deadline_at < $1
                and ${MATCH_VISIBLE('m')}`,
            [now],
          ),
        waiting: () =>
          pool.query(
            `select count(*)::int as n, min(m.expires_at) as oldest from matches m
              where m.status = 'waiting' and m.expires_at is not null and m.expires_at < $1
                and ${MATCH_VISIBLE('m')}`,
            [now],
          ),
        guests: () =>
          pool.query(
            `select count(*)::int as n, min(p.created_at) as oldest from players p
              where p.kind = 'guest' and p.created_at < $1 and ${NOT_TEST('p')}
                and not exists (select 1 from match_participants mp where mp.player_id = p.id)
                and not exists (select 1 from seed_wallets sw where sw.player_id = p.id and (sw.balance > 0 or sw.lifetime_earned > 0 or sw.lifetime_spent > 0))
                and not exists (select 1 from seed_reward_receipts sr where sr.player_id = p.id)
                and not exists (select 1 from seed_ledger sl where sl.player_id = p.id)
                and not exists (select 1 from training_seed_tickets st where st.player_id = p.id)
                and not exists (select 1 from world_claims wc where wc.owner_id = p.id)`,
            [now - windows.guestMaxAgeMs],
          ),
        sample: () =>
          pool.query(
            `select m.id, m.status, m.open_queue, m.live_since, m.created_at,
                    coalesce(m.turn_deadline_at, m.expires_at) as due_at,
                    (select count(*)::int from match_participants p where p.match_id = m.id) as seats
               from matches m
              where ((m.status = 'active' and m.turn_deadline_at is not null and m.turn_deadline_at < $1)
                 or (m.status = 'waiting' and m.expires_at is not null and m.expires_at < $1))
                and ${MATCH_VISIBLE('m')}
              order by due_at asc limit 20`,
            [now],
          ),
      });
      const rows = sample.rows.map((row) => ({
        id: str(row.id),
        status: str(row.status),
        mode: modeOf(row),
        createdAt: num(row.created_at),
        dueAt: nnum(row.due_at),
        seats: num(row.seats),
      }));
      return {
        expiredActive: {
          count: num(active.rows[0]?.n),
          oldest: nnum(active.rows[0]?.oldest),
          rows: rows.filter((row) => row.status === 'active'),
        },
        expiredWaiting: {
          count: num(waiting.rows[0]?.n),
          oldest: nnum(waiting.rows[0]?.oldest),
          rows: rows.filter((row) => row.status === 'waiting'),
        },
        cleanupEligibleGuests: { count: num(guests.rows[0]?.n), oldest: nnum(guests.rows[0]?.oldest) },
        windows,
      };
    },

    async rulesVersionCounts() {
      const { rows } = await pool.query(
        `select m.rules_version as value, count(*)::int as n from matches m
          where ${MATCH_VISIBLE('m')} group by 1 order by n desc limit 50`,
      );
      return rows.map((row) => ({ value: str(row.value), n: num(row.n) }));
    },

    async funnel(now) {
      const { byDay, links, totals, oldest } = await sequential({
        byDay: () =>
          pool.query(
            `select floor(p.created_at / ${DAY_MS})::bigint * ${DAY_MS} as day_ms,
                    count(*) filter (where p.kind = 'guest')::int as guests,
                    count(*) filter (where p.kind = 'account')::int as accounts
               from players p where p.created_at >= $1 and ${NOT_TEST('p')} group by 1 order by 1 limit 400`,
            [now - 90 * DAY_MS],
          ),
        links: () =>
          pool.query(
            `select floor(i.created_at / ${DAY_MS})::bigint * ${DAY_MS} as day_ms, count(*)::int as n
               from player_identities i where i.created_at >= $1 and ${PLAYER_OF_NOT_TEST('i.player_id')}
              group by 1 order by 1 limit 400`,
            [now - 90 * DAY_MS],
          ),
        totals: () =>
          pool.query(
            `select count(*)::int as players,
                    count(*) filter (where p.kind = 'guest')::int as guests,
                    count(*) filter (where p.kind = 'account')::int as accounts,
                    count(*) filter (where p.kind = 'account' and p.upgraded_at is not null)::int as with_upgraded_at
               from players p where ${NOT_TEST('p')}`,
          ),
        oldest: () =>
          pool.query(
            `select min(p.created_at) as first_created, count(*)::int as n from players p
              where p.upgraded_at is null and ${NOT_TEST('p')}`,
          ),
      });
      const dayIndex = new Map(byDay.rows.map((r) => [utcDay(num(r.day_ms)), r]));
      const linkIndex = new Map(links.rows.map((r) => [utcDay(num(r.day_ms)), num(r.n)]));
      const days = lastDays(now, 30);
      const accounts = num(totals.rows[0]?.accounts);
      return {
        serverNow: now,
        playersCreatedByDay: days.map((day) => {
          const row = dayIndex.get(day);
          return { day, guests: num(row?.guests), accounts: num(row?.accounts) };
        }),
        accountsLinkedByDay: days.map((day) => ({ day, n: linkIndex.get(day) ?? 0 })),
        totals: {
          players: num(totals.rows[0]?.players),
          guests: num(totals.rows[0]?.guests),
          accounts,
          withUpgradedAt: num(totals.rows[0]?.with_upgraded_at),
        },
        // Honest: `upgraded_at` arrived with accounts (migration 0010). Any player row created
        // before that column existed has NULL here, so a per-day upgrade series from it would be
        // wrong for those rows — hence player_identities.created_at is used for the linking series.
        upgradedAtMayBeUnpopulated: num(oldest.rows[0]?.n) > 0 && nnum(oldest.rows[0]?.first_created) !== null,
      };
    },

    async economy(now) {
      const { wallets, categories, receipts, denials, modes } = await sequential({
        wallets: () =>
          pool.query(
            `select count(*)::int as wallets,
                    coalesce(sum(w.balance), 0)::int as balance,
                    coalesce(sum(w.lifetime_earned), 0)::bigint as earned,
                    coalesce(sum(w.lifetime_spent), 0)::bigint as spent
               from seed_wallets w where ${PLAYER_OF_NOT_TEST('w.player_id')}`,
          ),
        categories: () =>
          pool.query(
            `select l.category,
                    count(*)::int as entries,
                    coalesce(sum(l.delta) filter (where l.delta > 0), 0)::int as minted,
                    coalesce(sum(-l.delta) filter (where l.delta < 0), 0)::int as spent,
                    coalesce(sum(l.delta), 0)::int as net
               from seed_ledger l where ${PLAYER_OF_NOT_TEST('l.player_id')} group by l.category order by entries desc limit 40`,
          ),
        receipts: () =>
          pool.query(
            `select count(*) filter (where r.awarded > 0)::int as awarded,
                    count(*) filter (where r.awarded = 0)::int as denied
               from seed_reward_receipts r where ${PLAYER_OF_NOT_TEST('r.player_id')}`,
          ),
        denials: () =>
          pool.query(
            `select coalesce(r.denial, 'awarded') as value, count(*)::int as n
               from seed_reward_receipts r where ${PLAYER_OF_NOT_TEST('r.player_id')} group by 1 order by n desc limit 40`,
          ),
        modes: () =>
          pool.query(
            `select r.mode as value, count(*)::int as n from seed_reward_receipts r
              where ${PLAYER_OF_NOT_TEST('r.player_id')} group by 1 order by n desc limit 40`,
          ),
      });
      const earned = num(wallets.rows[0]?.earned);
      const spent = num(wallets.rows[0]?.spent);
      const economy: AdminEconomy = {
        serverNow: now,
        totals: {
          wallets: num(wallets.rows[0]?.wallets),
          balance: num(wallets.rows[0]?.balance),
          lifetimeEarned: earned,
          lifetimeSpent: spent,
        },
        byCategory: categories.rows.map((row) => ({
          category: str(row.category),
          entries: num(row.entries),
          minted: num(row.minted),
          spent: num(row.spent),
          net: num(row.net),
        })),
        receipts: {
          awarded: num(receipts.rows[0]?.awarded),
          denied: num(receipts.rows[0]?.denied),
          byDenial: denials.rows.map((row) => ({ value: str(row.value), n: num(row.n) })),
          byMode: modes.rows.map((row) => ({ value: str(row.value), n: num(row.n) })),
        },
        // Minted per Seed actually spent. 1.0 = every Seed earned has been spent on land;
        // > 1 = the currency is inflating (the number is exact, the interpretation is a label).
        inflationRatio: spent > 0 ? earned / spent : null,
        caps: {
          tileCost: SEED_ECONOMY.tileCost,
          utcDailyRepeatableCap: SEED_ECONOMY.utcDailyRepeatableCap,
          economies: [
            ...Object.entries(SEED_ECONOMY.online).map(([mode, rules]) => `${mode}: win ${rules.win} / loss ${rules.loss} / draw ${rules.draw}, ${rules.dailyMatches}/day`),
          ],
        },
      };
      return economy;
    },

    async playerLookup(query) {
      let row: Record<string, unknown> | null = null;
      let matchedBy: 'id' | 'name' | 'tag' = 'id';
      let tagScanLimit: number | null = null;
      if (query.id) {
        const { rows } = await pool.query(
          `select * from players where id = $1 and ${NOT_TEST('players')}`,
          [query.id],
        );
        row = rows[0] ?? null;
      } else if (query.tag) {
        // The tag is an FNV-1a hash of the player id (src/player-tag.ts), so it cannot be indexed or
        // reversed: finding a tag means hashing candidate ids. Bounded to the most recent N players.
        tagScanLimit = TAG_SCAN_LIMIT;
        const { rows } = await pool.query(
          `select * from players where ${NOT_TEST('players')} order by created_at desc limit ${TAG_SCAN_LIMIT}`,
        );
        row = rows.find((candidate) => playerTag(str(candidate.id)) === query.tag) ?? null;
        matchedBy = 'tag';
      } else if (query.name) {
        // CASE-INSENSITIVE, and deliberately still an EXACT match. A search box is how this is typed,
        // so `lower()` on both sides is required: a plain `display_name = $1` made 'ryk' miss while
        // 'RYK' hit, which is the whole feature failing its one obvious input.
        //
        // It is NOT a LIKE '%…%' substring search, on purpose. `playerLookup` returns ONE player
        // (`row = rows[0]`) and labels it `matchedBy: 'name'`; a partial match would silently pick
        // the newest of several players and present it as the match — a wrong account shown as exact.
        // A substring scan is also unindexable (`%…%` is always a full-table scan). `lower(x) = lower(y)`
        // is at worst a sequential scan bounded by `limit 25` here (one account today); an expression
        // index on `lower(display_name)` would make it exact if the table ever grows.
        const { rows } = await pool.query(
          `select * from players where lower(display_name) = lower($1) and ${NOT_TEST('players')}
            order by created_at desc limit 25`,
          [query.name],
        );
        row = rows[0] ?? null;
        matchedBy = 'name';
      }
      if (!row) return null;
      const id = str(row.id);

      // Every sub-read is scoped to a player already proven NOT marked, so the test filter here is
      // belt-and-braces — but it keeps the rule uniform (and a source guard asserts it).
      const [providers, matchesOf, wallet, ledger, rewards, denied, tiles] = await Promise.all([
        pool.query(
          `select i.provider from player_identities i where i.player_id = $1 and ${PLAYER_OF_NOT_TEST('i.player_id')} limit 5`,
          [id],
        ),
        pool.query(
          `select m.id, m.status, m.created_at, m.finished_at, m.open_queue, m.live_since, m.result, mp.seat,
                  (select pl.display_name from match_participants op join players pl on pl.id = op.player_id
                    where op.match_id = m.id and op.player_id <> $1 limit 1) as opponent_name
             from matches m join match_participants mp on mp.match_id = m.id and mp.player_id = $1
            where ${MATCH_VISIBLE('m')}
            order by m.created_at desc limit 200`,
          [id],
        ),
        pool.query(
          `select * from seed_wallets w where w.player_id = $1 and ${PLAYER_OF_NOT_TEST('w.player_id')}`,
          [id],
        ),
        pool.query(
          `select l.id, l.player_id, l.delta, l.balance_after, l.category, l.source_key, l.created_at, p.display_name as player_name
             from seed_ledger l left join players p on p.id = l.player_id
            where l.player_id = $1 and ${PLAYER_OF_NOT_TEST('l.player_id')} order by l.created_at desc limit 20`,
          [id],
        ),
        pool.query(
          `select count(*) filter (where r.awarded > 0)::int as awarded, count(*) filter (where r.awarded = 0)::int as denied
             from seed_reward_receipts r where r.player_id = $1 and ${PLAYER_OF_NOT_TEST('r.player_id')}`,
          [id],
        ),
        pool.query(
          `select coalesce(r.denial, 'awarded') as value, count(*)::int as n from seed_reward_receipts r
            where r.player_id = $1 and ${PLAYER_OF_NOT_TEST('r.player_id')} group by 1 order by n desc limit 20`,
          [id],
        ),
        pool.query(
          `select c.cell_id, c.claimed_at from world_claims c where c.owner_id = $1 and ${PLAYER_OF_NOT_TEST('c.owner_id')}
            order by c.claimed_at desc limit 10`,
          [id],
        ),
      ]);
      const tileCount = await pool.query(
        `select count(*)::int as n from world_claims c where c.owner_id = $1 and ${PLAYER_OF_NOT_TEST('c.owner_id')}`,
        [id],
      );

      const rows = matchesOf.rows;
      const finished = rows.filter((r) => str(r.status) === 'finished');
      const outcomeOf = (r: Record<string, unknown>): 'win' | 'loss' | 'draw' | null => {
        if (str(r.status) !== 'finished') return null;
        const result = json<{ winner?: number | null } | null>(r.result, null);
        if (!result) return null;
        if (result.winner === null || result.winner === undefined) return 'draw';
        return result.winner === num(r.seat) ? 'win' : 'loss';
      };
      const player: AdminPlayerRow = {
        id,
        tag: playerTag(id),
        kind: str(row.kind) === 'account' ? 'account' : 'guest',
        displayName: nstr(row.display_name),
        createdAt: num(row.created_at),
        upgradedAt: nnum(row.upgraded_at),
        providers: providers.rows.map((p) => str(p.provider)),
      };
      const result: AdminPlayerResult = {
        player,
        matchedBy,
        matches: {
          total: rows.length,
          finished: finished.length,
          wins: finished.filter((r) => outcomeOf(r) === 'win').length,
          losses: finished.filter((r) => outcomeOf(r) === 'loss').length,
          draws: finished.filter((r) => outcomeOf(r) === 'draw').length,
          recent: rows.slice(0, 10).map((r) => ({
            id: str(r.id),
            mode: modeOf(r),
            status: str(r.status),
            createdAt: num(r.created_at),
            finishedAt: nnum(r.finished_at),
            outcome: outcomeOf(r),
            opponentName: nstr(r.opponent_name),
          })),
        },
        wallet: wallet.rows[0]
          ? { balance: num(wallet.rows[0].balance), lifetimeEarned: num(wallet.rows[0].lifetime_earned), lifetimeSpent: num(wallet.rows[0].lifetime_spent) }
          : { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
        ledger: ledger.rows.map((l) => ({
          id: str(l.id),
          playerId: str(l.player_id),
          playerName: nstr(l.player_name),
          delta: num(l.delta),
          balanceAfter: num(l.balance_after),
          category: str(l.category),
          sourceKey: str(l.source_key),
          createdAt: num(l.created_at),
        })),
        rewards: {
          awarded: num(rewards.rows[0]?.awarded),
          denied: num(rewards.rows[0]?.denied),
          deniedByReason: denied.rows.map((d) => ({ value: str(d.value), n: num(d.n) })),
        },
        tiles: { total: num(tileCount.rows[0]?.n), recent: tiles.rows.map((t) => ({ cellId: str(t.cell_id), claimedAt: num(t.claimed_at) })) },
        tagScanLimit,
      };
      return result;
    },

    async matches(filter) {
      const limit = clampLimit(filter.limit);
      const clauses: string[] = [MATCH_VISIBLE('m')];
      const values: unknown[] = [];
      const add = (value: unknown): string => {
        values.push(value);
        return `$${values.length}`;
      };
      if (filter.mode === 'live') clauses.push('m.live_since is not null');
      else if (filter.mode === 'queue') clauses.push('m.live_since is null and m.open_queue');
      else if (filter.mode === 'friend') clauses.push('m.live_since is null and not m.open_queue');
      if (filter.status) clauses.push(`m.status = ${add(filter.status)}`);
      if (filter.playerId) clauses.push(`exists (select 1 from match_participants p where p.match_id = m.id and p.player_id = ${add(filter.playerId)})`);
      if (filter.since !== undefined) clauses.push(`m.created_at >= ${add(filter.since)}`);
      if (filter.until !== undefined) clauses.push(`m.created_at <= ${add(filter.until)}`);
      const cursor = decodeCursor(filter.cursor);
      if (cursor) {
        const at = add(cursor.at);
        const id = add(cursor.id);
        clauses.push(`(m.created_at < ${at} or (m.created_at = ${at} and m.id < ${id}))`);
      }
      const where = clauses.length ? ` where ${clauses.join(' and ')}` : '';
      const [rows, total] = await Promise.all([
        pool.query(`${MATCH_SELECT}${where} order by m.created_at desc, m.id desc limit ${limit}`, values),
        pool.query(`select count(*)::int as n from matches m${where}`, values),
      ]);
      const mapped = rows.rows.map(showMatch);
      return page(mapped, num(total.rows[0]?.n), limit, (row) => ({ at: row.createdAt, id: row.id }));
    },

    async matchDetail(id, moveLimit) {
      const [found, moves] = await Promise.all([
        // A marked match is not just hidden from the list: its detail page 404s, so a stale bookmark
        // or a guessed id cannot surface test data either.
        pool.query(`${MATCH_SELECT} where m.id = $1 and ${MATCH_VISIBLE('m')}`, [id]),
        pool.query(
          `select revision, seat, player_id, action->>'type' as action_type, created_at,
                  coalesce(jsonb_array_length(events), 0) as events
             from match_moves where match_id = $1 order by revision asc limit ${clampLimit(moveLimit, 200)}`,
          [id],
        ),
      ]);
      if (!found.rows[0]) return null;
      const match = showMatch(found.rows[0]);
      const detail: AdminMatchDetail = {
        match,
        // A textual timeline only: the action NAME, the seat and the time. The raw `events` payload
        // is deliberately never returned — it is the unfiltered server-side record (it can contain
        // the opponent's hidden draw), so this endpoint reports how many events a move had, never
        // what they were.
        moves: moves.rows.map((row) => ({
          revision: num(row.revision),
          seat: num(row.seat),
          playerId: str(row.player_id),
          action: nstr(row.action_type) ?? '(unknown)',
          createdAt: num(row.created_at),
          events: num(row.events),
        })),
        truncated: moves.rows.length >= clampLimit(moveLimit, 200),
      };
      return detail;
    },

    async ledger(filter) {
      const limit = clampLimit(filter.limit);
      const clauses: string[] = [PLAYER_OF_NOT_TEST('l.player_id')];
      const values: unknown[] = [];
      const add = (value: unknown): string => {
        values.push(value);
        return `$${values.length}`;
      };
      if (filter.playerId) clauses.push(`l.player_id = ${add(filter.playerId)}`);
      if (filter.category) clauses.push(`l.category = ${add(filter.category)}`);
      if (filter.since !== undefined) clauses.push(`l.created_at >= ${add(filter.since)}`);
      if (filter.until !== undefined) clauses.push(`l.created_at <= ${add(filter.until)}`);
      const cursor = decodeCursor(filter.cursor);
      if (cursor) {
        const at = add(cursor.at);
        const id = add(cursor.id);
        clauses.push(`(l.created_at < ${at} or (l.created_at = ${at} and l.id < ${id}))`);
      }
      const where = clauses.length ? ` where ${clauses.join(' and ')}` : '';
      const [rows, total] = await Promise.all([
        pool.query(
          `select l.id, l.player_id, l.delta, l.balance_after, l.category, l.source_key, l.created_at, p.display_name as player_name
             from seed_ledger l left join players p on p.id = l.player_id${where}
            order by l.created_at desc, l.id desc limit ${limit}`,
          values,
        ),
        pool.query(`select count(*)::int as n from seed_ledger l${where}`, values),
      ]);
      const mapped: AdminLedgerRow[] = rows.rows.map((row) => ({
        id: str(row.id),
        playerId: str(row.player_id),
        playerName: nstr(row.player_name),
        delta: num(row.delta),
        balanceAfter: num(row.balance_after),
        category: str(row.category),
        sourceKey: str(row.source_key),
        createdAt: num(row.created_at),
      }));
      return page(mapped, num(total.rows[0]?.n), limit, (row) => ({ at: row.createdAt, id: row.id }));
    },

    async world(now) {
      // SEQUENTIAL on purpose. Through the deployed Edge runtime (postgres.js against the
      // transaction pooler) issuing this particular six-query batch in PARALLEL hangs the request
      // until the platform's 150s idle timeout. It was reproduced with the PRE-filter SQL as well,
      // so it is a pre-existing runtime quirk, not the test filter — and one query at a time always
      // answers (~1.5s). Same rows, same order, no pipelining.
      const meta = await pool.query('select revision from world_meta where version = $1', [WORLD_VERSION]);
      const total = await pool.query(`select count(*)::int as n from world_claims c where ${PLAYER_OF_NOT_TEST('c.owner_id')}`);
      const owners = await pool.query(`select count(distinct c.owner_id)::int as n from world_claims c where ${PLAYER_OF_NOT_TEST('c.owner_id')}`);
      const byDay = await pool.query(
        `select floor(c.claimed_at / ${DAY_MS})::bigint * ${DAY_MS} as day_ms, count(*)::int as n
           from world_claims c where c.claimed_at >= $1 and ${PLAYER_OF_NOT_TEST('c.owner_id')}
          group by 1 order by 1 limit 400`,
        [now - 90 * DAY_MS],
      );
      const recent = await pool.query(
        `select c.cell_id, c.owner_id, c.claimed_at, c.source, p.display_name as owner_name
           from world_claims c left join players p on p.id = c.owner_id
          where ${PLAYER_OF_NOT_TEST('c.owner_id')}
          order by c.claimed_at desc limit 20`,
      );
      // Bounded by design: the world is 275 hexes (v2), so every claim fits in one page. The limit
      // is a guard against a future expansion, not a silent truncation.
      const all = await pool.query(
        `select c.cell_id, c.owner_id, c.claimed_at from world_claims c
          where ${PLAYER_OF_NOT_TEST('c.owner_id')} order by c.claimed_at asc, c.cell_id asc limit 400`,
      );
      const dayIndex = new Map(byDay.rows.map((r) => [utcDay(num(r.day_ms)), num(r.n)]));
      const days = lastDays(now, 30);
      const byDayIndex = new Map<string, { cellId: string; ownerId: string; claimedAt: number }[]>();
      for (const row of all.rows) {
        const day = utcDay(num(row.claimed_at));
        const list = byDayIndex.get(day) ?? [];
        list.push({ cellId: str(row.cell_id), ownerId: str(row.owner_id), claimedAt: num(row.claimed_at) });
        byDayIndex.set(day, list);
      }
      const replayDays = [...new Set(all.rows.map((row) => utcDay(num(row.claimed_at))))].sort();
      return {
        serverNow: now,
        revision: num(meta.rows[0]?.revision),
        cellsTotal: WORLD_CELLS.length,
        cellIds: WORLD_CELLS.map((cell) => cell.id),
        totalClaims: num(total.rows[0]?.n),
        owners: num(owners.rows[0]?.n),
        claimsByDay: days.map((day) => ({ day, n: dayIndex.get(day) ?? 0 })),
        recentClaims: recent.rows.map((row) => ({
          cellId: str(row.cell_id),
          ownerId: str(row.owner_id),
          ownerName: nstr(row.owner_name),
          claimedAt: num(row.claimed_at),
          source: str(row.source),
        })),
        claimsByDayIndex: replayDays.map((day) => ({ day, claims: byDayIndex.get(day) ?? [] })),
        replayDays,
      };
    },

    async campaign() {
      // Both queries read RECORDED settlement rows only. The level id stays an opaque string; the
      // numeric level comes from the ledger's own `metadata.campaignLevel`, which the award path
      // wrote at the time it resolved the level (the Seeds store's `settle`).
      const [receipts, paid] = await Promise.all([
        pool.query(
          `select r.source_key, r.awarded, r.denial, r.utc_day from seed_reward_receipts r
            where r.mode = 'campaign' and ${PLAYER_OF_NOT_TEST('r.player_id')} order by r.created_at asc limit 5000`,
        ),
        pool.query(
          `select l.source_key, (l.metadata->>'campaignLevel') as level from seed_ledger l
            where l.category = 'campaign' and ${PLAYER_OF_NOT_TEST('l.player_id')} limit 5000`,
        ),
      ]);
      return shapeCampaign(
        receipts.rows.map((row) => ({
          sourceKey: str(row.source_key),
          awarded: num(row.awarded),
          denial: nstr(row.denial),
          utcDay: str(row.utc_day),
        })),
        paid.rows.map((row) => ({ sourceKey: str(row.source_key), level: nnum(row.level) })),
      );
    },
    async players(now) {
      // One row per visible player, newest first, bounded. Every sub-read is keyed by the player id
      // (indexed on each table) and never touches match_moves or matches.state. Campaign levels are
      // parsed from the recorded `campaign:c<chapter>-<level>` key, exactly as the world map does.
      const { rows } = await pool.query(
        `select p.id, p.display_name, p.kind, p.created_at, p.presence_at,
                exists (select 1 from player_identities i where i.player_id = p.id) as google,
                mm.played, mm.finished, mm.wins, mm.last_at as match_last_at, mm.last_status as match_last_status,
                cp.highest as campaign_highest, cp.clears as campaign_clears, cp.last_at as campaign_last_at, cp.last_level as campaign_last_level,
                (select count(*)::int from feedback_reports f where f.player_id = p.id) as reports,
                (select max(f.created_at) from feedback_reports f where f.player_id = p.id) as report_last_at,
                (select count(*)::int from world_claims c where c.owner_id = p.id) as tiles,
                (select max(c.claimed_at) from world_claims c where c.owner_id = p.id) as tile_last_at,
                coalesce((select w.balance from seed_wallets w where w.player_id = p.id), 0) as seeds
           from players p
           left join lateral (
             select count(*)::int as played,
                    count(*) filter (where m.status = 'finished')::int as finished,
                    count(*) filter (where m.status = 'finished' and m.result->>'winner' = mp.seat::text)::int as wins,
                    max(m.updated_at) as last_at,
                    (array_agg(m.status order by m.updated_at desc))[1] as last_status
               from match_participants mp join matches m on m.id = mp.match_id
              where mp.player_id = p.id and ${MATCH_VISIBLE('m')}
           ) mm on true
           left join lateral (
             select max((substring(r.source_key from '^campaign:c[0-9]+-([0-9]+)$'))::int) as highest,
                    count(*) filter (where r.awarded > 0)::int as clears,
                    max(r.created_at) as last_at,
                    (array_agg((substring(r.source_key from '^campaign:c[0-9]+-([0-9]+)$'))::int order by r.created_at desc))[1] as last_level
               from seed_reward_receipts r
              where r.player_id = p.id and r.mode = 'campaign'
           ) cp on true
          where ${NOT_TEST('p')}
          order by p.created_at desc
          limit ${PLAYERS_LIMIT * 5}`,
      );
      return shapePlayers(
        rows.map((row) => ({
          id: str(row.id),
          displayName: nstr(row.display_name),
          kind: str(row.kind) === 'account' ? ('account' as const) : ('guest' as const),
          createdAt: num(row.created_at),
          google: row.google === true,
          presenceAt: nnum(row.presence_at),
          matches: {
            played: num(row.played),
            finished: num(row.finished),
            wins: num(row.wins),
            lastAt: nnum(row.match_last_at),
            lastStatus: nstr(row.match_last_status),
          },
          campaign: {
            highest: nnum(row.campaign_highest),
            clears: num(row.campaign_clears),
            lastAt: nnum(row.campaign_last_at),
            lastLevel: nnum(row.campaign_last_level),
          },
          reports: { count: num(row.reports), lastAt: nnum(row.report_last_at) },
          tiles: { count: num(row.tiles), lastAt: nnum(row.tile_last_at) },
          seeds: num(row.seeds),
        })),
        now,
        PLAYERS_LIMIT,
      );
    },
  };
};
