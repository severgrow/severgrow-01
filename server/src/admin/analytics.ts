// First-party retention analytics for the admin dashboard (docs/ADMIN.md).
//
// Everything here is pure: given player activity facts already filtered to non-test humans, shape
// the numbers the dashboard shows. No I/O, no clocks except the `now` the caller supplies.
//
// Definitions (honest, from rows the server already stores — never guessed sessions):
//   * Active on UTC day D = a player who finished a duel that day, claimed a tile that day, or was
//     created that day. There is no last-seen column; this is the activity the database can prove.
//   * DAU / WAU = distinct active players today / in the last 7 UTC days (including today).
//   * D1 / D7 = of players created on cohort day C, the share with activity on C+1 / C+7. A rate is
//     ONLY returned when the observation window is complete (now is past the end of C+N). Incomplete
//     windows are null, never a partial fraction.
//   * Funnel rates are among new players created in the lookback; each step is a distinct player who
//     reached that milestone at least once. Invite-to-play is joined invites / invites sent.
import { DAY_MS, lastDays, utcDay } from './util.js';

/** One non-test player's activity facts, already stripped of private fields. */
export type AnalyticsPlayerFact = {
  playerId: string;
  createdAt: number;
  /** UTC days (`YYYY-MM-DD`) with proven activity (finished duel, claim, or create day). */
  activityDays: Set<string>;
  finishedMatchCount: number;
  /** Friend-mode matches this player created (seat 0) — an invite was sent. */
  invitesSent: number;
  /** Friend-mode matches this player created that later gained a second seat. */
  invitesJoined: number;
  hasClaim: boolean;
  /** Finished matches that are rematches of an earlier finished match. */
  rematchCount: number;
};

export type AdminRetentionCohort = {
  day: string;
  cohortSize: number;
  /** Null when the observation window is incomplete; never a partial rate. */
  d1: number | null;
  d7: number | null;
};

export type AdminAnalyticsFunnel = {
  /** New non-test players created in the lookback window. */
  lookbackDays: number;
  newPlayers: number;
  firstMatchCompleted: number;
  firstClaim: number;
  inviteSent: number;
  inviteJoined: number;
  rematchPlayed: number;
  repeatMatches: number;
  /** Joined / sent; null when nobody sent an invite. */
  inviteToPlayRate: number | null;
  /** First finished match / new players; null when nobody new. */
  firstMatchRate: number | null;
  /** First claim / new players; null when nobody new. */
  firstClaimRate: number | null;
  /** ≥2 finished matches / players with ≥1; null when nobody finished a match. */
  repeatMatchRate: number | null;
};

export type AdminAnalytics = {
  serverNow: number;
  /** Distinct non-test players with proven activity on today's UTC day. */
  dau: number;
  /** Distinct non-test players with proven activity in the last 7 UTC days. */
  wau: number;
  /** Non-test players created on today's UTC day. */
  newPlayersToday: number;
  /** Non-test players created in the last 7 UTC days. */
  newPlayers7d: number;
  /** Active players per UTC day for the last 14 days (oldest first). */
  activeByDay: { day: string; n: number }[];
  /** New players per UTC day for the last 14 days (oldest first). */
  newByDay: { day: string; n: number }[];
  /** Recent create-day cohorts with D1/D7 only when the window is complete. */
  retention: AdminRetentionCohort[];
  funnel: AdminAnalyticsFunnel;
  /**
   * Plain English of what "active" means here, so the screen never pretends this is a session
   * counter. The dashboard prints this verbatim.
   */
  activityDefinition: string;
};

export const ANALYTICS_ACTIVITY_DEFINITION =
  'Active = finished an online duel, claimed a territory tile, or was created that UTC day. ' +
  'There is no last-seen history; Campaign and Training games that never touch the server are invisible here.';

export const ANALYTICS_FUNNEL_LOOKBACK_DAYS = 28;
export const ANALYTICS_SERIES_DAYS = 14;
export const ANALYTICS_RETENTION_COHORT_DAYS = 14;

/** Start of the UTC day that contains `ms` (epoch ms). */
export const dayFloor = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;

/** Epoch ms at the start of the named UTC day (`YYYY-MM-DD`). */
export const dayStartMs = (day: string): number => {
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) throw new Error(`analytics: bad day key ${day}`);
  return parsed;
};

/**
 * True when the observation window for cohort day C + offsetDays is complete: `now` is strictly
 * after the end of that day (so a partial today is never counted as a finished window).
 */
export const retentionWindowComplete = (cohortDay: string, offsetDays: number, now: number): boolean => {
  const observeEndExclusive = dayStartMs(cohortDay) + (offsetDays + 1) * DAY_MS;
  return now >= observeEndExclusive;
};

/** Rate in [0, 1], or null when the window is incomplete or the cohort is empty. */
export const retentionRate = (
  returned: number,
  cohortSize: number,
  ready: boolean,
): number | null => {
  if (!ready || cohortSize <= 0) return null;
  return returned / cohortSize;
};

const rateOrNull = (part: number, whole: number): number | null => (whole <= 0 ? null : part / whole);

const addDay = (day: string, offset: number): string => utcDay(dayStartMs(day) + offset * DAY_MS);

/**
 * Shape the dashboard payload from already-filtered (non-test) player facts.
 * Never throws on empty input — a query failure belongs at the store boundary, not here.
 */
export const shapeAnalytics = (facts: readonly AnalyticsPlayerFact[], now: number): AdminAnalytics => {
  const today = utcDay(now);
  const weekDays = new Set(lastDays(now, 7));
  const seriesDays = lastDays(now, ANALYTICS_SERIES_DAYS);
  const cohortDays = lastDays(now, ANALYTICS_RETENTION_COHORT_DAYS);
  const funnelSince = now - ANALYTICS_FUNNEL_LOOKBACK_DAYS * DAY_MS;

  const activeToday = new Set<string>();
  const activeWeek = new Set<string>();
  const activeByDayCounts = new Map<string, number>(seriesDays.map((day) => [day, 0]));
  const newByDayCounts = new Map<string, number>(seriesDays.map((day) => [day, 0]));

  let newPlayersToday = 0;
  let newPlayers7d = 0;

  const cohortMembers = new Map<string, AnalyticsPlayerFact[]>();
  for (const day of cohortDays) cohortMembers.set(day, []);

  let funnelNew = 0;
  let firstMatch = 0;
  let firstClaim = 0;
  let inviteSent = 0;
  let inviteJoined = 0;
  let rematchPlayed = 0;
  let repeatMatches = 0;

  for (const fact of facts) {
    const createdDay = utcDay(fact.createdAt);
    if (createdDay === today) newPlayersToday += 1;
    if (fact.createdAt >= dayFloor(now) - 6 * DAY_MS) newPlayers7d += 1;
    if (seriesDays.includes(createdDay)) {
      newByDayCounts.set(createdDay, (newByDayCounts.get(createdDay) ?? 0) + 1);
    }

    let countedToday = false;
    let countedWeek = false;
    for (const day of fact.activityDays) {
      if (day === today && !countedToday) {
        activeToday.add(fact.playerId);
        countedToday = true;
      }
      if (weekDays.has(day) && !countedWeek) {
        activeWeek.add(fact.playerId);
        countedWeek = true;
      }
      if (activeByDayCounts.has(day)) {
        activeByDayCounts.set(day, (activeByDayCounts.get(day) ?? 0) + 1);
      }
    }

    const cohortList = cohortMembers.get(createdDay);
    if (cohortList) cohortList.push(fact);

    if (fact.createdAt >= funnelSince) {
      funnelNew += 1;
      if (fact.finishedMatchCount >= 1) firstMatch += 1;
      if (fact.finishedMatchCount >= 2) repeatMatches += 1;
      if (fact.hasClaim) firstClaim += 1;
      if (fact.invitesSent >= 1) inviteSent += 1;
      if (fact.invitesJoined >= 1) inviteJoined += 1;
      if (fact.rematchCount >= 1) rematchPlayed += 1;
    }
  }

  const retention: AdminRetentionCohort[] = cohortDays.map((day) => {
    const members = cohortMembers.get(day) ?? [];
    const cohortSize = members.length;
    const d1Ready = retentionWindowComplete(day, 1, now);
    const d7Ready = retentionWindowComplete(day, 7, now);
    const d1Day = addDay(day, 1);
    const d7Day = addDay(day, 7);
    const d1Returned = members.filter((m) => m.activityDays.has(d1Day)).length;
    const d7Returned = members.filter((m) => m.activityDays.has(d7Day)).length;
    return {
      day,
      cohortSize,
      d1: retentionRate(d1Returned, cohortSize, d1Ready),
      d7: retentionRate(d7Returned, cohortSize, d7Ready),
    };
  });

  return {
    serverNow: now,
    dau: activeToday.size,
    wau: activeWeek.size,
    newPlayersToday,
    newPlayers7d,
    activeByDay: seriesDays.map((day) => ({ day, n: activeByDayCounts.get(day) ?? 0 })),
    newByDay: seriesDays.map((day) => ({ day, n: newByDayCounts.get(day) ?? 0 })),
    retention,
    funnel: {
      lookbackDays: ANALYTICS_FUNNEL_LOOKBACK_DAYS,
      newPlayers: funnelNew,
      firstMatchCompleted: firstMatch,
      firstClaim,
      inviteSent,
      inviteJoined,
      rematchPlayed,
      repeatMatches,
      inviteToPlayRate: rateOrNull(inviteJoined, inviteSent),
      firstMatchRate: rateOrNull(firstMatch, funnelNew),
      firstClaimRate: rateOrNull(firstClaim, funnelNew),
      repeatMatchRate: rateOrNull(repeatMatches, firstMatch),
    },
    activityDefinition: ANALYTICS_ACTIVITY_DEFINITION,
  };
};

/**
 * Empty / failure payload for the dashboard when the store cannot answer. The admin UI shows this
 * as unavailable — never invents zeroes that look like "nobody played".
 */
export const unavailableAnalytics = (now: number, reason: string): AdminAnalytics & { unavailable: string } => ({
  ...shapeAnalytics([], now),
  unavailable: reason,
});
