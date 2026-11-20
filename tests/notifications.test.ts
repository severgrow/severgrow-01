// The notification decision is the server's, and it is the thing that must never mis-fire: a wrong
// recipient leaks a game to the wrong phone, and a missing dedupe key spams one. These are the pure
// rules behind both.
import { describe, expect, it } from 'vitest';
import {
  dueReminderKind,
  challengeAcceptedNotification,
  challengeNotification,
  reminderNotification,
  reminderPlan,
  turnNotification,
} from '../src/notifications';

const H = 60 * 60 * 1000;
const turn = (over: Record<string, unknown> = {}) => ({
  matchId: 'm1',
  status: 'active' as const,
  turnPlayer: 1 as const,
  callerSeat: 0 as const,
  turnStartRevision: 7,
  opponentId: 'p-opponent',
  callerName: 'RYK',
  ...over,
});
const challenge = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  cellId: '3,4',
  status: 'pending',
  challengerId: 'p-ryk',
  defenderId: 'p-me',
  challengerName: 'RYK',
  defenderName: 'LIDWINGO',
  expiresAt: 48 * H,
  matchId: null as string | null,
  ...over,
});

describe('turn notifications', () => {
  it('tells exactly the opponent, once per turn, when it is their turn', () => {
    const n = turnNotification(turn())!;
    expect(n.playerId).toBe('p-opponent');
    expect(n.kind).toBe('turn');
    expect(n.dedupeKey).toBe('turn:m1:7');
    expect(n.body).toContain('RYK');
  });

  it('is stable across a whole turn: mid-turn revisions cannot produce a second notification', () => {
    // turnStartRevision is the boundary. The same turn is the same key even if the mover draws and
    // plays several times before ending it.
    expect(turnNotification(turn({ turnStartRevision: 7 }))!.dedupeKey).toBe(
      turnNotification(turn({ turnStartRevision: 7 }))!.dedupeKey,
    );
  });

  it('says nothing when it is the caller who must act, or the match is over/waiting', () => {
    expect(turnNotification(turn({ turnPlayer: 0 }))).toBeNull();
    expect(turnNotification(turn({ status: 'finished' }))).toBeNull();
    expect(turnNotification(turn({ status: 'waiting' }))).toBeNull();
    expect(turnNotification(turn({ opponentId: null }))).toBeNull();
  });

  it('never invents a revision that could coalesce two turns', () => {
    expect(turnNotification(turn({ turnStartRevision: -1 }))).toBeNull();
    expect(turnNotification(turn({ turnStartRevision: 7.5 }))).toBeNull();
  });
});

describe('challenge notifications', () => {
  it('tells the defender about a fresh challenge, once, with the response window as a duration', () => {
    const n = challengeNotification(challenge(), 'p-ryk', 0)!;
    expect(n.playerId).toBe('p-me');
    expect(n.kind).toBe('challenge');
    expect(n.dedupeKey).toBe('challenge:c1:sent');
    expect(n.body).toContain('RYK');
    expect(n.body).toContain('48h');
    expect(n.body).not.toMatch(/\d{1,2}:\d{2}/); // P-19: durations, never a clock time
  });

  it('says nothing to the defender when the defender is the one nudging, or the row is closed', () => {
    expect(challengeNotification(challenge(), 'p-me', 0)).toBeNull();
    expect(challengeNotification(challenge({ status: 'declined' }), 'p-ryk', 0)).toBeNull();
    expect(challengeNotification(challenge({ status: 'expired' }), 'p-ryk', 0)).toBeNull();
  });

  it('tells the challenger exactly once when the defender accepts', () => {
    const accepted = challenge({ status: 'accepted', matchId: 'm9' });
    expect(challengeAcceptedNotification(accepted, 'p-ryk')).toBeNull(); // only the defender's page reports it
    const n = challengeAcceptedNotification(accepted, 'p-me')!;
    expect(n.playerId).toBe('p-ryk');
    expect(n.dedupeKey).toBe('challenge:c1:accepted');
    expect(challengeAcceptedNotification(challenge({ status: 'accepted', matchId: null }), 'p-me')).toBeNull();
    expect(challengeAcceptedNotification(accepted, 'p-me')!.dedupeKey).toBe(
      challengeAcceptedNotification(accepted, 'p-me')!.dedupeKey,
    );
  });
});

describe('challenge reminders', () => {
  it('the due step is the shortest one whose moment has passed, and never a late nudge', () => {
    expect(dueReminderKind(48 * H, 0)).toBeNull();
    expect(dueReminderKind(48 * H, 35 * H)).toBeNull();
    expect(dueReminderKind(48 * H, 36 * H)).toBe('12h'); // exactly at 12 h left
    expect(dueReminderKind(48 * H, 46 * H)).toBe('12h');
    expect(dueReminderKind(48 * H, 47 * H)).toBe('1h'); // exactly at 1 h left
    expect(dueReminderKind(48 * H, 48 * H)).toBeNull(); // the window is closed
  });

  it('a challenge first seen with 30 minutes left sends the urgent nudge only', () => {
    const late = challenge({ expiresAt: 48 * H });
    const kind = dueReminderKind(late.expiresAt, 48 * H - 30 * 60 * 1000)!;
    expect(kind).toBe('1h');
    expect(reminderNotification(late, kind, 48 * H - 30 * 60 * 1000)!.dedupeKey).toBe('challenge:c1:1h');
  });

  it('reminders go to the defender, never to the challenger, and keep separate once-only keys', () => {
    const row = challenge();
    const twelve = reminderNotification(row, '12h', 36 * H)!;
    const one = reminderNotification(row, '1h', 47 * H)!;
    expect(twelve.playerId).toBe('p-me');
    expect(one.playerId).toBe('p-me');
    expect(one.dedupeKey).toBe('challenge:c1:1h');
    expect(twelve.dedupeKey).not.toBe(one.dedupeKey);
    expect(reminderNotification(row, '1h', 48 * H)).toBeNull();
    expect(reminderNotification(challenge({ status: 'accepted' }), '12h', 36 * H)).toBeNull();
  });

  it('the planner (the same rule the skeleton already had) still plans the two ahead moments', () => {
    const plan = reminderPlan(
      [
        { id: 'a', cellId: '0,0', fromMe: false, status: 'pending', expiresAt: 48 * H },
        { id: 'b', cellId: '1,1', fromMe: false, status: 'pending', expiresAt: 6 * H },
        { id: 'c', cellId: '2,2', fromMe: true, status: 'pending', expiresAt: 48 * H },
      ],
      0,
    );
    expect(plan.map((p) => `${p.challengeId}:${p.kind}:${p.at / H}`)).toEqual(['b:1h:5', 'a:12h:36', 'a:1h:47']);
  });
});
