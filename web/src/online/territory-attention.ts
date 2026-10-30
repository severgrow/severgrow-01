// "IS THERE SOMETHING WAITING FOR ME IN TERRITORY?" — the ONE decision behind every Territory
// lamp and count (owner, 2026-10-30):
//
//   "notifcations for territory and in territory submenu should show up only when its OUR turn to
//    do something - respond to challenge or do our turn, notifcation dont show if we dont have any
//    move waiting for us there"
//
// Before this module the three surfaces each counted something slightly different and wider:
//   · the menu entry's lamp counted `challenges.incoming.length` — which includes an ACCEPTED
//     challenge whose duel is waiting for the OTHER player;
//   · the challenges key counted every open row (incoming and outgoing, pending and accepted), so
//     a challenge the player had SENT lit their own lamp;
//   · the map's MENU key added the achievements count on top.
// A badge that lights for somebody else's move teaches the player to ignore it, so all three now
// read this one predicate.
//
// The inputs are the fields the client already polls (`GET /v1/world/challenges`, every 12 s while
// Territory is open). `matchWaitingForMe` is computed by the server from the linked duel's actor
// (see `WorldEconomyService.challengeWire`), so the client needs no second read and no new poll.
//
// Pure and DOM-free: the rule is table-tested in `web/tests/territory-attention.test.ts`.
import type { WorldChallengeWire, WorldChallengesPayload } from '../../../server/src/seeds/types.js';

/** The four wire fields the decision reads (a Pick keeps the tests honest about that). */
export type TerritoryActionSource = Pick<
  WorldChallengeWire,
  'status' | 'fromMe' | 'matchFinished' | 'matchWaitingForMe'
>;

/**
 * A pending challenge waits for the DEFENDER's answer (so only an incoming one counts); an accepted
 * one has become a duel and waits only while the linked match's actor is the viewer. Everything
 * else — declined, expired, resolved, stale — is history: no move is waiting in it.
 *
 * `matchFinished` is checked as well as `matchWaitingForMe` so a stale row can never light a lamp
 * even if a server sent a contradictory pair of fields.
 */
export const needsMyAction = (challenge: TerritoryActionSource): boolean => {
  if (challenge.status === 'pending') return challenge.fromMe !== true;
  if (challenge.status === 'accepted') return challenge.matchFinished !== true && challenge.matchWaitingForMe === true;
  return false;
};

/** Every open challenge that is waiting on THIS player, in list order (incoming first). */
export const waitingChallenges = (
  payload: Pick<WorldChallengesPayload, 'incoming' | 'outgoing'> | null | undefined,
): WorldChallengeWire[] => {
  if (!payload) return [];
  return [...payload.incoming, ...payload.outgoing].filter(needsMyAction);
};

/** How many actions are waiting. A read that has not landed yet is 0, never a guess. */
export const waitingActionCount = (
  payload: Pick<WorldChallengesPayload, 'incoming' | 'outgoing'> | null | undefined,
): number => waitingChallenges(payload).length;

/** The lamps' spoken sentence; empty when nothing waits, so a quiet surface stays quiet. */
export const waitingWords = (count: number, copy: {
  one: string;
  many: (n: number) => string;
}): string => {
  if (!(count > 0)) return '';
  return count === 1 ? copy.one : copy.many(count);
};
