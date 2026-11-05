// Modern menu update, 2026-11-05: PLAY keeps its quiet amber invitation after graduation;
// the LEVEL key retains the progress-based guidance described below. No new timer or state.
// THE CAMPAIGN'S SUGGESTION — a slight cream halo around PLAY and LEVEL <n> (owner, 2026-11-02).
//
// Owner's words: "make slight glow cream around the play and level 1 so its suggestive". This
// REPLACES the ten first-run lamps (owner, same day: "nah remove that"), so it is the one way the
// menu now points a new player at the campaign. It is a suggestion, not a noticeboard: no count, no
// words, no second control — just the two keys that lead to level 1 wearing the game's cream a
// little more loudly than their neighbours.
//
// THE RULE, stated once. The halo is on while the ten lessons (campaign levels 1-10, which ARE the
// tutorial) are unfinished. `c1-10` is the marker: levels unlock in order, so clearing it means the
// ten are done, and the halo goes — for ever, because the predicate reads nothing but progress. The
// account's verified clears count too, so a returning player on a NEW phone does not get walked
// through lessons the account already finished. The LEVEL key always names the player's next
// unfinished level, so at the only moment the suggestion matters it reads LEVEL 1; later it follows
// the level the entry actually opens rather than glowing at a stale "1".
//
// WHAT IT IS NOT. No timer, no listener, no storage, no request, no animation, no `filter`: one
// class on two keys inside the menu pass that is already running. The halo itself is a static
// `box-shadow` on a `::after` (see style.css), so nothing is painted per frame and nothing can be
// left moving under Reduce motion.
import type { CampaignLevel, CampaignProgress } from '../../../src/campaign/index.js';
import { CAMPAIGN_CHAPTERS } from '../../../src/campaign/index.js';

/** Chapter one's levels, in order — read from the level data so the marker can never drift. */
const LESSONS: readonly CampaignLevel[] = Object.freeze(
  [...(CAMPAIGN_CHAPTERS.find((chapter) => chapter.number === 1)?.levels ?? [])].sort((a, b) => a.number - b.number),
);

/**
 * The account's cleared levels — campaign level NUMBERS derived from the account's furthest verified
 * Campaign level (`campaignHighestLevel`). `null` / `undefined` means "not answered (or no account)":
 * the device's record alone decides. An empty array is a real answer and means none.
 */
export type AccountClears = readonly number[] | null | undefined;

/**
 * THE ONE PREDICATE — is the campaign still suggested? True until the tenth lesson is cleared on
 * THIS device or on the signed-in ACCOUNT. A replay, a practice match or an online duel never moves
 * it; only `completed`/the account answer does.
 */
export const campaignSuggested = (
  progress: Pick<CampaignProgress, 'completed'>,
  account?: AccountClears,
): boolean => {
  const last = LESSONS[LESSONS.length - 1];
  if (!last) return false;
  const accountNumbers = new Set((account ?? []).filter((n) => Number.isInteger(n)));
  return !(progress.completed.includes(last.id) || accountNumbers.has(last.number));
};

export type MenuSuggestionUI = {
  /**
   * Put the halo on PLAY and on the LEVEL <n> key, or take it off. Never throws, never reads
   * storage, never fetches. Call it from the menu's own pass with the record it already holds, and
   * again when the account answer arrives.
   */
  paint(progress: Pick<CampaignProgress, 'completed'>, account?: AccountClears): void;
};

/**
 * The two keys the suggestion lives on. Both are moved/wired by main.ts and both exist in the
 * shipped markup, so this is one class toggle each — no markup is built, nothing is stored.
 */
export const installMenuSuggestion = (doc: Document = document): MenuSuggestionUI => {
  const play = doc.getElementById('menu-play');
  const level = doc.getElementById('menu-campaign');
  return {
    paint(progress, account) {
      const on = campaignSuggested(progress, account);
      // Modern PLAY remains the quiet primary invitation; only lesson guidance graduates.
      play?.classList.toggle('suggest', on || !!doc.documentElement?.classList.contains('v075'));
      level?.classList.toggle('suggest', on);
    },
  };
};
