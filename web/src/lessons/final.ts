// LEVEL 10, THE FINAL LESSON — the one level of the tutorial that pays Seeds (owner, 2026-10-24:
// "Level 10 should give 100 seeds"). The server replays the win exactly as it replays a Campaign
// level: this module is the ONE copy of the opening, read by the lesson (lessons.ts) and by the
// server's verifier (server/src/seeds/verify.ts). It imports no lesson scripts or words, so the Edge
// bundle stays small.
//
// THE PLAYER'S FIRST REAL GAME (owner, 2026-11-04: "level 10 says its the first full game, but it
// seems like its using the small map and starts from some tiles already on the board ---- bug";
// asked, the owner chose "Real first game, big board"). Level 10 deals campaign level 10's own
// match: the full 37-hex board, a fresh deal, only the two homes on it. The old authored opening
// (the small map with tiles already grown) is kept ONLY so a win from a page still on it verifies.
import { authoredState } from './authored.js';
import type { PositionSpec } from './authored.js';
import { campaignLevelByNumber } from '../../../src/campaign/levels.js';
import { campaignOpening } from '../../../src/campaign/play.js';

const YOU = 0 as const;
const THEM = 1 as const;

/** The OLD opening (until 2026-11-04): verified for pages still on it, never dealt any more. */
const LEGACY_POSITION: PositionSpec = {
  seed: 96010,
  gold: ['0,0'],
  rock: ['0,1'],
  // A normal opening: both sides have grown a little, and their home already has cover.
  tiles: [['-1,1', YOU, 4], ['1,-1', THEM, 4], ['1,-2', THEM, 6], ['2,-1', THEM, 7]],
  hand: [[0, 4], [0, 5], [1, 5], [2, 5], [3, 7], [null, 0], [1, 8]],
  opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
  deck: [[0, 6], [1, 4], [3, 5], [0, 3], [1, 6], [2, 4], [3, 6], [0, 8], [1, 7], [2, 7], [3, 8], [2, 8], [0, 7], [1, 3]],
  discard: [[3, 1]],
};

export const FINAL_LESSON = Object.freeze({
  /** The proof's level id on the wire (`POST /v1/seeds/campaign`), and its receipt key `lesson:10`. */
  id: 'lesson-10',
  level: 10,
  /** The bot it plays against (its own level, as for any bot game). */
  botLevel: 1 as const,
});

/** The final lesson's opening, exactly as the player starts it: campaign level 10's real match. */
export const finalLessonOpening = () => {
  const level = campaignLevelByNumber(FINAL_LESSON.level);
  if (!level) throw new Error('campaign level 10 is missing');
  return campaignOpening(level);
};
/** The old small-map opening, for verifying a win sent by a page that still deals it. */
export const finalLessonLegacyOpening = () => authoredState(LEGACY_POSITION);
