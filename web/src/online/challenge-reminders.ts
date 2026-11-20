// CHALLENGE REMINDERS — WIRED (owner, 2026-11-20). This file started as a skeleton that nothing
// imported (owner, 2026-11-10: "just a rough skeleton ... to be picked up in future"). The PWA now
// exists, so the plan is used by the server's web-push sender, and the installed app's icon count is
// set from the Territory read that already polls the challenges.
//
// One rule, two ends: the PURE plan lives in `src/notifications.ts` (imported by the server, which
// decides who is nudged at 12 h and 1 h before a challenge window closes) and is re-exported here so
// the page keeps the same names it always had. Nothing in this file reads storage or the network;
// `setIconCount` is the only browser call, and it is silent where the platform has no badge API.
//
// What the page does NOT do: ask for permission on first visit, or decide who gets a push. The
// Settings switch is the only entry point (off by default, one switch), and the server addresses
// every notification from its own match/challenge state.
export { REMINDER_LEFT_MS, reminderPlan } from '../../../src/notifications.js';
export type { PlannedReminder, ReminderKind } from '../../../src/notifications.js';

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
