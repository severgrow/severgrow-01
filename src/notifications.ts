// WHO GETS TOLD WHAT — the one pure rule behind web-push notifications, shared by the server
// (which decides) and the client reminder skeleton (which plans the same nudges).
//
// The authority rule (docs/ONLINE.md, AGENTS.md): the SERVER decides who is notified, from its own
// match/challenge state. Nothing here reads a request, a token, a clock or the browser: every input
// is already server-authoritative data, and `now` is passed in. The client never names a recipient.
//
// Two events matter (owner brief, 2026-11-20):
//   * `turn`       — it became the opponent's turn in a live duel;
//   * `challenge`  — a Territory challenge is waiting for the defender's answer;
//   plus the two reminders the skeleton already planned (`12h` / `1h` before the window closes) and
//   the one answer the challenger was never told about (`challenge-accepted`).
//
// "Once, and never twice" is the dedupe key. It is part of every event and the server stores it with
// a unique constraint (`push_sends`), so a repeated poll, a second tab or two racing requests can
// only ever send one notification per event.
import type { Player } from './engine/types.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** The two moments a reminder is worth sending, as time LEFT in the answer window. */
export const REMINDER_LEFT_MS = Object.freeze({ '12h': 12 * HOUR_MS, '1h': HOUR_MS });
export type ReminderKind = keyof typeof REMINDER_LEFT_MS;
export type PlannedReminder = Readonly<{ challengeId: string; cellId: string; kind: ReminderKind; at: number }>;

/** A challenge as the reminder planner needs it (the wire row is structurally compatible). */
export type ReminderSource = Readonly<{
  id: string;
  cellId: string;
  fromMe: boolean;
  status: string;
  expiresAt: number;
}>;

/**
 * Every reminder still ahead for the answers waiting on THIS player, soonest first. A window that is
 * already past a step simply has no reminder for it (never a late nudge), and nothing is planned for
 * my own outgoing challenges, a running duel or a closed row.
 */
export const reminderPlan = (challenges: readonly ReminderSource[], now: number): PlannedReminder[] => {
  const out: PlannedReminder[] = [];
  for (const c of challenges) {
    if (c.fromMe || c.status !== 'pending' || !(c.expiresAt > now)) continue;
    for (const kind of Object.keys(REMINDER_LEFT_MS) as ReminderKind[]) {
      const at = c.expiresAt - REMINDER_LEFT_MS[kind];
      if (at > now) out.push({ challengeId: c.id, cellId: c.cellId, kind, at });
    }
  }
  return out.sort((a, b) => a.at - b.at || (a.challengeId < b.challengeId ? -1 : 1));
};

/**
 * The single reminder that is DUE right now, or null. Deliberately the most urgent passed step only:
 * a challenge first seen with 30 minutes left sends the 1 h nudge, not a 12 h one as well. An expired
 * or closed window has nothing due (the row's status is checked by the caller).
 */
export const dueReminderKind = (expiresAt: number, now: number): ReminderKind | null => {
  if (!(expiresAt > now)) return null;
  if (now >= expiresAt - REMINDER_LEFT_MS['1h']) return '1h';
  if (now >= expiresAt - REMINDER_LEFT_MS['12h']) return '12h';
  return null;
};

export type PushKind = 'turn' | 'challenge' | 'challenge-accepted' | 'challenge-12h' | 'challenge-1h';

/**
 * One notification, addressed to ONE player by the server. `dedupeKey` is the once-only guard; the
 * copy is server-authored (the page only paints it), and `tag` lets a newer notification about the
 * same match/challenge replace an older one on the device instead of stacking.
 */
export type PushNotification = Readonly<{
  playerId: string;
  kind: PushKind;
  dedupeKey: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}>;

const nameOrRival = (name: string | null): string => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed ? trimmed.slice(0, 40) : 'A rival';
};

/** Durations only, never a wall-clock time (P-19: players are in many time zones). */
const hoursLeft = (expiresAt: number, now: number): string => {
  const hours = Math.max(1, Math.ceil((expiresAt - now) / HOUR_MS));
  return `${hours}h`;
};

const appUrl = './';

export type TurnSource = Readonly<{
  matchId: string;
  status: 'waiting' | 'active' | 'finished';
  /** The seat to act, from the server's own gated state. */
  turnPlayer: Player;
  /** The seat of the caller that asked the server to look. */
  callerSeat: Player;
  /** Revision at the last turn boundary: one notification per turn, never per mid-turn revision. */
  turnStartRevision: number;
  /** The opponent, from the server's participant table. Never from the request. */
  opponentId: string | null;
  /** The caller's own display name, for the line the opponent reads. */
  callerName: string | null;
}>;

/** "Your turn" for the opponent — only when the turn really is theirs, in an active match. */
export const turnNotification = (source: TurnSource): PushNotification | null => {
  if (source.status !== 'active') return null;
  if (source.turnPlayer === source.callerSeat) return null;
  if (!source.opponentId) return null;
  if (!Number.isInteger(source.turnStartRevision) || source.turnStartRevision < 0) return null;
  return {
    playerId: source.opponentId,
    kind: 'turn',
    dedupeKey: `turn:${source.matchId}:${source.turnStartRevision}`,
    title: 'Your turn in a duel',
    body: `${nameOrRival(source.callerName)} played. Open FUTASAKU to answer.`,
    url: appUrl,
    tag: `match:${source.matchId}`,
  };
};

export type ChallengeSource = Readonly<{
  id: string;
  cellId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'resolved' | 'stale' | string;
  challengerId: string;
  defenderId: string;
  challengerName: string | null;
  defenderName?: string | null;
  expiresAt: number;
  matchId?: string | null;
}>;

/** A fresh challenge, for the defender to answer. Sent once, when the challenger's page asks. */
export const challengeNotification = (
  challenge: ChallengeSource,
  callerId: string,
  now: number,
): PushNotification | null => {
  if (challenge.status !== 'pending') return null;
  if (challenge.defenderId === callerId) return null; // the defender nudging: this is not news to them
  return {
    playerId: challenge.defenderId,
    kind: 'challenge',
    dedupeKey: `challenge:${challenge.id}:sent`,
    title: 'A challenge is waiting',
    body: `${nameOrRival(challenge.challengerName)} challenged you for a tile — ${hoursLeft(challenge.expiresAt, now)} to answer.`,
    url: appUrl,
    tag: `challenge:${challenge.id}`,
  };
};

/** The challenger was never told: the defender accepted, and a linked duel is ready. */
export const challengeAcceptedNotification = (
  challenge: ChallengeSource,
  callerId: string,
): PushNotification | null => {
  if (challenge.status !== 'accepted') return null;
  if (challenge.defenderId !== callerId) return null; // only the DEFENDER's page can report this
  if (!challenge.matchId) return null;
  return {
    playerId: challenge.challengerId,
    kind: 'challenge-accepted',
    dedupeKey: `challenge:${challenge.id}:accepted`,
    title: 'Challenge accepted',
    body: `${nameOrRival(challenge.defenderName ?? null)} accepted. Your linked duel is ready.`,
    url: appUrl,
    tag: `challenge:${challenge.id}`,
  };
};

/** One of the two reminders, for the defender whose window is closing. */
export const reminderNotification = (
  challenge: ChallengeSource,
  kind: ReminderKind,
  now: number,
): PushNotification | null => {
  if (challenge.status !== 'pending') return null;
  if (!(challenge.expiresAt > now)) return null;
  return {
    playerId: challenge.defenderId,
    kind: kind === '12h' ? 'challenge-12h' : 'challenge-1h',
    dedupeKey: `challenge:${challenge.id}:${kind}`,
    title: kind === '1h' ? 'One hour left' : '12 hours left',
    body:
      kind === '1h'
        ? `Answer ${nameOrRival(challenge.challengerName)}'s challenge or the tile changes hands.`
        : `${nameOrRival(challenge.challengerName)} is waiting for your answer — ${hoursLeft(challenge.expiresAt, now)} left.`,
    url: appUrl,
    tag: `challenge:${challenge.id}`,
  };
};

/** The payload a service worker receives. Small on purpose: no ids, names, keys or board state. */
export type PushPayload = Readonly<{ title: string; body: string; url: string; tag: string; kind: PushKind }>;

export const payloadFor = (notification: PushNotification): PushPayload => ({
  title: notification.title,
  body: notification.body,
  url: notification.url,
  tag: notification.tag,
  kind: notification.kind,
});
