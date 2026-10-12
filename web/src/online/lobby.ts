// Phase 4 — lobby helpers (pure). Menu words live in src/strings.ts ONLINE.*.

import type { MatchListEntry, MatchStatus } from '../../../server/src/protocol.js';
import { formatRemaining } from './clock.js';
import { publicAppOrigin } from './config.js';
import { ONLINE } from '../../../src/strings.js';

export const FIRST_ONLINE_CARD_KEY = 'severgrow.duel.firstCard.v1';
export const WARN_LAST_MS = 2 * 3_600_000; // last 2 hours (P-12)

export type LobbyBucket = 'your_turn' | 'waiting' | 'finished';

export type LobbyRow = {
  matchId: string;
  bucket: LobbyBucket;
  opponentName: string;
  /** Short status word (never colour alone). */
  statusWord: string;
  /** Icon name for status (paired with the word). */
  statusIcon: 'play' | 'hourglass' | 'flag' | 'check';
  timeLeft: string | null;
  warnLastTwoHours: boolean;
  unseenTurn: boolean;
  inviteHint: string | null;
};

export const parseJoinHash = (hash: string): string | null => {
  const m = /^#\/join\/([A-Za-z0-9]{4,16})$/.exec(hash.trim());
  return m ? m[1]!.toUpperCase() : null;
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
  const status =
    bucket === 'finished'
      ? { word: ONLINE.statusFinished, icon: 'check' as const }
      : bucket === 'your_turn'
        ? { word: ONLINE.statusYourTurn, icon: 'play' as const }
        : entry.status === 'waiting'
          ? { word: ONLINE.statusWaitingFriend, icon: 'hourglass' as const }
          : { word: ONLINE.statusTheirTurn, icon: 'hourglass' as const };

  return {
    matchId: entry.matchId,
    bucket,
    opponentName: entry.opponentName?.trim() || ONLINE.opponentFallback,
    statusWord: status.word,
    statusIcon: status.icon,
    timeLeft: remaining === null || bucket === 'finished' ? null : formatRemaining(remaining),
    warnLastTwoHours: remaining !== null && remaining > 0 && remaining <= WARN_LAST_MS && bucket !== 'finished',
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
    case 'NOT_FOUND':
    case 'BAD_CODE':
    case 'EXPIRED':
      return ONLINE.errBadOrExpired;
    case 'OWN_MATCH':
      return ONLINE.errOwnCode;
    case 'FULL':
      return ONLINE.errFull;
    case 'ALREADY_JOINED':
      return ONLINE.errAlreadyJoined;
    case 'TOO_MANY_OPEN':
      return ONLINE.errTooMany;
    case 'RATE_LIMITED':
      return ONLINE.errRateLimited;
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
