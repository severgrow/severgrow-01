// THE SHELF: rewards already earned, waiting for COLLECT.
//
// OWNER ASK (2026-11-20): "find a smart way for extra window or space ... showing there the
// achievements window same size as planet - with the newly achieved achievement showed there ...
// just make it be dragged onto the section where this achievement is with button 'COLLECT' by the
// seed payout with our classic glow".
//
// WHY A SHELF AND NOT A SECOND LIST. A ready achievement is drawn ONCE, at the top of the sheet, at
// full width: its title, its seed payout and its COLLECT key. Its own row in its section is skipped
// while it waits, so nothing is announced twice and nothing has to be hunted for down a scroll. The
// moment it is collected the card leaves the shelf and the achievement is FILED BACK into its own
// section, ticked and flashed there (`world-view.ts#revealFiled`). That filing is the "moved onto the
// section where this achievement is" the owner described, performed by the view rather than by a
// finger, so a keyboard, a thumb and a mouse all reach the same place with the same one press.
//
// This module is the pure half: which rows the shelf takes, which stay in their section, and how the
// sheet brings the filed row back into view. `web/tests/achievement-collect.test.ts` pins it.
import type { AchievementView } from '../../../server/src/seeds/achievements.js';

/**
 * The rewards waiting for COLLECT, in the server's authored order (`done`, not yet `claimed`).
 * Sorted by nothing else: the amount is not a rank, and reordering on every poll would move a key
 * under the player's finger.
 */
export const collectableAchievements = (views: readonly AchievementView[]): AchievementView[] =>
  views.filter((view) => view.done && !view.claimed);

/**
 * The rows that stay in their sections: everything the shelf is not already showing. A claimed or
 * unearned achievement keeps its place in the list; a waiting one lives on the shelf only.
 */
export const filedAchievements = (
  views: readonly AchievementView[],
  shelved: readonly AchievementView[],
): AchievementView[] => {
  if (shelved.length === 0) return [...views];
  const ids = new Set(shelved.map((view) => view.id));
  return views.filter((view) => !ids.has(view.id));
};

/**
 * The scroll the sheet uses to bring a just-collected row back into its section. Reduced motion is
 * not a weaker move: the row is simply already where it belongs, with no travel to watch.
 */
export const filedScrollBehavior = (reduceMotion: boolean): ScrollBehavior => (reduceMotion ? 'auto' : 'smooth');
