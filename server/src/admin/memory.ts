// The in-memory admin data source: local dev servers and tests. It answers every question the
// Postgres store answers, from the in-memory stores the dev server already builds, so the dashboard
// can be exercised end to end without touching a real database.
//
// It reads the same fields the Postgres store reads and returns the same shapes. Where Postgres has
// a column the in-memory store does not keep, the difference is stated at that line rather than
// faked (there is one: a world claim's `source`).
import { playerTag } from '../../../src/player-tag.js';
import { WORLD_CELLS } from '../world.js';
import { SEED_ECONOMY } from '../seeds/config.js';
import { shapeCampaign } from './campaign.js';
import type { MatchRecord, PlayerRecord } from '../storage/types.js';
import type { MemoryStorage } from '../storage/memory.js';
import type { MemoryFeedbackStore } from '../feedback/feedback.js';
import type { MemoryWorldEconomyStore } from '../seeds/memory.js';
import type { MemoryIdentityLinkStore } from '../accounts/accounts.js';
import type {
  AdminAuditEntry,
  AdminBuildRow,
  AdminMatchDetail,
  AdminMatchRow,
  AdminOverview,
  AdminPlayerRow,
  AdminReportRow,
  AdminStore,
} from './types.js';
import { TAG_SCAN_LIMIT, normalizeBuild } from './types.js';
import { DAY_MS, clampLimit, decodeCursor, lastDays, pageOf, str, utcDay } from './util.js';

export type MemoryAdminSources = {
  storage: MemoryStorage;
  feedback?: MemoryFeedbackStore | null;
  economy?: MemoryWorldEconomyStore | null;
  links?: MemoryIdentityLinkStore | null;
};

type SeenRow = { adminPlayerId: string; seenAt: number };
type TriageRow = { reportId: string; status: 'new' | 'reviewing' | 'resolved'; note: string; updatedAt: number; updatedBy: string };

/**
 * The in-memory equivalent of the SQL mode expression. The SQL store reads `live_since` /
 * `open_queue` from the row; here the same facts are the `MatchRecord` fields.
 */
const modeOf = (match: MatchRecord): 'queue' | 'friend' | 'live' =>
  match.liveManaged === true ? 'live' : match.openQueue ? 'queue' : 'friend';

export const memoryAdminStore = (sources: MemoryAdminSources): AdminStore => {
  const seen = new Map<string, SeenRow>();
  const triage = new Map<string, TriageRow>();
  const auditRows: AdminAuditEntry[] = [];

  const players = (): PlayerRecord[] => sources.storage.allPlayers();
  const matches = (): MatchRecord[] => sources.storage.allMatches();
  const feedbackRows = () => sources.feedback?.rows ?? [];
  const economy = () => sources.economy ?? null;
  const walletOf = (playerId: string) => {
    const store = economy();
    const wallet = store?.wallets.get(playerId);
    return {
      balance: wallet?.balance ?? 0,
      lifetimeEarned: wallet?.lifetimeEarned ?? 0,
      lifetimeSpent: wallet?.lifetimeSpent ?? 0,
    };
  };
  const participantRows = async (matchId: string) => {
    const list = await sources.storage.participantsOf(matchId);
    return list.map((p) => {
      const player = players().find((candidate) => candidate.id === p.playerId);
      return { seat: p.seat, playerId: p.playerId, name: player?.displayName ?? null };
    });
  };
  const matchRow = async (match: MatchRecord): Promise<AdminMatchRow> => ({
    id: match.id,
    mode: modeOf(match),
    status: match.status,
    rulesVersion: match.rulesVersion,
    revision: match.revision,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    finishedAt: match.finishedAt,
    turnDeadlineAt: match.turnDeadlineAt,
    finishReason: match.result?.reason ?? null,
    winnerSeat: match.result ? match.result.winner : null,
    players: await participantRows(match.id),
    moveCount: (await sources.storage.movesOf(match.id, 0)).length,
  });

  const reportRow = (row: { id: string; createdAt: number; kind: 'report' | 'crash'; playerId: string | null; message: string; context: Record<string, unknown>; build: string | null; userAgent: string | null }): AdminReportRow => {
    const state = triage.get(row.id);
    const name = row.playerId ? (players().find((p) => p.id === row.playerId)?.displayName ?? null) : null;
    return {
      id: row.id,
      createdAt: row.createdAt,
      kind: row.kind,
      playerId: row.playerId,
      playerName: name,
      playerTag: row.playerId ? playerTag(row.playerId) : null,
      message: row.message,
      context: row.context,
      build: row.build,
      buildKey: normalizeBuild(row.build).key,
      userAgent: row.userAgent,
      status: state?.status ?? 'new',
      note: state?.note ?? '',
      triagedAt: state?.updatedAt ?? null,
      triagedBy: state?.updatedBy ?? null,
    };
  };

  return {
    async readSeen(adminId) {
      return seen.get(adminId)?.seenAt ?? null;
    },
    async writeSeen(adminId, at) {
      const previous = seen.get(adminId)?.seenAt ?? 0;
      seen.set(adminId, { adminPlayerId: adminId, seenAt: Math.max(previous, at) });
    },
    async countsSince(since) {
      return {
        reports: feedbackRows().filter((r) => r.createdAt > since && r.kind === 'report').length,
        crashes: feedbackRows().filter((r) => r.createdAt > since && r.kind === 'crash').length,
        claims: [...(economy()?.claims.values() ?? [])].filter((c) => c.claimedAt > since).length,
        matches: matches().filter((m) => m.createdAt > since).length,
      };
    },

    async overview(now) {
      const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
      const weekAgo = now - 7 * DAY_MS;
      const all = matches();
      const finished = all.filter((m) => m.status === 'finished' && m.finishedAt !== null);
      const count = (rows: MatchRecord[], mode: 'queue' | 'friend' | 'live') => rows.filter((m) => modeOf(m) === mode).length;
      const last7 = finished.filter((m) => (m.finishedAt ?? 0) >= weekAgo);
      const today = last7.filter((m) => (m.finishedAt ?? 0) >= todayStart);
      const days = lastDays(now, 7);
      const reports = feedbackRows();
      const seedRows = economy()?.ledger ?? [];
      const claims = [...(economy()?.claims.values() ?? [])];

      const merged = new Map<string, AdminBuildRow>();
      for (const row of reports.filter((r) => r.createdAt >= weekAgo)) {
        const parsed = normalizeBuild(row.build);
        const existing = merged.get(parsed.key) ?? { ...parsed, crashes: 0, reports: 0, total: 0 };
        if (row.kind === 'crash') existing.crashes += 1;
        else existing.reports += 1;
        existing.total += 1;
        merged.set(parsed.key, existing);
      }

      const overview: AdminOverview = {
        serverNow: now,
        rulesVersion: '',
        matches: {
          finishedToday: { total: today.length, byMode: { queue: count(today, 'queue'), friend: count(today, 'friend'), live: count(today, 'live') } },
          finished7d: { total: last7.length, byMode: { queue: count(last7, 'queue'), friend: count(last7, 'friend'), live: count(last7, 'live') } },
          byStatus: {
            waiting: all.filter((m) => m.status === 'waiting').length,
            active: all.filter((m) => m.status === 'active').length,
            finished: all.filter((m) => m.status === 'finished').length,
          },
          finishedByDay: days.map((day) => {
            const rows = last7.filter((m) => utcDay(m.finishedAt ?? 0) === day);
            return { day, queue: count(rows, 'queue'), friend: count(rows, 'friend'), live: count(rows, 'live') };
          }),
        },
        reports: {
          today: reports.filter((r) => r.createdAt >= todayStart).length,
          last7d: reports.filter((r) => r.createdAt >= weekAgo).length,
          crashes7d: reports.filter((r) => r.createdAt >= weekAgo && r.kind === 'crash').length,
          reports7d: reports.filter((r) => r.createdAt >= weekAgo && r.kind === 'report').length,
          byBuild: [...merged.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)).slice(0, 50),
        },
        seeds: {
          earned7d: seedRows.filter((l) => l.createdAt >= weekAgo && l.delta > 0).reduce((n, l) => n + l.delta, 0),
          spent7d: seedRows.filter((l) => l.createdAt >= weekAgo && l.delta < 0).reduce((n, l) => n - l.delta, 0),
          byDay: days.map((day) => ({
            day,
            earned: seedRows.filter((l) => utcDay(l.createdAt) === day && l.delta > 0).reduce((n, l) => n + l.delta, 0),
            spent: seedRows.filter((l) => utcDay(l.createdAt) === day && l.delta < 0).reduce((n, l) => n - l.delta, 0),
          })),
        },
        world: {
          totalClaims: claims.length,
          claims7d: claims.filter((c) => c.claimedAt >= weekAgo).length,
          cellsTotal: WORLD_CELLS.length,
          owners: new Set(claims.map((c) => c.ownerId)).size,
        },
        health: { dbOk: true, dbMs: null },
      };
      return overview;
    },

    async reports(filter) {
      const limit = clampLimit(filter.limit);
      let rows = feedbackRows().map(reportRow);
      if (filter.kind) rows = rows.filter((r) => r.kind === filter.kind);
      if (filter.status) rows = rows.filter((r) => r.status === filter.status);
      if (filter.build) rows = rows.filter((r) => r.buildKey === filter.build);
      if (filter.since !== undefined) rows = rows.filter((r) => r.createdAt >= filter.since!);
      if (filter.until !== undefined) rows = rows.filter((r) => r.createdAt <= filter.until!);
      rows.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
      const total = rows.length;
      const cursor = decodeCursor(filter.cursor);
      if (cursor) {
        rows = rows.filter((r) => r.createdAt < cursor.at || (r.createdAt === cursor.at && r.id < cursor.id));
      }
      return pageOf(rows.slice(0, limit), total, limit, (row) => ({ at: row.createdAt, id: row.id }));
    },

    async triage(input) {
      const exists = feedbackRows().some((r) => r.id === input.reportId);
      if (!exists) return null;
      const previous = triage.get(input.reportId)?.status ?? null;
      triage.set(input.reportId, {
        reportId: input.reportId,
        status: input.status,
        note: input.note,
        updatedAt: input.now,
        updatedBy: input.actorId,
      });
      return { changed: previous !== input.status, previous };
    },

    async audit(entry) {
      auditRows.push({ ...entry });
    },

    async stuck(now, windows) {
      const all = matches();
      const participantCounts = new Map<string, number>();
      for (const match of all) participantCounts.set(match.id, (await sources.storage.participantsOf(match.id)).length);
      const dueOf = (m: MatchRecord) => (m.status === 'active' ? m.turnDeadlineAt : m.expiresAt);
      const expired = all
        .filter((m) => (m.status === 'active' || m.status === 'waiting') && dueOf(m) !== null && (dueOf(m) as number) < now)
        .sort((a, b) => (dueOf(a) as number) - (dueOf(b) as number));
      const toRows = (list: MatchRecord[]) =>
        list.slice(0, 20).map((m) => ({
          id: m.id,
          status: m.status,
          mode: modeOf(m),
          createdAt: m.createdAt,
          dueAt: dueOf(m),
          seats: participantCounts.get(m.id) ?? 0,
        }));
      const activeList = expired.filter((m) => m.status === 'active');
      const waitingList = expired.filter((m) => m.status === 'waiting');
      const seededPlayers = new Set([
        ...(economy()?.wallets.keys() ?? []),
        ...(economy()?.ledger ?? []).map((l) => l.playerId),
        ...[...(economy()?.receipts.values() ?? [])].map((r) => r.input.playerId),
        ...[...(economy()?.claims.values() ?? [])].map((c) => c.ownerId),
      ]);
      const cleanup = players().filter(
        (p) => p.kind === 'guest' && p.createdAt < now - windows.guestMaxAgeMs && !seededPlayers.has(p.id),
      );
      return {
        expiredActive: { count: activeList.length, oldest: activeList[0] ? dueOf(activeList[0]) : null, rows: toRows(activeList) },
        expiredWaiting: { count: waitingList.length, oldest: waitingList[0] ? dueOf(waitingList[0]) : null, rows: toRows(waitingList) },
        cleanupEligibleGuests: { count: cleanup.length, oldest: cleanup.length ? Math.min(...cleanup.map((p) => p.createdAt)) : null },
        windows,
      };
    },

    async rulesVersionCounts() {
      const counts = new Map<string, number>();
      for (const match of matches()) counts.set(match.rulesVersion, (counts.get(match.rulesVersion) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n }));
    },

    async funnel(now) {
      const days = lastDays(now, 30);
      const byDay = new Map<string, { guests: number; accounts: number }>();
      for (const player of players()) {
        const day = utcDay(player.createdAt);
        const entry = byDay.get(day) ?? { guests: 0, accounts: 0 };
        if (player.kind === 'account') entry.accounts += 1;
        else entry.guests += 1;
        byDay.set(day, entry);
      }
      const linkDays = new Map<string, number>();
      for (const link of sources.links?.rows ?? []) linkDays.set(utcDay(link.createdAt), (linkDays.get(utcDay(link.createdAt)) ?? 0) + 1);
      const all = players();
      const accounts = all.filter((p) => p.kind === 'account');
      return {
        serverNow: now,
        playersCreatedByDay: days.map((day) => ({ day, guests: byDay.get(day)?.guests ?? 0, accounts: byDay.get(day)?.accounts ?? 0 })),
        accountsLinkedByDay: days.map((day) => ({ day, n: linkDays.get(day) ?? 0 })),
        totals: {
          players: all.length,
          guests: all.length - accounts.length,
          accounts: accounts.length,
          withUpgradedAt: accounts.filter((p) => p.upgradedAt !== null).length,
        },
        upgradedAtMayBeUnpopulated: all.some((p) => p.upgradedAt === null),
      };
    },

    async economy(now) {
      const store = economy();
      const wallets = [...(store?.wallets.values() ?? [])];
      const byCategory = new Map<string, { entries: number; minted: number; spent: number; net: number }>();
      for (const row of store?.ledger ?? []) {
        const entry = byCategory.get(row.category) ?? { entries: 0, minted: 0, spent: 0, net: 0 };
        entry.entries += 1;
        if (row.delta > 0) entry.minted += row.delta;
        else entry.spent += -row.delta;
        entry.net += row.delta;
        byCategory.set(row.category, entry);
      }
      const receipts = [...(store?.receipts.values() ?? [])];
      const tally = (values: string[]) => {
        const counts = new Map<string, number>();
        for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n }));
      };
      const earned = wallets.reduce((n, w) => n + w.lifetimeEarned, 0);
      const spent = wallets.reduce((n, w) => n + w.lifetimeSpent, 0);
      return {
        serverNow: now,
        totals: { wallets: wallets.length, balance: wallets.reduce((n, w) => n + w.balance, 0), lifetimeEarned: earned, lifetimeSpent: spent },
        byCategory: [...byCategory.entries()].map(([category, entry]) => ({ category, ...entry })),
        receipts: {
          awarded: receipts.filter((r) => r.awarded > 0).length,
          denied: receipts.filter((r) => r.awarded === 0).length,
          byDenial: tally(receipts.map((r) => r.reason ?? 'awarded')),
          byMode: tally(receipts.map((r) => r.input.mode)),
        },
        inflationRatio: spent > 0 ? earned / spent : null,
        caps: {
          tileCost: SEED_ECONOMY.tileCost,
          utcDailyRepeatableCap: SEED_ECONOMY.utcDailyRepeatableCap,
          economies: Object.entries(SEED_ECONOMY.online).map(
            ([mode, rules]) => `${mode}: win ${rules.win} / loss ${rules.loss} / draw ${rules.draw}, ${rules.dailyMatches}/day`,
          ),
        },
      };
    },

    async playerLookup(query) {
      const all = players();
      let player: PlayerRecord | null = null;
      let matchedBy: 'id' | 'name' | 'tag' = 'id';
      let tagScanLimit: number | null = null;
      if (query.id) player = all.find((p) => p.id === query.id) ?? null;
      else if (query.tag) {
        tagScanLimit = TAG_SCAN_LIMIT;
        matchedBy = 'tag';
        player = [...all].sort((a, b) => b.createdAt - a.createdAt).slice(0, TAG_SCAN_LIMIT).find((p) => playerTag(p.id) === query.tag) ?? null;
      } else if (query.name) {
        matchedBy = 'name';
        player = all.filter((p) => p.displayName === query.name).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
      }
      if (!player) return null;
      const id = player.id;
      const withSeat: { match: MatchRecord; seat: number }[] = [];
      for (const match of matches()) {
        const seat = (await sources.storage.participantsOf(match.id)).find((p) => p.playerId === id)?.seat;
        if (seat !== undefined) withSeat.push({ match, seat });
      }
      withSeat.sort((a, b) => b.match.createdAt - a.match.createdAt);
      const outcomeOf = (row: { match: MatchRecord; seat: number }): 'win' | 'loss' | 'draw' | null => {
        if (row.match.status !== 'finished' || !row.match.result) return null;
        if (row.match.result.winner === null) return 'draw';
        return row.match.result.winner === row.seat ? 'win' : 'loss';
      };
      const finished = withSeat.filter((row) => row.match.status === 'finished');
      const ledger = (economy()?.ledger ?? [])
        .filter((row) => row.playerId === id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
        .map((row) => ({
          id: row.id,
          playerId: row.playerId,
          playerName: player?.displayName ?? null,
          delta: row.delta,
          balanceAfter: row.balanceAfter,
          category: row.category,
          sourceKey: row.sourceKey,
          createdAt: row.createdAt,
        }));
      const receipts = [...(economy()?.receipts.values() ?? [])].filter((r) => r.input.playerId === id);
      const denied = new Map<string, number>();
      for (const receipt of receipts) {
        const key = receipt.reason ?? 'awarded';
        denied.set(key, (denied.get(key) ?? 0) + 1);
      }
      const claims = [...(economy()?.claims.values() ?? [])].filter((c) => c.ownerId === id);
      const identities = (sources.links?.rows ?? []).filter((link) => link.playerId === id);
      const row: AdminPlayerRow = {
        id,
        tag: playerTag(id),
        kind: player.kind,
        displayName: player.displayName,
        createdAt: player.createdAt,
        upgradedAt: player.upgradedAt,
        providers: identities.map((link) => link.provider),
      };
      return {
        player: row,
        matchedBy,
        matches: {
          total: withSeat.length,
          finished: finished.length,
          wins: finished.filter((r) => outcomeOf(r) === 'win').length,
          losses: finished.filter((r) => outcomeOf(r) === 'loss').length,
          draws: finished.filter((r) => outcomeOf(r) === 'draw').length,
          recent: await Promise.all(
            withSeat.slice(0, 10).map(async ({ match, seat }) => {
              const opponent = (await participantRows(match.id)).find((p) => p.seat !== seat);
              return {
                id: match.id,
                mode: modeOf(match),
                status: match.status,
                createdAt: match.createdAt,
                finishedAt: match.finishedAt,
                outcome: match.status === 'finished' && match.result ? (match.result.winner === null ? 'draw' : match.result.winner === seat ? 'win' : 'loss') : null,
                opponentName: opponent?.name ?? null,
              };
            }),
          ),
        },
        wallet: walletOf(id),
        ledger,
        rewards: {
          awarded: receipts.filter((r) => r.awarded > 0).length,
          denied: receipts.filter((r) => r.awarded === 0).length,
          deniedByReason: [...denied.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })),
        },
        tiles: {
          total: claims.length,
          recent: claims.sort((a, b) => b.claimedAt - a.claimedAt).slice(0, 10).map((c) => ({ cellId: c.cellId, claimedAt: c.claimedAt })),
        },
        tagScanLimit,
      };
    },

    async matches(filter) {
      const limit = clampLimit(filter.limit);
      const all = matches();
      let rows = [...all];
      if (filter.mode) rows = rows.filter((m) => modeOf(m) === filter.mode);
      if (filter.status) rows = rows.filter((m) => m.status === filter.status);
      if (filter.since !== undefined) rows = rows.filter((m) => m.createdAt >= filter.since!);
      if (filter.until !== undefined) rows = rows.filter((m) => m.createdAt <= filter.until!);
      if (filter.playerId) {
        const wanted = filter.playerId;
        const participants = await Promise.all(rows.map(async (m) => ((await sources.storage.participantsOf(m.id)).some((p) => p.playerId === wanted) ? m : null)));
        rows = participants.filter((m): m is MatchRecord => m !== null);
      }
      rows.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
      const total = rows.length;
      const cursor = decodeCursor(filter.cursor);
      if (cursor) rows = rows.filter((m) => m.createdAt < cursor.at || (m.createdAt === cursor.at && m.id < cursor.id));
      const page = await Promise.all(rows.slice(0, limit).map(matchRow));
      return pageOf(page, total, limit, (row) => ({ at: row.createdAt, id: row.id }));
    },

    async matchDetail(id, moveLimit) {
      const match = await sources.storage.matchById(id);
      if (!match) return null;
      const limit = clampLimit(moveLimit, 200);
      const moves = await sources.storage.movesOf(id, 0);
      const detail: AdminMatchDetail = {
        match: await matchRow(match),
        moves: moves.slice(0, limit).map((move) => ({
          revision: move.revision,
          seat: move.seat,
          playerId: move.playerId,
          action: str((move.action as { type?: unknown }).type ?? '(unknown)'),
          createdAt: move.createdAt,
          events: move.events.length,
        })),
        truncated: moves.length > limit,
      };
      return detail;
    },

    async ledger(filter) {
      const limit = clampLimit(filter.limit);
      const names = new Map(players().map((p) => [p.id, p.displayName]));
      let rows = (economy()?.ledger ?? []).map((row) => ({
        id: row.id,
        playerId: row.playerId,
        playerName: names.get(row.playerId) ?? null,
        delta: row.delta,
        balanceAfter: row.balanceAfter,
        category: row.category,
        sourceKey: row.sourceKey,
        createdAt: row.createdAt,
      }));
      if (filter.playerId) rows = rows.filter((r) => r.playerId === filter.playerId);
      if (filter.category) rows = rows.filter((r) => r.category === filter.category);
      if (filter.since !== undefined) rows = rows.filter((r) => r.createdAt >= filter.since!);
      if (filter.until !== undefined) rows = rows.filter((r) => r.createdAt <= filter.until!);
      rows.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
      const total = rows.length;
      const cursor = decodeCursor(filter.cursor);
      if (cursor) rows = rows.filter((r) => r.createdAt < cursor.at || (r.createdAt === cursor.at && r.id < cursor.id));
      return pageOf(rows.slice(0, limit), total, limit, (row) => ({ at: row.createdAt, id: row.id }));
    },

    async world(now) {
      const store = economy();
      const claims = [...(store?.claims.values() ?? [])].sort((a, b) => a.claimedAt - b.claimedAt || a.cellId.localeCompare(b.cellId));
      const names = new Map(players().map((p) => [p.id, p.displayName]));
      const byDay = new Map<string, { cellId: string; ownerId: string; claimedAt: number }[]>();
      for (const claim of claims) {
        const day = utcDay(claim.claimedAt);
        const list = byDay.get(day) ?? [];
        list.push({ cellId: claim.cellId, ownerId: claim.ownerId, claimedAt: claim.claimedAt });
        byDay.set(day, list);
      }
      const days = lastDays(now, 30);
      return {
        serverNow: now,
        revision: store?.revision ?? 0,
        cellsTotal: WORLD_CELLS.length,
        cellIds: WORLD_CELLS.map((cell) => cell.id),
        totalClaims: claims.length,
        owners: new Set(claims.map((c) => c.ownerId)).size,
        claimsByDay: days.map((day) => ({ day, n: byDay.get(day)?.length ?? 0 })),
        recentClaims: [...claims]
          .sort((a, b) => b.claimedAt - a.claimedAt)
          .slice(0, 20)
          .map((claim) => ({
            cellId: claim.cellId,
            ownerId: claim.ownerId,
            ownerName: names.get(claim.ownerId) ?? null,
            claimedAt: claim.claimedAt,
            // The in-memory store only ever records purchases; the legacy import exists only in SQL.
            source: 'purchase',
          })),
        claimsByDayIndex: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, list]) => ({ day, claims: list })),
        replayDays: [...byDay.keys()].sort(),
      };
    },

    async campaign() {
      const receipts = [...(economy()?.receipts.values() ?? [])].filter((r) => r.input.mode === 'campaign');
      // The in-memory ledger does not keep the numeric level, but the RECEIPT does: the award path
      // recorded `campaignLevel` when it resolved the level, exactly as the SQL receipt path writes
      // it. So the paid-level map is built from the same recorded fact, not from a level table.
      const paidLevels = receipts
        .filter((receipt) => receipt.awarded > 0)
        .map((receipt) => ({ sourceKey: receipt.input.sourceKey, level: receipt.input.campaignLevel ?? null }));
      return shapeCampaign(
        receipts.map((receipt) => ({
          sourceKey: receipt.input.sourceKey,
          awarded: receipt.awarded,
          denial: receipt.reason,
          utcDay: utcDay(receipt.input.now),
        })),
        paidLevels,
      );
    },
  };
};
