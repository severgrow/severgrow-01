// CHALLENGE REMINDERS — SKELETON, NOT WIRED IN (owner, 2026-11-10: "4 is not gonna be useful now since
// we don't have app to download ... so just a rough skeleton for it I guess to be picked up in future").
//
// The plan (agreed): at most TWO nudges per tile under challenge — 12 h left and 1 h left — only for
// players who opted in, plus a count on the installed app's icon. Nothing here runs today: no module
// imports it outside its test. To pick it up later:
//   1. server: store a Web Push subscription per player (needs VAPID keys and a push endpoint), and a
//      job that sends `reminderPlan(...)` entries when they fall due (the plan is the same on both ends);
//   2. page: ask for notification permission only after the player has answered a challenge once
//      (never on first visit), register the service worker's `push` handler, and call `setIconCount`
//      after each Territory read with the number of answers waiting;
//   3. settings: one "Challenge reminders" switch, off by default.
// The icon count works today in installed desktop Chrome/Edge; iOS needs an installed app with
// notification permission, which is why this waits.
import type { WorldChallengeWire } from '../../../server/src/seeds/types.js';

const HOUR_MS = 60 * 60 * 1000;
/** The two moments a reminder is worth sending, as time LEFT in the answer window. */
export const REMINDER_LEFT_MS = Object.freeze({ '12h': 12 * HOUR_MS, '1h': HOUR_MS });
export type ReminderKind = keyof typeof REMINDER_LEFT_MS;
export type PlannedReminder = Readonly<{ challengeId: string; cellId: string; kind: ReminderKind; at: number }>;

/**
 * Every reminder still ahead for the answers waiting on THIS player, soonest first. A window that is
 * already past a step simply has no reminder for it (never a late nudge), and nothing is planned for
 * my own outgoing challenges, a running duel or a closed row.
 */
export const reminderPlan = (
  challenges: readonly Pick<WorldChallengeWire, 'id' | 'cellId' | 'fromMe' | 'status' | 'expiresAt'>[],
  now: number,
): PlannedReminder[] => {
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
 * The installed app's icon count (the Badging API). Silent where unsupported or refused; 0 clears it.
 * Returns whether the platform accepted it.
 */
export const setIconCount = async (count: number, nav: Partial<Navigator> | undefined = globalThis.navigator): Promise<boolean> => {
  const n = nav as { setAppBadge?: (c?: number) => Promise<void>; clearAppBadge?: () => Promise<void> } | undefined;
  if (!n?.setAppBadge) return false;
  try {
    if (count > 0) await n.setAppBadge(Math.min(99, Math.floor(count)));
    else await (n.clearAppBadge ? n.clearAppBadge() : n.setAppBadge(0));
    return true;
  } catch { return false; }
};
