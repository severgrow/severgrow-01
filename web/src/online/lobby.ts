// Phase 4 — lobby helpers (pure). Menu words live in src/strings.ts ONLINE.*.

import type { MatchListEntry, MatchStatus } from '../../../server/src/protocol.js';
import { formatRemaining } from './clock.js';
import { publicAppOrigin } from './config.js';
import { ONLINE, REPLAY } from '../../../src/strings.js';

export const FIRST_ONLINE_CARD_KEY = 'severgrow.duel.firstCard.v1';
export const WARN_LAST_MS = 2 * 3_600_000; // last 2 hours (P-12)

/**
 * After this long parked in the Find-opponent queue, offer the honest computer fallback alongside
 * waiting (never instead of it — the search keeps running). Replaces the old "invite a friend"
 * prompt, which was the only option before parking existed.
 */
export const PARKED_OFFER_MS = 3 * 60 * 1000;
export const isSearchParked = (elapsedMs: number, offerMs = PARKED_OFFER_MS): boolean => elapsedMs >= offerMs;

export type LobbyBucket = 'your_turn' | 'waiting' | 'finished';

export type LobbyRow = {
  matchId: string;
  bucket: LobbyBucket;
  opponentName: string;
  /** Short status word (never colour alone). */
  statusWord: string;
  /** Icon name for status (paired with the word). */
  statusIcon: 'play' | 'hourglass' | 'flag' | 'check' | 'replay';
  timeLeft: string | null;
  warnLastTwoHours: boolean;
  /** A finished duel with a real move log: its row opens the replay. */
  replayable: boolean;
  /** Timeout-grace line for the row (punchy): your spent grace, or the opponent's. */
  graceWord: string | null;
  /** True when the viewer already used their grace on a live match: their next miss loses. */
  atRisk: boolean;
  unseenTurn: boolean;
  inviteHint: string | null;
};

export const parseJoinHash = (hash: string): string | null => {
  const m = /^#\/join\/([A-Za-z0-9]{4,16})$/.exec(hash.trim());
  return m ? m[1]!.toUpperCase() : null;
};

/** The only shapes a code may take (matches parseJoinHash and the server's invite alphabet). */
export const INVITE_CODE_SHAPE = /^[A-Z0-9]{4,16}$/;

export const isWellFormedInviteCode = (code: string): boolean => INVITE_CODE_SHAPE.test(code);

/**
 * Turn whatever the player typed or pasted into a candidate code. Trims, keeps just the code when a
 * whole invite link was pasted, drops spaces and dashes (people read codes in groups; links wrap),
 * and uppercases. Callers still validate the result with `isWellFormedInviteCode`.
 */
export const normalizeInviteCodeInput = (raw: string): string => {
  const trimmed = raw.trim();
  const fromLink = /#\/join\/([A-Za-z0-9]{4,16})/.exec(trimmed);
  const base = fromLink ? fromLink[1]! : trimmed;
  return base.replace(/[\s-]+/g, '').toUpperCase();
};

export const inviteLink = (code: string, origin = publicAppOrigin()): string =>
  `${origin.replace(/\/+$/, '')}/#/join/${code.toUpperCase()}`;

export const shareInviteText = (code: string, origin = publicAppOrigin()): string =>
  ONLINE.shareInvite(inviteLink(code, origin));

/** Bucket a list entry for Your turn / Waiting / Finished. */
export const lobbyBucket = (entry: MatchListEntry): LobbyBucket => {
  if (entry.status === 'finished') return 'finished';
  if (entry.status === 'waiting') return 'waiting';
  if (entry.turnPlayer === entry.mySeat || entry.unseenTurn) return 'your_turn';
  return 'waiting';
};

export const sortLobbyEntries = (entries: readonly MatchListEntry[]): MatchListEntry[] => {
  const rank = (b: LobbyBucket) => (b === 'your_turn' ? 0 : b === 'waiting' ? 1 : 2);
  return [...entries].sort((a, b) => {
    const d = rank(lobbyBucket(a)) - rank(lobbyBucket(b));
    if (d !== 0) return d;
    return b.lastActivityAt - a.lastActivityAt;
  });
};

/** A waiting match's AGE (not a countdown): "3d", "5h", "12m" — so an open duel explains itself. */
export const formatWaitingAge = (ms: number): string => {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  if (totalMin >= 24 * 60) return `${Math.floor(totalMin / (24 * 60))}d`;
  if (totalMin >= 60) return `${Math.floor(totalMin / 60)}h`;
  return `${Math.max(1, totalMin)}m`;
};

export const toLobbyRow = (
  entry: MatchListEntry,
  now: number,
  serverOffsetMs = 0,
): LobbyRow => {
  const bucket = lobbyBucket(entry);
  const remaining =
    entry.turnDeadlineAt === null
      ? null
      : Math.max(0, entry.turnDeadlineAt - (now + serverOffsetMs));
  // A WAITING match has no countdown, so the row shows how long it has been open instead — that is
  // what explains why the duel is still in the list (and that it will expire on its own).
  const waitingAge = formatWaitingAge(Math.max(0, now + serverOffsetMs - entry.lastActivityAt));
  const timeText =
    bucket === 'finished'
      ? null
      : entry.status === 'waiting'
        ? waitingAge
        : remaining === null
          ? null
          : formatRemaining(remaining);
  // A finished duel's row is the way into its REPLAY (owner brief, 2026-10-25), so it says what
  // tapping it does rather than only that it is over. A match that finished with no committed moves
  // (an abandoned waiting room) has nothing to watch, so it keeps the plain word.
  const replayable = bucket === 'finished' && entry.revision > 0;
  const status =
    bucket === 'finished'
      ? replayable
        ? { word: REPLAY.pastRow, icon: 'replay' as const }
        : { word: ONLINE.statusFinished, icon: 'check' as const }
      : bucket === 'your_turn'
        ? { word: ONLINE.statusYourTurn, icon: 'play' as const }
        : entry.status === 'waiting'
          ? { word: ONLINE.statusWaitingFriend, icon: 'hourglass' as const }
          : { word: ONLINE.statusTheirTurn, icon: 'hourglass' as const };

  // Grace is public: the row explains why a match did not end on a missed deadline.
  const opponentSeat = entry.mySeat === 0 ? 1 : 0;
  const graceWord =
    entry.status !== 'active'
      ? null
      : (entry.graceUsed?.[entry.mySeat] ?? 0) > 0
        ? ONLINE.graceYouUsed
        : (entry.graceUsed?.[opponentSeat] ?? 0) > 0
          ? ONLINE.graceOpponentUsed
          : null;

  return {
    matchId: entry.matchId,
    bucket,
    // "MapleFox #7QK2": the tag tells two players with the same nature name apart.
    opponentName: entry.opponentName?.trim() ? (entry.opponentTag ? `${entry.opponentName.trim()} #${entry.opponentTag}` : entry.opponentName.trim()) : ONLINE.opponentFallback,
    statusWord: status.word,
    statusIcon: status.icon,
    replayable,
    timeLeft: timeText,
    warnLastTwoHours: remaining !== null && remaining > 0 && remaining <= WARN_LAST_MS && bucket !== 'finished',
    graceWord,
    atRisk: graceWord === ONLINE.graceYouUsed,
    unseenTurn: entry.unseenTurn,
    inviteHint: entry.status === 'waiting' ? ONLINE.waitingInviteHint : null,
  };
};

/** Finished matches: keep the latest 10 only (plan). */
export const trimLobbyList = (entries: readonly MatchListEntry[]): MatchListEntry[] => {
  const sorted = sortLobbyEntries(entries);
  const live = sorted.filter((e) => lobbyBucket(e) !== 'finished');
  const finished = sorted.filter((e) => lobbyBucket(e) === 'finished').slice(0, 10);
  return [...live, ...finished];
};

export const yourTurnCount = (entries: readonly MatchListEntry[]): number =>
  entries.filter((e) => lobbyBucket(e) === 'your_turn').length;

export const pageTitleForLobby = (yourTurns: number, base = ONLINE.pageTitleBase): string =>
  yourTurns > 0 ? `(${yourTurns}) ${base} — your turn` : base;

export const friendlyJoinError = (code: string): string => {
  switch (code) {
    // THE CODES THE SERVER ACTUALLY SENDS. Every case below is a code some server path can emit;
    // `web/tests/lobby.test.ts` drives the REAL service to produce them and fails if a case here is
    // not a code the server knows. That guard exists because this function was silently dead: it
    // keyed on `BAD_CODE` / `FULL` / `EXPIRED` / `OWN_MATCH`, NONE of which the server has ever
    // emitted, so every failed join - a wrong code, an already-full duel, a finished one - fell
    // through to the generic "Something went wrong. Try again." A wrong invite code is the single
    // most likely thing to go wrong at a playtest, and it must never read as a broken app.
    case 'INVALID_REQUEST': // joinMatch: an empty code
    case 'MATCH_NOT_FOUND': // joinMatch: no duel has that code (wrong, or expired before a move)
    case 'NOT_FOUND':
    case 'MATCH_EXPIRED':
      return ONLINE.errBadOrExpired;
    case 'MATCH_FULL': // joinMatch: two players already in it
      return ONLINE.errFull;
    case 'MATCH_FINISHED': // joinMatch: the duel is over, and it kept its result
    case 'MATCH_NOT_ACTIVE':
      return ONLINE.errFinished;
    case 'ALREADY_JOINED': // storage-level race: you were added while the request was in flight
      return ONLINE.errAlreadyJoined;
    case 'TOO_MANY_MATCHES':
      // The code the server ACTUALLY emits when a player is at the open-match cap
      // (`server/src/service.ts`, `TOO_MANY_MATCHES`). It used to be spelled `TOO_MANY_OPEN` here
      // — a code no server path emits — so the specific line was dead and a capped player got the
      // generic one. `web/tests/lobby.test.ts` pins that this stays aligned with the server.
      return ONLINE.errTooMany;
    case 'RATE_LIMITED':
      return ONLINE.errRateLimited;
    case 'DB_UNAVAILABLE':
      // Transiently unreachable database. The retry works, so say so rather than implying a bug.
      return ONLINE.errDbBusy;
    case 'CLIENT_TOO_OLD':
      return ONLINE.errClientTooOld;
    default:
      return ONLINE.errGeneric;
  }
};

export const matchStatusLabel = (status: MatchStatus): string => {
  if (status === 'waiting') return ONLINE.statusWaitingFriend;
  if (status === 'active') return ONLINE.statusActive;
  return ONLINE.statusFinished;
};
